import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const endpoint = (req.query.endpoint as string) || 'http://127.0.0.1:11434';

  try {
    const url = `${endpoint.replace(/\/$/, '')}/api/tags`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to query Ollama' });
    }
    const data = await response.json().catch(() => ({} as any));
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => m?.model || m?.name || '').filter((s: string) => !!s)
      : [];
    res.status(200).json({ models });
  } catch (err) {
    res.status(500).json({ error: 'Ollama query failed', details: (err as Error)?.message || String(err) });
  }
}



