/// <reference types="@cloudflare/workers-types" />

interface Env {
  BUDGET_KV: KVNamespace;
}

interface SyncData {
  passwordHash: string;
  openRouterKey?: string;
}

const MAX_TEXT_CHARS = 30000;
const MAX_BASE64_CHARS = 20000; // For non-PDF files
const MAX_PDF_BASE64_CHARS = 5000000; // ~3.7MB PDF when base64 encoded (much larger limit for PDFs)
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
  console.log('[IMPORT] Request received');
  const form = await request.formData();

  const email = form.get('email')?.toString() || '';
  const password = form.get('password')?.toString() || '';
  const overrideKey = form.get('openRouterKey')?.toString() || '';
  const userModel = form.get('model')?.toString() || '';
  const defaultCsvModel = 'openai/gpt-4o-mini';
  const defaultPdfModel = 'openai/gpt-4o';
  const categoriesRaw = form.get('categories')?.toString() || '[]';

  console.log('[IMPORT] Form data:', {
    email: email ? `${email.substring(0, 3)}***` : 'missing',
    hasPassword: !!password,
    hasOverrideKey: !!overrideKey,
    userModel: userModel || 'not set',
    categoriesCount: categoriesRaw ? JSON.parse(categoriesRaw)?.length : 0
  });

  let categories: string[] = [];
  try {
    categories = JSON.parse(categoriesRaw);
    if (!Array.isArray(categories)) categories = [];
  } catch {
    categories = [];
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  console.log('[IMPORT] Files received:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
  if (files.length === 0) {
    console.log('[IMPORT] ERROR: No files provided');
    return jsonResponse({ error: "No files provided" }, 400);
  }

  let openRouterKey = overrideKey;
  if (!openRouterKey) {
    console.log('[IMPORT] No override key, checking KV for user:', email ? `${email.substring(0, 3)}***` : 'missing');
    if (!email || !password) {
      console.log('[IMPORT] ERROR: Missing credentials and key');
      return jsonResponse({ error: "Missing credentials and key" }, 400);
    }
    const key = `user:${email}`;
    const existing = await env.BUDGET_KV.get<SyncData>(key, "json");
    if (!existing) {
      console.log('[IMPORT] ERROR: User not found in KV');
      return jsonResponse({ error: "User not found" }, 404);
    }
    const hashed = await hashPassword(password);
    if (existing.passwordHash !== hashed) {
      console.log('[IMPORT] ERROR: Invalid password');
      return jsonResponse({ error: "Invalid password" }, 401);
    }
    openRouterKey = existing.openRouterKey || '';
    console.log('[IMPORT] Retrieved key from KV:', openRouterKey ? 'present' : 'missing');
  } else {
    console.log('[IMPORT] Using override key');
  }

  if (!openRouterKey) {
    console.log('[IMPORT] ERROR: No OpenRouter key available');
    return jsonResponse({ error: "No OpenRouter key on profile" }, 400);
  }

  const hasPdf = files.some(f => (f.type || '').includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
  const model = userModel || (hasPdf ? defaultPdfModel : defaultCsvModel);
  console.log('[IMPORT] Model selection:', { hasPdf, userModel, selectedModel: model });

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
    console.log('[IMPORT] Processing file:', { name, mime, sizeMb: sizeMb.toFixed(2) });
    if (sizeMb > 12) {
      console.log('[IMPORT] ERROR: File too large');
      return jsonResponse({ error: `File ${name} too large (>12MB)` }, 413);
    }

    let textContent = '';
    if (mime.includes('text') || name.toLowerCase().endsWith('.csv')) {
      textContent = await file.text();
      console.log('[IMPORT] Extracted text content length:', textContent.length);
    }

    const base64 = toBase64(arrayBuffer);
    const isPdf = mime.includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const maxBase64ForFile = isPdf ? MAX_PDF_BASE64_CHARS : MAX_BASE64_CHARS;
    
    const safeText = textContent
      ? (textContent.length > MAX_TEXT_CHARS
        ? `${textContent.slice(0, MAX_TEXT_CHARS)}\n...[TRIMMED ${textContent.length - MAX_TEXT_CHARS} CHARS]`
        : textContent)
      : '';

    const safeBase64 = base64.length > maxBase64ForFile
      ? `${base64.slice(0, maxBase64ForFile)}...[TRIMMED ${base64.length - maxBase64ForFile} CHARS]`
      : base64;

    if (isPdf && base64.length > maxBase64ForFile) {
      console.log('[IMPORT] WARNING: PDF is very large and will be truncated!', {
        originalSize: base64.length,
        maxSize: maxBase64ForFile,
        truncatedBy: base64.length - maxBase64ForFile
      });
    }

    const payload = safeText || `data:${mime};base64,${safeBase64}`;
    console.log('[IMPORT] Payload type:', safeText ? 'text' : 'base64', 'length:', payload.length, 'isPdf:', isPdf, 'wasTruncated:', base64.length > maxBase64ForFile);

    userContent.push({
      type: 'text',
      text: `File: ${name} (${mime}). Content (trimmed if indicated):\n${payload}`
    });
  }

  console.log('[IMPORT] Calling OpenRouter API with model:', model);
  const requestBody = {
    model,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  };
  console.log('[IMPORT] Request body size:', JSON.stringify(requestBody).length, 'chars');
  console.log('[IMPORT] System prompt length:', systemPrompt.length);
  console.log('[IMPORT] User content items:', userContent.length);

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterKey}`,
      'HTTP-Referer': 'https://brutal-budget.pages.dev',
      'X-Title': 'Brutal Budget Importer'
    },
    body: JSON.stringify(requestBody)
  });

  console.log('[IMPORT] OpenRouter response status:', aiRes.status, aiRes.statusText);
  if (!aiRes.ok) {
    const txt = await aiRes.text();
    console.log('[IMPORT] ERROR: OpenRouter call failed:', txt.substring(0, 500));
    return jsonResponse({ error: "OpenRouter call failed", detail: txt }, 502);
  }

  let parsed: ParsedTransaction[] = [];
  let raw: unknown;
  try {
    const data = await aiRes.json() as any;
    console.log('[IMPORT] OpenRouter response structure:', {
      hasChoices: !!data?.choices,
      choicesLength: data?.choices?.length,
      hasMessage: !!data?.choices?.[0]?.message,
      hasContent: !!data?.choices?.[0]?.message?.content
    });
    const content = data?.choices?.[0]?.message?.content;
    raw = content;
    console.log('[IMPORT] Raw content type:', typeof content, 'length:', typeof content === 'string' ? content.length : 'N/A');
    console.log('[IMPORT] Raw content preview:', typeof content === 'string' ? content.substring(0, 200) : JSON.stringify(content).substring(0, 200));
    
    const obj = typeof content === 'string' ? JSON.parse(content) : content;
    console.log('[IMPORT] Parsed object keys:', Object.keys(obj || {}));
    console.log('[IMPORT] Has transactions array:', Array.isArray(obj?.transactions));
    if (obj && Array.isArray(obj.transactions)) {
      parsed = obj.transactions;
      console.log('[IMPORT] Parsed transactions count:', parsed.length);
      if (parsed.length > 0) {
        console.log('[IMPORT] First transaction sample:', JSON.stringify(parsed[0]));
      }
    } else {
      console.log('[IMPORT] WARNING: No transactions array found in response');
      console.log('[IMPORT] Full parsed object:', JSON.stringify(obj).substring(0, 1000));
    }
  } catch (e) {
    console.log('[IMPORT] ERROR: Could not parse AI response:', String(e));
    console.log('[IMPORT] Raw content that failed:', typeof raw === 'string' ? raw.substring(0, 500) : JSON.stringify(raw).substring(0, 500));
    return jsonResponse({ error: "Could not parse AI response", detail: String(e) }, 500);
  }

  console.log('[IMPORT] Returning response with', parsed.length, 'transactions');
  return jsonResponse({
    transactions: parsed,
    raw
  });
};

