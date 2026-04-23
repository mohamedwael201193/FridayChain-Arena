export const config = {
  api: {
    bodyParser: false,
  },
};

const REQUEST_HEADERS_TO_DROP = new Set([
  'connection',
  'content-length',
  'host',
  'origin',
  'referer',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-vercel-forwarded-for',
]);

const RESPONSE_HEADERS_TO_DROP = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);

const VALIDATOR_RPC_PREFIX = '/rpc.v1.ValidatorNode/';
const VALIDATOR_RPC_HOST_SUFFIXES = ['.linera.net', '.brightlystake.com'];

function isAllowedValidatorRpcHost(hostname) {
  return VALIDATOR_RPC_HOST_SUFFIXES.some((suffix) => (
    hostname === suffix.slice(1) || hostname.endsWith(suffix)
  ));
}

function isAllowedTarget(target) {
  return (
    target.protocol === 'https:' &&
    isAllowedValidatorRpcHost(target.hostname) &&
    target.pathname.startsWith(VALIDATOR_RPC_PREFIX)
  );
}

function normalizeHeaderValue(value) {
  return Array.isArray(value) ? value.join(', ') : value;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const targetParam = req.query.target;
  if (typeof targetParam !== 'string') {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing target URL' }));
    return;
  }

  let target;
  try {
    target = new URL(targetParam);
  } catch {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid target URL' }));
    return;
  }

  if (!isAllowedTarget(target)) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Target not allowed' }));
    return;
  }

  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(req.headers)) {
    const value = normalizeHeaderValue(rawValue);
    if (!value || REQUEST_HEADERS_TO_DROP.has(key.toLowerCase())) {
      continue;
    }
    headers.set(key, value);
  }

  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (!RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error('[linera-rpc proxy] Upstream request failed:', error);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Upstream validator request failed' }));
  }
}