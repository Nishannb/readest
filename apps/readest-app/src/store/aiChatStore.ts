import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  context?: string[];
};

type PerBookMap<T> = { [bookKey: string]: T | undefined };

type AIChatState = {
  visibleByBookKey: PerBookMap<boolean>;
  inputByBookKey: PerBookMap<string>;
  isStreamingByBookKey: PerBookMap<boolean>;
  contextByBookKey: PerBookMap<string[]>; // highlighted snippets queued for context
  expandedContextByBookKey: PerBookMap<{ [messageIndex: number]: { [snippetIndex: number]: boolean } }>;

  // Threads per book
  threadsByBookKey: PerBookMap<AIChatThread[]>;
  activeThreadIdByBookKey: PerBookMap<string>;

  toggleVisible: (bookKey: string) => void;
  setVisible: (bookKey: string, visible: boolean) => void;
  setInput: (bookKey: string, val: string) => void;
  clear: (bookKey: string) => void; // clears active thread messages
  // Thread controls
  createThread: (bookKey: string, title?: string) => string; // returns new thread id
  setActiveThread: (bookKey: string, threadId: string) => void;
  renameThread: (bookKey: string, threadId: string, title: string) => void;
  ensureThreadExists: (bookKey: string) => void;
  getThreadsMeta: (bookKey: string) => { id: string; title: string; updatedAt: number }[];
  getActiveThreadId: (bookKey: string) => string | undefined;
  getActiveThreadMessages: (bookKey: string) => AIChatMessage[];
  getActiveThreadSummary: (bookKey: string) => string;
  // Memory & summary per active thread
  setSummary: (bookKey: string, summary: string) => void;
  addNotes: (bookKey: string, notes: { text: string; salience?: number; ttlDays?: number }[]) => void;
  retrieveNotes: (bookKey: string, query: string, k?: number) => string[];
  gcNotes: (bookKey: string) => void;
  // Messaging APIs operate on active thread
  addUserMessage: (bookKey: string, content: string, context?: string[]) => void;
  startAssistantMessage: (bookKey: string) => void;
  appendAssistantChunk: (bookKey: string, chunk: string) => void;
  setStreaming: (bookKey: string, v: boolean) => void;
  addContext: (bookKey: string, text: string) => void;
  clearContext: (bookKey: string) => void;
  removeContextAt: (bookKey: string, index: number) => void;
  toggleContextExpanded: (bookKey: string, messageIndex: number, snippetIndex: number) => void;

  // NEW: hydrate threads from disk for a book
  hydrateThreads: (bookKey: string) => Promise<void>;
  // NEW: force save to disk immediately
  flushToDisk: (bookKey: string) => Promise<void>;
};

export type AIChatThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AIChatMessage[];
  summary: string;
  notes: { text: string; ts: number; salience: number; ttl: number }[];
};

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set, get) => ({
  visibleByBookKey: {},
  inputByBookKey: {},
  isStreamingByBookKey: {},
  contextByBookKey: {},
  expandedContextByBookKey: {},
  threadsByBookKey: {},
  activeThreadIdByBookKey: {},

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
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const activeId = s.activeThreadIdByBookKey[bookKey];
      const idx = activeId ? threads.findIndex((t) => t.id === activeId) : -1;
      if (idx >= 0) {
        threads[idx] = { ...threads[idx]!, messages: [], summary: '', notes: [], updatedAt: Date.now() };
      }
      // schedule disk save
      queueSaveThreads(bookKey, threads);
      return {
        threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: threads },
        inputByBookKey: { ...s.inputByBookKey, [bookKey]: '' },
        isStreamingByBookKey: { ...s.isStreamingByBookKey, [bookKey]: false },
        contextByBookKey: { ...s.contextByBookKey, [bookKey]: [] },
        expandedContextByBookKey: { ...s.expandedContextByBookKey, [bookKey]: {} },
      };
    }),

  // --- Thread helpers ---
  ensureThreadExists: (bookKey) => {
    const s = get();
    const threads = s.threadsByBookKey[bookKey] as AIChatThread[] ?? [];
    if (threads.length === 0) {
      const id = generateId();
      const now = Date.now();
      const thread: AIChatThread = {
        id,
        title: 'New chat',
        createdAt: now,
        updatedAt: now,
        messages: [],
        summary: '',
        notes: [],
      };
      const next = [thread];
      set((s) => ({
        threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: next },
        activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: id },
      }));
      // Save the new thread to disk
      queueSaveThreads(bookKey, next);
    } else if (!s.activeThreadIdByBookKey[bookKey]) {
      set((s) => ({
        activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: threads[0]!.id },
      }));
    }
  },

  createThread: (bookKey, title = 'New chat') => {
    const id = generateId();
    const now = Date.now();
    const thread: AIChatThread = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      summary: '',
      notes: [],
    };
    set((s) => {
      const next = capThreads([ ...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? []), thread ]);
      // schedule disk save
      queueSaveThreads(bookKey, next);
      return {
        threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: next },
        activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: id },
        inputByBookKey: { ...s.inputByBookKey, [bookKey]: '' },
        contextByBookKey: { ...s.contextByBookKey, [bookKey]: [] },
        expandedContextByBookKey: { ...s.expandedContextByBookKey, [bookKey]: {} },
      };
    });
    return id;
  },

  setActiveThread: (bookKey, threadId) =>
    set((s) => ({ activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: threadId } })),

  renameThread: (bookKey, threadId, title) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const idx = threads.findIndex((t) => t.id === threadId);
      if (idx >= 0) {
        threads[idx] = { ...threads[idx]!, title, updatedAt: Date.now() };
        queueSaveThreads(bookKey, threads);
      }
      return { threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: threads } };
    }),

  getThreadsMeta: (bookKey) => {
    const s = get();
    const threads = (s.threadsByBookKey[bookKey] as AIChatThread[] ?? []);
    return threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  getActiveThreadId: (bookKey) => {
    const s = get();
    return s.activeThreadIdByBookKey[bookKey];
  },

  getActiveThreadMessages: (bookKey) => {
    const s = get();
    const id = s.activeThreadIdByBookKey[bookKey];
    const threads = (s.threadsByBookKey[bookKey] as AIChatThread[] ?? []);
    const thr = id ? threads.find((t) => t.id === id) : undefined;
    return thr?.messages ?? [];
  },

  getActiveThreadSummary: (bookKey) => {
    const s = get();
    const id = s.activeThreadIdByBookKey[bookKey];
    const threads = (s.threadsByBookKey[bookKey] as AIChatThread[] ?? []);
    const thr = id ? threads.find((t) => t.id === id) : undefined;
    return thr?.summary ?? '';
  },

  setSummary: (bookKey, summary) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const id = s.activeThreadIdByBookKey[bookKey];
      const idx = id ? threads.findIndex((t) => t.id === id) : -1;
      if (idx >= 0) {
        threads[idx] = { ...threads[idx]!, summary, updatedAt: Date.now() };
        // maintain cap order by updatedAt
        threads.sort((a, b) => b.updatedAt - a.updatedAt);
        threads.splice(7);
      }
      // schedule disk save
      queueSaveThreads(bookKey, threads);
      return { threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: threads } };
    }),

  addNotes: (bookKey, notes) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const id = s.activeThreadIdByBookKey[bookKey];
      const idx = id ? threads.findIndex((t) => t.id === id) : -1;
      if (idx < 0) return {} as any;
      const existing = [...threads[idx]!.notes];
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
      threads[idx] = { ...threads[idx]!, notes: existing, updatedAt: now };
      // schedule disk save
      queueSaveThreads(bookKey, threads);
      return { threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: threads } };
    }),

  retrieveNotes: (bookKey, query, k = 5) => {
    const s = get();
    const id = s.activeThreadIdByBookKey[bookKey];
    const threads = (s.threadsByBookKey[bookKey] as AIChatThread[] ?? []);
    const thr = id ? threads.find((t) => t.id === id) : undefined;
    const all = thr?.notes ?? [];
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
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const id = s.activeThreadIdByBookKey[bookKey];
      const idx = id ? threads.findIndex((t) => t.id === id) : -1;
      if (idx < 0) return {} as any;
      const all = threads[idx]!.notes ?? [];
      const kept = all.filter((n) => now - n.ts <= n.ttl && n.salience >= 0.3);
      if (kept.length === all.length) return {} as any;
      threads[idx] = { ...threads[idx]!, notes: kept };
      // schedule disk save
      queueSaveThreads(bookKey, threads);
      return { threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: threads } };
    }),

  addUserMessage: (bookKey, content, context) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      let id = s.activeThreadIdByBookKey[bookKey];
      let idx = id ? threads.findIndex((t) => t.id === id) : -1;
      const now = Date.now();
      if (idx < 0) {
        // create default thread lazily
        const newId = generateId();
        threads.push({ id: newId, title: 'New chat', createdAt: now, updatedAt: now, messages: [], summary: '', notes: [] });
        id = newId;
        idx = threads.length - 1;
      }
      const m: AIChatMessage = { role: 'user', content, context: (context && context.length ? [...context] : undefined) };
      const prev = threads[idx]!.messages;
      const nextMsgs = [...prev, m];
      // Auto-title if default
      const title = (threads[idx]!.title === 'New chat' && prev.length === 0) ? truncateTitle(content) : threads[idx]!.title;
      threads[idx] = { ...threads[idx]!, title, messages: nextMsgs, updatedAt: now };
      const kept = capThreads(threads);
      // If active thread was pushed out by cap, keep it active by moving it to front
      const activeStillExists = kept.some((t) => t.id === id);
      const nextThreads = activeStillExists ? kept : capThreads([{ ...threads[idx]! }, ...kept]);
      // schedule disk save
      queueSaveThreads(bookKey, nextThreads);
      return {
        threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: nextThreads },
        activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: id! },
      };
    }),

  startAssistantMessage: (bookKey) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      let id = s.activeThreadIdByBookKey[bookKey];
      let idx = id ? threads.findIndex((t) => t.id === id) : -1;
      const now = Date.now();
      if (idx < 0) {
        const newId = generateId();
        threads.push({ id: newId, title: 'New chat', createdAt: now, updatedAt: now, messages: [], summary: '', notes: [] });
        id = newId;
        idx = threads.length - 1;
      }
      const prev = threads[idx]!.messages;
      const nextMsgs = [...prev, { role: 'assistant', content: '' }];
      threads[idx] = { ...threads[idx]!, messages: nextMsgs, updatedAt: now };
      const kept = capThreads(threads);
      // schedule disk save
      queueSaveThreads(bookKey, kept);
      return {
        threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: kept },
        activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: id! },
      };
    }),

  appendAssistantChunk: (bookKey, chunk) =>
    set((s) => {
      const threads = ([...(s.threadsByBookKey[bookKey] as AIChatThread[] ?? [])]);
      const id = s.activeThreadIdByBookKey[bookKey];
      const idx = id ? threads.findIndex((t) => t.id === id) : -1;
      if (idx < 0) return {} as any;
      const msgs = [...threads[idx]!.messages];
      if (msgs.length === 0 || msgs[msgs.length - 1]?.role !== 'assistant') {
        msgs.push({ role: 'assistant', content: chunk });
      } else {
        msgs[msgs.length - 1] = { role: 'assistant', content: msgs[msgs.length - 1]!.content + chunk };
      }
      threads[idx] = { ...threads[idx]!, messages: msgs, updatedAt: Date.now() };
      const kept = capThreads(threads);
      // schedule disk save
      queueSaveThreads(bookKey, kept);
      return { threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: kept } };
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

  // NEW: hydrate threads from disk for a book
  hydrateThreads: async (bookKey) => {
    const loaded = await readThreadsFromDisk(bookKey);
    if (loaded.length === 0) return;
    
    const capped = capThreads(loaded);
    set((s) => ({
      threadsByBookKey: { ...s.threadsByBookKey, [bookKey]: capped },
      activeThreadIdByBookKey: { ...s.activeThreadIdByBookKey, [bookKey]: capped[0]!.id },
    }));
  },
  // NEW: force save to disk immediately
  flushToDisk: async (bookKey) => {
    const s = get();
    const threads = (s.threadsByBookKey[bookKey] as AIChatThread[] ?? []);
    await saveThreadsToDisk(bookKey, threads);
  },
    }),
    {
      name: 'ai-chat-store-v3',
      version: 3,
      migrate: (persisted: any) => persisted as AIChatState,
      partialize: (s) => ({
        // Only persist UI bits; threads live on disk
        visibleByBookKey: s.visibleByBookKey,
        inputByBookKey: s.inputByBookKey,
        isStreamingByBookKey: s.isStreamingByBookKey,
        contextByBookKey: s.contextByBookKey,
        expandedContextByBookKey: s.expandedContextByBookKey,
      }),
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(name, value);
          } catch {}
        },
        removeItem: (name: string) => {
          try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
          } catch {}
        },
      })),
    },
  ),
);

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

function generateId(): string {
  // Simple random id
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function truncateTitle(s: string): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length <= 60 ? t : t.slice(0, 57) + '…';
}

function capThreads(threads: AIChatThread[]): AIChatThread[] {
  const list = [...threads];
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (list.length > 7) list.length = 7;
  return list;
}

function safeBookKey(bookKey: string): string {
  return (bookKey || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function persistentBookId(rawBookKey: string): string {
  const base = (rawBookKey || '').split('-')[0] || rawBookKey;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// --- Persistence: use Tauri filesystem for threads; UI bits fallback to localStorage ---
const ensureThreadsDir = async (bookKey: string): Promise<string> => {
  try {
    const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const key = persistentBookId(bookKey);
    const root = 'ai-chat';
    const bookRel = `ai-chat/${key}`;

    await mkdir(root, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
    await mkdir(bookRel, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});

    try {
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const basePath = await appDataDir();
      const absolute = await join(basePath, bookRel);
      console.log(`[AI Chat] Ensured threads dir: ${absolute}`);
    } catch {}

    return bookRel;
  } catch (e) {
    console.error(`[AI Chat] Failed to ensure threads directory:`, e);
    throw e;
  }
};

const readThreadsFromDisk = async (bookKey: string): Promise<AIChatThread[]> => {
  try {
    const { readDir, readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const key = persistentBookId(bookKey);
    const bookRel = `ai-chat/${key}`;

    const threads: AIChatThread[] = [];

    // 1) Read from stable folder if present
    if (await exists(bookRel, { baseDir: BaseDirectory.AppData })) {
      const entries = await readDir(bookRel, { baseDir: BaseDirectory.AppData });
      const threadFiles = entries.filter((e: any) => !e.isDirectory && e.name && String(e.name).endsWith('.json'));
      for (const file of threadFiles) {
        try {
          const content = await readTextFile(`${bookRel}/${file.name}`, { baseDir: BaseDirectory.AppData });
          const thread = JSON.parse(content) as AIChatThread;
          if (thread.id && Array.isArray(thread.messages)) threads.push(thread);
        } catch (e) {
          console.warn(`[AI Chat] Failed to read thread file ${file.name}:`, e);
        }
      }
    }

    // 2) Migration: also scan legacy per-session folders named `${key}-*` and merge
    try {
      const root = 'ai-chat';
      if (await exists(root, { baseDir: BaseDirectory.AppData })) {
        const rootEntries = await readDir(root, { baseDir: BaseDirectory.AppData });
        const legacyDirs = rootEntries.filter((e: any) => e.isDirectory && typeof e.name === 'string' && e.name.startsWith(`${key}-`));
        for (const dir of legacyDirs) {
          try {
            const legacyFiles = await readDir(`${root}/${dir.name}`, { baseDir: BaseDirectory.AppData });
            for (const f of legacyFiles) {
              if (f.isDirectory || !f.name || !String(f.name).endsWith('.json')) continue;
              try {
                const content = await readTextFile(`${root}/${dir.name}/${f.name}`, { baseDir: BaseDirectory.AppData });
                const t = JSON.parse(content) as AIChatThread;
                if (t.id && Array.isArray(t.messages)) threads.push(t);
              } catch {}
            }
          } catch {}
        }
      }
    } catch {}

    // Sort and cap; caller will write to stable folder on save
    const uniqueById = new Map<string, AIChatThread>();
    for (const t of threads) {
      const prev = uniqueById.get(t.id);
      if (!prev || (t.updatedAt || 0) > (prev.updatedAt || 0)) uniqueById.set(t.id, t);
    }
    const merged = Array.from(uniqueById.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return merged;
  } catch (e) {
    console.warn('[AI Chat] Failed to read threads from disk:', e);
    return [];
  }
};

const saveThreadsToDisk = async (bookKey: string, threads: AIChatThread[]): Promise<void> => {
  try {
    const { writeTextFile, removeFile, readDir, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const bookRel = await ensureThreadsDir(bookKey);

    // Remove old files not present anymore in stable folder
    if (await exists(bookRel, { baseDir: BaseDirectory.AppData })) {
      const entries = await readDir(bookRel, { baseDir: BaseDirectory.AppData });
      const existingFiles = entries.filter((e: any) => !e.isDirectory && e.name && String(e.name).endsWith('.json'));
      const currentThreadIds = new Set(threads.map((t) => t.id));
      for (const file of existingFiles) {
        const threadId = String(file.name).replace(/\.json$/, '');
        if (!currentThreadIds.has(threadId)) {
          await removeFile(`${bookRel}/${file.name}`, { baseDir: BaseDirectory.AppData }).catch(() => {});
          console.log(`[AI Chat] Removed old thread file: ${file.name}`);
        }
      }
    }

    // Write/update current threads into stable folder
    for (const thread of threads) {
      await writeTextFile(`${bookRel}/${thread.id}.json`, JSON.stringify(thread, null, 2), {
        baseDir: BaseDirectory.AppData,
      });
      console.log(`[AI Chat] Saved thread file: ${bookRel}/${thread.id}.json`);
    }
  } catch (e) {
    console.error('[AI Chat] Failed to save threads to disk:', e);
  }
};

const saveQueue = new Map<string, NodeJS.Timeout>();
const queueSaveThreads = (bookKey: string, threads: AIChatThread[]) => {
  console.log('[AI Chat] Queue save threads (debounced)');
  const existing = saveQueue.get(bookKey);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    console.log('[AI Chat] Debounce flush now');
    saveThreadsToDisk(bookKey, threads);
    saveQueue.delete(bookKey);
  }, 250);
  saveQueue.set(bookKey, timeout);
};


