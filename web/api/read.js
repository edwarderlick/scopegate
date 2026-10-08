import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

const client = createClient({ chain: studioDevnet });

const ALLOWED_METHODS = [
  'list_workspaces',
  'get_workspace',
  'list_policies',
  'list_agents',
  'get_agent',
  'get_policy',
  'list_requests',
  'get_request',
  'list_evaluations',
  'get_evaluation',
  'list_permits',
  'get_permit',
  'list_posts',
  'get_post',
];

const cache = new Map();
const inFlight = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const address = req.query.address;
  const functionName = req.query.functionName;
  
  if (!address || !functionName || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Missing or invalid address/functionName' });
  }

  if (!ALLOWED_METHODS.includes(functionName)) {
    return res.status(403).json({ error: 'Method not allowlisted' });
  }

  let args = [];
  try {
    if (req.query.args) {
      args = JSON.parse(req.query.args);
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid args JSON' });
  }

  const normalizedArgs = JSON.stringify(args);
  const cacheKey = `${address}:${functionName}:${normalizedArgs}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached) {
    if (cached.error) {
      if (now < cached.expiresAt) {
        res.setHeader('Retry-After', Math.ceil((cached.expiresAt - now) / 1000));
        return res.status(cached.status).json({ error: cached.error });
      }
    } else if (now < cached.expiresAt) {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ result: cached.result, cachedAt: cached.cachedAt });
    }
  }

  if (inFlight.has(cacheKey)) {
    try {
      const result = await inFlight.get(cacheKey);
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ result, cachedAt: Date.now() });
    } catch (error) {
      if (error.message?.includes('Rate limit exceeded') || error.cause?.code === -32029) {
        res.setHeader('Retry-After', 5);
        return res.status(429).json({ error: 'Rate limit exceeded: 30 requests per minute.' });
      }
      return res.status(500).json({ error: error.message || 'Unknown read error' });
    }
  }

  const promise = client.readContract({ address, functionName, args });
  inFlight.set(cacheKey, promise);

  try {
    const result = await promise;
    inFlight.delete(cacheKey);
    cache.set(cacheKey, { result, cachedAt: Date.now(), expiresAt: Date.now() + 30000 });
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ result, cachedAt: Date.now() });
  } catch (error) {
    inFlight.delete(cacheKey);
    if (error.message?.includes('Rate limit exceeded') || error.cause?.code === -32029) {
      cache.set(cacheKey, { error: 'Rate limit exceeded: 30 requests per minute.', status: 429, expiresAt: Date.now() + 5000 });
      res.setHeader('Retry-After', 5);
      return res.status(429).json({ error: 'Rate limit exceeded: 30 requests per minute.' });
    }
    return res.status(500).json({ error: error.message || 'Unknown read error' });
  }
}
