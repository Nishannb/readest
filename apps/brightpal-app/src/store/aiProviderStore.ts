import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ProviderName = 'selfHosted' | 'gemini' | 'openai' | 'ollama' | 'openrouter';

export type SelfHostedConfig = {
  endpoint: string;
  apiKey?: string;
  model: string;
};

export type GeminiConfig = {
  apiKey?: string;
  model?: string; // default: gemini-2.0-flash
};

export type OpenAIConfig = {
  apiKey?: string;
  model?: string;
};

export type OllamaConfig = {
  endpoint?: string; // base URL, e.g. http://127.0.0.1:11434
  model?: string; // e.g. llama3.2, qwen2.5-coder:7b, etc.
};

export type OpenRouterConfig = {
  apiKey?: string;
  model?: string; // e.g. meta-llama/llama-4-maverick:free
};

type ProviderState = {
  defaultProvider: ProviderName;
  selfHosted: SelfHostedConfig;
  gemini: GeminiConfig;
  openai: OpenAIConfig;
  ollama: OllamaConfig;
  openrouter: OpenRouterConfig;
  setDefault: (p: ProviderName) => void;
  saveSelfHosted: (cfg: Partial<SelfHostedConfig>) => void;
  saveGemini: (cfg: Partial<GeminiConfig>) => void;
  saveOpenAI: (cfg: Partial<OpenAIConfig>) => void;
  saveOllama: (cfg: Partial<OllamaConfig>) => void;
  saveOpenRouter: (cfg: Partial<OpenRouterConfig>) => void;
};

export const useAIProviderStore = create<ProviderState>()(
  persist(
    (set) => ({
      defaultProvider: 'selfHosted',
      selfHosted: { endpoint: 'http://192.168.1.7:11500/api/generate', model: 'mistral:7b' },
      gemini: { model: 'gemini-2.0-flash' },
      openai: { model: 'gpt-4o' },
      ollama: { endpoint: 'http://127.0.0.1:11434', model: '' },
      openrouter: { model: 'meta-llama/llama-4-maverick:free' },
      setDefault: (p) => set({ defaultProvider: p }),
      saveSelfHosted: (cfg) => set((s) => ({ selfHosted: { ...s.selfHosted, ...cfg } })),
      saveGemini: (cfg) => set((s) => ({ gemini: { ...s.gemini, ...cfg } })),
      saveOpenAI: (cfg) => set((s) => ({ openai: { ...s.openai, ...cfg } })),
      saveOllama: (cfg) => set((s) => ({ ollama: { ...s.ollama, ...cfg } })),
      saveOpenRouter: (cfg) => set((s) => ({ openrouter: { ...s.openrouter, ...cfg } })),
    }),
    {
      name: 'ai-provider-store',
      version: 3,
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as ProviderState;
        const next = { ...persisted } as any;
        // Ensure ollama shape exists
        if (!next.ollama) next.ollama = { endpoint: 'http://127.0.0.1:11434', model: '' };
        // Clear legacy default model that might not exist locally
        if (fromVersion < 2) {
          if (next.ollama && next.ollama.model === 'llama3.2') {
            next.ollama = { ...next.ollama, model: '' };
          }
        }
        // Ensure openrouter shape exists
        if (fromVersion < 3) {
          if (!next.openrouter) next.openrouter = { model: 'meta-llama/llama-4-maverick:free' };
        }
        return next as ProviderState;
      },
      partialize: (s) => ({
        defaultProvider: s.defaultProvider,
        selfHosted: s.selfHosted,
        gemini: s.gemini,
        openai: s.openai,
        ollama: s.ollama,
        openrouter: s.openrouter,
      }),
    },
  ),
);


