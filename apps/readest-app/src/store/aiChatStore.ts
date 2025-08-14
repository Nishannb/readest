import { create } from 'zustand';

export type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  context?: string[];
};

type PerBookMap<T> = { [bookKey: string]: T | undefined };

type AIChatState = {
  visibleByBookKey: PerBookMap<boolean>;
  messagesByBookKey: PerBookMap<AIChatMessage[]>;
  inputByBookKey: PerBookMap<string>;
  isStreamingByBookKey: PerBookMap<boolean>;
  contextByBookKey: PerBookMap<string[]>; // highlighted snippets queued for context
  expandedContextByBookKey: PerBookMap<{ [messageIndex: number]: { [snippetIndex: number]: boolean } }>;

  // Memory & summary per thread (scoped by bookKey)
  summaryByBookKey: PerBookMap<string>;
  notesByBookKey: PerBookMap<{ text: string; ts: number; salience: number; ttl: number }[]>;

  toggleVisible: (bookKey: string) => void;
  setVisible: (bookKey: string, visible: boolean) => void;
  setInput: (bookKey: string, val: string) => void;
  clear: (bookKey: string) => void;
  setSummary: (bookKey: string, summary: string) => void;
  addNotes: (bookKey: string, notes: { text: string; salience?: number; ttlDays?: number }[]) => void;
  retrieveNotes: (bookKey: string, query: string, k?: number) => string[];
  gcNotes: (bookKey: string) => void;
  addUserMessage: (bookKey: string, content: string, context?: string[]) => void;
  startAssistantMessage: (bookKey: string) => void;
  appendAssistantChunk: (bookKey: string, chunk: string) => void;
  setStreaming: (bookKey: string, v: boolean) => void;
  addContext: (bookKey: string, text: string) => void;
  clearContext: (bookKey: string) => void;
  removeContextAt: (bookKey: string, index: number) => void;
  toggleContextExpanded: (bookKey: string, messageIndex: number, snippetIndex: number) => void;
};

export const useAIChatStore = create<AIChatState>((set, get) => ({
  visibleByBookKey: {},
  messagesByBookKey: {},
  inputByBookKey: {},
  isStreamingByBookKey: {},
  contextByBookKey: {},
  expandedContextByBookKey: {},
  summaryByBookKey: {},
  notesByBookKey: {},

  toggleVisible: (bookKey) =>
    set((s) => ({
      visibleByBookKey: {
        ...s.visibleByBookKey,
        [bookKey]: !s.visibleByBookKey[bookKey],
      },
    })),

  setVisible: (bookKey, visible) =>
    set((s) => ({ visibleByBookKey: { ...s.visibleByBookKey, [bookKey]: visible } })),

  setInput: (bookKey, val) =>
    set((s) => ({ inputByBookKey: { ...s.inputByBookKey, [bookKey]: val } })),

  clear: (bookKey) =>
    set((s) => ({
      messagesByBookKey: { ...s.messagesByBookKey, [bookKey]: [] },
      inputByBookKey: { ...s.inputByBookKey, [bookKey]: '' },
      isStreamingByBookKey: { ...s.isStreamingByBookKey, [bookKey]: false },
      contextByBookKey: { ...s.contextByBookKey, [bookKey]: [] },
      expandedContextByBookKey: { ...s.expandedContextByBookKey, [bookKey]: {} },
      summaryByBookKey: { ...s.summaryByBookKey, [bookKey]: '' },
      notesByBookKey: { ...s.notesByBookKey, [bookKey]: [] },
    })),

  setSummary: (bookKey, summary) =>
    set((s) => ({ summaryByBookKey: { ...s.summaryByBookKey, [bookKey]: summary } })),

  addNotes: (bookKey, notes) =>
    set((s) => {
      const existing = [...(((s.notesByBookKey[bookKey] as { text: string; ts: number; salience: number; ttl: number }[]) ?? []))];
      const now = Date.now();
      const added = notes
        .map((n) => ({ text: n.text.trim(), salience: n.salience ?? 1.0, ttl: (n.ttlDays ?? 30) * 86400_000 }))
        .filter((n) => n.text.length > 0 && n.text.length <= 240);
      for (const n of added) {
        // Deduplicate by simple text match or high overlap
        const dupIdx = existing.findIndex((e) => similarity(e.text, n.text) > 0.9);
        if (dupIdx >= 0) {
          existing[dupIdx].salience = Math.min(2.0, existing[dupIdx].salience + 0.1);
          existing[dupIdx].ts = now;
        } else {
          existing.push({ text: n.text, ts: now, salience: n.salience, ttl: n.ttl });
        }
      }
      return { notesByBookKey: { ...s.notesByBookKey, [bookKey]: existing } };
    }),

  retrieveNotes: (bookKey, query, k = 5) => {
    const s = get();
    const all = (s.notesByBookKey[bookKey] as { text: string; ts: number; salience: number; ttl: number }[]) ?? [];
    if (all.length === 0) return [];
    const now = Date.now();
    const qTokens = tokenize(query);
    const scored = all.map((n) => {
      const score = scoreNote(qTokens, n.text, n.salience, now - n.ts);
      return { text: n.text, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(k, scored.length)).map((s) => s.text);
  },

  gcNotes: (bookKey) =>
    set((s) => {
      const now = Date.now();
      const all = (s.notesByBookKey[bookKey] as { text: string; ts: number; salience: number; ttl: number }[]) ?? [];
      const kept = all.filter((n) => now - n.ts <= n.ttl && n.salience >= 0.3);
      if (kept.length === all.length) return {} as any;
      return { notesByBookKey: { ...s.notesByBookKey, [bookKey]: kept } };
    }),

  addUserMessage: (bookKey, content, context) =>
    set((s) => ({
      messagesByBookKey: {
        ...s.messagesByBookKey,
        [bookKey]: [
          ...((s.messagesByBookKey[bookKey] as AIChatMessage[]) ?? []),
          { role: 'user', content, context: (context && context.length ? [...context] : undefined) },
        ],
      },
    })),

  startAssistantMessage: (bookKey) =>
    set((s) => ({
      messagesByBookKey: {
        ...s.messagesByBookKey,
        [bookKey]: [
          ...((s.messagesByBookKey[bookKey] as AIChatMessage[]) ?? []),
          { role: 'assistant', content: '' },
        ],
      },
    })),

  appendAssistantChunk: (bookKey, chunk) =>
    set((s) => {
      const msgs = [...(((s.messagesByBookKey[bookKey] as AIChatMessage[]) ?? []))];
      if (msgs.length === 0 || msgs[msgs.length - 1]?.role !== 'assistant') {
        msgs.push({ role: 'assistant', content: chunk });
      } else {
        msgs[msgs.length - 1] = {
          role: 'assistant',
          content: msgs[msgs.length - 1]!.content + chunk,
        };
      }
      return { messagesByBookKey: { ...s.messagesByBookKey, [bookKey]: msgs } };
    }),

  setStreaming: (bookKey, v) =>
    set((s) => ({ isStreamingByBookKey: { ...s.isStreamingByBookKey, [bookKey]: v } })),

  addContext: (bookKey, text) =>
    set((s) => ({
      contextByBookKey: {
        ...s.contextByBookKey,
        [bookKey]: [ ...((s.contextByBookKey[bookKey] as string[]) ?? []), text ],
      },
    })),
  clearContext: (bookKey) =>
    set((s) => ({
      contextByBookKey: { ...s.contextByBookKey, [bookKey]: [] },
    })),
  removeContextAt: (bookKey, index) =>
    set((s) => {
      const list = [ ...(((s.contextByBookKey[bookKey] as string[]) ?? [])) ];
      if (index >= 0 && index < list.length) list.splice(index, 1);
      return { contextByBookKey: { ...s.contextByBookKey, [bookKey]: list } };
    }),
  toggleContextExpanded: (bookKey, messageIndex, snippetIndex) =>
    set((s) => {
      const perBook = (s.expandedContextByBookKey[bookKey] as { [mi: number]: { [si: number]: boolean } }) ?? {};
      const perMsg = perBook[messageIndex] ?? {};
      return {
        expandedContextByBookKey: {
          ...s.expandedContextByBookKey,
          [bookKey]: {
            ...perBook,
            [messageIndex]: { ...perMsg, [snippetIndex]: !perMsg[snippetIndex] },
          },
        },
      };
    }),
}));

// --- Simple text utilities for local retrieval ---
function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 256);
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function scoreNote(qTokens: string[], noteText: string, salience: number, ageMs: number): number {
  const nt = tokenize(noteText);
  if (qTokens.length === 0 || nt.length === 0) return 0;
  const qset = new Set(qTokens);
  let overlap = 0;
  for (const t of nt) if (qset.has(t)) overlap++;
  const recencyBoost = 1 / (1 + ageMs / (7 * 86400_000)); // 1..~0 over ~weeks
  return overlap * 0.7 + salience * 0.2 + recencyBoost * 0.1;
}


