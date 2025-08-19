import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const endpoint = (req.query.endpoint as string) || 'http://127.0.0.1:11434';

  const body = typeof req.body === 'string' ? safeParseJson(req.body) : req.body || {};
  const { stream } = body || {};

  try {
    const useChat = Array.isArray((body as any)?.messages);
    const path = useChat ? '/api/chat' : '/api/generate';
    const url = `${endpoint.replace(/\/$/, '')}${path}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: 'Upstream error', details: text });
    }

    if (stream) {
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstream.body?.getReader();
      if (!reader) {
        res.end();
        return;
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      } finally {
        res.end();
      }
      return;
    }

    const json = await upstream.json().catch(() => ({}));
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy generate failed', details: (err as Error)?.message || String(err) });
  }
}

function safeParseJson(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}


