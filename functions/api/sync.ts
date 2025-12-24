/// <reference types="@cloudflare/workers-types" />

interface Env {
    BUDGET_KV: KVNamespace;
}

interface SyncData {
    passwordHash: string; // Simple hash/token
    transactions: any[];
    lastUpdated: string;
}

// Simple hash function for "auth" (Not secure for high-value targets, but good enough for simple key-value bucket protection)
async function hashPassword(pw: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(pw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const { request, env } = context;
        const body: any = await request.json();
        const { email, password, transactions } = body;

        if (!email || !password || !transactions) {
            return new Response("Missing fields", { status: 400 });
        }

        const key = `user:${email}`;
        const newHash = await hashPassword(password);

        // Check existing (optional: could just overwrite)
        const existing = await env.BUDGET_KV.get<SyncData>(key, "json");
        if (existing) {
            if (existing.passwordHash !== newHash) {
                return new Response("Invalid Password for this Email or User Exists", { status: 401 });
            }
        }

        const data: SyncData = {
            passwordHash: newHash,
            transactions,
            lastUpdated: new Date().toISOString()
        };

        await env.BUDGET_KV.put(key, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true, message: "Saved!" }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
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
            lastUpdated: existing.lastUpdated
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
