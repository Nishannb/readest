import React, { useCallback, useState, useRef, useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import clsx from 'clsx';
import { useAIChatStore, type AIChatMessage, type AIChatThread } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { uniqueId } from '@/utils/misc';
import { FiSend, FiX, FiSettings, FiPlus, FiRefreshCw } from 'react-icons/fi';
import Button from '@/components/Button';
import { useAIProviderStore, ProviderName } from '@/store/aiProviderStore';
import { detectLookoutCommand } from '../utils/lookoutCommandDetection';
import { detectNotesCommand } from '../utils/notesCommandDetection';
import { PerformanceOptimizationService } from '../services/performanceOptimizationService';
import LookoutAgentLazy from './LookoutAgentLazy';


const InputRow: React.FC<{ bookKey: string; value: string; onChange: (v: string)=>void; onSend: ()=>void }> = ({ bookKey, value, onChange, onSend }) => {
  return (
    <div className='mb-0 flex items-end gap-2 border border-base-300 bg-base-200/20 px-3 py-2 shadow-sm w-full'>
      <textarea
        className='textarea textarea-bordered flex-1 bg-transparent leading-tight w-full'
        style={{ minHeight: '5.5rem', maxHeight: '8rem' }}
        placeholder='Ask AI… (use @notes <text> to add to notebook)'
        value={value}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button className='btn btn-neutral btn-sm' onClick={onSend} title='Send'>
        {useAIChatStore.getState()?.isStreamingByBookKey?.[bookKey] ? (
          <span className='relative inline-block w-4 h-4'>
            <span className='absolute inset-0 rounded-full border-2 border-base-300 border-t-transparent animate-spin' />
          </span>
        ) : (
          <FiSend size={16} />
        )}
      </button>
    </div>
  )
}


// Comprehensive Markdown formatter for chat content supporting:
// - Tables with proper HTML table rendering (e.g., | Header | Header |\n|--------|--------|\n| Cell | Cell |)
// - Code blocks with syntax highlighting (e.g., ```javascript\ncode here\n```)
// - Headings with proper hierarchy (e.g., # H1, ## H2, ### H3)
// - Lists (bullet: - item or * item, ordered: 1. item, 2. item)
// - Inline formatting (bold: **text**, italic: *text*, code: `text`)
// - Think blocks for AI reasoning (<think>content</think>)
// 
// Examples:
// Tables: | Name | Age | City |\n|-------|-----|------|\n| John | 25 | NYC |\n| Jane | 30 | LA |
// Code: ```python\nprint("Hello World")\n```
// Headings: # Main Title\n## Subtitle\n### Section
// Lists: - First item\n- Second item\n1. First\n2. Second
const ChatFormattedText: React.FC<{ text: string }> = ({ text }) => {
  const [dotCount, setDotCount] = React.useState(0);

  // Parse and render Markdown table
  const renderTable = (tableText: string, keyPrefix: string) => {
    const lines = tableText.trim().split('\n');
    if (lines.length < 2) return null;

    // Parse header
    const headerLine = lines[0];
    if (!headerLine) return null;
    const headers = headerLine.split('|').map(h => h.trim()).filter(Boolean);
    
    // Skip separator line (contains dashes)
    const dataLines = lines.slice(2).filter(line => line.trim() && !line.includes('---'));
    
    // Parse data rows
    const rows = dataLines.map(line => 
      line.split('|').map(cell => cell.trim()).filter(Boolean)
    );

    return (
      <div key={`${keyPrefix}-table`} className="overflow-x-auto my-2">
        <table className="table table-sm table-bordered w-full">
          <thead>
            <tr>
              {headers.map((header, idx) => (
                <th key={`${keyPrefix}-header-${idx}`} className="bg-base-200 text-base-content font-semibold px-3 py-2 text-left">
                  {renderInline(header, `${keyPrefix}-header-${idx}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={`${keyPrefix}-row-${rowIdx}`}>
                {row.map((cell, cellIdx) => (
                  <td key={`${keyPrefix}-cell-${rowIdx}-${cellIdx}`} className="px-3 py-2 border-t">
                    {renderInline(cell, `${keyPrefix}-cell-${rowIdx}-${cellIdx}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Parse and render code block
  const renderCodeBlock = (codeText: string, keyPrefix: string) => {
    const lines = codeText.trim().split('\n');
    if (lines.length === 0) return null;

    // Extract language from first line if it exists
    const firstLine = lines[0];
    if (!firstLine) return null;
    const languageMatch = firstLine.match(/^```(\w+)?/);
    const language = languageMatch?.[1] || '';
    const codeContent = languageMatch ? lines.slice(1, -1).join('\n') : lines.join('\n');

    return (
      <div key={`${keyPrefix}-code`} className="my-3">
        {language && (
          <div className="text-xs text-base-content/60 bg-base-200 px-3 py-1 rounded-t border-b">
            {language}
          </div>
        )}
        <pre className={`bg-base-300 text-base-content p-3 rounded-b overflow-x-auto ${language ? '' : 'rounded-t'}`}>
          <code>{codeContent}</code>
        </pre>
      </div>
    );
  };

  // Parse and render heading
  const renderHeading = (line: string, keyPrefix: string) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return null;

    const level = match[1].length;
    const content = match[2];
    if (!content) return null;
    const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
    
    const headingClasses = {
      1: 'text-2xl font-bold my-4',
      2: 'text-xl font-bold my-3',
      3: 'text-lg font-bold my-2',
      4: 'text-base font-semibold my-2',
      5: 'text-sm font-semibold my-1',
      6: 'text-xs font-semibold my-1'
    };

    return (
      <Tag key={`${keyPrefix}-heading`} className={headingClasses[level as keyof typeof headingClasses]}>
        {renderInline(content, `${keyPrefix}-heading-content`)}
      </Tag>
    );
  };

  // Parse and render inline formatting
  const renderInline = (s: string, keyPrefix: string) => {
    const parts: React.ReactNode[] = [];
    if (!s) return parts;

    // Enhanced regex to handle more inline formatting
    const regex = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let idx = 0;
    
    while ((match = regex.exec(s)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      if (start > lastIndex) {
        parts.push(<span key={`${keyPrefix}-t-${idx++}`}>{s.slice(lastIndex, start)}</span>);
      }
      const token = match[0];
      if (token.startsWith('***')) {
        parts.push(
          <strong key={`${keyPrefix}-b+i-${idx++}`}><em>{token.slice(3, -3)}</em></strong>
        );
      } else if (token.startsWith('**')) {
        parts.push(
          <strong key={`${keyPrefix}-b-${idx++}`}>{token.slice(2, -2)}</strong>
        );
      } else if (token.startsWith('*')) {
        parts.push(
          <em key={`${keyPrefix}-i-${idx++}`}>{token.slice(1, -1)}</em>
        );
      } else if (token.startsWith('`')) {
        parts.push(
          <code key={`${keyPrefix}-code-${idx++}`} className="bg-base-200 px-1 py-0.5 rounded text-sm font-mono">
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = end;
    }
    if (lastIndex < s.length) {
      parts.push(<span key={`${keyPrefix}-t-${idx++}`}>{s.slice(lastIndex)}</span>);
    }
    return parts;
  };

  // Parse and render list
  const renderList = (lines: string[], startIndex: number, keyPrefix: string) => {
    const items: { content: string; type: 'bullet' | 'ordered' }[] = [];
    let i = startIndex;
    
    while (i < lines.length) {
      const line = lines[i];
      if (!line) break;
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
      
      if (bulletMatch) {
        const content = bulletMatch[1];
        if (content) items.push({ content, type: 'bullet' });
        i++;
      } else if (orderedMatch) {
        const content = orderedMatch[2];
        if (content) items.push({ content, type: 'ordered' });
        i++;
      } else {
        break;
      }
    }

    if (items.length === 0) return { items: [], nextIndex: startIndex };

    const isOrdered = items[0]?.type === 'ordered';
    const ListTag = isOrdered ? 'ol' : 'ul';
    const listClass = isOrdered ? 'list-decimal' : 'list-disc';

    const listElement = (
      <ListTag key={`${keyPrefix}-list`} className={`${listClass} pl-5 my-2`}>
        {items.map((item, idx) => (
          <li key={`${keyPrefix}-item-${idx}`} className="my-1">
            {renderInline(item.content, `${keyPrefix}-item-${idx}`)}
          </li>
        ))}
      </ListTag>
    );

    return { items: [listElement], nextIndex: i };
  };

  // Stream-friendly split: toggle think styling as soon as <think> appears,
  // even if </think> hasn't arrived yet
  const segments: { type: 'text' | 'think'; content: string }[] = [];
  let buffer = '';
  let inThink = false;
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<think>', i)) {
      if (buffer) segments.push({ type: inThink ? 'think' : 'text', content: buffer });
      buffer = '';
      inThink = true;
      i += '<think>'.length;
      continue;
    }
    if (text.startsWith('</think>', i)) {
      if (buffer) segments.push({ type: inThink ? 'think' : 'text', content: buffer });
      buffer = '';
      inThink = false;
      i += '</think>'.length;
      continue;
    }
    buffer += text[i] as string;
    i += 1;
  }
  if (buffer) segments.push({ type: inThink ? 'think' : 'text', content: buffer });
  const isThinking = inThink;

  React.useEffect(() => {
    if (isThinking) {
      const id = setInterval(() => {
        setDotCount((c) => (c + 1) % 4);
      }, 400);
      return () => clearInterval(id);
    } else {
      setDotCount(0);
    }
    return undefined;
  }, [isThinking]);

  const blocks: React.ReactNode[] = [];
  let blockIdx = 0;
  
  for (const seg of segments) {
    if (seg.type === 'think') {
      blocks.push(
        <div key={`think-${blockIdx++}`} className="whitespace-pre-wrap text-base-content/70 pl-[4.5px] bg-base-200/50 p-2 rounded" style={{ fontSize: '0.9em' }}>
          {seg.content}
        </div>
      );
      continue;
    }

    const s = seg.content;
    const lines = s.split('\n');
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i++;
        continue;
      }
      
      // Check for code blocks
      if (line.trim().startsWith('```')) {
        const codeStart = i;
        let codeEnd = i + 1;
        while (codeEnd < lines.length && !lines[codeEnd]?.trim().startsWith('```')) {
          codeEnd++;
        }
        if (codeEnd < lines.length) {
          const codeBlock = lines.slice(codeStart, codeEnd + 1).join('\n');
          const codeElement = renderCodeBlock(codeBlock, `code-${blockIdx}`);
          if (codeElement) blocks.push(codeElement);
          i = codeEnd + 1;
          blockIdx++;
          continue;
        }
      }
      
      // Check for tables
      if (line.includes('|') && i + 1 < lines.length && lines[i + 1]?.includes('---')) {
        const tableStart = i;
        let tableEnd = i + 1;
        while (tableEnd < lines.length && (lines[tableEnd]?.includes('|') || lines[tableEnd]?.includes('---'))) {
          tableEnd++;
        }
        const tableBlock = lines.slice(tableStart, tableEnd).join('\n');
        const tableElement = renderTable(tableBlock, `table-${blockIdx}`);
        if (tableElement) blocks.push(tableElement);
        i = tableEnd;
        blockIdx++;
        continue;
      }
      
      // Check for headings
      if (line.match(/^#{1,6}\s+/)) {
        const headingElement = renderHeading(line, `heading-${blockIdx}`);
        if (headingElement) {
          blocks.push(headingElement);
          i++;
          blockIdx++;
          continue;
        }
      }
      
      // Check for lists
      if (line.match(/^\s*[-*]\s+/) || line.match(/^\s*\d+\.\s+/)) {
        const { items, nextIndex } = renderList(lines, i, `list-${blockIdx}`);
        if (items.length > 0) {
          blocks.push(...items);
          i = nextIndex;
          blockIdx++;
          continue;
        }
      }
      
      // Regular text line
      if (line.trim()) {
        blocks.push(
          <div key={`p-${blockIdx++}`} className="my-1">
            {renderInline(line, `p-${blockIdx}`)}
          </div>
        );
      } else {
        // Empty line for spacing
        blocks.push(<div key={`spacer-${blockIdx++}`} className="h-2" />);
      }
      i++;
    }
  }

  return (
    <div className="space-y-1">
      {isThinking && (
        <div className="text-base-content/70 pl-[4.5px] bg-base-200/50 p-2 rounded" style={{ fontSize: '0.9em' }}>
          {`Thinking${'.'.repeat(dotCount)}`}
        </div>
      )}
      {blocks}
    </div>
  );
};

const OllamaModelPicker: React.FC = () => {
  const provider = useAIProviderStore();
  const endpoint = provider.ollama.endpoint || 'http://127.0.0.1:11434';
  const [models, setModels] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ollama/models?endpoint=${encodeURIComponent(endpoint)}`);
      if (!res.ok) throw new Error('Failed to list models');
      const data = await res.json();
      const list: string[] = Array.isArray(data?.models) ? data.models : [];
      setModels(list);
      // Auto-select a model only if the current saved model is not in the new list
      if (list.length > 0) {
        const cur = provider.ollama.model || '';
        if (!cur || !list.includes(cur)) {
          provider.saveOllama({ model: list[0] });
        }
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to fetch models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className='grid gap-2 text-xs'>
      <div className='flex gap-2'>
        <input
          className='input input-bordered input-xs flex-1'
          placeholder='Ollama endpoint (e.g. http://127.0.0.1:11434)'
          defaultValue={provider.ollama.endpoint || ''}
          onBlur={(e) => provider.saveOllama({ endpoint: e.target.value })}
        />
        <button className='btn btn-outline btn-xs' onClick={load} title='Refresh models'>
          <FiRefreshCw size={12} />
        </button>
      </div>
      <div className='text-[11px] opacity-70'>
        Tip: Use <code>ollama list</code> to see installed models. On macOS, model files are typically under <code>~/Library/Application Support/Ollama</code>.
      </div>
      <select
        className='select select-bordered select-xs'
        value={provider.ollama.model || ''}
        onChange={(e) => provider.saveOllama({ model: e.target.value })}
      >
        <option value='' disabled>
          {loading ? 'Loading models…' : models.length ? 'Choose a model' : 'No local models found'}
        </option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {error && <div className='text-[11px] text-error'>{error}</div>}
    </div>
  );
};

const OpenRouterModelPicker: React.FC = () => {
  const provider = useAIProviderStore();
  const [models, setModels] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) throw new Error('Failed to list models');
      const data = await res.json();
      const list: string[] = Array.isArray(data?.data)
        ? data.data
            .map((m: any) => m?.id as string)
            .filter((id: string) => typeof id === 'string' && /:free$/.test(id))
        : [];
      setModels(list);
      if (list.length > 0) {
        const cur = provider.openrouter.model || '';
        if (!cur || !list.includes(cur)) {
          provider.saveOpenRouter({ model: list[0] });
        }
      }
    } catch (e) {
      setError((e as Error)?.message || 'Failed to fetch models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className='grid gap-2 text-xs'>
      <div className='flex gap-2'>
        <input
          className='input input-bordered input-xs flex-1'
          placeholder='OpenRouter API Key'
          type='password'
          defaultValue={provider.openrouter.apiKey || ''}
          onBlur={(e) => provider.saveOpenRouter({ apiKey: e.target.value })}
        />
        <button className='btn btn-outline btn-xs' onClick={load} title='Refresh models'>
          <FiRefreshCw size={12} />
        </button>
      </div>
      <div className='text-[11px] opacity-70'>
        Only free models are shown. Create a free key at openrouter.ai.
      </div>
      <select
        className='select select-bordered select-xs'
        value={provider.openrouter.model || ''}
        onChange={(e) => provider.saveOpenRouter({ model: e.target.value })}
      >
        <option value='' disabled>
          {loading ? 'Loading models…' : models.length ? 'Choose a model' : 'No free models found'}
        </option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {error && <div className='text-[11px] text-error'>{error}</div>}
    </div>
  );
};

const AIChatPanel: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const visible = useAIChatStore((s) => s.visibleByBookKey[bookKey]);
  const input = useAIChatStore((s) => s.inputByBookKey[bookKey]);
  const setInput = useAIChatStore((s) => s.setInput);
  const EMPTY_THREADS: AIChatThread[] = React.useMemo(() => [], []);
  const threads = useAIChatStore((s) => (s.threadsByBookKey[bookKey] as AIChatThread[]) || EMPTY_THREADS, shallow);
  const activeThreadId = useAIChatStore((s) => s.activeThreadIdByBookKey[bookKey]);
  const addUserMessage = useAIChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useAIChatStore((s) => s.startAssistantMessage);
  const appendAssistantChunk = useAIChatStore((s) => s.appendAssistantChunk);
  const setStreaming = useAIChatStore((s) => s.setStreaming);
  const setVisible = useAIChatStore((s) => s.setVisible);
  const clearContext = useAIChatStore((s) => s.clearContext);
  const createThread = useAIChatStore((s) => s.createThread);
  const setActiveThread = useAIChatStore((s) => s.setActiveThread);
  const ensureThreadExists = useAIChatStore((s) => s.ensureThreadExists);
  const provider = useAIProviderStore();
  const [activeProvider, setActiveProvider] = React.useState<ProviderName>(() => provider.defaultProvider as ProviderName);
  // Memory & summary
  const setSummary = useAIChatStore((s) => s.setSummary);
  const retrieveNotes = useAIChatStore((s) => s.retrieveNotes);
  const addNotes = useAIChatStore((s) => s.addNotes);
  const gcNotes = useAIChatStore((s) => s.gcNotes);
  const EMPTY_CTX: string[] = React.useMemo(() => [], []);
  const EMPTY_EXPANDED: Record<number, boolean> = React.useMemo(() => ({}), []);
  const contextFromStore = useAIChatStore((s) => s.contextByBookKey[bookKey], shallow);
  const removeContextAt = useAIChatStore((s) => s.removeContextAt);
  const contextSnippets = contextFromStore ?? EMPTY_CTX;
  const expandedFromStore = useAIChatStore((s) => s.expandedContextByBookKey[bookKey], shallow);
  const expandedMap = expandedFromStore ?? EMPTY_EXPANDED;
  const toggleContextExpanded = useAIChatStore((s) => s.toggleContextExpanded);
  const [showSettings, setShowSettings] = React.useState(false);
  const [threadListOpen, setThreadListOpen] = React.useState(false);
  
  // Book data and reader store hooks
  const { getConfig, saveConfig, updateBooknotes } = useBookDataStore();
  const { getProgress } = useReaderStore();
  const { settings } = useSettingsStore();
  const { envConfig } = useEnv();
  
  // Lookout agent state management
  const [lookoutModalOpen, setLookoutModalOpen] = useState(false);
  const [lookoutQuestion, setLookoutQuestion] = useState('');
  const [lookoutContext, setLookoutContext] = useState<string | undefined>(undefined);
  
  // Panel resize functionality
  const [panelWidth, setPanelWidth] = React.useState(448); // Start with default width
  const [isResizing, setIsResizing] = React.useState(false);
  const resizeRef = React.useRef<HTMLDivElement>(null);
  const startXRef = React.useRef<number>(0);
  const startWidthRef = React.useRef<number>(0);

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle resize move
  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.max(320, Math.min(800, startWidthRef.current + deltaX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Finalize the panel width when mouse is released
      const finalDeltaX = startXRef.current - e.clientX;
      const finalWidth = Math.max(320, Math.min(800, startWidthRef.current + finalDeltaX));
      setPanelWidth(finalWidth);
      
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  
  // Performance optimization refs
  const debouncedDetectionRef = useRef<((input: string) => void) | null>(null);
  const [, setIsLookoutCommand] = useState(false);
  
  // Initialize debounced command detection
  useEffect(() => {
    if (!debouncedDetectionRef.current) {
      debouncedDetectionRef.current = (inputValue: string) => {
        PerformanceOptimizationService.detectLookoutCommandDebounced(inputValue, (result) => {
          setIsLookoutCommand(result.isLookoutCommand);
        });
      };
    }
  }, []);
  
  // Handle input changes with debounced command detection
  const handleInputChange = useCallback((value: string) => {
    setInput(bookKey, value);
    
    // Debounced command detection for UI feedback
    if (debouncedDetectionRef.current) {
      debouncedDetectionRef.current(value);
    }
  }, [bookKey, setInput]);

  // Cleanup effect for performance optimizations
  useEffect(() => {
    return () => {
      // Cancel any pending lookout requests when component unmounts
      PerformanceOptimizationService.cancelAllRequests();
    };
  }, []);

  // Ensure a thread exists when component mounts (after hydrating from disk)
  useEffect(() => {
    if (visible && bookKey) {
      (async () => {
        const hydrate = useAIChatStore.getState().hydrateThreads;
        await hydrate(bookKey);
        ensureThreadExists(bookKey);
      })();
    }
  }, [visible, bookKey, ensureThreadExists]);

  const activeThread = React.useMemo(() => {
    const thr = threads.find((t) => t.id === activeThreadId) || threads[0];
    return thr || null;
  }, [threads, activeThreadId]);
  const messages = activeThread?.messages ?? [];
  const summary = activeThread?.summary ?? '';

  const sendPrompt = useCallback(async () => {
    const prompt = (input ?? '').trim();
    if (!prompt || !visible) return;
    
    // Check if this is a lookout command (immediate check for send action)
    const lookoutCommand = detectLookoutCommand(prompt, contextSnippets);
    if (lookoutCommand.isLookoutCommand) {
      // Handle lookout command by opening the modal
      setLookoutQuestion(lookoutCommand.question);
      setLookoutContext(lookoutCommand.highlightedContext);
      setLookoutModalOpen(true);
      
      // Clear input since we detected the command
      setInput(bookKey, '');
      return;
    }
    
    // Check if this is a notes command
    const notesCommand = detectNotesCommand(prompt, contextSnippets);
    if (notesCommand.isNotesCommand) {
      // Handle notes command by creating the note and showing response in chat
      await handleNotesCommand(notesCommand, contextSnippets);
      return;
    }
    
    // snapshot current context to bind to this user message
    const boundContext = contextSnippets.length ? [...contextSnippets] : undefined;

    // Build composite prompt with memory (before mutating messages state)
    const SLIDING_WINDOW_TURNS = 8;
    const prevMessages = (messages ?? []).slice(-SLIDING_WINDOW_TURNS);
    const recent = prevMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    const retrieved = retrieveNotes?.(bookKey, prompt, 5) ?? [];
    const summaryLocal = summary || '';
    const systemPreamble = [
      'You are a concise, helpful assistant.',
      summaryLocal ? `Conversation summary:\n${summaryLocal}` : '',
      retrieved.length ? `Relevant notes:\n- ${retrieved.join('\n- ')}` : '',
      boundContext?.length ? `Additional context:\n${boundContext.join('\n\n')}` : '',
      recent ? `Recent chat:\n${recent}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const fullPrompt = [systemPreamble, `User: ${prompt}`, 'Assistant:'].filter(Boolean).join('\n\n');

    // Now record the user message into the thread
    addUserMessage(bookKey, prompt, boundContext);
    // clear pending context queue after binding to this message
    clearContext(bookKey);
    setInput(bookKey, '');
    startAssistantMessage(bookKey);
    setStreaming(bookKey, true);

    try {
      let fullAssistant = '';
      if (provider.defaultProvider === 'gemini') {
        const apiKey = provider.gemini.apiKey || '';
        const model = provider.gemini.model || 'gemini-2.0-flash';

        // Build multimodal request: include boundContext images as inlineData
        const toBase64 = (buffer: ArrayBuffer) => {
          let binary = '';
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
          // btoa is available in browser/webview
          return btoa(binary);
        };

        const imageParts: any[] = [];
        const maxImages = 3;
        const ctx = boundContext ?? [];
        for (const t of ctx) {
          if (imageParts.length >= maxImages) break;
          // data URI inside the snippet
          const dataMatch = t.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (dataMatch) {
            imageParts.push({ inlineData: { mimeType: dataMatch[1] as string, data: dataMatch[2] as string } });
            continue;
          }
          // markdown image or direct URL
          let src = '';
          const md = t.match(/!\[[^\]]*\]\(([^)]+)\)/);
          if (md) src = md[1] || '';
          else if (/^https?:\/\//i.test(t)) src = t;
          if (!src) continue;
          if (/^data:image\//i.test(src)) {
            const m = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (m) imageParts.push({ inlineData: { mimeType: m[1] as string, data: m[2] as string } });
            continue;
          }
          // Try fetch http(s) and inline (CORS may block in web)
          try {
            const resp = await fetch(src as string, { mode: 'cors' as RequestMode });
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              const ct = resp.headers.get('content-type') || 'image/png';
              imageParts.push({ inlineData: { mimeType: ct, data: toBase64(buf) } });
            }
          } catch {}
          if (imageParts.length >= maxImages) break;
        }

        const parts: any[] = [];
        if (systemPreamble) parts.push({ text: systemPreamble });
        for (const p of imageParts) parts.push(p);
        parts.push({ text: `User: ${prompt}` });

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
        });
        if (!res.ok) throw new Error('Gemini request failed');
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
        fullAssistant = text;
        appendAssistantChunk(bookKey, text);
      } else if (provider.defaultProvider === 'ollama') {
        const base = provider.ollama.endpoint || 'http://127.0.0.1:11434';
        const modelName = provider.ollama.model || '';
        if (!modelName) throw new Error('No model selected for Ollama');
        const res = await fetch(`/api/ollama/generate?endpoint=${encodeURIComponent(base)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, prompt: fullPrompt, stream: true }),
        });
        if (!res.ok || !res.body) {
          try { console.error('Ollama error', await res.text()); } catch {}
          throw new Error('Something went wrong. Check your internet or try changing the model.');
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const parts = buffer.split(/\n+/);
          buffer = parts.pop() ?? '';
          for (const p of parts) {
            const line = p.trim();
            if (!line) continue;
            try {
              const obj = JSON.parse(line);
              if (typeof obj?.response === 'string') {
                fullAssistant += obj.response;
                appendAssistantChunk(bookKey, obj.response);
              }
            } catch {}
          }
        }
      } else if (provider.defaultProvider === 'openrouter') {
        const apiKey = provider.openrouter.apiKey || '';
        const modelName = provider.openrouter.model || 'meta-llama/llama-4-maverick:free';
        if (!apiKey) throw new Error('OpenRouter API key is required');
        const messagesForOR = [
          ...(systemPreamble ? [{ role: 'system', content: systemPreamble }] : []),
          { role: 'user', content: prompt },
        ];
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: modelName, messages: messagesForOR, temperature: 0.7, max_tokens: 1024, stream: false }),
        });
        if (!res.ok) {
          try { console.error('OpenRouter error', await res.text()); } catch {}
          throw new Error('OpenRouter request failed');
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        fullAssistant = text;
        appendAssistantChunk(bookKey, text);
      } else {
        const endpoint = provider.selfHosted.endpoint;
        const modelName = provider.selfHosted.model || 'mistral:7b';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(provider.selfHosted.apiKey ? { Authorization: `Bearer ${provider.selfHosted.apiKey}` } : {}) },
          body: JSON.stringify({ model: modelName, prompt: fullPrompt, stream: true }),
        });
        if (!res.ok || !res.body) {
          try { console.error('SelfHosted error', await res.text()); } catch {}
          throw new Error('Something went wrong. Check your internet or try changing the model.');
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const parts = buffer.split(/\n+/);
          buffer = parts.pop() ?? '';
          for (const p of parts) {
            const line = p.trim();
            if (!line) continue;
            const jsonStr = line.startsWith('data:') ? line.slice(5).trim() : line;
            try {
              const obj = JSON.parse(jsonStr);
              if (typeof obj?.response === 'string') {
                fullAssistant += obj.response;
                appendAssistantChunk(bookKey, obj.response);
              }
            } catch {}
          }
        }
        // If buffer has leftover JSON, try to parse last one
        try {
          const line = buffer.trim();
          if (line) {
            const obj = JSON.parse(line.startsWith('data:') ? line.slice(5).trim() : line);
            if (typeof obj?.response === 'string') {
              fullAssistant += obj.response;
              appendAssistantChunk(bookKey, obj.response);
            }
          }
        } catch {}
      }
    } catch (e) {
      const msg = (e as Error)?.message || 'Something went wrong. Check your internet or try changing the model.';
      appendAssistantChunk(bookKey, `\n${msg}`);
    } finally {
      setStreaming(bookKey, false);
    }
    // After assistant response, update summary and extract notes
    try {
      const lastUser = prompt;
      // get the latest assistant content from store to be safe
      const msgs: any[] = messages ?? [];
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')?.content || '';

      const genOnce = async (p: string): Promise<string> => {
        if (provider.defaultProvider === 'gemini') {
          const apiKey = provider.gemini.apiKey || '';
          const model = provider.gemini.model || 'gemini-2.0-flash';
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] }),
          });
          if (!res.ok) throw new Error('Gemini request failed');
          const data = await res.json();
          return data?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') || '';
        } else if (provider.defaultProvider === 'ollama') {
          const base = provider.ollama.endpoint || 'http://127.0.0.1:11434';
          const modelName = provider.ollama.model || '';
          if (!modelName) throw new Error('No model selected for Ollama');
          const res = await fetch(`/api/ollama/generate?endpoint=${encodeURIComponent(base)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName, prompt: p, stream: false }),
          });
          if (!res.ok) {
            try { console.error('Ollama error', await res.text()); } catch {}
            throw new Error('Something went wrong. Check your internet or try changing the model.');
          }
          const data = await res.json().catch(() => undefined as any);
          if (data && typeof data.response === 'string') return data.response;
          return typeof data === 'string' ? data : '';
        } else if (provider.defaultProvider === 'openrouter') {
          const apiKey = provider.openrouter.apiKey || '';
          const modelName = provider.openrouter.model || 'meta-llama/llama-4-maverick:free';
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: p }], stream: false }),
          });
          if (!res.ok) throw new Error('OpenRouter request failed');
          const data = await res.json();
          return data?.choices?.[0]?.message?.content || '';
        } else {
          const endpoint = provider.selfHosted.endpoint;
          const modelName = provider.selfHosted.model || 'mistral:7b';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(provider.selfHosted.apiKey ? { Authorization: `Bearer ${provider.selfHosted.apiKey}` } : {}) },
            body: JSON.stringify({ model: modelName, prompt: p, stream: false }),
          });
          if (!res.ok) {
            try { console.error('SelfHosted error', await res.text()); } catch {}
            throw new Error('Something went wrong. Check your internet or try changing the model.');
          }
          const data = await res.json().catch(() => undefined);
          if (data && typeof data.response === 'string') return data.response;
          const text = typeof data === 'string' ? data : '';
          return text;
        }
      };

      const SUMMARY_PROMPT = [
        'Update the running summary of this conversation. Keep it concise, preserving key facts, decisions, tasks, and constraints.',
        `Previous summary:\n${summary || '(none)'}`,
        'New exchange:',
        `User: ${lastUser}`,
        `Assistant: ${lastAssistant}`,
        'Updated summary (<= 20 bullet points, terse):',
      ].join('\n\n');

      const EXTRACT_PROMPT = [
        'Extract at most 5 new long-term notes from the exchange that would be helpful later.',
        'Only include durable facts, preferences, constraints, definitions, or tasks. Return as JSON array of strings.',
        'Do not include explanations.',
        'Exchange:',
        `User: ${lastUser}`,
        `Assistant: ${lastAssistant}`,
        'JSON:',
      ].join('\n\n');

      const [newSummary, rawNotes] = await Promise.all([
        genOnce(SUMMARY_PROMPT).catch(() => ''),
        genOnce(EXTRACT_PROMPT).catch(() => ''),
      ]);

      if (newSummary && typeof newSummary === 'string') setSummary(bookKey, newSummary.trim());

      try {
        const jsonStr = (() => {
          const m = (rawNotes || '').match(/```json\s*([\s\S]*?)\s*```/i);
          return (m ? m[1] : rawNotes) || '';
        })();
        const arr = JSON.parse(jsonStr);
        if (Array.isArray(arr)) {
          const items = arr
            .filter((s) => typeof s === 'string')
            .map((text: string) => ({ text }));
          if (items.length) addNotes(bookKey, items);
        }
      } catch {}
      gcNotes(bookKey);
    } catch {}
  }, [appendAssistantChunk, bookKey, input, setInput, visible, addUserMessage, startAssistantMessage, setStreaming, provider, contextSnippets, retrieveNotes, setSummary, addNotes, gcNotes, messages, summary]);

  // Handle notes command - create note and show response in chat
  const handleNotesCommand = async (notesCommand: any, contextSnippets: string[]) => {
    try {
      // Create the note
      const newNote = {
        id: uniqueId(),
        type: 'annotation' as const,
        cfi: '', // Will be set from progress
        text: notesCommand.highlightedContext || '',
        note: notesCommand.noteText.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Get current progress for CFI and page info
      const progress = getProgress(bookKey);
      if (progress?.location) {
        newNote.cfi = progress.location;
      }

      // Add to existing notes in config
      const config = getConfig(bookKey);
      if (config) {
        const existingNotes = config.booknotes || [];
        const updatedNotes = [...existingNotes, newNote];
        // Update local store state so UI reflects immediately
        const updatedConfig = updateBooknotes(bookKey, updatedNotes);
        if (updatedConfig) {
          await saveConfig(envConfig, bookKey, updatedConfig, settings);
        }
      }

      // Add user message to chat
      addUserMessage(bookKey, `@notes ${notesCommand.noteText}`, contextSnippets.length ? [...contextSnippets] : undefined);
      
      // Add assistant response confirming note creation
      const responseText = notesCommand.highlightedContext 
        ? `Note added successfully! 📝\n\n**Note:** ${notesCommand.noteText}\n**Context:** ${notesCommand.highlightedContext}`
        : `Note added successfully! 📝\n\n**Note:** ${notesCommand.noteText}`;
      // Append as assistant message in the chat stream
      startAssistantMessage(bookKey);
      appendAssistantChunk(bookKey, responseText);
      
      // Clear context and input
      clearContext(bookKey);
      setInput(bookKey, '');
      
    } catch (error) {
      console.error('Failed to create note:', error);
      
      // Add user message to chat
      addUserMessage(bookKey, `@notes ${notesCommand.noteText}`, contextSnippets.length ? [...contextSnippets] : undefined);
      
      // Add error response
      startAssistantMessage(bookKey);
      appendAssistantChunk(bookKey, '❌ Failed to create note. Please try again.');
      
      // Clear context and input
      clearContext(bookKey);
      setInput(bookKey, '');
    }
  };

  const inputVal = input ?? '';
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastMessageContent = messages.length ? messages[messages.length - 1]!.content : '';
  const isRenderableImage = React.useCallback((s: string) => {
    return (
      /^!\[.*\]\((data:image\/.+?|asset:|tauri:\/\/|https?:\/\/).+?\)$/i.test(s) ||
      s.startsWith('data:image/') || s.startsWith('asset:') || s.startsWith('tauri://') || s.startsWith('http://') || s.startsWith('https://')
    );
  }, []);
  const extractImageSrc = React.useCallback((s: string) => {
    if (s.startsWith('data:image/') || s.startsWith('asset:') || s.startsWith('tauri://') || s.startsWith('http://') || s.startsWith('https://')) return s;
    const m = s.match(/!\[[^\]]*\]\(([^)]+)\)/);
    return m ? m[1] : '';
  }, []);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageContent, contextSnippets.length]);

  return (
    <>
    <div
      style={{
        width: panelWidth,
        top: 'var(--reader-header-height, 44px)',
        bottom: 0,
      }}
      className={clsx(
        'absolute right-0 z-30 flex max-w-[90vw] flex-col border-l border-base-300 bg-base-100 shadow-xl transition-transform duration-300',
        visible ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
      )}
    >
      {/* Resize handle */}
      <div
        ref={resizeRef}
        className={clsx(
          "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize transition-all duration-200",
          "hover:w-1.5 hover:bg-primary/50 active:bg-primary",
          isResizing && "w-1.5 bg-primary shadow-lg"
        )}
        onMouseDown={handleResizeStart}
        title="Drag to resize panel"
      />
      
      {/* Width indicator */}
      {isResizing && (
        <div className="absolute left-2 top-4 bg-base-100 border border-base-300 rounded px-2 py-1 text-xs font-mono shadow-lg z-20">
          {panelWidth}px
        </div>
      )}
      
      {/* Resize indicator overlay */}
      {isResizing && (
        <div className="absolute inset-0 bg-base-300/20 pointer-events-none z-10" />
      )}
      
      <div className='flex items-center justify-between border-b border-base-300 px-3 py-2'>
        <div className='text-sm font-semibold'>Ask Anything...</div>
        <div className='flex items-center gap-2'>
          <Button icon={<FiSettings size={14} />} onClick={() => setShowSettings(true)} tooltip='Settings' tooltipDirection='bottom' />
          <Button
            icon={<FiPlus size={14} />}
            onClick={() => {
              const id = createThread(bookKey);
              setActiveThread(bookKey, id);
            }}
            tooltip='New Chat'
            tooltipDirection='bottom'
          />
          <Button icon={<FiX size={16} />} onClick={() => setVisible(bookKey, false)} tooltip='Close' tooltipDirection='bottom' />
        </div>
      </div>
      <div ref={scrollRef} className='flex-1 overflow-auto p-3 space-y-3 select-text'>
        {messages.length === 0 && (
          <div className='rounded-lg border border-base-300 bg-base-200/30 p-3 text-xs text-base-content/70'>
            use <code>@notes</code> to add content in notebook. You can also add highlighted text as content
          </div>
        )}
        {messages.map((m: AIChatMessage, idx: number) => (
          <React.Fragment key={idx}>
             {m.role === 'user' && Array.isArray(m.context) && m.context.length > 0 && (
              m.context.map((t: string, ci: number) => {
                const perMsg = (expandedMap as any)[idx] || {};
                const expanded = !!perMsg[ci];
                return (
                  <div key={`ctx-${idx}-${ci}`} className='rounded-2xl border border-base-300 bg-base-200/20 p-0'>
                    <button className='w-full px-3 py-2 text-left' onClick={() => toggleContextExpanded(bookKey, idx, ci)}>
                      <div className='mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-70'>
                        <span>@</span>
                        <span>Context</span>
                      </div>
                      {/* If content is an image (markdown or URL), render as image */}
                      {isRenderableImage(t) ? (
                        <div className='mt-1'>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt='screenshot'
                            src={extractImageSrc(t)}
                            className={clsx('max-h-40 rounded-md border border-base-300', !expanded && 'max-h-24')}
                          />
                        </div>
                      ) : (
                        <div className={clsx('text-xs whitespace-pre-wrap', !expanded && 'line-clamp-2')}>{t}</div>
                      )}
                      <div className='mt-1 text-[11px] opacity-70'>{expanded ? 'Click to collapse' : 'Click to expand'}</div>
                    </button>
                  </div>
                );
              })
            )}
            <div className={clsx('whitespace-pre-wrap break-words text-sm select-text', m.role === 'user' ? 'text-primary' : 'text-base-content')}>
              <ChatFormattedText text={m.content} />
            </div>
          </React.Fragment>
        ))}
          {contextSnippets.length > 0 && contextSnippets.map((t: string, ci: number) => {
          const perMsg = (expandedMap as any)[-1] || {};
          const expanded = !!perMsg[ci];
          return (
            <div key={`ctx-pending-${ci}`} className='rounded-2xl border border-base-300 bg-base-200/20 p-0'>
              <div className='flex items-center justify-between gap-2 px-3 py-2'>
                <button className='flex-1 text-left' onClick={() => toggleContextExpanded(bookKey, -1, ci)}>
                  <div className='mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-70'>
                    <span>@</span>
                    <span>Context</span>
                  </div>
                    {isRenderableImage(t) ? (
                    <div className='mt-1'>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt='screenshot'
                          src={extractImageSrc(t)}
                        className={clsx('max-h-40 rounded-md border border-base-300', !expanded && 'max-h-24')}
                      />
                    </div>
                  ) : (
                    <div className={clsx('text-xs whitespace-pre-wrap', !expanded && 'line-clamp-2')}>{t}</div>
                  )}
                  <div className='mt-1 text-[11px] opacity-70'>{expanded ? 'Click to collapse' : 'Click to expand'}</div>
                </button>
                <button
                  className='btn btn-ghost btn-xs shrink-0'
                  title='Remove'
                  onClick={() => removeContextAt(bookKey, ci)}
                >
                  <FiX size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className='border-t border-base-300 px-2 pt-2 pb-0'>
        {/* Thread dropdown above input */}
        <div className='mb-2'>
          {activeThread && (
            <div className='relative'>
              {threadListOpen && (
                <div className='absolute bottom-full mb-1 max-h-48 w-full overflow-auto rounded-t-md border border-base-300 bg-base-100 shadow'>
                  {threads.map((t: AIChatThread) => (
                    <button
                      key={t.id}
                      className={clsx('flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-base-200', t.id === (activeThread as AIChatThread).id && 'bg-base-200/60')}
                      onClick={() => {
                        setActiveThread(bookKey, t.id);
                        setThreadListOpen(false);
                      }}
                    >
                      <span className='truncate'>{t.title || 'New chat'}</span>
                      <span className='opacity-60'>{new Date(t.updatedAt || Date.now()).toLocaleDateString()}</span>
                    </button>
                  ))}
                  <div className='border-t border-base-300 p-2'>
                    <button
                      className='btn btn-outline btn-xs w-full'
                      onClick={() => {
                        const id = createThread(bookKey);
                        setActiveThread(bookKey, id);
                      }}
                    >
                      New chat
                    </button>
                  </div>
                </div>
              )}
              <button
                className='flex w-full items-center justify-between rounded-t-md border border-base-300 bg-base-100 px-3 py-2 text-left text-xs'
                onClick={() => setThreadListOpen((v) => !v)}
                title='Chat threads'
              >
                <span className='truncate'>{activeThread?.title || 'New chat'}</span>
                <span className={clsx('transition-transform', threadListOpen && 'rotate-180')}>▾</span>
              </button>
            </div>
          )}
        </div>
        <InputRow
          bookKey={bookKey}
          value={inputVal}
          onChange={handleInputChange}
          onSend={sendPrompt}
        />
      </div>
    </div>
    {showSettings && (
      <div className='absolute inset-0 z-40 flex items-center justify-center bg-base-300/40'>
        <div className='w-[min(36rem,95vw)] rounded-xl border border-base-300 bg-base-100 p-4 shadow-2xl'>
          <div className='mb-3 flex items-center justify-between'>
            <h3 className='text-sm font-semibold'>AI Providers</h3>
            <button className='btn btn-ghost btn-xs' onClick={() => setShowSettings(false)}>
              <FiX size={16} />
            </button>
          </div>
          <div className='space-y-3'>
            <div className='rounded-lg border border-base-300 p-3'>
              <div className='mb-2 text-xs font-semibold'>Choose provider to configure</div>
              <select
                className='select select-bordered select-xs w-full'
                value={activeProvider}
                onChange={(e)=>setActiveProvider(e.target.value as ProviderName)}
              >
                <option value='selfHosted'>Self-hosted</option>
                <option value='ollama'>Ollama (local)</option>
                <option value='gemini'>Gemini</option>
                <option value='openai'>OpenAI</option>
                <option value='openrouter'>OpenRouter</option>
              </select>
            </div>

            {activeProvider === 'selfHosted' && (
              <div className='rounded-lg border border-base-300 p-3'>
                <div className='mb-2 flex items-center gap-2 text-xs font-semibold'>
                  {provider.defaultProvider === 'selfHosted' && <span className='h-2 w-2 rounded-full bg-green-500'></span>}
                  <span>Self-hosted</span>
                </div>
                <div className='grid gap-2 text-xs'>
                  <input className='input input-bordered input-xs' placeholder='Endpoint URL' defaultValue={provider.selfHosted.endpoint} onBlur={(e)=>provider.saveSelfHosted({ endpoint: e.target.value })} />
                  <input className='input input-bordered input-xs' placeholder='Secret Key (optional)' type='password' defaultValue={provider.selfHosted.apiKey || ''} onBlur={(e)=>provider.saveSelfHosted({ apiKey: e.target.value })} />
                  <input className='input input-bordered input-xs' placeholder='Model (e.g. mistral:7b)' defaultValue={provider.selfHosted.model} onBlur={(e)=>provider.saveSelfHosted({ model: e.target.value })} />
                </div>
                <div className='mt-2 flex gap-2'>
                  <button className='btn btn-outline btn-xs' onClick={()=>provider.setDefault('selfHosted')}>Set Default</button>
                </div>
              </div>
            )}

            {activeProvider === 'ollama' && (
              <div className='rounded-lg border border-base-300 p-3'>
                <div className='mb-2 flex items-center gap-2 text-xs font-semibold'>
                  {provider.defaultProvider === 'ollama' && <span className='h-2 w-2 rounded-full bg-green-500'></span>}
                  <span>Ollama (local)</span>
                </div>
                <OllamaModelPicker />
                <div className='mt-2 flex gap-2'>
                  <button className='btn btn-outline btn-xs' onClick={()=>provider.setDefault('ollama')}>Set Default</button>
                </div>
              </div>
            )}

            {activeProvider === 'gemini' && (
              <div className='rounded-lg border border-base-300 p-3'>
                <div className='mb-2 flex items-center gap-2 text-xs font-semibold'>
                  {provider.defaultProvider === 'gemini' && <span className='h-2 w-2 rounded-full bg-green-500'></span>}
                  <span>Gemini</span>
                </div>
                <div className='grid gap-2 text-xs'>
                  <input className='input input-bordered input-xs' placeholder='API Key' type='password' defaultValue={provider.gemini.apiKey || ''} onBlur={(e)=>provider.saveGemini({ apiKey: e.target.value })} />
                  <input className='input input-bordered input-xs' placeholder='Model (e.g. gemini-2.0-flash)' defaultValue={provider.gemini.model || ''} onBlur={(e)=>provider.saveGemini({ model: e.target.value })} />
                </div>
                <div className='mt-2 flex gap-2'>
                  <button className='btn btn-outline btn-xs' onClick={()=>provider.setDefault('gemini')}>Set Default</button>
                </div>
              </div>
            )}

            {activeProvider === 'openai' && (
              <div className='rounded-lg border border-base-300 p-3'>
                <div className='mb-2 flex items-center gap-2 text-xs font-semibold'>
                  {provider.defaultProvider === 'openai' && <span className='h-2 w-2 rounded-full bg-green-500'></span>}
                  <span>OpenAI</span>
                </div>
                <div className='grid gap-2 text-xs'>
                  <input className='input input-bordered input-xs' placeholder='API Key' type='password' defaultValue={provider.openai.apiKey || ''} onBlur={(e)=>provider.saveOpenAI({ apiKey: e.target.value })} />
                  <input className='input input-bordered input-xs' placeholder='Model (optional)' defaultValue={provider.openai.model || ''} onBlur={(e)=>provider.saveOpenAI({ model: e.target.value })} />
                </div>
                <div className='mt-2 flex gap-2'>
                  <button className='btn btn-outline btn-xs' onClick={()=>provider.setDefault('openai')}>Set Default</button>
                </div>
              </div>
            )}

            {activeProvider === 'openrouter' && (
              <div className='rounded-lg border border-base-300 p-3'>
                <div className='mb-2 flex items-center gap-2 text-xs font-semibold'>
                  {provider.defaultProvider === 'openrouter' && <span className='h-2 w-2 rounded-full bg-green-500'></span>}
                  <span>OpenRouter</span>
                </div>
                <OpenRouterModelPicker />
                <div className='mt-2 flex gap-2'>
                  <button className='btn btn-outline btn-xs' onClick={()=>provider.setDefault('openrouter')}>Set Default</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    
    {/* Lookout Agent Modal - Lazy Loaded */}
    {lookoutModalOpen && (
      <LookoutAgentLazy
        isOpen={lookoutModalOpen}
        onClose={() => setLookoutModalOpen(false)}
        question={lookoutQuestion}
        context={lookoutContext}
        bookKey={bookKey}
        onLoadError={() => {
          console.error('Failed to load LookoutAgent');
          setLookoutModalOpen(false);
        }}
      />
    )}
    

    </>
  );
};

export default AIChatPanel;


