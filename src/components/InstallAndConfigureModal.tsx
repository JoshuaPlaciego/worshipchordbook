import React, { useState, useEffect } from 'react';

interface InstallAndConfigureModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrl: string;
  onSaveScriptUrl: (url: string) => void;
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
  scriptUrl,
  onSaveScriptUrl,
  onResetScriptUrl,
  deferredInstallPrompt,
  lastSynced,
  isOffline,
  onForceSync,
  isAdmin,
  onOpenAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'install' | 'backend'>('install');
  const [inputUrl, setInputUrl] = useState(scriptUrl);
  const [syncLoading, setSyncLoading] = useState(false);

  // Global cursor loading state integration
  useEffect(() => {
    const incrementProcessing = () => {
      if (typeof window !== 'undefined') {
        (window as any).__processingCount = ((window as any).__processingCount || 0) + 1;
        document.body.classList.add('app-processing');
      }
    };

    const decrementProcessing = () => {
      if (typeof window !== 'undefined') {
        (window as any).__processingCount = Math.max(0, ((window as any).__processingCount || 0) - 1);
        if ((window as any).__processingCount === 0) {
          document.body.classList.remove('app-processing');
        }
      }
    };

    if (syncLoading) {
      incrementProcessing();
    } else {
      decrementProcessing();
    }

    return () => {
      if (syncLoading) {
        decrementProcessing();
      }
    };
  }, [syncLoading]);

  const [copiedScript, setCopiedScript] = useState(false);

  if (!isOpen) return null;

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    onSaveScriptUrl(inputUrl.trim());
  };

  const handleResetUrl = () => {
    onResetScriptUrl();
    // Use setTimeout to allow the prop update to flow, or just set it locally
    setInputUrl('https://script.google.com/macros/s/AKfycbyXCeXackc_suAUMKCGJ6qIjMygAADB9zHmoJ5EqWU_OTmBxkgH9uHLP4nY427farS5/exec');
  };

  const triggerDirectInstall = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
      }
    }
  };

  const handleManualSync = async () => {
    setSyncLoading(true);
    try {
      await onForceSync();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncLoading(false);
    }
  };

  const copyAppsScriptInstructions = () => {
    const instructions = `// GOOGLE APPS SCRIPT BACKEND FOR SONGS, ARRANGEMENTS & SETLISTS
// Paste this code in Extensions -> Apps Script inside your Google Sheet!
// Ensure you deploy as a Web App with access for "Anyone".`;
    navigator.clipboard.writeText(instructions);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[750] flex items-center justify-center p-4 animate-fadeIn">
      {/* Modal Container: shrunk width to max-w-sm, tighter padding for compact footprint */}
      <div className="bg-gradient-to-br from-indigo-950/95 via-[#0c0d21]/98 to-[#05060a]/95 backdrop-blur-2xl p-3 sm:p-3.5 rounded-2xl w-full max-w-sm shadow-[0_15px_40px_rgba(99,102,241,0.2)] border border-indigo-500/15 max-h-[82vh] flex flex-col animate-scaleIn">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-2 flex-shrink-0 border-b border-indigo-500/15 pb-1.5">
          <div>
            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">Control Center</span>
            <h3 className="text-sm font-black text-white leading-tight mt-0.5 flex items-center gap-1.5">
              <span>📲</span> Load & Configure
            </h3>
            <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
              PWA installer & Google Sheet connection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs - Slimmer height and smaller text */}
        <div className="grid grid-cols-2 gap-1.5 mb-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('install')}
            className={`text-[10px] font-bold py-1 px-1.5 rounded-lg transition-all active:scale-95 border cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'install'
                ? 'bg-indigo-600/30 text-white border-indigo-500/50 shadow-md'
                : 'bg-indigo-950/20 text-indigo-300/60 hover:text-indigo-200 border-indigo-500/10'
            }`}
          >
            <span>📱</span> App Install
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={`text-[10px] font-bold py-1 px-1.5 rounded-lg transition-all active:scale-95 border cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'backend'
                ? 'bg-indigo-600/30 text-white border-indigo-500/50 shadow-md'
                : 'bg-indigo-950/20 text-indigo-300/60 hover:text-indigo-200 border-indigo-500/10'
            }`}
          >
            <span>⚙️</span> Backend Config
          </button>
        </div>

        {/* Tab Scroll Content */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
          
          {activeTab === 'install' && (
            <div className="space-y-2 animate-fadeIn">
              {/* Direct Installation (PWA Prompt) */}
              {deferredInstallPrompt ? (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col gap-1 shadow-inner">
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
                <div className="p-2 bg-indigo-950/40 border border-indigo-500/10 rounded-xl">
                  <div className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider font-mono">PWA Active</div>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-normal">
                    Configured as a Progressive Web App (PWA) with automatic offline caching.
                  </p>
                </div>
              )}

              {/* iOS Safari Installation Steps */}
              <div className="p-2.5 bg-white/3 border border-white/5 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-300 font-black text-[10px] select-none">
                  <span className="bg-indigo-500/20 text-indigo-300 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-mono">1</span>
                  <span>Install on iPhone / iPad (Safari)</span>
                </div>
                <ul className="list-disc list-inside text-[9.5px] text-gray-400 space-y-0.5 pl-1 leading-normal">
                  <li>Open <code className="text-indigo-200">Safari</code> on your iOS device.</li>
                  <li>Tap the <span className="text-white font-bold">Share icon 📤</span> in the bottom toolbar.</li>
                  <li>Select <span className="text-indigo-300 font-bold">"Add to Home Screen" ➕</span>.</li>
                </ul>
              </div>

              {/* Android Chrome Installation Steps */}
              <div className="p-2.5 bg-white/3 border border-white/5 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-300 font-black text-[10px] select-none">
                  <span className="bg-indigo-500/20 text-indigo-300 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-mono">2</span>
                  <span>Install on Android (Chrome)</span>
                </div>
                <ul className="list-disc list-inside text-[9.5px] text-gray-400 space-y-0.5 pl-1 leading-normal">
                  <li>Open <code className="text-indigo-200">Chrome</code> on your Android device.</li>
                  <li>Tap the <span className="text-white font-bold">Menu (3 dots) ⚙️</span> in top-right.</li>
                  <li>Select <span className="text-indigo-300 font-bold">"Install app"</span> or <span className="text-indigo-300 font-bold">"Add to Home screen"</span>.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'backend' && (
            <div className="space-y-2 animate-fadeIn">
              {/* API Connection Form */}
              <form onSubmit={handleSaveUrl} className="space-y-1.5 bg-white/2 p-2.5 rounded-xl border border-white/5">
                <label className="block text-[8.5px] text-indigo-300 font-bold uppercase tracking-wider font-mono">
                  Google Apps Script Web App URL
                </label>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full bg-indigo-950/40 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-[10.5px] text-white placeholder-gray-600 focus:outline-none focus:border-indigo-400"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={handleResetUrl}
                      className="px-2.5 py-0.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-[8.5px] font-bold rounded-lg transition-all cursor-pointer border border-indigo-500/10"
                    >
                      Reset
                    </button>
                    <button
                      type="submit"
                      disabled={!inputUrl.trim() || inputUrl === scriptUrl}
                      className="px-3 py-0.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[8.5px] font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                    >
                      Save & Connect
                    </button>
                  </div>
                </div>
              </form>

              {/* Status Details */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="p-1.5 bg-indigo-950/20 border border-indigo-500/10 rounded-xl flex flex-col justify-center">
                  <span className="text-[7.5px] text-gray-500 font-bold uppercase font-mono">Sync Status</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                    <span className="text-[9px] font-black text-indigo-100">
                      {isOffline ? 'Offline Mode' : 'Cloud Sync'}
                    </span>
                  </div>
                </div>

                <div className="p-1.5 bg-indigo-950/20 border border-indigo-500/10 rounded-xl flex flex-col justify-center">
                  <span className="text-[7.5px] text-gray-500 font-bold uppercase font-mono">Last Sync</span>
                  <span className="text-[9px] font-black text-indigo-100 mt-0.5">
                    {lastSynced ? new Date(lastSynced).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncLoading}
                  className="flex-1 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/15 text-indigo-200 hover:text-white py-1 px-1.5 rounded-lg text-[9px] font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  🔄 {syncLoading ? 'Syncing...' : 'Sync'}
                </button>
                
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="flex-1 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/15 text-violet-300 hover:text-violet-200 py-1 px-1.5 rounded-lg text-[9px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  {isAdmin ? '🔓 Logged' : '🔒 Admin'}
                </button>
              </div>

              {/* Apps Script Installation Quick Helper */}
              <div className="p-2 bg-indigo-950/25 border border-indigo-500/10 rounded-xl space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-indigo-300 font-bold uppercase tracking-wider font-mono">Host Your Own Sheet</span>
                  <button
                    onClick={copyAppsScriptInstructions}
                    className="text-[7.5px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-1 py-0.5 rounded font-bold hover:bg-indigo-500/20 transition-all cursor-pointer"
                  >
                    {copiedScript ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 leading-tight">
                  Paste script code in Google Sheet <code className="text-indigo-200">Apps Script</code> to host.
                </p>
              </div>

            </div>
          )}

        </div>

        {/* Footer info and close button */}
        <div className="mt-2.5 pt-1.5 border-t border-indigo-500/15 flex justify-between items-center flex-shrink-0">
          <p className="text-[7.5px] text-gray-500 font-medium">
            Worship Chord Book PWA v1.2
          </p>
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
