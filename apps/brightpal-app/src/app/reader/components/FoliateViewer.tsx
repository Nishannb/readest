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
import { HIGHLIGHT_COLOR_HEX } from '@/services/constants';
import { Overlayer } from 'foliate-js/overlayer.js';
import { getViewInsets } from '@/utils/insets';

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
  const [eventView, setEventView] = useState<FoliateView | null>(null);
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

  const reapplyAnnotationsForIndex = (index: number) => {
    const sectionAnnotations = annotationsMapRef.current.get(index);
    if (sectionAnnotations && sectionAnnotations.length > 0) {
      sectionAnnotations.forEach((annotation: any) => {
        try { viewRef.current?.addAnnotation(annotation); } catch {}
      });
    }
  };

  // PDF-specific highlighting function that creates positioned divs
  const createPDFHighlight = async (cfi: string, color: string) => {
    try {
      console.log('📍 Creating PDF highlight for CFI:', cfi);
      
      if (!viewRef.current) {
        console.log('⚠️ No view available for PDF highlighting');
        return;
      }

      // Resolve the CFI to get the anchor/range
      const resolved = await viewRef.current.resolveNavigation(cfi);
      if (!resolved || !resolved.anchor) {
        console.log('⚠️ Could not resolve CFI for PDF highlighting');
        return;
      }

      // Get the content document
      const contents = viewRef.current.renderer.getContents();
      const content = contents?.find((c: any) => c.index === resolved.index);
      if (!content || !content.doc) {
        console.log('⚠️ Could not find document for PDF highlighting');
        return;
      }

      const doc = content.doc;
      const range = typeof resolved.anchor === 'function' ? resolved.anchor(doc) : resolved.anchor;
      
      if (!range) {
        console.log('⚠️ Could not get range for PDF highlighting');
        return;
      }

      console.log('📍 Got range for PDF highlighting:', range);

      // Get the client rects for the range
      const rects = Array.from(range.getClientRects());
      console.log('📍 Range rects:', rects.length);

      if (rects.length === 0) {
        console.log('⚠️ No client rects found for range');
        return;
      }

      // Find the PDF container (iframe or div containing the PDF)
      const pdfContainer = containerRef.current?.querySelector('iframe') || 
                          containerRef.current?.querySelector('[data-pdf-page]') ||
                          containerRef.current;

      if (!pdfContainer) {
        console.log('⚠️ Could not find PDF container');
        return;
      }

      console.log('📍 Found PDF container:', pdfContainer);

      // Get container bounds
      const containerRect = pdfContainer.getBoundingClientRect();
      console.log('📍 Container rect:', containerRect);

      // Create highlight divs for each rect
      rects.forEach((rect, index) => {
        console.log(`📍 Creating highlight div ${index + 1}/${rects.length}:`, rect);

        const highlightDiv = document.createElement('div');
        highlightDiv.className = 'pdf-highlight-overlay';
        highlightDiv.setAttribute('data-cfi', cfi);
        
        // Position the highlight div absolutely over the text
        Object.assign(highlightDiv.style, {
          position: 'absolute',
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          backgroundColor: color,
          opacity: '0.3',
          pointerEvents: 'none',
          zIndex: '10',
          borderRadius: '2px',
          mixBlendMode: 'multiply' // Better blending with text
        });

        // Add to the container
        if (pdfContainer.style.position !== 'relative' && pdfContainer.style.position !== 'absolute') {
          pdfContainer.style.position = 'relative';
        }
        
        pdfContainer.appendChild(highlightDiv);
        console.log('✅ PDF highlight div created and positioned');
      });

      console.log('🎯 PDF highlight overlay created successfully!');

    } catch (error) {
      console.error('❌ Error creating PDF highlight:', error);
    }
  };

  // Function to remove PDF highlights
  const removePDFHighlight = (cfi: string) => {
    try {
      const highlights = containerRef.current?.querySelectorAll(`[data-cfi="${cfi}"]`);
      highlights?.forEach(highlight => highlight.remove());
      console.log('🗑️ Removed PDF highlight for CFI:', cfi);
    } catch (error) {
      console.error('❌ Error removing PDF highlight:', error);
    }
  };

  // Function to reapply all PDF highlights for a section
  const reapplyPDFHighlights = async (index: number) => {
    try {
      const sectionAnnotations = annotationsMapRef.current.get(index);
      if (sectionAnnotations && sectionAnnotations.length > 0) {
        console.log('🔄 Reapplying PDF highlights for section', index);
        
        for (const annotation of sectionAnnotations) {
          if (annotation.style === 'highlight') {
            const hexColor = annotation.color && HIGHLIGHT_COLOR_HEX[annotation.color] 
              ? HIGHLIGHT_COLOR_HEX[annotation.color] 
              : annotation.color || '#facc15';
            
            await createPDFHighlight(annotation.value, hexColor);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error reapplying PDF highlights:', error);
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
    try { if (typeof detail.index === 'number') reapplyAnnotationsForIndex(detail.index); } catch {}
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

  // Annotation management system (similar to reader.js)
  const annotationsMapRef = useRef<Map<number, any[]>>(new Map());
  const annotationsByValueRef = useRef<Map<string, any>>(new Map());

  // Function to add a new annotation to the system
  const addAnnotationToSystem = async (annotation: any, sectionIndex: number) => {
    console.log('🔧 addAnnotationToSystem called:', { annotation, sectionIndex });
    
    const annotationForSystem = {
      value: annotation.cfi,
      color: annotation.color,
      style: annotation.style,
      note: annotation.note || '',
      ...annotation
    };
    
    console.log('📝 Annotation for system:', annotationForSystem);
    
    // Add to section map
    let sectionAnnotations = annotationsMapRef.current.get(sectionIndex);
    if (!sectionAnnotations) {
      sectionAnnotations = [];
      annotationsMapRef.current.set(sectionIndex, sectionAnnotations);
    }
    
    // Check if annotation already exists
    const existingIndex = sectionAnnotations.findIndex(a => a.value === annotationForSystem.value);
    if (existingIndex === -1) {
      sectionAnnotations.push(annotationForSystem);
      console.log('➕ Added new annotation to section', sectionIndex, '- total:', sectionAnnotations.length);
    } else {
      sectionAnnotations[existingIndex] = annotationForSystem;
      console.log('🔄 Updated existing annotation in section', sectionIndex);
    }
    
    // Add to value map
    annotationsByValueRef.current.set(annotationForSystem.value, annotationForSystem);
    
    // Add to view and FORCE immediate visual rendering
    if (viewRef.current) {
      console.log('📤 Adding annotation to view:', annotationForSystem.value);
      
      try {
        // Add to the view system first
        await viewRef.current.addAnnotation(annotationForSystem);
        console.log('✅ Successfully added annotation to view');
        
        // FORCE immediate visual overlay drawing for PDFs
        if (annotationForSystem.style === 'highlight') {
          console.log('🎨 Forcing immediate PDF highlight rendering...');
          
          const hexColor = annotationForSystem.color && HIGHLIGHT_COLOR_HEX[annotationForSystem.color] 
            ? HIGHLIGHT_COLOR_HEX[annotationForSystem.color] 
            : annotationForSystem.color || '#facc15'; // default yellow
          
          console.log('🎨 Using hex color:', hexColor);
          
          // For PDFs, we need to create highlight divs positioned over the text layer
          await createPDFHighlight(annotationForSystem.value, hexColor);
        }
      } catch (error) {
        console.error('❌ Error adding annotation to view:', error);
      }
    } else {
      console.log('⚠️ No view available to add annotation to');
    }
  };

  // Function to remove annotation from system
  const removeAnnotationFromSystem = (cfi: string) => {
    // Remove from value map
    annotationsByValueRef.current.delete(cfi);
    
    // Remove from section maps
    for (const [index, annotations] of annotationsMapRef.current.entries()) {
      const filteredAnnotations = annotations.filter(a => a.value !== cfi);
      if (filteredAnnotations.length !== annotations.length) {
        annotationsMapRef.current.set(index, filteredAnnotations);
      }
    }
    
    // Remove from view
    viewRef.current?.addAnnotation({ value: cfi }, true);
    
    // Remove PDF highlight overlay
    removePDFHighlight(cfi);
    
    console.log('🗑️ Removed annotation from system:', cfi);
  };

  const onCreateOverlay = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { index } = detail;
    console.log('🎨 Create overlay for section:', index);
    
    // Debug: Check the overlay structure
    if (viewRef.current && viewRef.current.renderer) {
      const contents = viewRef.current.renderer.getContents();
      if (contents && contents[index]) {
        console.log('🔍 Section content:', contents[index]);
        if (contents[index].overlayer) {
          console.log('🔍 Overlay element:', contents[index].overlayer.element);
          console.log('🔍 Overlay in DOM:', document.contains(contents[index].overlayer.element));
        } else {
          console.log('⚠️ No overlay found for section', index);
        }
      } else {
        console.log('⚠️ No content found for section', index);
      }
    }
    
    // Get stored annotations for this specific section
    const sectionAnnotations = annotationsMapRef.current.get(index);
    if (sectionAnnotations && sectionAnnotations.length > 0) {
      console.log('📝 Re-adding', sectionAnnotations.length, 'annotations for section', index);
      
      // Add annotations to the view
      sectionAnnotations.forEach((annotation: any) => {
        console.log('➕ Adding annotation:', annotation.value, 'color:', annotation.color, 'style:', annotation.style);
        
        // Ensure the annotation has the right structure for the view
        const viewAnnotation = {
          value: annotation.value,
          color: annotation.color,
          style: annotation.style,
          note: annotation.note || '',
          ...annotation
        };
        
        viewRef.current?.addAnnotation(viewAnnotation);
      });
    } else {
      console.log('📝 No annotations found for section', index);
    }
    
    // For PDFs, also reapply the visual highlights
    setTimeout(() => reapplyPDFHighlights(index), 100); // Small delay to ensure DOM is ready
  };

  const onDrawAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { draw, annotation, doc, range } = detail;
    const value = annotation.value || annotation.cfi;
    const systemAnnotation = annotationsByValueRef.current.get(value);

    // Determine style/color robustly
    const style = (systemAnnotation?.style || annotation.style || 'highlight') as 'highlight' | 'underline' | 'squiggly';
    const colorKey = (systemAnnotation?.color || annotation.color) as keyof typeof HIGHLIGHT_COLOR_HEX | string | undefined;
    const hexColor = typeof colorKey === 'string' && HIGHLIGHT_COLOR_HEX[colorKey as keyof typeof HIGHLIGHT_COLOR_HEX]
      ? HIGHLIGHT_COLOR_HEX[colorKey as keyof typeof HIGHLIGHT_COLOR_HEX]
      : (colorKey as string | undefined);

    // For PDFs, range(anchor) can sometimes be null; derive rects from selection as fallback
    if (style === 'highlight') {
      if (range) {
        draw(Overlayer.highlight, { color: hexColor });
        return;
      }
      try {
        const selection = doc?.getSelection?.();
        const rects = Array.from(selection?.rangeCount ? selection.getRangeAt(0).getClientRects() : []).map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
        if (rects.length) {
          draw(Overlayer.highlight, { color: hexColor, __rects: rects });
          return;
        }
      } catch {}
      // final fallback: draw nothing but avoid crash
      draw(Overlayer.highlight, { color: hexColor });
    } else if (style === 'underline' || style === 'squiggly') {
      draw(Overlayer[style], { color: hexColor });
    }
  };

  const onShowAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const annotation = annotationsByValueRef.current.get(detail.value);
    if (annotation?.note) {
      console.log('📝 Show annotation note:', annotation.note);
    }
  };

  // IMPORTANT: bind events to a stateful view reference so React re-runs the effect
  // when the view is created. Using viewRef.current directly would not trigger
  // the effect because ref changes do not cause re-renders.
  useFoliateEvents(eventView, {
    onLoad: docLoadHandler,
    onRelocate: progressRelocateHandler,
    onRendererRelocate: docRelocateHandler,
    onCreateOverlay,
    onDrawAnnotation,
    onShowAnnotation,
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
      setEventView(view);
      
      // Add annotation management methods to the view
      (view as any).addAnnotationToSystem = addAnnotationToSystem;
      (view as any).removeAnnotationFromSystem = removeAnnotationFromSystem;
      
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

    </>
  );
};

export default FoliateViewer;
