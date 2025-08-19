import React from 'react';
import { RiFontSize } from 'react-icons/ri';

import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import Button from '@/components/Button';

const SettingsToggler = () => {
  const _ = useTranslation();
  const { setHoveredBookKey } = useReaderStore();
  const { sideBarBookKey } = useSidebarStore();
  const setAIVisible = useAIChatStore((s) => s.setVisible);
  const { isFontLayoutSettingsDialogOpen, setFontLayoutSettingsDialogOpen } = useSettingsStore();
  
  const handleToggleSettings = () => {
    // Close AI chat panel when settings dialog is toggled
    if (sideBarBookKey) {
      setAIVisible(sideBarBookKey, false);
    }
    
    setHoveredBookKey('');
    setFontLayoutSettingsDialogOpen(!isFontLayoutSettingsDialogOpen);
  };
  return (
    <Button
      icon={<RiFontSize className='text-base-content' />}
      onClick={handleToggleSettings}
      tooltip={_('Font & Layout')}
      tooltipDirection='bottom'
    ></Button>
  );
};

export default SettingsToggler;
