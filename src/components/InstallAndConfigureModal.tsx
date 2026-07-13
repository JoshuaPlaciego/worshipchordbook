import React, { useState } from 'react';

interface InstallAndConfigureModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrls: string[];
  onSaveScriptUrls: (urls: string[]) => void;
  onResetScriptUrl: () => void;
  deferredInstallPrompt: any;
  lastSynced: number | null;
  isOffline: boolean;
  onForceSync: () => Promise<void>;
  isAdmin: boolean;
  onOpenAdmin: () => void;
}

export const InstallAndConfigureModal: React.FC<InstallAndConfigureModalProps> = ({
  isOpen,
  onClose,
  deferredInstallPrompt,
  isAdmin,
  onOpenAdmin,
}) => {
  if (!isOpen) return null;

  const triggerDirectInstall = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[750] flex items-center justify-center p-4 animate-fadeIn">
      {/* Modal Container */}
      <div className="bg-gradient-to-br from-indigo-950/95 via-[#0c0d21]/98 to-[#05060a]/95 backdrop-blur-2xl p-4 rounded-2xl w-full max-w-md shadow-[0_15px_40px_rgba(99,102,241,0.25)] border border-indigo-500/15 max-h-[88vh] flex flex-col animate-scaleIn">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-3.5 flex-shrink-0 border-b border-indigo-500/15 pb-2">
          <div>
            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">Setup Assistant</span>
            <h3 className="text-sm font-black text-white leading-tight mt-0.5 flex items-center gap-1.5">
              <span>📲</span> Load & Configure App
            </h3>
            <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
              PWA installer guidelines & standalone application setup.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        {/* Scroll Content */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3.5">
          
          {/* Direct Installation (PWA Prompt) */}
          {deferredInstallPrompt ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex flex-col gap-1.5 shadow-inner">
              <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-[11px]">
                <span>💡</span> Direct Install Available!
              </div>
              <p className="text-[10px] text-gray-300 leading-normal">
                Install this worship chord book directly. Run in standalone offline-capable app mode!
              </p>
              <button
                onClick={triggerDirectInstall}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold uppercase py-1.5 px-3 rounded-lg shadow-md hover:shadow-emerald-600/10 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                📥 Install App Now
              </button>
            </div>
          ) : (
            <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/15 rounded-xl">
              <div className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider font-mono">PWA Active</div>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-normal">
                Configured as a Progressive Web App (PWA) with automatic offline caching of lyrics and chord structures.
              </p>
            </div>
          )}

          {/* iOS Safari Installation Steps */}
          <div className="p-3 bg-white/3 border border-white/5 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-indigo-300 font-black text-[10.5px] select-none">
              <span className="bg-indigo-500/20 text-indigo-300 w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-mono">1</span>
              <span>Install on iPhone / iPad (Safari)</span>
            </div>
            <ul className="list-disc list-inside text-[9.5px] text-gray-400 space-y-0.5 pl-1 leading-normal">
              <li>Open <code className="text-indigo-200 bg-indigo-500/10 px-1 rounded">Safari</code> on your iOS device.</li>
              <li>Tap the <span className="text-white font-bold">Share icon 📤</span> in the bottom toolbar.</li>
              <li>Select <span className="text-indigo-300 font-bold">"Add to Home Screen" ➕</span>.</li>
            </ul>
          </div>

          {/* Android Chrome Installation Steps */}
          <div className="p-3 bg-white/3 border border-white/5 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-indigo-300 font-black text-[10.5px] select-none">
              <span className="bg-indigo-500/20 text-indigo-300 w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-mono">2</span>
              <span>Install on Android (Chrome)</span>
            </div>
            <ul className="list-disc list-inside text-[9.5px] text-gray-400 space-y-0.5 pl-1 leading-normal">
              <li>Open <code className="text-indigo-200 bg-indigo-500/10 px-1 rounded">Chrome</code> on your Android device.</li>
              <li>Tap the <span className="text-white font-bold">Menu (3 dots) ⚙️</span> in top-right.</li>
              <li>Select <span className="text-indigo-300 font-bold">"Install app"</span> or <span className="text-indigo-300 font-bold">"Add to Home screen"</span>.</li>
            </ul>
          </div>

          {/* Secure Admin Control Access */}
          <div className="p-3 bg-purple-950/15 border border-purple-500/15 rounded-xl flex flex-col gap-2">
            <div className="text-[9px] text-purple-300 font-bold uppercase tracking-wider font-mono flex items-center gap-1">
              <span>🛡️</span> Database Administration Suite
            </div>
            <p className="text-[10px] text-gray-400 leading-normal">
              Federated database cluster manager, write-node configurations, and capacity statistics are restricted to administrators.
            </p>
            <button
              onClick={onOpenAdmin}
              className="bg-purple-600/25 border border-purple-500/35 hover:bg-purple-600/40 text-purple-200 hover:text-white py-1.5 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm"
            >
              🔑 {isAdmin ? 'Access Admin Suite' : 'Authenticate Admin'}
            </button>
          </div>

        </div>

        {/* Footer info and close button */}
        <div className="mt-3 pt-2 border-t border-indigo-500/15 flex justify-between items-center flex-shrink-0">
          <p className="text-[7.5px] text-gray-500 font-medium">
            Worship Chord Book PWA v1.4
          </p>
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
