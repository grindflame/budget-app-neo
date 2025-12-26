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
      '  BUDGET_BASE_URL   e.g. https://brutal-budget.pages.dev',
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
  return url.replace(/\/+$/, '');
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
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  return entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => n.toLowerCase().endsWith('.pdf'))
    .sort()
    .map(n => path.join(dirAbs, n));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
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

  // Import in chunks of 4 (matches worker MAX_FILES).
  const batches = chunk(pdfFiles, 4);
  let totalImported = 0;
  let totalDeduped = 0;
  let totalFailedFiles = 0;

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
  }

  console.log(`\nDone parsing. New tx added: ${totalImported}. Deduped: ${totalDeduped}. Failed files: ${totalFailedFiles}.`);

  if (dryRun) {
    console.log('Dry-run enabled: skipping /api/sync writeback.');
    return;
  }

  const syncPostUrl = `${baseUrl}/api/sync`;
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
}

main().catch(err => {
  console.error(err?.message || String(err));
  process.exit(1);
});


