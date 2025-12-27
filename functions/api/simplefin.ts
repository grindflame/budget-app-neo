/// <reference types="@cloudflare/workers-types" />

interface Env {
  BUDGET_KV: KVNamespace;
}

interface SyncData {
  passwordHash: string;
  transactions: unknown[];
  debts?: unknown[];
  assets?: unknown[];
  categoryBudgets?: Record<string, number>;
  recurring?: unknown[];
  lastUpdated: string;
  openRouterKey?: string;
  simplefinAccessUrl?: string;
  simplefinLastSyncEpoch?: number;
}

type Action =
  | 'status'
  | 'claim'
  | 'disconnect'
  | 'sync';

type SimplefinAccountSet = {
  errors?: string[];
  accounts?: Array<{
    id: string;
    name: string;
    currency?: string;
    balance?: string;
    'available-balance'?: string;
    'balance-date'?: number;
    org?: { domain?: string; name?: string };
    transactions?: Array<{
      id: string;
      posted: number;
      transacted_at?: number;
      amount: string; // numeric string
      description: string;
      pending?: boolean;
      extra?: unknown;
    }>;
  }>;
};

type SimplefinAccountMeta = { id: string; name: string; balance?: string; balanceDate?: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hashPassword(pw: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function requireUser(env: Env, email: string, password: string): Promise<SyncData> {
  if (!email || !password) throw new Error('Missing credentials');
  const key = `user:${email}`;
  const existing = await env.BUDGET_KV.get<SyncData>(key, 'json');
  if (!existing) throw new Error('User not found');
  const inputHash = await hashPassword(password);
  if (existing.passwordHash !== inputHash) throw new Error('Invalid password');
  return existing;
}

function tryDecodeBase64ToString(input: string): string | null {
  try {
    // atob is available in Workers runtime
    const decoded = atob(input);
    return decoded;
  } catch {
    return null;
  }
}

function parseClaimUrl(tokenOrUrl: string): string {
  const raw = tokenOrUrl.trim();
  if (!raw) throw new Error('Missing setup token / claim URL');

  const asUrl = raw.startsWith('http://') || raw.startsWith('https://')
    ? raw
    : (tryDecodeBase64ToString(raw) || '');

  if (!asUrl) throw new Error('Token is not valid base64 and is not a URL');

  let url: URL;
  try {
    url = new URL(asUrl);
  } catch {
    throw new Error('Decoded token is not a valid URL');
  }

  // Minimal safety check: it must look like a SimpleFIN bridge claim URL.
  if (!url.pathname.includes('/simplefin/claim/')) {
    throw new Error('URL does not look like a SimpleFIN claim URL');
  }

  return url.toString();
}

function splitAccessUrl(accessUrl: string): { baseUrl: string; username: string; password: string } {
  let u: URL;
  try {
    u = new URL(accessUrl);
  } catch {
    throw new Error('Stored Access URL is invalid');
  }
  const username = u.username || '';
  const password = u.password || '';
  if (!username || !password) throw new Error('Access URL is missing Basic Auth credentials');

  // Remove credentials from URL; use Authorization header instead (more compatible).
  const baseUrl = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
  return { baseUrl, username, password };
}

function toIsoDateFromEpochSeconds(sec: number): string {
  const d = new Date(sec * 1000);
  // yyyy-mm-dd in local time can be off; use UTC to be stable
  return d.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || 'status') as Action;
    const email = url.searchParams.get('email') || '';
    const password = url.searchParams.get('password') || '';

    if (action !== 'status') return json({ error: 'Unsupported action' }, 400);

    const user = await requireUser(env, email, password);
    return json({
      hasSimplefin: Boolean(user.simplefinAccessUrl),
      simplefinLastSyncEpoch: typeof user.simplefinLastSyncEpoch === 'number' ? user.simplefinLastSyncEpoch : null,
      lastUpdated: user.lastUpdated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const actionFromQuery = url.searchParams.get('action');

    let body: Record<string, unknown> = {};
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      // allow empty
    }

    const action = (typeof body.action === 'string' ? body.action : actionFromQuery) as Action;
    if (!action) return json({ error: 'action is required' }, 400);

    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const existing = await requireUser(env, email, password);

    if (action === 'disconnect') {
      const updated: SyncData = { ...existing, simplefinAccessUrl: undefined, simplefinLastSyncEpoch: undefined, lastUpdated: new Date().toISOString() };
      await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));
      return json({ success: true });
    }

    if (action === 'claim') {
      const tokenOrUrl = typeof body.token === 'string' ? body.token : (typeof body.claimUrl === 'string' ? body.claimUrl : '');
      const claimUrl = parseClaimUrl(tokenOrUrl);

      const res = await fetch(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } });
      if (!res.ok) {
        const txt = await res.text();
        return json({ error: `Claim failed: ${res.status} ${res.statusText}`, details: txt.slice(0, 500) }, 400);
      }
      const accessUrl = (await res.text()).trim();
      if (!accessUrl.startsWith('http://') && !accessUrl.startsWith('https://')) {
        return json({ error: 'Claim did not return a valid access URL' }, 400);
      }

      // Validate we can parse credentials.
      splitAccessUrl(accessUrl);

      // New access URL = new connection; reset last sync marker.
      const updated: SyncData = { ...existing, simplefinAccessUrl: accessUrl, simplefinLastSyncEpoch: undefined, lastUpdated: new Date().toISOString() };
      await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));
      return json({ success: true });
    }

    if (action === 'sync') {
      const daysBackRaw = typeof body.daysBack === 'number' && Number.isFinite(body.daysBack)
        ? Math.floor(body.daysBack)
        : 60;
      // Bridge limits the range to 60 days per request. We'll chunk up to MAX_DAYS_BACK.
      const MAX_DAYS_BACK = 366;
      const requestedDaysBack = Math.max(1, Math.min(MAX_DAYS_BACK, daysBackRaw));
      const includePending = Boolean(body.includePending);

      const accessUrl = existing.simplefinAccessUrl;
      if (!accessUrl) return json({ error: 'SimpleFIN not connected' }, 400);

      const { baseUrl, username, password: sfinPw } = splitAccessUrl(accessUrl);

      const end = Math.floor(Date.now() / 1000);
      const auth = btoa(`${username}:${sfinPw}`);
      const secondsPerDay = 24 * 60 * 60;
      const maxDaysPerRequest = 60;
      const maxRangeSeconds = maxDaysPerRequest * secondsPerDay;

      const lastSync = typeof existing.simplefinLastSyncEpoch === 'number' && existing.simplefinLastSyncEpoch > 0
        ? existing.simplefinLastSyncEpoch
        : null;

      const errors: string[] = [];
      const accountsMeta: SimplefinAccountMeta[] = [];
      const seenAccountIds = new Set<string>();
      const imported: Array<{
        externalId: string;
        simplefinAccountId: string;
        simplefinAccountName: string;
        date: string;
        description: string;
        amount: number;
        type: 'income' | 'expense';
        category: 'Uncategorized';
        source: string;
      }> = [];

      const fetchChunk = async (start: number, endExclusive: number) => {
        const accountsUrl = new URL(`${baseUrl}/accounts`);
        accountsUrl.searchParams.set('start-date', String(start));
        accountsUrl.searchParams.set('end-date', String(endExclusive));
        if (includePending) accountsUrl.searchParams.set('pending', '1');

        const dataRes = await fetch(accountsUrl.toString(), {
          method: 'GET',
          headers: { 'Authorization': `Basic ${auth}` },
        });
        if (!dataRes.ok) {
          const txt = await dataRes.text();
          throw new Error(`SimpleFIN fetch failed: ${dataRes.status} ${dataRes.statusText} (${start}..${endExclusive}) :: ${txt.slice(0, 200)}`);
        }

        const accountSet = await dataRes.json() as SimplefinAccountSet;
        const chunkErrors = Array.isArray(accountSet.errors) ? accountSet.errors : [];
        errors.push(...chunkErrors);
        const accounts = Array.isArray(accountSet.accounts) ? accountSet.accounts : [];

        for (const acc of accounts) {
          const accName = acc?.name || 'Account';
          const accId = acc?.id || 'unknown';
          if (accId && !seenAccountIds.has(accId)) {
            seenAccountIds.add(accId);
            accountsMeta.push({
              id: accId,
              name: accName,
              balance: typeof acc.balance === 'string' ? acc.balance : undefined,
              balanceDate: typeof acc['balance-date'] === 'number' ? acc['balance-date'] : undefined,
            });
          }
          const txns = Array.isArray(acc?.transactions) ? acc.transactions : [];
          for (const t of txns) {
            const posted = typeof t.posted === 'number' && t.posted > 0
              ? t.posted
              : (typeof t.transacted_at === 'number' && t.transacted_at > 0 ? t.transacted_at : 0);

            const isoDate = posted ? toIsoDateFromEpochSeconds(posted) : new Date().toISOString().slice(0, 10);
            const amt = Number(t.amount);
            const abs = Math.abs(Number.isFinite(amt) ? amt : 0);
            if (!(abs > 0)) continue;

            imported.push({
              externalId: `simplefin:${accId}:${t.id}`,
              simplefinAccountId: accId,
              simplefinAccountName: accName,
              date: isoDate,
              description: `${t.description || 'Transaction'} (${accName})`,
              amount: abs,
              type: amt >= 0 ? 'income' : 'expense',
              category: 'Uncategorized',
              source: `SimpleFIN:${accId}`,
            });
          }
        }
      };

      let start: number;
      let chunks: Array<{ start: number; end: number }> = [];

      if (requestedDaysBack > maxDaysPerRequest) {
        // Backfill mode: chunk a larger explicit range into 60-day windows.
        const globalStart = Math.max(0, end - (requestedDaysBack * secondsPerDay));
        start = globalStart;
        for (let s = globalStart; s < end; s += maxRangeSeconds) {
          const e = Math.min(end, s + maxRangeSeconds);
          chunks.push({ start: s, end: e });
        }
      } else {
        // Incremental mode: honor lastSync (with overlap) but never exceed requestedDaysBack.
        const maxRangeStart = end - (requestedDaysBack * secondsPerDay);
        const overlapSeconds = 2 * secondsPerDay;
        const incrementalStart = lastSync ? Math.max(0, lastSync - overlapSeconds) : 0;
        start = lastSync ? Math.max(maxRangeStart, incrementalStart) : maxRangeStart;
        chunks = [{ start, end }];
      }

      // Bridge guideline: 24 requests/day. Enforce hard cap here to avoid disabling tokens.
      if (chunks.length > 24) {
        return json({ error: `Requested range requires ${chunks.length} requests; max is 24 per day. Lower daysBack.` }, 400);
      }

      for (const c of chunks) {
        await fetchChunk(c.start, c.end);
      }

      // Persist last sync marker only after successful fetch + parse.
      const updated: SyncData = { ...existing, simplefinLastSyncEpoch: end, lastUpdated: new Date().toISOString() };
      await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));

      return json({
        success: true,
        errors,
        accounts: accountsMeta,
        transactions: imported,
        meta: { requestedDaysBack, includePending, start, end, lastSync, chunks: chunks.length },
      });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
};


