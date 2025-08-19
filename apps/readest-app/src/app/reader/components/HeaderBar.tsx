import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import { PiDotsThreeVerticalBold } from 'react-icons/pi';

import { Insets } from '@/types/misc';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import WindowButtons from '@/components/WindowButtons';
import { FaRegStar, FaStar } from 'react-icons/fa';
import { FaBrain } from 'react-icons/fa6';
import { LuBrain } from "react-icons/lu";
import { FiZoomIn, FiZoomOut } from 'react-icons/fi';
import Button from '@/components/Button';
import { useAIChatStore } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { getStyles } from '@/utils/style';
import Dropdown from '@/components/Dropdown';
import SidebarToggler from './SidebarToggler';
import BookmarkToggler from './BookmarkToggler';
import NotebookToggler from './NotebookToggler';
import SettingsToggler from './SettingsToggler';

import ViewMenu from './ViewMenu';

interface HeaderBarProps {
  bookKey: string;
  bookTitle: string;
  isTopLeft: boolean;
  isHoveredAnim: boolean;
  gridInsets: Insets;
  onCloseBook: (bookKey: string) => void;
  onSetSettingsDialogOpen: (open: boolean) => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  bookKey,
  bookTitle,
  isTopLeft,
  isHoveredAnim,
  gridInsets,
  onCloseBook,
  onSetSettingsDialogOpen,
}) => {
  const { appService } = useEnv();
  const headerRef = useRef<HTMLDivElement>(null);
  const {
    trafficLightInFullscreen,
    setTrafficLightVisibility,
    initializeTrafficLightStore,
    initializeTrafficLightListeners,
    cleanupTrafficLightListeners,
  } = useTrafficLightStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { bookKeys, hoveredBookKey, setHoveredBookKey } = useReaderStore();
  const { systemUIVisible, statusBarHeight } = useThemeStore();
  const { isSideBarVisible } = useSidebarStore();
  const iconSize16 = useResponsiveSize(16);
  const isAIVisible = useAIChatStore((s) => s.visibleByBookKey[bookKey] ?? false);
  const toggleAIVisible = useAIChatStore((s) => s.toggleVisible);
  const { getViewSettings, setViewSettings, getView } = useReaderStore();
  const currentZoom = getViewSettings(bookKey)?.zoomLevel ?? 100;

  const applyZoom = (nextZoom: number) => {
    const vs = getViewSettings(bookKey);
    if (!vs) return;
    const clamped = Math.max(100, Math.min(nextZoom, 400));
    if (clamped === vs.zoomLevel) return;
    vs.zoomLevel = clamped;
    setViewSettings(bookKey, vs);
    const view = getView(bookKey);
    view?.renderer.setStyles?.(getStyles(vs));
    const data = useBookDataStore.getState().getBookData(bookKey);
    const bookDoc = data?.bookDoc;
    if (bookDoc?.rendition?.layout === 'pre-paginated') {
      view?.renderer.setAttribute('zoom', `${vs.zoomLevel / 100}`);
    }
  };

  const handleToggleDropdown = (isOpen: boolean) => {
    setIsDropdownOpen(isOpen);
    if (!isOpen) setHoveredBookKey('');
  };

  useEffect(() => {
    if (!appService?.hasTrafficLight) return;

    initializeTrafficLightStore(appService);
    initializeTrafficLightListeners();
    return () => {
      cleanupTrafficLightListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService]);

  // Ensure traffic light is visible in top-left cell even when not hovered
  useEffect(() => {
    if (!appService?.hasTrafficLight) return;
    if (isTopLeft && !isSideBarVisible) {
      setTrafficLightVisibility(true, { x: 10, y: 20 });
    }
    // offset the header padding to leave room for traffic lights
    if (headerRef.current) {
      headerRef.current.style.paddingLeft = appService?.hasTrafficLight ? '64px' : '16px';
    }
    // compute header height for AI panel offset
    const updateHeaderHeightVar = () => {
      const bottom = headerRef.current?.getBoundingClientRect().bottom || 44;
      document.documentElement.style.setProperty('--reader-header-height', `${Math.max(44, bottom)}px`);
      // set footer height (reader bottom bar ~72px) to avoid overlap
      document.documentElement.style.setProperty('--reader-footer-height', `72px`);
    };
    updateHeaderHeightVar();
    window.addEventListener('resize', updateHeaderHeightVar);
    return () => window.removeEventListener('resize', updateHeaderHeightVar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService?.hasTrafficLight, isTopLeft, isSideBarVisible]);

  useEffect(() => {
    if (!appService?.hasTrafficLight) return;
    if (isSideBarVisible) return;

    // Keep traffic lights always visible in the header when applicable.
    // Only update their position when the current reader cell is hovered.
    if (isTopLeft) {
      if (hoveredBookKey === bookKey) {
        setTrafficLightVisibility(true, { x: 10, y: 20 });
      } else {
        setTrafficLightVisibility(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, isSideBarVisible, hoveredBookKey]);

  const isHeaderVisible = true;
  const trafficLightInHeader =
    appService?.hasTrafficLight && !trafficLightInFullscreen && !isSideBarVisible && isTopLeft;

  return (
    <div
      className={clsx('bg-base-100 absolute top-0 w-full')}
      style={{
        paddingTop: appService?.hasSafeAreaInset ? `${gridInsets.top}px` : '0px',
      }}
    >
      <div
        className={clsx('absolute top-0 z-10 h-11 w-full')}
        onMouseEnter={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onTouchStart={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
      />
      <div
        className={clsx(
          'bg-base-100 absolute left-0 right-0 top-0 z-10',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          isHeaderVisible ? 'visible' : 'hidden',
        )}
        style={{
          height: systemUIVisible ? `${Math.max(gridInsets.top, statusBarHeight)}px` : '0px',
        }}
      />
      <div
        ref={headerRef}
        className={clsx(
          `header-bar bg-base-100 absolute top-0 z-10 flex h-11 w-full items-center pr-4`,
          `shadow-xs transition-[opacity,margin-top] duration-300`,
          trafficLightInHeader ? 'pl-20' : 'pl-4',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          !isSideBarVisible && appService?.hasRoundedWindow && 'rounded-window-top-left',
          isHoveredAnim && 'hover-bar-anim',
           isHeaderVisible ? 'pointer-events-auto visible' : 'pointer-events-none opacity-0',
          isDropdownOpen && 'header-bar-pinned',
        )}
        style={{
          marginTop: systemUIVisible
            ? `${Math.max(gridInsets.top, statusBarHeight)}px`
            : `${gridInsets.top}px`,
        }}
        onMouseLeave={() => !appService?.isMobile && setHoveredBookKey('')}
      >
        <div className='bg-base-100 sidebar-bookmark-toggler z-20 flex h-full items-center gap-x-4 pe-2'>
          <div className='hidden sm:flex ml-4'>
            <SidebarToggler bookKey={bookKey} />
          </div>
          <BookmarkToggler bookKey={bookKey} />
          {/* Zoom controls next to Translate */}
          <Button
            icon={<FiZoomOut size={iconSize16} />}
            onClick={() => applyZoom(currentZoom - 25)}
            disabled={currentZoom <= 100}
            tooltip='Zoom out'
            tooltipDirection='bottom'
          />
          <Button
            icon={<FiZoomIn size={iconSize16} />}
            onClick={() => applyZoom(currentZoom + 25)}
            tooltip='Zoom in'
            tooltipDirection='bottom'
          />
        </div>

        <div className='header-title z-15 bg-base-100 pointer-events-none absolute inset-0 hidden items-center justify-center sm:flex'>
          <h2 className='line-clamp-1 max-w-[50%] text-center text-xs font-semibold'>
            {bookTitle}
          </h2>
        </div>

        <div className='bg-base-100 z-20 ml-auto flex h-full items-center space-x-4 ps-2'>
          <Button
            icon={isAIVisible ? <FaBrain size={iconSize16} /> : <LuBrain size={iconSize16} />}
            onClick={() => toggleAIVisible(bookKey)}
            tooltip={isAIVisible ? 'Hide AI' : 'Show AI'}
            tooltipDirection='bottom'
          />
          {/* Swap Notebook (more left) and Settings */}
          <NotebookToggler bookKey={bookKey} />
          <SettingsToggler />
          <Dropdown
            className='exclude-title-bar-mousedown dropdown-bottom dropdown-end'
            buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0'
            toggleButton={<PiDotsThreeVerticalBold size={iconSize16} />}
            onToggle={handleToggleDropdown}
          >
            <ViewMenu bookKey={bookKey} onSetSettingsDialogOpen={onSetSettingsDialogOpen} />
          </Dropdown>

          <WindowButtons
            className='window-buttons flex h-full items-center'
            headerRef={headerRef}
            showMinimize={
              bookKeys.length == 1 &&
              !appService?.hasTrafficLight &&
              appService?.appPlatform !== 'web'
            }
            showMaximize={
              bookKeys.length == 1 &&
              !appService?.hasTrafficLight &&
              appService?.appPlatform !== 'web'
            }
            onClose={() => {
              setHoveredBookKey(null);
              onCloseBook(bookKey);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default HeaderBar;
