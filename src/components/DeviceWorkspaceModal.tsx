import React from 'react';
import { 
  Folder, HardDrive, ShieldCheck, RefreshCw, AlertTriangle, 
  X, CheckCircle, Database, HelpCircle, ArrowRight, Server, CloudLightning
} from 'lucide-react';

interface DeviceWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceDirName: string;
  deviceDirPermission: boolean;
  onConnect: () => Promise<void>;
  onRequestPermission: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: () => Promise<void>;
}

export const DeviceWorkspaceModal: React.FC<DeviceWorkspaceModalProps> = ({
  isOpen,
  onClose,
  deviceDirName,
  deviceDirPermission,
  onConnect,
  onRequestPermission,
  onDisconnect,
  onExport,
  onImport
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#020205]/85 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-xl bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-slate-100 overflow-hidden flex flex-col z-10 animate-scaleUp">
        {/* Aesthetic top accent lines */}
        <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-amber-500 to-indigo-500 w-full" />

        {/* Header */}
        <div className="p-5 border-b border-indigo-500/10 flex justify-between items-center bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans font-black text-xs uppercase tracking-widest text-white">Device Workspace Sync</h3>
              <p className="text-[10px] text-indigo-400/70 font-mono uppercase tracking-wider">File System Access Engine</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 border border-transparent hover:border-slate-800 rounded-lg transition-all text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 scrollbar-thin">
          {deviceDirName ? (
            /* CONNECTED STATE */
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-indigo-500/10 rounded-xl flex items-start gap-3.5">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl shrink-0 mt-0.5 animate-pulse">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Status: Connected</span>
                  <h4 className="font-sans font-extrabold text-sm text-white">{deviceDirName}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This browser is connected to your local workspace directory. Songs, setlists, and arrangements are automatically mirrored to your hard drive on save.
                  </p>
                </div>
              </div>

              {/* Read/Write Permissions Alert */}
              {!deviceDirPermission && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Access Permission Required</h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Browsers require user approval in each session to read/write directories. Click below to re-authorize Worshipchordbook.
                    </p>
                    <button
                      onClick={onRequestPermission}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Authorize Read/Write Access
                    </button>
                  </div>
                </div>
              )}

              {/* Workspace Sync Operations */}
              <div className="space-y-2 pt-1">
                <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest font-mono">Manual Operations</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={onExport}
                    disabled={!deviceDirPermission}
                    className="flex items-center justify-between p-3.5 bg-slate-950/40 hover:bg-indigo-950/20 border border-indigo-500/10 hover:border-indigo-500/35 rounded-xl transition-all text-left group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="font-extrabold text-xs text-indigo-300 group-hover:text-indigo-200">Force Export All</div>
                      <div className="text-[10px] text-slate-500 group-hover:text-slate-400">Overwrite local folder with current browser state</div>
                    </div>
                    <Server className="w-5 h-5 text-indigo-400/70 shrink-0 group-hover:text-indigo-400 transition-colors" />
                  </button>

                  <button
                    onClick={onImport}
                    disabled={!deviceDirPermission}
                    className="flex items-center justify-between p-3.5 bg-slate-950/40 hover:bg-emerald-950/20 border border-indigo-500/10 hover:border-emerald-500/35 rounded-xl transition-all text-left group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="font-extrabold text-xs text-emerald-400 group-hover:text-emerald-300">Force Import All</div>
                      <div className="text-[10px] text-slate-500 group-hover:text-slate-400">Load and merge songs and setlists from local folder</div>
                    </div>
                    <CloudLightning className="w-5 h-5 text-emerald-400/70 shrink-0 group-hover:text-emerald-400 transition-colors" />
                  </button>
                </div>
              </div>

              {/* Disconnect Option */}
              <div className="pt-4 border-t border-indigo-500/10 flex justify-between items-center">
                <span className="text-[10px] text-slate-500 font-mono">Connected via secure File System Handle</span>
                <button
                  onClick={onDisconnect}
                  className="px-3 py-1.5 border border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-950/25 text-rose-400 hover:text-rose-300 rounded-lg text-[10px] uppercase tracking-wider font-extrabold transition-all cursor-pointer"
                >
                  Disconnect Folder
                </button>
              </div>
            </div>
          ) : (
            /* DISCONNECTED / ONBOARDING STATE */
            <div className="space-y-5">
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400" />
                  <h4 className="font-sans font-extrabold text-xs text-indigo-200 uppercase tracking-wider">A Local-First Cloud Stage Companion</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Normally, stage data is cached in temporary browser storage (LocalStorage). By selecting a workspace folder, you direct Worshipchordbook to read and write actual physical folders and JSON files directly onto your device.
                </p>
              </div>

              {/* Features List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 bg-slate-950/30 border border-indigo-500/10 rounded-xl flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-white">Full Offline Autonomy</h5>
                    <p className="text-[10px] text-slate-400">Run the entire application, create setlists, and tweak roadmap loops completely offline without losing anything.</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/30 border border-indigo-500/10 rounded-xl flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-white">Secure Local Backup</h5>
                    <p className="text-[10px] text-slate-400">All songs, custom key roadmaps, and setlists are safely persisted as standard human-readable JSON files on your hard drive.</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/30 border border-indigo-500/10 rounded-xl flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-white">Perfect Mirroring</h5>
                    <p className="text-[10px] text-slate-400">Saves are structured into folders identical to our cloud databases: <code className="text-indigo-400 font-mono">/songs</code>, <code className="text-indigo-400 font-mono">/setlists</code>, and <code className="text-indigo-400 font-mono">/arrangements</code>.</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/30 border border-indigo-500/10 rounded-xl flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-white">Direct Edit Capabilities</h5>
                    <p className="text-[10px] text-slate-400">Easily view, edit, or copy the physical JSON files manually to share layouts directly with other worship leaders.</p>
                  </div>
                </div>
              </div>

              {/* Connect Button */}
              <div className="pt-2 text-center">
                <button
                  onClick={onConnect}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] active:scale-95 cursor-pointer flex items-center justify-center gap-2 mx-auto"
                >
                  <Folder className="w-4 h-4" />
                  <span>Choose Workspace Folder on Device</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="mt-3 text-[10px] text-slate-400 hover:text-indigo-300 font-mono tracking-wider uppercase underline transition-all"
                >
                  Skip and Use Browser Local Storage Only
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-indigo-500/10 text-[9px] font-mono text-slate-500 flex items-center justify-between select-none shrink-0">
          <span>SECURED BY FILE SYSTEM ACCESS API</span>
          <span>WORSHIPCHORDBOOK ENGINE V2</span>
        </div>
      </div>
    </div>
  );
};
