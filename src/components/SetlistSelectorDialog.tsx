import React, { useState } from 'react';
import { Song } from '../types';

interface SetlistSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song;
  allSharedSetlists: any[];
  onAddSongToSet: (setName: string) => Promise<void>;
  onRemoveSongFromSet: (setName: string, songId: string) => Promise<void>;
  onCreateNewSetlist: (setName: string) => Promise<void>;
}

export default function SetlistSelectorDialog({
  isOpen,
  onClose,
  currentSong,
  allSharedSetlists,
  onAddSongToSet,
  onRemoveSongFromSet,
  onCreateNewSetlist,
}: SetlistSelectorDialogProps) {
  const [newSetName, setNewSetName] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [removeConfirmSet, setRemoveConfirmSet] = useState<string | null>(null);

  if (!isOpen) return null;

  // Extract setlist metadata folders
  const folders = allSharedSetlists
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

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    setActionLoading('create_folder');
    try {
      await onCreateNewSetlist(newSetName.trim());
      setNewSetName('');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddToSet = async (setName: string) => {
    setActionLoading(`add_${setName}`);
    try {
      await onAddSongToSet(setName);
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[550] flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-gradient-to-br from-indigo-950/95 via-[#0c0d21]/98 to-[#05060a]/95 backdrop-blur-3xl p-5 sm:p-6 rounded-3xl w-full max-w-md shadow-[0_20px_50px_rgba(99,102,241,0.25)] border border-indigo-500/20 max-h-[85vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-4 flex-shrink-0">
          <div>
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono">Setlist Multi-Service Manager</span>
            <h3 className="text-lg font-black text-white leading-tight mt-0.5">
              Add "{currentSong.Title}" to Sets
            </h3>
            <p className="text-[11px] text-gray-400 mt-1 leading-normal">
              Captures your active key, BPM, layout, and section flow settings automatically for this service lineup.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Create Folder Form */}
        <form onSubmit={handleCreateFolder} className="mb-4 flex-shrink-0">
          <label className="block text-[10px] text-indigo-300 font-bold uppercase tracking-wider font-mono mb-1">
            Create New Setlist Folder
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="e.g. Sunday Youth Service, Sunday 9AM..."
              className="flex-1 bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-400/50"
            />
            <button
              type="submit"
              disabled={actionLoading !== null || !newSetName.trim()}
              className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center min-w-[70px]"
            >
              {actionLoading === 'create_folder' ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>

        {/* Setlist Folders Scroll Area */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[150px]">
          <span className="block text-[10px] text-indigo-300 font-bold uppercase tracking-wider font-mono mb-1">
            Available Setlist Folders
          </span>

          {folders.length === 0 ? (
            <div className="p-4 text-center border border-dashed border-indigo-500/10 rounded-2xl bg-white/2">
              <p className="text-xs text-gray-500">No setlist folders found.</p>
              <p className="text-[10px] text-gray-600 mt-1">Use the field above to create your first church service setlist folder!</p>
            </div>
          ) : (
            folders.map((folder) => {
              const hasSong = getIsSongInSet(folder);
              const isLoading = actionLoading === `add_${folder.PresetName}` || actionLoading === `remove_${folder.PresetName}`;

              return (
                <div
                  key={folder.PresetName}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    hasSong
                      ? 'bg-violet-600/10 border-violet-500/30 shadow-inner'
                      : 'bg-white/3 border-white/5 hover:border-indigo-500/20'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <span className={hasSong ? 'text-violet-400' : 'text-indigo-400'}>📁</span>
                      <span className="truncate">{folder.PresetName}</span>
                    </div>
                    <div className="text-[9px] text-gray-500 mt-0.5">
                      {hasSong ? 'Captured Arrangement Saved' : 'Not in this setlist'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {removeConfirmSet === folder.PresetName ? (
                      <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-lg animate-fadeIn">
                        <span className="text-[9px] text-rose-300 font-bold select-none">Remove?</span>
                        <button
                          onClick={() => {
                            setRemoveConfirmSet(null);
                            handleRemoveFromSet(folder.PresetName);
                          }}
                          className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black rounded cursor-pointer transition-all active:scale-90"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setRemoveConfirmSet(null)}
                          className="px-1.5 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/20 text-indigo-200 text-[9px] font-bold rounded cursor-pointer transition-all active:scale-90"
                        >
                          No
                        </button>
                      </div>
                    ) : hasSong ? (
                      <>
                        <button
                          onClick={() => handleAddToSet(folder.PresetName)}
                          disabled={actionLoading !== null}
                          className="bg-violet-600 hover:bg-violet-500 text-white text-[10px] px-2.5 py-1 rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-0.5"
                          title="Save / Overwrite arrangement setting"
                        >
                          🔄 Overwrite
                        </button>
                        <button
                          onClick={() => setRemoveConfirmSet(folder.PresetName)}
                          disabled={actionLoading !== null}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 hover:border-red-500/40 text-[10px] px-2 py-1 rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer"
                          title="Remove from Set"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAddToSet(folder.PresetName)}
                        disabled={actionLoading !== null}
                        className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/20 hover:border-indigo-500/40 text-[10px] px-3 py-1 rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isLoading ? 'Saving...' : '+ Add'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info and close button */}
        <div className="mt-4 pt-3 border-t border-indigo-500/10 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
