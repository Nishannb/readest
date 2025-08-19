import { useSettingsStore } from '@/store/settingsStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useEffect } from 'react';

const useSidebar = (initialWidth: string, isPinned: boolean) => {
  const { settings } = useSettingsStore();
  const {
    sideBarWidth,
    isSideBarVisible,
    isSideBarPinned,
    setSideBarWidth,
    setSideBarVisible,
    setSideBarPin,
    toggleSideBar,
    toggleSideBarPin,
  } = useSidebarStore();

  useEffect(() => {
    setSideBarWidth(initialWidth);
    setSideBarPin(isPinned);
    setSideBarVisible(isPinned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSideBarResize = (newWidth: string) => {
    setSideBarWidth(newWidth);
    settings.globalReadSettings.sideBarWidth = newWidth;
  };

  const handleSideBarTogglePin = () => {
    toggleSideBarPin();
    settings.globalReadSettings.isSideBarPinned = !isSideBarPinned;
    if (isSideBarPinned && isSideBarVisible) setSideBarVisible(false);
  };

  return {
    sideBarWidth,
    isSideBarPinned,
    isSideBarVisible,
    handleSideBarResize,
    handleSideBarTogglePin,
    setSideBarVisible,
    toggleSideBar,
  };
};

export default useSidebar;
