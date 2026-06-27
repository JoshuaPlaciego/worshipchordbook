import React from 'react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-[500] flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-3xl p-6 rounded-3xl w-full max-w-sm shadow-[0_20px_50px_rgba(49,46,129,0.5)] border border-indigo-500/20 relative"
      >
        <div className="flex justify-between items-center mb-4 border-b border-indigo-500/20 pb-3">
          <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-2">
            ⌨ Musician Hotkeys
          </h3>
          <button
            onClick={onClose}
            className="text-indigo-400/60 hover:text-white text-xs p-1 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3.5 text-xs text-indigo-100/80">
          <div className="flex justify-between items-center">
            <span>Play/Pause Autoscroll</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              Space
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Transpose Down</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              [
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Transpose Up</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              ]
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Zoom Out Font</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              -
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Zoom In Font</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              =
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Dismiss Popups</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              Esc
            </kbd>
          </div>
          <div className="flex justify-between items-center">
            <span>Toggle Fullscreen</span>
            <kbd className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded font-mono text-[10px] text-indigo-200 shadow-sm">
              F
            </kbd>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 btn-5d-primary text-white rounded-xl text-xs font-bold active:scale-95 transition-all"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};
