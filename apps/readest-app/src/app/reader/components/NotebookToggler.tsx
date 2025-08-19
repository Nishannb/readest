import React from 'react';
import { LuNotebookPen } from 'react-icons/lu';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import Button from '@/components/Button';

interface NotebookTogglerProps {
  bookKey: string;
}

const NotebookToggler: React.FC<NotebookTogglerProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { setHoveredBookKey } = useReaderStore();
  const { sideBarBookKey, setSideBarBookKey } = useSidebarStore();
  const { isNotebookVisible, toggleNotebook } = useNotebookStore();
  const setAIVisible = useAIChatStore((s) => s.setVisible);
  const iconSize16 = useResponsiveSize(16);

  const handleToggleSidebar = () => {
    // Close AI chat panel when notebook is toggled
    setAIVisible(bookKey, false);
    
    if (appService?.isMobile) {
      setHoveredBookKey('');
    }
    if (sideBarBookKey === bookKey) {
      toggleNotebook();
    } else {
      setSideBarBookKey(bookKey);
      if (!isNotebookVisible) toggleNotebook();
    }
  };
  return (
    <Button
      icon={
        sideBarBookKey == bookKey && isNotebookVisible ? (
          <LuNotebookPen size={iconSize16} className='text-base-content' />
        ) : (
          <LuNotebookPen size={iconSize16} className='text-base-content' />
        )
      }
      onClick={handleToggleSidebar}
      tooltip={_('Notebook')}
      tooltipDirection='bottom'
    ></Button>
  );
};

export default NotebookToggler;
