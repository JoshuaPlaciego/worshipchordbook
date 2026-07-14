import React, { useState, useEffect } from 'react';

interface SetlistSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: any;
  allSharedSetlists: any[];
  localSetlists?: any[];
  onAddSongToSet: (
    setName: string,
    arrangementName: string,
    customLayout?: {
      key?: string;
      roadmap?: any[];
      snapshotSections?: any;
    }
  ) => Promise<void>;
  onRemoveSongFromSet: (setName: string, songId: string) => Promise<void>;
  onCreateNewSetlist: (name: string, target?: 'cloud' | 'local') => Promise<void>;
  isAdmin?: boolean;
  currentKey: string;
  currentArrangementName: string;
  activeRoadmap: any[];
  originalRoadmap: any[];
  syncedSheetArrangements: any[];
  effectiveSectionTemplates: any;
  sectionTemplates: any;
}

export default function SetlistSelectorDialog({
  isOpen,
  onClose,
  currentSong,
  allSharedSetlists,
  localSetlists = [],
  onAddSongToSet,
  onRemoveSongFromSet,
  onCreateNewSetlist,
  isAdmin = false,
  currentKey,
  currentArrangementName,
  activeRoadmap,
  originalRoadmap,
  syncedSheetArrangements = [],
  effectiveSectionTemplates,
  sectionTemplates,
}: SetlistSelectorDialogProps) {
  const [newSetName, setNewSetName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingCreateName, setPendingCreateName] = useState<string | null>(null);

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

    if (actionLoading !== null) {
      incrementProcessing();
    } else {
      decrementProcessing();
    }

    return () => {
      if (actionLoading !== null) {
        decrementProcessing();
      }
    };
  }, [actionLoading]);

  const [removeConfirmSet, setRemoveConfirmSet] = useState<string | null>(null);
  const [addingToSet, setAddingToSet] = useState<string | null>(null);
  const [arrangementSource, setArrangementSource] = useState<'active' | 'original' | string>('active');
  const [arrangementName, setArrangementName] = useState('');
  const [localPresets, setLocalPresets] = useState<any[]>([]);

  // Load local custom arrangements/presets for this song
  useEffect(() => {
    if (currentSong && currentSong.SongID) {
      try {
        const raw = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Object.keys(parsed).map((name) => ({
            PresetName: name,
            RoadmapJSON: JSON.stringify(parsed[name]),
            isLocal: true,
          }));
          setLocalPresets(list);
        }
      } catch (e) {
        console.warn('Failed to parse local presets', e);
      }
    }
  }, [currentSong, isOpen]);

  if (!isOpen) return null;

  // Filter out setlist-specific Arrangements to list ONLY general, reusable presets
  const sharedPresets = (syncedSheetArrangements || []).filter(
    (arr: any) => arr && arr.PresetName && !arr.PresetName.startsWith('Set:')
  );

  // Merge presets preferring local if they have the same name
  const presetsMap = new Map<string, any>();
  sharedPresets.forEach((p) => presetsMap.set(p.PresetName, p));
  localPresets.forEach((p) => presetsMap.set(p.PresetName, p));
  const availablePresets = Array.from(presetsMap.values());

  // Merge folders from allSharedSetlists and localSetlists
  const mergedFoldersMap = new Map<string, { source: 'local' | 'shared' | 'modified'; folder: any }>();

  // First, add all shared setlists
  (allSharedSetlists || []).forEach((sl) => {
    if (sl && sl.PresetName) {
      mergedFoldersMap.set(sl.PresetName, { source: 'shared', folder: sl });
    }
  });

  // Then, override or add local setlists
  (localSetlists || []).forEach((sl) => {
    if (sl && sl.PresetName) {
      if (mergedFoldersMap.has(sl.PresetName)) {
        mergedFoldersMap.set(sl.PresetName, { source: 'modified', folder: sl });
      } else {
        mergedFoldersMap.set(sl.PresetName, { source: 'local', folder: sl });
      }
    }
  });

  const folders = Array.from(mergedFoldersMap.values())
    .map(({ source, folder }) => ({ ...folder, source }))
    .sort((a, b) => a.PresetName.localeCompare(b.PresetName));

  // Check which folders contain the current song
  const getIsSongInSet = (folder: any) => {
    try {
      const parsed = JSON.parse(folder.RoadmapJSON);
      const songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
      return songIds.some((id: string) => String(id) === String(currentSong.SongID));
    } catch {
      return false;
    }
  };

  const getIsSetlistLocked = (folder: any) => {
    try {
      const parsed = JSON.parse(folder.RoadmapJSON);
      return !!parsed.locked;
    } catch {
      return false;
    }
  };

  // Helper to extract the currently configured arrangement name inside a setlist
  const getSongArrangementNameInSet = (folder: any) => {
    // 1. Try local arrangements first
    try {
      const localArrsRaw = localStorage.getItem('local_setlist_arrangements');
      if (localArrsRaw) {
        const localArrs = JSON.parse(localArrsRaw);
        const found = localArrs.find(
          (arr: any) =>
            String(arr.SongID) === String(currentSong.SongID) &&
            arr.PresetName.toLowerCase().trim() === `set: ${folder.PresetName}`.toLowerCase().trim()
        );
        if (found) {
          const parsed = JSON.parse(found.RoadmapJSON);
          return parsed.arrangementName || 'Default';
        }
      }
    } catch {}

    // 2. Try synced sheet arrangements
    const matchingArr = (syncedSheetArrangements || []).find(
      (arr: any) => arr && String(arr.SongID) === String(currentSong.SongID) && arr.PresetName === `Set: ${folder.PresetName}`
    );
    if (matchingArr) {
      try {
        const parsed = JSON.parse(matchingArr.RoadmapJSON);
        return parsed.arrangementName || 'Default';
      } catch {}
    }
    return null;
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSetName.trim();
    if (!trimmed) return;
    if (isAdmin) {
      setPendingCreateName(trimmed);
    } else {
      setActionLoading('create_folder');
      try {
        await onCreateNewSetlist(trimmed, 'local');
        setNewSetName('');
      } catch (err) {
        console.error(err);
      } finally {
        setActionLoading(null);
      }
    }
  };

  const startAddingToSet = (folderName: string) => {
    setAddingToSet(folderName);
    setArrangementSource('active');
    
    // Prepopulate arrangement name
    if (currentArrangementName) {
      setArrangementName(currentArrangementName);
    } else {
      const foundFolder = folders.find(f => f.PresetName === folderName);
      const existingName = foundFolder ? getSongArrangementNameInSet(foundFolder) : null;
      setArrangementName(existingName || 'Default');
    }
  };

  const handleAddToSet = async (setName: string) => {
    if (!arrangementName.trim()) return;
    setActionLoading(`add_${setName}`);
    try {
      let customLayout: any = undefined;

      if (arrangementSource === 'active') {
        customLayout = {
          key: currentKey,
          roadmap: activeRoadmap,
          snapshotSections: effectiveSectionTemplates,
        };
      } else if (arrangementSource === 'original') {
        customLayout = {
          key: currentSong.Key || 'C',
          roadmap: originalRoadmap,
          snapshotSections: sectionTemplates,
        };
      } else {
        // Find pre-saved preset
        const selectedPreset = availablePresets.find((p) => p.PresetName === arrangementSource);
        if (selectedPreset) {
          try {
            const parsed = JSON.parse(selectedPreset.RoadmapJSON);
            customLayout = {
              key: parsed.key || currentSong.Key || 'C',
              roadmap: parsed.roadmap || [],
              snapshotSections: parsed.snapshotSections || {},
            };
          } catch (err) {
            console.error('Error parsing selected arrangement preset', err);
          }
        }
      }

      await onAddSongToSet(setName, arrangementName.trim(), customLayout);
      setAddingToSet(null);
      setArrangementName('');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFromSet = async (setName: string) => {
    setActionLoading(`remove_${setName}`);
    try {
      await onRemoveSongFromSet(setName, String(currentSong.SongID));
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div id="setlist-selector-backdrop" className="fixed inset-0 bg-black/80 backdrop-blur-md z-[550] flex items-center justify-center p-4 animate-fadeIn">
      <div 
        id="setlist-selector-container" 
        className={`bg-gradient-to-br from-indigo-950/95 via-[#0c0d21]/98 to-[#05060a]/95 backdrop-blur-3xl p-5 sm:p-6 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col animate-scaleIn transition-all duration-300 ${
          isAdmin 
            ? 'shadow-[0_20px_50px_rgba(99,102,241,0.25)] border border-indigo-500/20' 
            : 'shadow-[0_20px_50px_rgba(245,158,11,0.15)] border border-amber-500/20'
        }`}
      >
        
        {/* Header */}
        <div className="flex justify-between items-start mb-4 flex-shrink-0 border-b border-indigo-500/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono">Setlist Selector & Arrangement Flow</span>
              {isAdmin ? (
                <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded font-bold font-mono">🔓 ADMIN CLOUD</span>
              ) : (
                <span className="text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded font-bold font-mono">💻 LOCAL VIEWER MODE</span>
              )}
            </div>
            <h3 className="text-lg font-black text-white leading-tight mt-1">
              Add "{currentSong.Title}" to Setlist Folder
            </h3>
            <p className="text-[11px] text-gray-400 mt-1 leading-normal">
              Select or customize which chord layout, key, and roadmap arrangement this setlist uses.
            </p>
          </div>
          <button
            id="close-setlist-selector-btn"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        {/* Local saving notice banner */}
        {!isAdmin && (
          <div className="mb-4 p-3 bg-amber-950/25 border border-amber-500/20 rounded-xl flex flex-col gap-1 shadow-[0_0_15px_rgba(245,158,11,0.03)] transition-all duration-300 hover:border-amber-500/35">
            <div className="flex items-center gap-1.5 text-amber-400 font-sans font-black text-[9px] uppercase tracking-widest">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
              </span>
              Local Storage Mode Active
            </div>
            <p className="text-[9px] leading-relaxed text-amber-200/70 font-medium">
              You are in Viewer Mode. All folders, songs added to setlists, and arrangements are stored in your browser's local storage only.
            </p>
          </div>
        )}

        {/* Create Folder Form */}
        <form onSubmit={handleCreateFolder} className="mb-4 flex-shrink-0">
          <label className="block text-[10px] text-indigo-300 font-bold uppercase tracking-wider font-mono mb-1">
            Create New Setlist Folder {isAdmin ? '(Cloud & Shared)' : '(Local Only)'}
          </label>
          <div className="flex gap-2">
            <input
              id="new-setlist-name-input"
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="e.g. Sunday Youth Service, Wednesday Night..."
              className="flex-1 bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400/50"
            />
            <button
              id="submit-create-setlist-btn"
              type="submit"
              disabled={actionLoading !== null || !newSetName.trim()}
              className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center min-w-[80px]"
            >
              {actionLoading === 'create_folder' ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>

        {/* Setlist Folders Scroll Area */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar min-h-[180px]">
          <span className="block text-[10px] text-indigo-300 font-bold uppercase tracking-wider font-mono mb-1">
            Available Setlist Folders
          </span>
          {folders.length === 0 ? (
            <div className="p-5 text-center border border-dashed border-indigo-500/10 rounded-2xl bg-white/2">
              <p className="text-xs text-gray-500">No setlist folders found.</p>
              <p className="text-[10px] text-gray-600 mt-1">Use the field above to create your first church service setlist folder!</p>
            </div>
          ) : (
            folders.map((folder: any) => {
              const hasSong = getIsSongInSet(folder);
              const isLocked = getIsSetlistLocked(folder);
              const isLockedForUser = isLocked && !isAdmin;
              const isLoading = actionLoading === `add_${folder.PresetName}` || actionLoading === `remove_${folder.PresetName}`;
              const activeArrNameInSet = getSongArrangementNameInSet(folder);
              
              const isLocalFolder = folder.source === 'local' || folder.source === 'modified';
              return (
                <div
                  key={folder.PresetName}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2 ${
                    hasSong
                      ? isLocalFolder
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.05)] text-amber-100'
                        : 'bg-violet-600/10 border-violet-500/30 shadow-inner'
                      : isLocalFolder
                        ? 'bg-amber-950/5 border-amber-500/10 hover:border-amber-500/25'
                        : 'bg-white/3 border-white/5 hover:border-indigo-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className={hasSong ? (isLocalFolder ? 'text-amber-400' : 'text-violet-400') : 'text-indigo-400'}>
                          {isLocalFolder ? '💻' : '📁'}
                        </span>
                        <span className="truncate">{folder.PresetName}</span>
                        {folder.source === 'local' && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black font-mono border border-amber-500/20">LOCAL ONLY</span>
                        )}
                        {folder.source === 'modified' && (
                          <span className="text-[9px] bg-amber-600/20 text-amber-300 px-1.5 py-0.5 rounded font-black font-mono border border-amber-500/30" title="Shared folder with your local modifications">LOCAL COPY</span>
                        )}
                        {folder.source === 'shared' && (
                          <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold font-mono border border-indigo-500/20">CLOUD</span>
                        )}
                        {isLocked && (
                          <span className="text-[10px]" title="Setlist Locked by Admin">🔒</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        {isLockedForUser ? (
                          <span className="text-rose-400 text-[9px] font-bold">Locked by Admin</span>
                        ) : hasSong ? (
                          <>
                            <span className={`font-semibold px-1.5 py-0.5 rounded text-[9px] ${
                              isLocalFolder ? 'text-amber-400 bg-amber-500/15' : 'text-violet-400 bg-violet-500/10'
                            }`}>
                              ✓ In Setlist
                            </span>
                            {activeArrNameInSet && (
                              <span className="text-gray-400">
                                (Arrangement: <span className={isLocalFolder ? 'text-amber-300 font-medium' : 'text-indigo-300 font-medium'}>{activeArrNameInSet}</span>)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500">Not in this setlist</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isAdmin && !isLocalFolder ? (
                        <span className="text-[9px] bg-slate-500/10 border border-slate-500/20 px-2.5 py-1 rounded-lg text-slate-400 font-extrabold select-none flex items-center gap-1" title="Admins can modify cloud folders. Local Sandboxes can be customized freely.">
                          🔒 READ-ONLY
                        </span>
                      ) : isLockedForUser ? (
                        <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg text-amber-400 font-extrabold select-none flex items-center gap-1">
                          🔒 LOCKED
                        </span>
                      ) : removeConfirmSet === folder.PresetName ? (
                        <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-xl animate-fadeIn">
                          <span className="text-[10px] text-rose-300 font-bold select-none">Remove?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setRemoveConfirmSet(null);
                              handleRemoveFromSet(folder.PresetName);
                            }}
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black rounded cursor-pointer transition-all active:scale-90"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoveConfirmSet(null)}
                            className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/20 text-indigo-200 text-[10px] font-bold rounded cursor-pointer transition-all active:scale-90"
                          >
                            No
                          </button>
                        </div>
                      ) : addingToSet !== folder.PresetName ? (
                        hasSong ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startAddingToSet(folder.PresetName)}
                              disabled={actionLoading !== null}
                              className={`text-[10px] px-3 py-1 rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1 ${
                                isLocalFolder
                                  ? 'bg-amber-600/30 hover:bg-amber-600 text-amber-100 hover:text-white border border-amber-500/20 hover:border-amber-500/40'
                                  : 'bg-violet-600/30 hover:bg-violet-600 text-violet-100 hover:text-white border border-violet-500/20 hover:border-violet-500/40'
                              }`}
                              title="Overwrite default arrangement setting"
                            >
                              🔄 Change Layout
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveConfirmSet(folder.PresetName)}
                              disabled={actionLoading !== null}
                              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 hover:border-rose-500/40 text-[10px] px-2.5 py-1 rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer"
                              title="Remove from Set"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startAddingToSet(folder.PresetName)}
                            disabled={actionLoading !== null}
                            className={`text-[10px] px-3.5 py-1.5 rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer ${
                              isLocalFolder
                                ? 'bg-amber-600/20 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-500/20 border-amber-500/40'
                                : 'bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/20 border-indigo-500/40'
                            }`}
                          >
                            {isLoading ? 'Saving...' : '+ Add Song'}
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>

                  {/* Enhanced Arrangement Selector Dropdown View */}
                  {addingToSet === folder.PresetName && (
                    <div className={`flex flex-col gap-3 mt-2 pt-3 border-t p-3 rounded-2xl animate-fadeIn ${
                      isLocalFolder 
                        ? 'border-amber-500/15 bg-amber-950/20 text-amber-200' 
                        : 'border-indigo-500/15 bg-indigo-950/20'
                    }`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider font-mono ${
                        isLocalFolder ? 'text-amber-400' : 'text-indigo-300'
                      }`}>
                        Select Song Arrangement Source:
                      </div>
                      
                      {/* Source options stack */}
                      <div className="grid grid-cols-1 gap-2">
                        {/* 1. Active screen view */}
                        <button
                           type="button"
                           onClick={() => {
                             setArrangementSource('active');
                             setArrangementName(currentArrangementName || 'Active Screen Layout');
                           }}
                           className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col ${
                             arrangementSource === 'active'
                               ? !isAdmin 
                                 ? 'bg-amber-600/20 border-amber-400 text-amber-100 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                                 : 'bg-indigo-600/20 border-indigo-400 text-white font-semibold shadow-inner'
                               : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                           }`}
                        >
                          <span className="flex items-center justify-between w-full">
                            <span className="flex items-center gap-1.5">
                              <span>🖥️</span>
                              <span>Active Screen Layout</span>
                              {currentArrangementName && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                  !isAdmin ? 'bg-amber-500/30 text-amber-200' : 'bg-indigo-500/30 text-indigo-200'
                                }`}>
                                  {currentArrangementName}
                                </span>
                              )}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                              !isAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'
                            }`}>
                              Key: {currentKey} ({activeRoadmap.length} blocks)
                            </span>
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal mt-1 leading-normal">
                            Captures the current key, custom roadmaps, and edits visible on your screen right now.
                          </span>
                        </button>
 
                        {/* 2. Original / Baseline default */}
                        <button
                          type="button"
                          onClick={() => {
                            setArrangementSource('original');
                            setArrangementName('Default');
                          }}
                          className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col ${
                            arrangementSource === 'original'
                              ? 'bg-indigo-600/20 border-indigo-400 text-white font-semibold shadow-inner'
                              : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          <span className="flex items-center justify-between w-full">
                            <span className="flex items-center gap-1.5">
                              <span>📄</span>
                              <span>Original Song Layout</span>
                            </span>
                            <span className="text-[9px] bg-slate-500/20 px-1.5 py-0.5 rounded text-gray-300 font-bold font-mono">
                              Key: {currentSong.Key || 'C'} ({originalRoadmap.length} blocks)
                            </span>
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal mt-1 leading-normal">
                            Uses the baseline arrangement structure from the song card's original structure.
                          </span>
                        </button>
 
                        {/* 3. Reusable arrangements */}
                        {(() => {
                          const targetPresets = isLocalFolder ? localPresets : sharedPresets;
                          if (targetPresets.length === 0) {
                            return (
                              <div className="text-gray-500 italic text-[10px] py-4 text-center bg-black/20 rounded-xl border border-dashed border-white/5">
                                No {isLocalFolder ? 'local' : 'cloud'} arrangements saved yet for this song
                              </div>
                            );
                          }
                          return targetPresets.map((preset) => {
                            let pKey = currentSong.Key || 'C';
                            let blockCount = 0;
                            const isLocalPreset = (preset as any).isLocal;
                            try {
                              const parsed = JSON.parse(preset.RoadmapJSON);
                              if (parsed) {
                                if (parsed.key) pKey = parsed.key;
                                if (Array.isArray(parsed.roadmap)) blockCount = parsed.roadmap.length;
                              }
                            } catch {}

                            return (
                              <button
                                key={preset.PresetName}
                                type="button"
                                onClick={() => {
                                  setArrangementSource(preset.PresetName);
                                  setArrangementName(preset.PresetName);
                                }}
                                className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col ${
                                  arrangementSource === preset.PresetName
                                    ? isLocalPreset
                                      ? 'bg-amber-600/20 border-amber-400 text-amber-100 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                                      : 'bg-indigo-600/20 border-indigo-400 text-white font-semibold shadow-inner'
                                    : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                              >
                                <span className="flex items-center justify-between w-full">
                                  <span className="flex items-center gap-1.5">
                                    <span>{isLocalPreset ? '💻' : '💾'}</span>
                                    <span>
                                      {isLocalPreset ? 'Local Arrangement' : 'Saved Arrangement'}: {preset.PresetName}
                                    </span>
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                                    isLocalPreset
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    Key: {pKey} {blockCount > 0 ? `(${blockCount} blocks)` : ''}
                                  </span>
                                </span>
                                <span className="text-[10px] text-gray-400 font-normal mt-1 leading-normal">
                                  {isLocalPreset 
                                    ? 'Clones your custom arrangement saved on this device.'
                                    : 'Clones this saved reusable arrangement snapshot directly.'
                                  }
                                </span>
                              </button>
                            );
                          });
                        })()}
                      </div>
 
                      {/* Display name in setlist */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <label className={`text-[10px] font-bold uppercase tracking-wider font-mono ${
                          isLocalFolder ? 'text-amber-400' : 'text-indigo-300'
                        }`}>
                          Arrangement Name ({isAdmin ? 'Saved Online' : 'Saved Locally'}):
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. Standard, Acoustic, Full Band..."
                            value={arrangementName}
                            onChange={(e) => setArrangementName(e.target.value)}
                            className={`flex-1 bg-indigo-950/60 border rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400 ${
                              isLocalFolder ? 'border-amber-500/30' : 'border-indigo-500/30'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddToSet(folder.PresetName)}
                            disabled={actionLoading !== null || !arrangementName.trim()}
                            className={`text-white text-xs px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center min-w-[70px] ${
                              isLocalFolder 
                                ? 'bg-amber-600 hover:bg-amber-500' 
                                : 'bg-emerald-600 hover:bg-emerald-500'
                            }`}
                          >
                            {isLoading ? '...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingToSet(null);
                              setArrangementName('');
                            }}
                            className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs px-3 py-2 rounded-xl font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* Footer info and close button */}
        <div className="mt-4 pt-3 border-t border-indigo-500/10 flex justify-end gap-2 flex-shrink-0">
          <button
            id="done-setlist-selector-btn"
            onClick={onClose}
            className="bg-white/5 hover:bg-white/10 text-gray-300 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Admin storage location choice prompt */}
      {pendingCreateName && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md rounded-3xl z-[1000] flex flex-col items-center justify-center p-6 animate-fadeIn select-none">
          <div className="max-w-xs text-center flex flex-col gap-5">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-xl">
              ❓
            </div>
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider font-sans">
                Setlist Storage Destination
              </h4>
              <p className="text-[11px] text-gray-300 mt-2 leading-relaxed">
                You are creating setlist "<span className="text-indigo-400 font-bold">{pendingCreateName}</span>". As an Admin, where would you like to publish this new folder?
              </p>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  setActionLoading('create_folder');
                  const name = pendingCreateName;
                  setPendingCreateName(null);
                  try {
                    await onCreateNewSetlist(name, 'cloud');
                    setNewSetName('');
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setActionLoading(null);
                  }
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.25)]"
              >
                <span>☁️</span> Publish to Cloud (Shared)
              </button>
              
              <button
                type="button"
                onClick={async () => {
                  setActionLoading('create_folder');
                  const name = pendingCreateName;
                  setPendingCreateName(null);
                  try {
                    await onCreateNewSetlist(name, 'local');
                    setNewSetName('');
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setActionLoading(null);
                  }
                }}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
              >
                <span>💻</span> Save to Local (This Device)
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => setPendingCreateName(null)}
              className="text-gray-400 hover:text-white text-[10px] uppercase font-bold tracking-widest mt-2 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
