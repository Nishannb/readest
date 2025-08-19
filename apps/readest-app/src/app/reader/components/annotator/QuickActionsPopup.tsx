import React from 'react';
import clsx from 'clsx';
import { Position } from '@/utils/sel';
import { FiCopy } from 'react-icons/fi';
import { FaRegStar } from 'react-icons/fa';
import { LuBrain } from "react-icons/lu";

type Props = {
  position: Position;
  trianglePosition: Position;
  onCopy: () => void;
  onAskAI: () => void;
};

const QuickActionsPopup: React.FC<Props> = ({ position, trianglePosition, onCopy, onAskAI }) => {
  const { point, dir } = position;
  const tri = trianglePosition.point;
  const offsetY = dir === 'down' ? -12 : 12;
  return (
    <div
      className={clsx('absolute z-30')}
      style={{ left: point.x, top: point.y + offsetY, transform: 'translate(-50%, -50%)' }}
    >
      {/* Triangle */}
      <div
        className='absolute h-0 w-0 border-transparent'
        style={{
          left: tri.x - point.x,
          top: tri.y - point.y,
          borderWidth: 6,
          borderTopColor: dir === 'down' ? 'var(--fallback-bc, oklch(var(--bc)))' : 'transparent',
          borderBottomColor: dir === 'up' ? 'var(--fallback-bc, oklch(var(--bc)))' : 'transparent',
        }}
      />
      <div className='rounded-xl border border-base-300 bg-base-100 shadow-xl'>
        <div className='flex items-center gap-2 p-2'>
          <button className='btn btn-ghost btn-circle btn-xs' title='Copy' onClick={onCopy}>
            <FiCopy size={14} />
          </button>
          <button className='btn btn-ghost btn-circle btn-xs' title='Ask AI' onClick={onAskAI}>
            <LuBrain size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickActionsPopup;


