/// <reference types="@cloudflare/workers-types" />

interface Env {
  BUDGET_KV: KVNamespace;
}

interface SyncData {
  passwordHash: string;
  openRouterKey?: string;
}

const MAX_TEXT_CHARS = 30000;
const MAX_BASE64_CHARS = 20000;
const MAX_FILES = 4;

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  source?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function hashPassword(pw: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(arr: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(arr);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function guessMime(name: string): string {
  if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (name.toLowerCase().endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const form = await request.formData();

  const email = form.get('email')?.toString() || '';
  const password = form.get('password')?.toString() || '';
  const overrideKey = form.get('openRouterKey')?.toString() || '';
  const userModel = form.get('model')?.toString() || '';
  const defaultCsvModel = 'openai/gpt-4o-mini';
  const defaultPdfModel = 'openai/gpt-4o';
  const categoriesRaw = form.get('categories')?.toString() || '[]';

  let categories: string[] = [];
  try {
    categories = JSON.parse(categoriesRaw);
    if (!Array.isArray(categories)) categories = [];
  } catch {
    categories = [];
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  if (files.length === 0) {
    return jsonResponse({ error: "No files provided" }, 400);
  }

  let openRouterKey = overrideKey;
  if (!openRouterKey) {
    if (!email || !password) return jsonResponse({ error: "Missing credentials and key" }, 400);
    const key = `user:${email}`;
    const existing = await env.BUDGET_KV.get<SyncData>(key, "json");
    if (!existing) return jsonResponse({ error: "User not found" }, 404);
    const hashed = await hashPassword(password);
    if (existing.passwordHash !== hashed) return jsonResponse({ error: "Invalid password" }, 401);
    openRouterKey = existing.openRouterKey || '';
  }

  if (!openRouterKey) {
    return jsonResponse({ error: "No OpenRouter key on profile" }, 400);
  }

  const hasPdf = files.some(f => (f.type || '').includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
  const model = userModel || (hasPdf ? defaultPdfModel : defaultCsvModel);

  const userContent: Array<{ type: 'text'; text: string }> = [];
  const systemPrompt = [
    "You are a financial data extractor. Parse the provided bank statements (PDF or CSV text).",
    "If content is data:<mime>;base64,... decode the base64 (may be trimmed) and parse what is available.",
    "Return ONLY valid JSON with this shape:",
    `{"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":123.45,"type":"income|expense|debt-payment|debt-interest|asset-deposit|asset-growth","category":"string","source":"filename"}]}`,
    "Rules:",
    "- Use positive numbers for amount.",
    "- type income for credits/inflows, expense for debits/outflows.",
    "- debt-payment if paying credit card/loan; debt-interest for interest/fees.",
    "- asset-deposit for savings/transfer to asset; asset-growth for interest yield.",
    `- Categories (choose closest): ${categories.length ? categories.join(', ') : 'Uncategorized'}.`,
    "- If unsure of category use 'Uncategorized'.",
    "- Ensure ISO date format YYYY-MM-DD.",
    "- Limit to 500 transactions."
  ].join('\n');

  for (const file of files) {
    const name = file.name || 'statement';
    const mime = file.type || guessMime(name);
    const arrayBuffer = await file.arrayBuffer();
    const sizeMb = arrayBuffer.byteLength / (1024 * 1024);
    if (sizeMb > 12) return jsonResponse({ error: `File ${name} too large (>12MB)` }, 413);

    let textContent = '';
    if (mime.includes('text') || name.toLowerCase().endsWith('.csv')) {
      textContent = await file.text();
    }

    const base64 = toBase64(arrayBuffer);
    const safeText = textContent
      ? (textContent.length > MAX_TEXT_CHARS
        ? `${textContent.slice(0, MAX_TEXT_CHARS)}\n...[TRIMMED ${textContent.length - MAX_TEXT_CHARS} CHARS]`
        : textContent)
      : '';

    const safeBase64 = base64.length > MAX_BASE64_CHARS
      ? `${base64.slice(0, MAX_BASE64_CHARS)}...[TRIMMED ${base64.length - MAX_BASE64_CHARS} CHARS]`
      : base64;

    const payload = safeText || `data:${mime};base64,${safeBase64}`;

    userContent.push({
      type: 'text',
      text: `File: ${name} (${mime}). Content (trimmed if indicated):\n${payload}`
    });
  }

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterKey}`,
      'HTTP-Referer': 'https://brutal-budget.pages.dev',
      'X-Title': 'Brutal Budget Importer'
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    return jsonResponse({ error: "OpenRouter call failed", detail: txt }, 502);
  }

  let parsed: ParsedTransaction[] = [];
  let raw: unknown;
  try {
    const data = await aiRes.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    raw = content;
    const obj = typeof content === 'string' ? JSON.parse(content) : content;
    if (obj && Array.isArray(obj.transactions)) {
      parsed = obj.transactions;
    }
  } catch (e) {
    return jsonResponse({ error: "Could not parse AI response", detail: String(e) }, 500);
  }

  return jsonResponse({
    transactions: parsed,
    raw
  });
};

