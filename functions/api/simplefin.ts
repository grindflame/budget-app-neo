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
      const daysBack = typeof body.daysBack === 'number' && Number.isFinite(body.daysBack) ? Math.max(1, Math.min(60, Math.floor(body.daysBack))) : 60;
      const includePending = Boolean(body.includePending);

      const accessUrl = existing.simplefinAccessUrl;
      if (!accessUrl) return json({ error: 'SimpleFIN not connected' }, 400);

      const { baseUrl, username, password: sfinPw } = splitAccessUrl(accessUrl);

      const end = Math.floor(Date.now() / 1000);
      const maxRangeStart = end - (daysBack * 24 * 60 * 60);
      const lastSync = typeof existing.simplefinLastSyncEpoch === 'number' && existing.simplefinLastSyncEpoch > 0
        ? existing.simplefinLastSyncEpoch
        : null;
      // Use a small overlap so we catch late-posting transactions while still being incremental.
      const overlapSeconds = 2 * 24 * 60 * 60;
      const incrementalStart = lastSync ? Math.max(0, lastSync - overlapSeconds) : 0;
      const start = lastSync ? Math.max(maxRangeStart, incrementalStart) : maxRangeStart;

      const accountsUrl = new URL(`${baseUrl}/accounts`);
      accountsUrl.searchParams.set('start-date', String(start));
      accountsUrl.searchParams.set('end-date', String(end));
      if (includePending) accountsUrl.searchParams.set('pending', '1');

      const auth = btoa(`${username}:${sfinPw}`);
      const dataRes = await fetch(accountsUrl.toString(), {
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` },
      });
      if (!dataRes.ok) {
        const txt = await dataRes.text();
        return json({ error: `SimpleFIN fetch failed: ${dataRes.status} ${dataRes.statusText}`, details: txt.slice(0, 500) }, 400);
      }

      const accountSet = await dataRes.json() as SimplefinAccountSet;

      const errors = Array.isArray(accountSet.errors) ? accountSet.errors : [];
      const accounts = Array.isArray(accountSet.accounts) ? accountSet.accounts : [];

      const imported = accounts.flatMap(acc => {
        const accName = acc?.name || 'Account';
        const accId = acc?.id || 'unknown';
        const txns = Array.isArray(acc?.transactions) ? acc.transactions : [];

        return txns.map(t => {
          const posted = typeof t.posted === 'number' && t.posted > 0
            ? t.posted
            : (typeof t.transacted_at === 'number' && t.transacted_at > 0 ? t.transacted_at : 0);

          const isoDate = posted ? toIsoDateFromEpochSeconds(posted) : new Date().toISOString().slice(0, 10);
          const amt = Number(t.amount);
          const abs = Math.abs(Number.isFinite(amt) ? amt : 0);
          const type = amt >= 0 ? 'income' : 'expense';
          const description = `${t.description || 'Transaction'} (${accName})`;

          return {
            externalId: `simplefin:${accId}:${t.id}`,
            date: isoDate,
            description,
            amount: abs,
            type,
            category: 'Uncategorized',
            source: `SimpleFIN:${accId}`,
          };
        }).filter(x => x.amount > 0);
      });

      // Persist last sync marker only after successful fetch + parse.
      const updated: SyncData = { ...existing, simplefinLastSyncEpoch: end, lastUpdated: new Date().toISOString() };
      await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));

      return json({
        success: true,
        errors,
        transactions: imported,
        meta: { daysBack, includePending, accounts: accounts.length, start, end, lastSync },
      });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
};


