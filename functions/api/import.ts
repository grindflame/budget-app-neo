/// <reference types="@cloudflare/workers-types" />

interface Env {
  BUDGET_KV: KVNamespace;
}

interface SyncData {
  passwordHash: string;
  openRouterKey?: string;
}

const MAX_TEXT_CHARS = 30000;
const MAX_BASE64_CHARS = 20000; // For non-PDF text fallback (CSV)
const MAX_PDF_BASE64_CHARS = 8000000; // allow larger PDFs; still capped to avoid huge requests
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

type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'file'; file: { filename: string; file_data: string } };

type PerFileResult = {
  file: { name: string; mime: string; sizeBytes: number };
  model: string;
  isPdf: boolean;
  wasTruncated: boolean;
  ok: boolean;
  transactionsCount: number;
  raw?: unknown;
  error?: string;
};

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
  const chosenModelForBatch = userModel || (hasPdf ? defaultPdfModel : defaultCsvModel);
  console.log('[IMPORT] Model selection (batch):', { hasPdf, userModel, selectedModel: chosenModelForBatch });

  const systemPrompt = [
    "You are a financial data extractor. Parse the provided bank statements (PDF or CSV text).",
    "If the user provides PDF files, use the PDF content to extract transactions. Do not invent transactions.",
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

  const perFile: PerFileResult[] = [];
  const allTransactions: ParsedTransaction[] = [];

  for (const file of files) {
    const name = file.name || 'statement';
    const mime = file.type || guessMime(name);
    const isPdf = (mime || '').includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const modelForFile = userModel || (isPdf ? defaultPdfModel : defaultCsvModel);

    console.log('[IMPORT] ===== File start =====', { name, mime, isPdf, modelForFile });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const sizeMb = arrayBuffer.byteLength / (1024 * 1024);
      console.log('[IMPORT] File bytes:', arrayBuffer.byteLength, '(', sizeMb.toFixed(2), 'MB )');
      if (sizeMb > 12) {
        throw new Error(`File ${name} too large (>12MB)`);
      }

      let textContent = '';
      if (mime.includes('text') || name.toLowerCase().endsWith('.csv')) {
        textContent = await file.text();
        console.log('[IMPORT] Extracted text content length:', textContent.length);
      }

      const base64 = toBase64(arrayBuffer);
      const maxBase64ForFile = isPdf ? MAX_PDF_BASE64_CHARS : MAX_BASE64_CHARS;
      const wasTruncated = base64.length > maxBase64ForFile;

      const safeText = textContent
        ? (textContent.length > MAX_TEXT_CHARS
          ? `${textContent.slice(0, MAX_TEXT_CHARS)}\n...[TRIMMED ${textContent.length - MAX_TEXT_CHARS} CHARS]`
          : textContent)
        : '';

      const safeBase64 = wasTruncated
        ? `${base64.slice(0, maxBase64ForFile)}...[TRIMMED ${base64.length - maxBase64ForFile} CHARS]`
        : base64;

      if (wasTruncated) {
        console.log('[IMPORT] WARNING: File base64 was truncated', {
          name,
          isPdf,
          originalSize: base64.length,
          maxSize: maxBase64ForFile,
        });
      }

      const userContent: OpenRouterContentPart[] = [];
      if (isPdf) {
        const fileData = `data:${mime};base64,${safeBase64}`;
        console.log('[IMPORT] Payload type: file(pdf)', 'length:', fileData.length);
        userContent.push({ type: 'text', text: `File: ${name} (${mime}). Extract transactions from this document.` });
        userContent.push({ type: 'file', file: { filename: name, file_data: fileData } });
      } else {
        const payload = safeText || `data:${mime};base64,${safeBase64}`;
        console.log('[IMPORT] Payload type:', safeText ? 'text' : 'base64', 'length:', payload.length);
        userContent.push({ type: 'text', text: `File: ${name} (${mime}). Content:\n${payload}` });
      }

      const requestBody: any = {
        model: modelForFile,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      };

      // Only enable the PDF parser when we actually send a PDF file part.
      // Docs: https://openrouter.ai/docs/features/multimodal/pdfs
      if (isPdf) {
        requestBody.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
      }

      console.log('[IMPORT] Calling OpenRouter (per-file):', { name, model: modelForFile, isPdf, bodyChars: JSON.stringify(requestBody).length });
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

      console.log('[IMPORT] OpenRouter response status (per-file):', name, aiRes.status, aiRes.statusText);
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        console.log('[IMPORT] ERROR: OpenRouter call failed (per-file):', name, txt.substring(0, 500));
        perFile.push({
          file: { name, mime, sizeBytes: arrayBuffer.byteLength },
          model: modelForFile,
          isPdf,
          wasTruncated,
          ok: false,
          transactionsCount: 0,
          error: txt,
        });
        continue;
      }

      const data = await aiRes.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      const raw = content;
      console.log('[IMPORT] Raw content preview (per-file):', name, typeof content === 'string' ? content.substring(0, 200) : JSON.stringify(content).substring(0, 200));

      let parsed: ParsedTransaction[] = [];
      try {
        const obj = typeof content === 'string' ? JSON.parse(content) : content;
        if (obj && Array.isArray(obj.transactions)) {
          parsed = obj.transactions;
        }
      } catch (e) {
        console.log('[IMPORT] ERROR: Could not parse AI response (per-file):', name, String(e));
        perFile.push({
          file: { name, mime, sizeBytes: arrayBuffer.byteLength },
          model: modelForFile,
          isPdf,
          wasTruncated,
          ok: false,
          transactionsCount: 0,
          raw,
          error: `Could not parse AI response: ${String(e)}`,
        });
        continue;
      }

      // Ensure source is always populated for downstream UX.
      const withSource = parsed.map(t => ({
        ...t,
        source: (t && typeof t === 'object' && (t as any).source) ? (t as any).source : name
      }));

      allTransactions.push(...withSource);
      perFile.push({
        file: { name, mime, sizeBytes: arrayBuffer.byteLength },
        model: modelForFile,
        isPdf,
        wasTruncated,
        ok: true,
        transactionsCount: withSource.length,
        raw,
      });

      console.log('[IMPORT] Parsed transactions (per-file):', name, withSource.length);
    } catch (e) {
      const msg = String(e);
      console.log('[IMPORT] ERROR: File processing failed:', name, msg);
      perFile.push({
        file: { name, mime, sizeBytes: file.size ?? 0 },
        model: modelForFile,
        isPdf,
        wasTruncated: false,
        ok: false,
        transactionsCount: 0,
        error: msg,
      });
    }
  }

  console.log('[IMPORT] Returning merged response:', { files: perFile.length, transactions: allTransactions.length });
  return jsonResponse({
    transactions: allTransactions,
    raw: perFile.map(r => ({ file: r.file.name, ok: r.ok, model: r.model, raw: r.raw, error: r.error })),
    perFile,
    selectedModel: chosenModelForBatch,
  });
};

