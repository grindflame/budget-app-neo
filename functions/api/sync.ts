/// <reference types="@cloudflare/workers-types" />

interface Env {
    BUDGET_KV: KVNamespace;
}

interface SyncData {
    passwordHash: string;
    transactions: unknown[];
    debts?: unknown[];
    assets?: unknown[]; // Added assets
    categoryBudgets?: Record<string, number>;
    recurring?: unknown[];
    lastUpdated: string;
    openRouterKey?: string;
}

interface SyncRequestBody {
    email?: unknown;
    password?: unknown;
    transactions?: unknown;
    debts?: unknown;
    assets?: unknown;
    categoryBudgets?: unknown;
    recurring?: unknown;
}

async function hashPassword(pw: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(pw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { request, env } = context;
        const body = await request.json() as SyncRequestBody;
        const email = typeof body.email === 'string' ? body.email : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const transactions = Array.isArray(body.transactions) ? body.transactions : [];
        const debts = Array.isArray(body.debts) ? body.debts : [];
        const assets = Array.isArray(body.assets) ? body.assets : [];
        const recurring = Array.isArray(body.recurring) ? body.recurring : [];
        const categoryBudgets = (body.categoryBudgets && typeof body.categoryBudgets === 'object' && !Array.isArray(body.categoryBudgets))
            ? (body.categoryBudgets as Record<string, number>)
            : {};

        if (!email || !password) {
            return new Response("Missing fields", { status: 400 });
        }

        const key = `user:${email}`;
        const newHash = await hashPassword(password);

        const existing = await env.BUDGET_KV.get<SyncData>(key, "json");
        if (existing) {
            if (existing.passwordHash !== newHash) {
                return new Response("Invalid Password for this Email or User Exists", { status: 401 });
            }
        }

        const data: SyncData = {
            passwordHash: newHash,
            transactions,
            debts,
            assets,
            categoryBudgets,
            recurring,
            lastUpdated: new Date().toISOString(),
            openRouterKey: existing?.openRouterKey
        };

        await env.BUDGET_KV.put(key, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true, message: "Saved!" }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const email = url.searchParams.get("email");
        const password = url.searchParams.get("password");

        if (!email || !password) {
            return new Response("Missing credentials", { status: 400 });
        }

        const key = `user:${email}`;
        const existing = await env.BUDGET_KV.get<SyncData>(key, "json");

        if (!existing) {
            return new Response("User not found", { status: 404 });
        }

        const inputHash = await hashPassword(password);
        if (existing.passwordHash !== inputHash) {
            return new Response("Invalid Password", { status: 401 });
        }

        return new Response(JSON.stringify({
            transactions: existing.transactions,
            debts: existing.debts || [],
            assets: existing.assets || [], // Return assets
            categoryBudgets: existing.categoryBudgets || {},
            recurring: existing.recurring || [],
            lastUpdated: existing.lastUpdated
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
}
