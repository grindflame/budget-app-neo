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
}

async function hashPassword(pw: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchUser(env: Env, email: string): Promise<SyncData | null> {
  const key = `user:${email}`;
  return env.BUDGET_KV.get<SyncData>(key, "json");
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const actionFromQuery = url.searchParams.get("action");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    // allow empty
  }

  const action = typeof body.action === 'string' ? body.action : actionFromQuery;

  if (!action) return response({ error: "action is required" }, 400);

  if (action === 'change-password') {
    const email = typeof body.email === 'string' ? body.email : '';
    const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!email || !oldPassword || !newPassword) {
      return response({ error: "Missing fields" }, 400);
    }

    const existing = await fetchUser(env, email);
    if (!existing) return response({ error: "User not found" }, 404);

    const oldHash = await hashPassword(oldPassword);
    if (existing.passwordHash !== oldHash) {
      return response({ error: "Invalid password" }, 401);
    }

    const newHash = await hashPassword(newPassword);
    const updated: SyncData = { ...existing, passwordHash: newHash };
    await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));
    return response({ success: true });
  }

  if (action === 'save-openrouter-key') {
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const openRouterKey = typeof body.openRouterKey === 'string' ? body.openRouterKey : '';

    if (!email || !password || !openRouterKey) {
      return response({ error: "Missing fields" }, 400);
    }

    const existing = await fetchUser(env, email);
    const passwordHash = await hashPassword(password);

    if (existing && existing.passwordHash !== passwordHash) {
      return response({ error: "Invalid password" }, 401);
    }

    const updated: SyncData = existing ? { ...existing, openRouterKey } : {
      passwordHash,
      transactions: [],
      debts: [],
      assets: [],
      categoryBudgets: {},
      recurring: [],
      openRouterKey,
      lastUpdated: new Date().toISOString()
    };

    await env.BUDGET_KV.put(`user:${email}`, JSON.stringify(updated));
    return response({ success: true });
  }

  return response({ error: "Unsupported action" }, 400);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = url.searchParams.get("email") || '';
  const password = url.searchParams.get("password") || '';

  if (!email || !password) return response({ error: "Missing credentials" }, 400);

  const existing = await fetchUser(env, email);
  if (!existing) return response({ error: "User not found" }, 404);

  const passwordHash = await hashPassword(password);
  if (existing.passwordHash !== passwordHash) return response({ error: "Invalid password" }, 401);

  return response({
    hasOpenRouterKey: Boolean(existing.openRouterKey),
    lastUpdated: existing.lastUpdated
  });
};

