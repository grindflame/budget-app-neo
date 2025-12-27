import fs from 'node:fs/promises';
import path from 'node:path';

function usage(exitCode = 1) {
  // Keep this short and avoid printing secrets.
  console.error(
    [
      '',
      'Bulk-import PDFs into a cloud user via the existing /api/import + /api/sync endpoints.',
      '',
      'Required env vars:',
      '  BUDGET_BASE_URL   e.g. https://neo-budget.pages.dev',
      '  BUDGET_EMAIL',
      '  BUDGET_PASSWORD',
      '',
      'Optional env vars:',
      '  BUDGET_MODEL      e.g. openai/gpt-4o (or leave empty for auto)',
      '  BUDGET_DIR        default: import-docs',
      '  BUDGET_DRY_RUN    set to 1 to skip /api/sync writeback',
      '',
      'Run:',
      '  node scripts/bulk-import.mjs',
      '',
    ].join('\n')
  );
  process.exit(exitCode);
}

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normBaseUrl(url) {
  const cleaned = url.replace(/\/+$/, '');
  // Help catch common mistakes like "neo-budget.pages.dev" (missing scheme)
  if (!/^https?:\/\//i.test(cleaned)) {
    throw new Error(`BUDGET_BASE_URL must include http(s):// (got: ${cleaned})`);
  }
  return cleaned;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makeId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function txKey(t) {
  // Simple dedupe key. Not perfect, but prevents obvious duplicates.
  const date = (t.date || '').trim();
  const desc = (t.description || '').trim().toLowerCase();
  const amt = Number(t.amount || 0).toFixed(2);
  const type = (t.type || '').trim();
  return `${date}|${desc}|${amt}|${type}`;
}

async function listPdfFiles(dirAbs) {
  const out = [];

  const walk = async (currentAbs) => {
    const entries = await fs.readdir(currentAbs, { withFileTypes: true });
    // Deterministic traversal order
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const e of entries) {
      const abs = path.join(currentAbs, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      if (!e.name.toLowerCase().endsWith('.pdf')) continue;
      out.push(abs);
    }
  };

  await walk(dirAbs);
  return out;
}

async function fetchJson(url, init) {
  const timeoutMs = Number(process.env.BUDGET_TIMEOUT_MS || 0) || 0;
  const controller = timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(url, { ...init, signal: controller?.signal });
  } catch (e) {
    const msg = e?.message || String(e);
    const cause = e?.cause ? (e.cause.message || String(e.cause)) : '';
    const isAbort = e?.name === 'AbortError';
    const abortNote = isAbort ? ` (timeout after ${timeoutMs}ms)` : '';
    throw new Error(`Fetch failed for ${url}: ${msg}${cause ? ` (cause: ${cause})` : ''}${abortNote}`);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response for ${url}: ${text.slice(0, 400)}`);
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) usage(0);

  const baseUrl = normBaseUrl(mustGetEnv('BUDGET_BASE_URL'));
  const email = mustGetEnv('BUDGET_EMAIL');
  const password = mustGetEnv('BUDGET_PASSWORD');
  const model = process.env.BUDGET_MODEL || '';
  const dirRel = process.env.BUDGET_DIR || 'import-docs';
  const dryRun = process.env.BUDGET_DRY_RUN === '1';
  const batchSize = Number(process.env.BUDGET_BATCH_SIZE || '1') || 1;
  const saveEach = (process.env.BUDGET_SAVE_EACH || '1') !== '0';
  console.log(`Base URL: ${baseUrl}`);
  if (!process.env.BUDGET_TIMEOUT_MS) {
    // Default timeout: 5 minutes per request
    process.env.BUDGET_TIMEOUT_MS = '300000';
  }

  const dirAbs = path.resolve(process.cwd(), dirRel);
  const pdfFiles = await listPdfFiles(dirAbs);
  if (pdfFiles.length === 0) {
    console.error(`No PDFs found in ${dirAbs}`);
    process.exit(1);
  }

  console.log(`Found ${pdfFiles.length} PDFs in ${dirRel}`);

  // Load existing cloud state.
  const syncGetUrl = `${baseUrl}/api/sync?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const existing = await fetchJson(syncGetUrl);

  const existingTx = Array.isArray(existing.transactions) ? existing.transactions : [];
  const debts = Array.isArray(existing.debts) ? existing.debts : [];
  const assets = Array.isArray(existing.assets) ? existing.assets : [];
  const recurring = Array.isArray(existing.recurring) ? existing.recurring : [];
  const categoryBudgets = (existing.categoryBudgets && typeof existing.categoryBudgets === 'object' && !Array.isArray(existing.categoryBudgets))
    ? existing.categoryBudgets
    : {};

  const seen = new Set(existingTx.map(txKey));
  const merged = [...existingTx];

  // Import in user-controlled batches (default 1 file) to avoid a single slow doc stalling the run.
  // Worker MAX_FILES is 4, but batching 1 makes progress + persistence much more reliable.
  const batches = chunk(pdfFiles, Math.max(1, Math.min(4, batchSize)));
  let totalImported = 0;
  let totalDeduped = 0;
  let totalFailedFiles = 0;

  const syncPostUrl = `${baseUrl}/api/sync`;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`\nBatch ${bi + 1}/${batches.length}: ${batch.map(p => path.basename(p)).join(', ')}`);

    const form = new FormData();
    form.append('email', email);
    form.append('password', password);
    form.append('categories', JSON.stringify([]));
    if (model) form.append('model', model);

    for (const filePath of batch) {
      const buf = await fs.readFile(filePath);
      const blob = new Blob([buf], { type: 'application/pdf' });
      form.append('files', blob, path.basename(filePath));
    }

    const importUrl = `${baseUrl}/api/import`;
    const result = await fetchJson(importUrl, { method: 'POST', body: form });

    // perFile is returned by our worker; use it to spot failures quickly.
    if (Array.isArray(result.perFile)) {
      const failed = result.perFile.filter(r => r && r.ok === false);
      if (failed.length) {
        totalFailedFiles += failed.length;
        console.error(`  ${failed.length} file(s) failed in this batch`);
      }
    }

    const txs = Array.isArray(result.transactions) ? result.transactions : [];
    let importedThisBatch = 0;
    let dedupedThisBatch = 0;

    for (const t of txs) {
      if (!t || typeof t !== 'object') continue;
      const date = String(t.date || '');
      const description = String(t.description || '');
      const amount = Number(t.amount || 0);
      const type = String(t.type || 'expense');
      const category = String(t.category || 'Uncategorized');

      const normalized = {
        id: makeId(),
        date,
        description,
        amount,
        type,
        category,
        debtAccountId: t.debtAccountId,
        assetAccountId: t.assetAccountId,
        recurringId: t.recurringId,
        // source is kept in the object returned by /api/import but the core app Transaction doesn't include it.
      };

      const key = txKey(normalized);
      if (seen.has(key)) {
        dedupedThisBatch++;
        continue;
      }
      seen.add(key);
      merged.push(normalized);
      importedThisBatch++;
    }

    totalImported += importedThisBatch;
    totalDeduped += dedupedThisBatch;
    console.log(`  Added ${importedThisBatch} new tx (deduped ${dedupedThisBatch})`);

    // Persist progress after each batch (default is per-doc batching).
    if (!dryRun && saveEach) {
      await fetchJson(syncPostUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          transactions: merged,
          debts,
          assets,
          categoryBudgets,
          recurring,
        }),
      });
      console.log(`  Saved to cloud. Total transactions now: ${merged.length}`);
    }
  }

  console.log(`\nDone parsing. New tx added: ${totalImported}. Deduped: ${totalDeduped}. Failed files: ${totalFailedFiles}.`);

  if (dryRun) {
    console.log('Dry-run enabled: skipping /api/sync writeback.');
    return;
  }
  if (!saveEach) {
    await fetchJson(syncPostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        transactions: merged,
        debts,
        assets,
        categoryBudgets,
        recurring,
      }),
    });
    console.log(`Cloud sync updated. Total transactions now: ${merged.length}`);
  } else {
    console.log(`Cloud sync already updated incrementally. Total transactions now: ${merged.length}`);
  }
}

main().catch(err => {
  console.error(err?.message || String(err));
  process.exit(1);
});


