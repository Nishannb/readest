import React, { useState } from 'react';
import { MdKeyboardArrowDown } from 'react-icons/md';
import { LuBrain } from 'react-icons/lu';
import { FaCamera } from 'react-icons/fa';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import Button from '@/components/Button';

interface ShortcutsDropdownProps {
  bookKey: string;
  onToggleAIChat: () => void;
  onTakeScreenshot: () => void;
}

const ShortcutsDropdown: React.FC<ShortcutsDropdownProps> = ({
  bookKey,
  onToggleAIChat,
  onTakeScreenshot,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [isOpen, setIsOpen] = useState(false);
  const isMac = appService?.appPlatform === 'macos';
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className={`dropdown dropdown-bottom dropdown-end ${isOpen ? 'dropdown-open' : ''}`}>
      <Button
        icon={<MdKeyboardArrowDown size={16} />}
        onClick={handleToggle}
        tooltip={_('Keyboard Shortcuts')}
        tooltipDirection="bottom"
        className="btn btn-ghost h-8 min-h-8 w-8 p-0"
      />
      <ul className="dropdown-content menu z-[100] w-64 rounded-box bg-base-200 p-2 shadow-lg">
        <li>
          <button
            onClick={() => {
              onToggleAIChat();
              handleClose();
            }}
            className="flex items-center gap-3 px-3 py-2 hover:bg-base-300 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <LuBrain size={16} className="text-primary" />
              <span className="text-sm font-medium">AI Chat</span>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-base-content/60">
              <kbd className="kbd kbd-xs">Shift</kbd>
              <span>+</span>
              <kbd className="kbd kbd-xs">A</kbd>
            </div>
          </button>
        </li>
        <li>
          <button
            onClick={() => {
              onTakeScreenshot();
              handleClose();
            }}
            className="flex items-center gap-3 px-3 py-2 hover:bg-base-300 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <FaCamera size={16} className="text-primary" />
              <span className="text-sm font-medium">Take Screenshot</span>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-base-content/60">
              <kbd className="kbd kbd-xs">{cmdKey}</kbd>
              <span>+</span>
              <kbd className="kbd kbd-xs">S</kbd>
            </div>
          </button>
        </li>
      </ul>
    </div>
  );
};

export default ShortcutsDropdown;
