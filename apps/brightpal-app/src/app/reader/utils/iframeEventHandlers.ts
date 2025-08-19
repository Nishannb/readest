import { DOUBLE_CLICK_INTERVAL_THRESHOLD_MS, LONG_HOLD_THRESHOLD } from '@/services/constants';
import { eventDispatcher } from '@/utils/event';

let lastClickTime = 0;
let longHoldTimeout: ReturnType<typeof setTimeout> | null = null;

export const handleKeydown = (bookKey: string, event: KeyboardEvent) => {
  if (['Backspace', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
  }
  // Prevent default Save dialog on Cmd+S inside iframe so host can handle it
  if ((event as any).metaKey && (event.key === 's' || event.key === 'S' || (event as any).code === 'KeyS')) {
    event.preventDefault();
    event.stopPropagation?.();
  }
  window.postMessage(
    {
      type: 'iframe-keydown',
      bookKey,
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    },
    '*',
  );
};

export const handleKeyup = (bookKey: string, event: KeyboardEvent) => {
  window.postMessage(
    {
      type: 'iframe-keyup',
      bookKey,
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    },
    '*',
  );
};

export const handleMousedown = (bookKey: string, event: MouseEvent) => {
  // avoid any potential selection flicker; don't schedule longHold when meta key is used (screenshot mode)
  if (!event.metaKey) {
    longHoldTimeout = setTimeout(() => {
      longHoldTimeout = null;
    }, LONG_HOLD_THRESHOLD);
  } else {
    longHoldTimeout = null;
  }

  window.postMessage(
    {
      type: 'iframe-mousedown',
      bookKey,
      button: event.button,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
      metaKey: (event as any).metaKey === true,
    },
    '*',
  );
};

export const handleMouseup = (bookKey: string, event: MouseEvent) => {
  // we will handle mouse back and forward buttons ourselves
  if ([3, 4].includes(event.button)) {
    event.preventDefault();
  }
  try {
    // @ts-ignore
    if ((window.top as any)?.__READEST_SCREENSHOT_ACTIVE) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
  } catch {}
  window.postMessage(
    {
      type: 'iframe-mouseup',
      bookKey,
      button: event.button,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
      // forward metaKey so host can require Cmd being held
      metaKey: (event as any).metaKey === true,
    },
    '*',
  );
};

export const handleWheel = (bookKey: string, event: WheelEvent) => {
  // If the user is pinching (Ctrl/Meta + wheel), prefer zoom. Post a custom event for zoom.
  if (event.ctrlKey || event.metaKey) {
    window.postMessage(
      {
        type: 'iframe-zoom-wheel',
        bookKey,
        deltaY: event.deltaY,
      },
      '*',
    );
    event.preventDefault();
    return;
  }
  window.postMessage(
    {
      type: 'iframe-wheel',
      bookKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
    },
    '*',
  );
};

// Safari/WebKit trackpads dispatch gesture events for pinch zoom
export const handleGestureChange = (bookKey: string, event: any) => {
  try {
    const scale = (event as any)?.scale ?? 1;
    window.postMessage(
      {
        type: 'iframe-zoom-gesture',
        bookKey,
        scale,
      },
      '*',
    );
    event.preventDefault?.();
  } catch {}
};

export const handleGestureStart = (bookKey: string, event: any) => {
  try {
    const scale = (event as any)?.scale ?? 1;
    window.postMessage(
      {
        type: 'iframe-zoom-gesture-start',
        bookKey,
        scale,
      },
      '*',
    );
    event.preventDefault?.();
  } catch {}
};

export const handleGestureEnd = (bookKey: string) => {
  window.postMessage(
    {
      type: 'iframe-zoom-gesture-end',
      bookKey,
    },
    '*',
  );
};

export const handleClick = (
  bookKey: string,
  doubleClickDisabled: React.MutableRefObject<boolean>,
  event: MouseEvent,
) => {
  // If screenshot mode is active on the top window, ignore clicks to avoid page flip
  try {
    // @ts-ignore
    if ((window.top as any)?.__READEST_SCREENSHOT_ACTIVE) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
  } catch {}
  const now = Date.now();

  if (!doubleClickDisabled.current && now - lastClickTime < DOUBLE_CLICK_INTERVAL_THRESHOLD_MS) {
    lastClickTime = now;
    window.postMessage(
      {
        type: 'iframe-double-click',
        bookKey,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      },
      '*',
    );
    return;
  }

  lastClickTime = now;

  const postSingleClick = () => {
    let element: HTMLElement | null = event.target as HTMLElement;
    while (element) {
      if (['sup', 'a', 'audio', 'video'].includes(element.tagName.toLowerCase())) {
        // Intercept intra-document anchors and suppress engine errors if target is missing
        if (element.tagName.toLowerCase() === 'a') {
          const href = (element as HTMLAnchorElement).getAttribute('href') || '';
          if (href && href.startsWith('#')) {
            const id = href.slice(1);
            const doc = element.ownerDocument || document;
            if (!doc.getElementById(id)) {
              try {
                event.preventDefault?.();
                event.stopPropagation?.();
              } catch {}
              try {
                eventDispatcher.dispatch('toast', { type: 'info', message: 'No match', timeout: 1500 });
              } catch {}
            }
          }
        }
        return;
      }
      if (
        element.classList.contains('js_readerFooterNote') ||
        element.classList.contains('zhangyue-footnote')
      ) {
        eventDispatcher.dispatch('footnote-popup', {
          bookKey,
          element,
          footnote:
            element.getAttribute('data-wr-footernote') || element.getAttribute('zy-footnote') || '',
        });
        return;
      }
      element = element.parentElement;
    }

    // if long hold is detected, we don't want to send single click event
    if (!longHoldTimeout) {
      return;
    }

    window.postMessage(
      {
        type: 'iframe-single-click',
        bookKey,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
      },
      '*',
    );
  };
  if (!doubleClickDisabled.current) {
    setTimeout(() => {
      if (Date.now() - lastClickTime >= DOUBLE_CLICK_INTERVAL_THRESHOLD_MS) {
        postSingleClick();
      }
    }, DOUBLE_CLICK_INTERVAL_THRESHOLD_MS);
  } else {
    postSingleClick();
  }
};

const handleTouchEv = (bookKey: string, event: TouchEvent, type: string) => {
  const touch = event.targetTouches[0];
  const touches = [];
  if (touch) {
    touches.push({
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
    });
  }
  window.postMessage(
    {
      type: type,
      bookKey,
      targetTouches: touches,
    },
    '*',
  );
};

export const handleTouchStart = (bookKey: string, event: TouchEvent) => {
  handleTouchEv(bookKey, event, 'iframe-touchstart');
};

export const handleTouchMove = (bookKey: string, event: TouchEvent) => {
  handleTouchEv(bookKey, event, 'iframe-touchmove');
};

export const handleTouchEnd = (bookKey: string, event: TouchEvent) => {
  handleTouchEv(bookKey, event, 'iframe-touchend');
};
