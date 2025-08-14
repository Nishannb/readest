import React, { useEffect, useRef, useState } from 'react';
import { BookDoc, getDirection } from '@/libs/document';
import { BookConfig } from '@/types/book';
import { FoliateView, wrappedFoliateView } from '@/types/view';
import { Insets } from '@/types/misc';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { useMouseEvent, useTouchEvent } from '../hooks/useIframeEvents';
import { usePagination } from '../hooks/usePagination';
import { useFoliateEvents } from '../hooks/useFoliateEvents';
import { useProgressSync } from '../hooks/useProgressSync';
import { useProgressAutoSave } from '../hooks/useProgressAutoSave';
import { useKOSync } from '../hooks/useKOSync';
import {
  applyFixedlayoutStyles,
  applyImageStyle,
  applyTranslationStyle,
  getStyles,
  transformStylesheet,
} from '@/utils/style';
import { mountAdditionalFonts } from '@/utils/font';
import { getBookDirFromLanguage, getBookDirFromWritingMode } from '@/utils/book';
import { useUICSS } from '@/hooks/useUICSS';
import {
  handleKeydown,
  handleKeyup,
  handleMousedown,
  handleMouseup,
  handleClick,
  handleWheel,
  handleGestureStart,
  handleGestureChange,
  handleGestureEnd,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} from '../utils/iframeEventHandlers';
import { getMaxInlineSize } from '@/utils/config';
import { getDirFromUILanguage } from '@/utils/rtl';
import { isCJKLang } from '@/utils/lang';
import { isTauriAppPlatform } from '@/services/environment';
import { transformContent } from '@/services/transformService';
import { lockScreenOrientation } from '@/utils/bridge';
import { useTextTranslation } from '../hooks/useTextTranslation';
import { manageSyntaxHighlighting } from '@/utils/highlightjs';
import { getViewInsets } from '@/utils/insets';
import ConfirmSyncDialog from './ConfirmSyncDialog';
// import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { eventDispatcher } from '@/utils/event';
import { useAIChatStore } from '@/store/aiChatStore';
import { startMacScreenCapture, type MacCaptureController } from '@/utils/screenshot';

declare global {
  interface Window {
    eval(script: string): void;
  }
}

const FoliateViewer: React.FC<{
  bookKey: string;
  bookDoc: BookDoc;
  config: BookConfig;
  contentInsets: Insets;
}> = ({ bookKey, bookDoc, config, contentInsets: insets }) => {
  const { getView, setView: setFoliateView, setProgress } = useReaderStore();
  const addAIContext = useAIChatStore((s) => s.addContext);
  const setAIPanelVisible = useAIChatStore((s) => s.setVisible);
  const { getViewSettings, setViewSettings } = useReaderStore();
  const { getParallels } = useParallelViewStore();
  const { getBookData } = useBookDataStore();
  const { appService } = useEnv();
  const { themeCode, isDarkMode } = useThemeStore();
  const viewSettings = getViewSettings(bookKey);

  const viewRef = useRef<FoliateView | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isScreenshotMode, setIsScreenshotMode] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const isViewCreated = useRef(false);
  const doubleClickDisabled = useRef(!!viewSettings?.disableDoubleClick);
  const [toastMessage, setToastMessage] = useState('');
  const macCaptureRef = useRef<MacCaptureController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setToastMessage(''), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useUICSS(bookKey);
  useProgressSync(bookKey);
  useProgressAutoSave(bookKey);
  const {
    syncState,
    conflictDetails,
    resolveConflictWithLocal,
    resolveConflictWithRemote,
  } = useKOSync(bookKey);
  useTextTranslation(bookKey, viewRef.current);

  const progressRelocateHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    setProgress(
      bookKey,
      detail.cfi,
      detail.tocItem,
      detail.section,
      detail.location,
      detail.time,
      detail.range,
    );
  };

  const getDocTransformHandler = ({ width, height }: { width: number; height: number }) => {
    return (event: Event) => {
      const { detail } = event as CustomEvent;
      detail.data = Promise.resolve(detail.data)
        .then((data) => {
          const viewSettings = getViewSettings(bookKey);
          if (viewSettings && detail.type === 'text/css')
            return transformStylesheet(width, height, data);
          if (viewSettings && detail.type === 'application/xhtml+xml') {
            const ctx = {
              bookKey,
              viewSettings,
              content: data,
              transformers: ['punctuation', 'footnote', 'language'],
            };
            return Promise.resolve(transformContent(ctx));
          }
          return data;
        })
        .catch((e) => {
          console.error(new Error(`Failed to load ${detail.name}`, { cause: e }));
          return '';
        });
    };
  };

  const docLoadHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    console.log('doc index loaded:', detail.index);
    if (detail.doc) {
      const writingDir = viewRef.current?.renderer.setStyles && getDirection(detail.doc);
      const viewSettings = getViewSettings(bookKey)!;
      const bookData = getBookData(bookKey)!;
      viewSettings.vertical =
        writingDir?.vertical || viewSettings.writingMode.includes('vertical') || false;
      viewSettings.rtl =
        writingDir?.rtl ||
        getDirFromUILanguage() === 'rtl' ||
        viewSettings.writingMode.includes('rl') ||
        false;
      setViewSettings(bookKey, { ...viewSettings });

      mountAdditionalFonts(detail.doc, isCJKLang(bookData.book?.primaryLanguage));

      if (bookDoc.rendition?.layout === 'pre-paginated') {
        applyFixedlayoutStyles(detail.doc, viewSettings);
      }

      applyImageStyle(detail.doc);

      // Inline scripts in tauri platforms are not executed by default
      if (viewSettings.allowScript && isTauriAppPlatform()) {
        evalInlineScripts(detail.doc);
      }

      // only call on load if we have highlighting turned on.
      if (viewSettings.codeHighlighting) {
        manageSyntaxHighlighting(detail.doc, viewSettings);
      }

      if (!detail.doc.isEventListenersAdded) {
        // listened events in iframes are posted to the main window
        // and then used by useMouseEvent and useTouchEvent
        // and more gesture events can be detected in the iframeEventHandlers
        detail.doc.isEventListenersAdded = true;
        detail.doc.addEventListener('keydown', handleKeydown.bind(null, bookKey));
        detail.doc.addEventListener('keyup', handleKeyup.bind(null, bookKey));
        detail.doc.addEventListener('mousedown', handleMousedown.bind(null, bookKey));
        detail.doc.addEventListener('mouseup', handleMouseup.bind(null, bookKey));
        detail.doc.addEventListener('click', handleClick.bind(null, bookKey, doubleClickDisabled));
        detail.doc.addEventListener('wheel', handleWheel.bind(null, bookKey));
        detail.doc.addEventListener('touchstart', handleTouchStart.bind(null, bookKey));
        detail.doc.addEventListener('touchmove', handleTouchMove.bind(null, bookKey));
        detail.doc.addEventListener('touchend', handleTouchEnd.bind(null, bookKey));
        // WebKit gesture events for pinch zoom
        // @ts-ignore
        detail.doc.addEventListener('gesturestart', (e: any) => handleGestureStart(bookKey, e));
        // @ts-ignore
        detail.doc.addEventListener('gesturechange', (e: any) => handleGestureChange(bookKey, e));
        // @ts-ignore
        detail.doc.addEventListener('gestureend', () => handleGestureEnd(bookKey));
      }

      // Listen for failed navigation (e.g., broken in-page citations) and show a toast instead of console errors
      try {
        const onGoToFailed = (e: Event) => {
          const det = (e as CustomEvent).detail || {};
          const target = det?.target || '';
          const msg = typeof target === 'string' ? target : (target?.href || target?.cfi || '');
          try { eventDispatcher.dispatch('toast', { type: 'info', message: msg ? `No match: ${msg}` : 'No match', timeout: 3000 }); } catch {}
        };
        const win = detail.doc.defaultView
        win?.addEventListener('foliate-go-to-failed', onGoToFailed as any, { passive: true });
        // Also handle the precheck event (link-precheck)
        win?.addEventListener('foliate-go-to-failed', onGoToFailed as any, { passive: true });
      } catch {}
    }
  };

  const evalInlineScripts = (doc: Document) => {
    if (doc.defaultView && doc.defaultView.frameElement) {
      const iframe = doc.defaultView.frameElement as HTMLIFrameElement;
      const scripts = doc.querySelectorAll('script:not([src])');
      scripts.forEach((script, index) => {
        const scriptContent = script.textContent || script.innerHTML;
        try {
          console.warn('Evaluating inline scripts in iframe');
          iframe.contentWindow?.eval(scriptContent);
        } catch (error) {
          console.error(`Error executing iframe script ${index + 1}:`, error);
        }
      });
    }
  };

  const docRelocateHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail.reason !== 'scroll' && detail.reason !== 'page') return;

    const parallelViews = getParallels(bookKey);
    if (parallelViews && parallelViews.size > 0) {
      parallelViews.forEach((key) => {
        if (key !== bookKey) {
          const target = getView(key)?.renderer;
          if (target) {
            target.goTo?.({ index: detail.index, anchor: detail.fraction });
          }
        }
      });
    }
  };

  const { handlePageFlip, handleContinuousScroll } = usePagination(bookKey, viewRef, containerRef);
  const mouseHandlers = useMouseEvent(bookKey, handlePageFlip, handleContinuousScroll);
  const touchHandlers = useTouchEvent(bookKey, handleContinuousScroll);

  // Handle Cmd-based screenshot mode toggle (from both iframe-forwarded and global key events)
  useEffect(() => {
    // Only used on non-mac/web to enable overlay selection
    const enable = async () => {
      // Do not trigger on macOS with key events; require Cmd+MouseDown
      if (isTauriAppPlatform() && appService?.isMacOSApp) return;
      // Fallback in-app crosshair mode (web/other OS)
      setIsScreenshotMode(true);
      if (containerRef.current) containerRef.current.style.cursor = 'crosshair';
      try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
    };
    const disable = () => {
      setIsScreenshotMode(false);
      setDragStart(null);
      setDragRect(null);
      if (containerRef.current) containerRef.current.style.cursor = '';
      try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
    };

    const handleMsg = (msg: MessageEvent) => {
      const data = msg.data;
      if (!data || data.bookKey !== bookKey) return;
      if (data.type === 'iframe-mousedown' && data.metaKey) {
        // For non-mac/web: start overlay selection on mousedown
        if (!(isTauriAppPlatform() && appService?.isMacOSApp)) {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const startX = Math.max(0, Math.min(data.clientX - rect.left, rect.width));
          const startY = Math.max(0, Math.min(data.clientY - rect.top, rect.height));
          setIsScreenshotMode(true);
          setDragStart({ x: startX, y: startY });
          setDragRect({ x: startX, y: startY, w: 0, h: 0 });
          try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
        }
        return;
      }
      if (data.type === 'iframe-mouseup') {
        // macOS: manage native crosshair lifecycle with Cmd key
        if ((isTauriAppPlatform() && appService?.isMacOSApp)) {
          if (data.metaKey && !macCaptureRef.current) {
            try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
            (async () => {
              const controller = await startMacScreenCapture((res) => {
              if (res?.imageUrl) {
                addAIContext(bookKey, res.imageUrl);
                setAIPanelVisible(bookKey, true);
                eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: Use Models with image-input capabality (e.g. Janus, Gemini)d', timeout: 1500 });
              }
              macCaptureRef.current = null;
              try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
              });
              macCaptureRef.current = controller;
            })();
          }
          return;
        }
        // finalize capture if screenshot mode started inside iframe
        if (!isScreenshotMode || !dragStart || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const endX = Math.max(0, Math.min(data.clientX - rect.left, rect.width));
        const endY = Math.max(0, Math.min(data.clientY - rect.top, rect.height));
        const x = Math.min(endX, dragStart.x);
        const y = Math.min(endY, dragStart.y);
        const w = Math.abs(endX - dragStart.x);
        const h = Math.abs(endY - dragStart.y);
        setDragRect({ x, y, w, h });
        // reuse the capture routine inline
        const finish = async () => {
          if (w < 3 || h < 3) return;
          // Build canvas list
          const container = containerRef.current!;
          const canvases: HTMLCanvasElement[] = [];
          const collect = (root: Document | ShadowRoot | Element) => {
            try {
              const found = Array.from((root as any).querySelectorAll?.('canvas') ?? []) as Element[];
              for (const el of found) {
                const cv = el as HTMLCanvasElement;
                if (cv && typeof cv.getContext === 'function') canvases.push(cv);
              }
              const nodes = Array.from((root as any).querySelectorAll?.('*') ?? []) as Element[];
              for (const el of nodes) {
                // @ts-ignore
                if ((el as any).shadowRoot) collect((el as any).shadowRoot as ShadowRoot);
                if (el.tagName === 'IFRAME') {
                  const iframe = el as HTMLIFrameElement;
                  try { if (iframe.contentDocument) collect(iframe.contentDocument); } catch {}
                }
              }
            } catch {}
          };
          collect(container);
          let url: string | null = null;
          if (canvases.length > 0) {
            const pixelRatio = window.devicePixelRatio || 1;
            const out = document.createElement('canvas');
            out.width = Math.max(1, Math.round(w * pixelRatio));
            out.height = Math.max(1, Math.round(h * pixelRatio));
            const outCtx = out.getContext('2d');
            if (outCtx) {
              outCtx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
              outCtx.fillRect(0, 0, out.width, out.height);
              const selLeft = rect.left + x;
              const selTop = rect.top + y;
              const selRight = selLeft + w;
              const selBottom = selTop + h;
              for (const cv of canvases) {
                const r = cv.getBoundingClientRect();
                const interLeft = Math.max(selLeft, r.left);
                const interTop = Math.max(selTop, r.top);
                const interRight = Math.min(selRight, r.right);
                const interBottom = Math.min(selBottom, r.bottom);
                const interW = interRight - interLeft;
                const interH = interBottom - interTop;
                if (interW <= 0 || interH <= 0) continue;
                const scaleX = cv.width / r.width;
                const scaleY = cv.height / r.height;
                const sx = Math.round((interLeft - r.left) * scaleX);
                const sy = Math.round((interTop - r.top) * scaleY);
                const sw = Math.round(interW * scaleX);
                const sh = Math.round(interH * scaleY);
                const dx = Math.round((interLeft - selLeft) * pixelRatio);
                const dy = Math.round((interTop - selTop) * pixelRatio);
                const dw = Math.max(1, Math.round(interW * pixelRatio));
                const dh = Math.max(1, Math.round(interH * pixelRatio));
                outCtx.drawImage(cv, sx, sy, sw, sh, dx, dy, dw, dh);
              }
              url = out.toDataURL('image/png');
            }
          }
          if (!url) {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(container, {
              useCORS: true,
              logging: false,
              backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
              scale: window.devicePixelRatio || 1,
              foreignObjectRendering: true,
              removeContainer: true,
              scrollX: 0,
              scrollY: 0,
              onclone: (doc) => {
                const style = doc.createElement('style');
                style.textContent = `*{animation:none!important;transition:none!important}`;
                doc.head.appendChild(style);
              },
            });
            const scale = canvas.width / container.clientWidth;
            const sx = Math.round(x * scale);
            const sy = Math.round(y * scale);
            const sw = Math.round(w * scale);
            const sh = Math.round(h * scale);
            const cropped = document.createElement('canvas');
            cropped.width = Math.max(1, sw);
            cropped.height = Math.max(1, sh);
            const ctx = cropped.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
              url = cropped.toDataURL('image/png');
            }
          }
          if (url) {
            addAIContext(bookKey, url);
            setAIPanelVisible(bookKey, true);
            // Reminder: use image-capable model
            try { eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: switch to an image-capable model (e.g., Gemini) for better results.', timeout: 4000 }); } catch {}
          } else {
            try { eventDispatcher.dispatch('toast', { type: 'error', message: 'Screenshot failed', timeout: 2000 }); } catch {}
          }
        };
        void finish();
        // clean up state
        setIsScreenshotMode(false);
        setDragStart(null);
        setDragRect(null);
        if (containerRef.current) containerRef.current.style.cursor = '';
        try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
        return;
      }
      // macOS: start via iframe-forwarded Cmd+S when focus is inside iframe
      if (isTauriAppPlatform() && appService?.isMacOSApp) {
        if (data.type === 'iframe-keydown' && data.metaKey && (data.key === 's' || data.key === 'S' || data.code === 'KeyS')) {
          if (!macCaptureRef.current) {
            try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
            (async () => {
              const controller = await startMacScreenCapture((res) => {
                if (res?.imageUrl) {
                  addAIContext(bookKey, res.imageUrl);
                  setAIPanelVisible(bookKey, true);
                  eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: Use Models with image-input capabality (e.g. Janus, Gemini)d', timeout: 1500 });
                }
                macCaptureRef.current = null;
                try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
              });
              if (controller) {
                macCaptureRef.current = controller;
              } else {
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  const res = (await invoke<any>('capture_screen_interactive')) as [string, string] | null;
                  const dataUrl = Array.isArray(res) ? res[1] : '';
                  if (dataUrl) {
                    addAIContext(bookKey, dataUrl);
                    setAIPanelVisible(bookKey, true);
                    eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: Use Models with image-input capabality (e.g. Janus, Gemini)d', timeout: 1500 });
                  } // else canceled/no file
                } finally {
                  try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
                }
              }
            })();
          }
          return;
        }
        // No cancel on keyup for Cmd+S mode
      }
      // macOS: cancel crosshair immediately when Cmd key is released
      if (data.type === 'iframe-keyup' && data.key === 'Meta') {
        if (isTauriAppPlatform() && appService?.isMacOSApp) {
          (async () => { try { macCaptureRef.current && (await macCaptureRef.current.cancel()); } catch {} })();
          macCaptureRef.current = null;
          try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
          return;
        }
        disable();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global: Cmd+S starts capture; prevent default save
      const isCmdS = (e.metaKey && (e.key === 's' || e.key === 'S'));
      if (isCmdS) {
        e.preventDefault();
        e.stopPropagation();
        if (isTauriAppPlatform() && appService?.isMacOSApp) {
          if (!macCaptureRef.current) {
            try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
            (async () => {
              const controller = await startMacScreenCapture((res) => {
                if (res?.imageUrl) {
                  addAIContext(bookKey, res.imageUrl);
                  setAIPanelVisible(bookKey, true);
                  eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: Use Models with image-input capabality (e.g. Janus, Gemini)d', timeout: 1500 });
                }
                macCaptureRef.current = null;
                try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
              });
              macCaptureRef.current = controller;
            })();
          }
        } else {
          // Non-mac/web: enter overlay selection mode on Cmd+S
          setIsScreenshotMode(true);
          if (containerRef.current) containerRef.current.style.cursor = 'crosshair';
          try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
          try { eventDispatcher.dispatch('toast', { type: 'info', message: 'Screenshot: drag to select…', timeout: 1200 }); } catch {}
        }
        return;
      }
      if (!isTauriAppPlatform() && e.key === 'Escape') disable();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      // Nothing special on keyup for Cmd+S mode
    };
    window.addEventListener('message', handleMsg);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('message', handleMsg);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  const handleStartDrag = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!isScreenshotMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const startY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setDragStart({ x: startX, y: startY });
    setDragRect({ x: startX, y: startY, w: 0, h: 0 });
    e.preventDefault();
    e.stopPropagation();
    try { (window as any).__READEST_SCREENSHOT_ACTIVE = true; } catch {}
    try { eventDispatcher.dispatch('toast', { type: 'info', message: 'Screenshot: drag to select…', timeout: 1200 }); } catch {}
  };

  const handleMoveDrag = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!isScreenshotMode || !dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const x = Math.min(curX, dragStart.x);
    const y = Math.min(curY, dragStart.y);
    const w = Math.abs(curX - dragStart.x);
    const h = Math.abs(curY - dragStart.y);
    setDragRect({ x, y, w, h });
    e.preventDefault();
    e.stopPropagation();
  };

  const handleEndDrag = async (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!isScreenshotMode || !dragStart || !dragRect || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    // Temporarily hide the overlay box before rendering to avoid any visual blink
    const overlayEl = overlayRef.current;
    if (overlayEl) overlayEl.style.visibility = 'hidden';
    // Cancel if selection too small
    if (dragRect.w < 1 || dragRect.h < 1) {
      setIsScreenshotMode(false);
      setDragStart(null);
      setDragRect(null);
      if (containerRef.current) containerRef.current.style.cursor = '';
      try { eventDispatcher.dispatch('toast', { type: 'info', message: 'Screenshot canceled', timeout: 1200 }); } catch {}
      return;
    }
    try {
      const container = containerRef.current;
      // Prefer compositing from existing canvases (PDF renderer) to avoid black images and flicker
      // Capture canvases from main tree, shadow roots and foliate iframes
          const canvases: HTMLCanvasElement[] = [];
      const collect = (root: Document | ShadowRoot | Element) => {
        try {
              const found = Array.from((root as any).querySelectorAll?.('canvas') ?? []) as Element[];
              for (const el of found) {
                const cv = el as HTMLCanvasElement;
                if (cv && typeof cv.getContext === 'function') canvases.push(cv);
              }
          const nodes = Array.from((root as any).querySelectorAll?.('*') ?? []) as Element[];
          for (const el of nodes) {
            // shadow roots
            // @ts-ignore
            if ((el as any).shadowRoot) collect((el as any).shadowRoot as ShadowRoot);
            if (el.tagName === 'IFRAME') {
              const iframe = el as HTMLIFrameElement;
              try {
                if (iframe.contentDocument) collect(iframe.contentDocument);
              } catch {}
            }
          }
        } catch {}
      };
      collect(container);
      let url: string | null = null;
      if (canvases.length > 0) {
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(dragRect.w * (window.devicePixelRatio || 1)));
        out.height = Math.max(1, Math.round(dragRect.h * (window.devicePixelRatio || 1)));
        const outCtx = out.getContext('2d');
        if (outCtx) {
          outCtx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
          outCtx.fillRect(0, 0, out.width, out.height);
          const cRect = container.getBoundingClientRect();
          const selLeft = cRect.left + dragRect.x;
          const selTop = cRect.top + dragRect.y;
          const selRight = selLeft + dragRect.w;
          const selBottom = selTop + dragRect.h;
          const pixelRatio = window.devicePixelRatio || 1;
          for (const cv of canvases) {
            const r = cv.getBoundingClientRect();
            const interLeft = Math.max(selLeft, r.left);
            const interTop = Math.max(selTop, r.top);
            const interRight = Math.min(selRight, r.right);
            const interBottom = Math.min(selBottom, r.bottom);
            const interW = interRight - interLeft;
            const interH = interBottom - interTop;
            if (interW <= 0 || interH <= 0) continue;
            const scaleX = cv.width / r.width;
            const scaleY = cv.height / r.height;
            const sx = Math.round((interLeft - r.left) * scaleX);
            const sy = Math.round((interTop - r.top) * scaleY);
            const sw = Math.round(interW * scaleX);
            const sh = Math.round(interH * scaleY);
            const dx = Math.round((interLeft - selLeft) * pixelRatio);
            const dy = Math.round((interTop - selTop) * pixelRatio);
            const dw = Math.max(1, Math.round(interW * pixelRatio));
            const dh = Math.max(1, Math.round(interH * pixelRatio));
            outCtx.drawImage(cv, sx, sy, sw, sh, dx, dy, dw, dh);
          }
          url = out.toDataURL('image/png');
        }
      }
      if (!url) {
        // Fallback to html2canvas for EPUB/text content
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(container, {
          useCORS: true,
          logging: false,
          backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
          scale: window.devicePixelRatio || 1,
          foreignObjectRendering: true,
          removeContainer: true,
          scrollX: 0,
          scrollY: 0,
          onclone: (doc) => {
            const style = doc.createElement('style');
            style.textContent = `*{animation:none!important;transition:none!important}`;
            doc.head.appendChild(style);
          },
        });
        const scale = canvas.width / container.clientWidth;
        const sx = Math.round(dragRect.x * scale);
        const sy = Math.round(dragRect.y * scale);
        const sw = Math.round(dragRect.w * scale);
        const sh = Math.round(dragRect.h * scale);
        const cropped = document.createElement('canvas');
        cropped.width = Math.max(1, sw);
        cropped.height = Math.max(1, sh);
        const ctx = cropped.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
          url = cropped.toDataURL('image/png');
        }
      }
      if (url) {
        addAIContext(bookKey, url);
        setAIPanelVisible(bookKey, true);
        // Reminder: use image-capable model
        try { eventDispatcher.dispatch('toast', { type: 'info', message: 'Tip: switch to an image-capable model (e.g., Gemini) for better results.', timeout: 4000 }); } catch {}
      } else {
        try { eventDispatcher.dispatch('toast', { type: 'error', message: 'Screenshot failed', timeout: 2000 }); } catch {}
      }
    } finally {
      if (overlayEl) overlayEl.style.visibility = '';
      setIsScreenshotMode(false);
      setDragStart(null);
      setDragRect(null);
      if (containerRef.current) containerRef.current.style.cursor = '';
      try { delete (window as any).__READEST_SCREENSHOT_ACTIVE; } catch {}
    }
  };

  useFoliateEvents(viewRef.current, {
    onLoad: docLoadHandler,
    onRelocate: progressRelocateHandler,
    onRendererRelocate: docRelocateHandler,
  });

  useEffect(() => {
    if (isViewCreated.current) return;
    isViewCreated.current = true;

    const openBook = async () => {
      console.log('Opening book', bookKey);
      await import('foliate-js/view.js');
      const view = wrappedFoliateView(document.createElement('foliate-view') as FoliateView);
      view.id = `foliate-view-${bookKey}`;
      document.body.append(view);
      containerRef.current?.appendChild(view);

      const viewSettings = getViewSettings(bookKey)!;
      const writingMode = viewSettings.writingMode;
      if (writingMode) {
        const settingsDir = getBookDirFromWritingMode(writingMode);
        const languageDir = getBookDirFromLanguage(bookDoc.metadata.language);
        if (settingsDir !== 'auto') {
          bookDoc.dir = settingsDir;
        } else if (languageDir !== 'auto') {
          bookDoc.dir = languageDir;
        }
      }

      await view.open(bookDoc);
      // make sure we can listen renderer events after opening book
      viewRef.current = view;
      setFoliateView(bookKey, view);

      const { book } = view;

      book.transformTarget?.addEventListener('load', (event: Event) => {
        const { detail } = event as CustomEvent;
        if (detail.isScript) {
          detail.allowScript = viewSettings.allowScript ?? false;
        }
      });
      const viewWidth = appService?.isMobile ? screen.width : window.innerWidth;
      const viewHeight = appService?.isMobile ? screen.height : window.innerHeight;
      const width = viewWidth - insets.left - insets.right;
      const height = viewHeight - insets.top - insets.bottom;
      book.transformTarget?.addEventListener('data', getDocTransformHandler({ width, height }));
      view.renderer.setStyles?.(getStyles(viewSettings));
      applyTranslationStyle(viewSettings);

      doubleClickDisabled.current = viewSettings.disableDoubleClick!;
      const animated = viewSettings.animated!;
      const maxColumnCount = viewSettings.maxColumnCount!;
      const maxInlineSize = getMaxInlineSize(viewSettings);
      const maxBlockSize = viewSettings.maxBlockSize!;
      const screenOrientation = viewSettings.screenOrientation!;
      if (appService?.isMobileApp) {
        await lockScreenOrientation({ orientation: screenOrientation });
      }
      if (animated) {
        view.renderer.setAttribute('animated', '');
      } else {
        view.renderer.removeAttribute('animated');
      }
      view.renderer.setAttribute('max-column-count', maxColumnCount);
      view.renderer.setAttribute('max-inline-size', `${maxInlineSize}px`);
      view.renderer.setAttribute('max-block-size', `${maxBlockSize}px`);
      applyMarginAndGap();

      const lastLocation = config.location;
      if (lastLocation) {
        await view.init({ lastLocation });
      } else {
        await view.goToFraction(0);
      }
    };

    openBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyMarginAndGap = () => {
    const viewSettings = getViewSettings(bookKey)!;
    const viewInsets = getViewInsets(viewSettings);
    const showDoubleBorder = viewSettings.vertical && viewSettings.doubleBorder;
    const showDoubleBorderHeader = showDoubleBorder && viewSettings.showHeader;
    const showDoubleBorderFooter = showDoubleBorder && viewSettings.showFooter;
    const showTopHeader = viewSettings.showHeader && !viewSettings.vertical;
    const showBottomFooter = viewSettings.showFooter && !viewSettings.vertical;
    const moreTopInset = showTopHeader ? Math.max(0, 44 - insets.top) : 0;
    const moreBottomInset = showBottomFooter ? Math.max(0, 44 - insets.bottom) : 0;
    const moreRightInset = showDoubleBorderHeader ? 32 : 0;
    const moreLeftInset = showDoubleBorderFooter ? 32 : 0;
    const topMargin = (showTopHeader ? insets.top : viewInsets.top) + moreTopInset;
    const rightMargin = insets.right + moreRightInset;
    const bottomMargin = (showBottomFooter ? insets.bottom : viewInsets.bottom) + moreBottomInset;
    const leftMargin = insets.left + moreLeftInset;

    viewRef.current?.renderer.setAttribute('margin-top', `${topMargin}px`);
    viewRef.current?.renderer.setAttribute('margin-right', `${rightMargin}px`);
    viewRef.current?.renderer.setAttribute('margin-bottom', `${bottomMargin}px`);
    viewRef.current?.renderer.setAttribute('margin-left', `${leftMargin}px`);
    viewRef.current?.renderer.setAttribute('gap', `${viewSettings.gapPercent}%`);
    if (viewSettings.scrolled) {
      viewRef.current?.renderer.setAttribute('flow', 'scrolled');
    }
  };

  useEffect(() => {
    if (viewRef.current && viewRef.current.renderer) {
      const viewSettings = getViewSettings(bookKey)!;
      viewRef.current.renderer.setStyles?.(getStyles(viewSettings));
      if (bookDoc.rendition?.layout === 'pre-paginated') {
        const docs = viewRef.current.renderer.getContents();
        docs.forEach(({ doc }) => applyFixedlayoutStyles(doc, viewSettings));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeCode, isDarkMode, viewSettings?.overrideColor, viewSettings?.invertImgColorInDark]);

  useEffect(() => {
    if (viewRef.current && viewRef.current.renderer) {
      doubleClickDisabled.current = !!viewSettings?.disableDoubleClick;
    }
  }, [viewSettings?.disableDoubleClick]);

  useEffect(() => {
    if (viewRef.current && viewRef.current.renderer && viewSettings) {
      applyMarginAndGap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    insets.top,
    insets.right,
    insets.bottom,
    insets.left,
    viewSettings?.doubleBorder,
    viewSettings?.showHeader,
    viewSettings?.showFooter,
  ]);

  return (
    <>
      <div
        ref={containerRef}
        className='foliate-viewer relative h-[100%] w-[calc(100%-var(--ai-panel-pad,0px))] transition-[width] duration-200 will-change-[width]'
        {...mouseHandlers}
        {...touchHandlers}
      >
        {isScreenshotMode && (
          <div
            ref={overlayRef}
            className='absolute inset-0 z-50 select-none'
            style={{ cursor: 'crosshair' }}
            onMouseDown={handleStartDrag}
            onMouseMove={handleMoveDrag}
            onMouseUp={handleEndDrag}
            onMouseLeave={handleEndDrag}
            onClick={(e) => {
              // prevent synthetic click reaching container (would flip page)
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {dragRect && (
              <div
                className='absolute border-2 border-blue-500/80 bg-blue-500/10'
                style={{ left: `${dragRect.x}px`, top: `${dragRect.y}px`, width: `${dragRect.w}px`, height: `${dragRect.h}px` }}
              />
            )}
          </div>
        )}
      </div>
      {syncState === 'conflict' && conflictDetails && (
        <ConfirmSyncDialog
          details={conflictDetails}
          onConfirmLocal={resolveConflictWithLocal}
          onConfirmRemote={resolveConflictWithRemote}
          onClose={resolveConflictWithLocal}
        />
      )}
    </>
  );
};

export default FoliateViewer;
