import React, { useState, useEffect } from 'react';
import { Song } from '../types';

interface SidebarCatalogProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  favorites: string[];
  setlists: string[];
  currentTab: 'songs' | 'setlists' | 'favorites';
  onSetTab: (tab: 'songs' | 'setlists' | 'favorites') => void;
  currentSong: Song | null;
  onChangeSong: (song: Song) => void;
  onOpenAddSongForm: () => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
  onOpenShortcuts: () => void;
  onToggleFullScreen: () => void;
  triggerCapability: (cap: 'focus' | 'transpose' | 'metronome' | 'autoscroll') => void;
  onRunDiagnostics?: () => void;
  allSharedSetlists: any[];
  onSaveSetlistOrder?: (setName: string, updatedSongIds: string[]) => Promise<void>;
  onDeleteSetlist?: (setName: string) => Promise<void>;
  onRemoveSongFromSetlist?: (setName: string, songId: string) => Promise<void>;
  onSelectSongFromSetlist?: (song: Song, setName: string) => void;
  onCreateSetlist?: (setName: string) => Promise<void>;
  activeSetlistFolder?: string;
}

export const SidebarCatalog: React.FC<SidebarCatalogProps> = ({
  isOpen,
  onClose,
  songs,
  favorites,
  setlists,
  currentTab,
  onSetTab,
  currentSong,
  onChangeSong,
  onOpenAddSongForm,
  isAdmin,
  onToggleAdmin,
  onOpenShortcuts,
  onToggleFullScreen,
  triggerCapability,
  onRunDiagnostics,
  allSharedSetlists,
  onSaveSetlistOrder,
  onDeleteSetlist,
  onRemoveSongFromSetlist,
  onSelectSongFromSetlist,
  onCreateSetlist,
  activeSetlistFolder,
}) => {
  const [search, setSearch] = useState('');
  const [expandedSets, setExpandedSets] = useState<{ [setName: string]: boolean }>({});
  const [draggedItem, setDraggedItem] = useState<{ setName: string; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [deleteConfirmSet, setDeleteConfirmSet] = useState<string | null>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(false);
  const [prevTab, setPrevTab] = useState(currentTab);

  useEffect(() => {
    const openedNow = isOpen && !prevIsOpen;
    const switchedToSetlistsNow = currentTab === 'setlists' && prevTab !== 'setlists' && isOpen;

    if ((openedNow || switchedToSetlistsNow) && activeSetlistFolder) {
      setExpandedSets({ [activeSetlistFolder]: true });
    }

    if (openedNow || switchedToSetlistsNow) {
      setDeleteConfirmSet(null);
    }

    setPrevIsOpen(isOpen);
    setPrevTab(currentTab);
  }, [isOpen, currentTab, activeSetlistFolder, prevIsOpen, prevTab]);

  const clearSearch = () => setSearch('');

  const toggleSetExpanded = (setName: string) => {
    setExpandedSets((prev) => ({ ...prev, [setName]: !prev[setName] }));
  };

  const moveSong = (setName: string, songIds: string[], index: number, direction: number) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= songIds.length) return;
    const updated = [...songIds];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    
    if (onSaveSetlistOrder) {
      onSaveSetlistOrder(setName, updated);
    }
  };

  // Filter based on tab & query
  const filtered = songs.filter((s) => {
    const matchesSearch = s.Title && s.Title.toLowerCase().includes(search.toLowerCase());
    if (currentTab === 'favorites') return matchesSearch && favorites.includes(String(s.SongID));
    if (currentTab === 'setlists') return matchesSearch && setlists.includes(String(s.SongID));
    return matchesSearch;
  });

  // Alphabetical sort
  filtered.sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));

  // Group by alphabetical letters
  const counts: { [key: string]: number } = {};
  filtered.forEach((s) => {
    const title = s.Title || '';
    const firstChar = title.trim().charAt(0).toUpperCase();
    const displayLetter = firstChar >= 'A' && firstChar <= 'Z' ? firstChar : '#';
    counts[displayLetter] = (counts[displayLetter] || 0) + 1;
  });

  const lettersInList: string[] = [];
  let currentLetter = '';

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`anchor-${letter}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      {/* Lateral Menu Drawer */}
      <div
        id="navDrawer"
        className={`fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-3xl z-[100] transform shadow-[4px_0_40px_rgba(49,46,129,0.5)] flex flex-col transition-transform duration-300 border-r border-indigo-500/20 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header & Search Controls */}
        <div className="p-5 sm:p-6 pb-2 flex-shrink-0">
          <h2 className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2 select-none">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            Library Menu
          </h2>

          {isAdmin && (
            <button
              onClick={() => {
                onOpenAddSongForm();
                onClose();
              }}
              className="w-full mb-4 py-2.5 btn-5d-primary text-white text-[10px] font-bold tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              ADD NEW SONG
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 mb-4">
            {(['songs', 'setlists', 'favorites'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => onSetTab(tab)}
                className={`text-[9px] font-bold py-2 rounded-xl transition-all active:scale-95 border cursor-pointer ${
                  currentTab === tab
                    ? 'bg-indigo-600/40 text-white border-indigo-400/50 shadow-md'
                    : 'bg-indigo-950/20 text-indigo-300/60 hover:text-indigo-200 border-indigo-500/20 hover:bg-indigo-900/40'
                }`}
              >
                {tab === 'songs' ? 'SONGS' : tab === 'setlists' ? 'SETS' : 'FAVS'}
              </button>
            ))}
          </div>

          {currentTab === 'setlists' && (
            <div className="mb-4 bg-black/20 p-2.5 rounded-xl border border-white/5 select-none">
              <div className="text-[8px] font-bold text-indigo-300/80 uppercase tracking-widest mb-1.5">
                + Create New Setlist Folder
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Sunday Morning"
                  id="sidebarNewSetName"
                  className="flex-1 bg-black/40 text-indigo-100 py-1.5 px-2.5 rounded-lg text-xs outline-none border border-white/10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (onCreateSetlist && e.currentTarget.value.trim()) {
                        onCreateSetlist(e.currentTarget.value.trim());
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const el = document.getElementById('sidebarNewSetName') as HTMLInputElement;
                    if (el && onCreateSetlist && el.value.trim()) {
                      onCreateSetlist(el.value.trim());
                      el.value = '';
                    }
                  }}
                  className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          <div className="relative mt-2">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog..."
              className="w-full bg-indigo-900/30 text-indigo-100 py-3.5 pl-10 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] placeholder-indigo-300/50 transition-all border border-indigo-500/30 hover:bg-indigo-900/40 hover:border-indigo-400/50"
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-indigo-300/50 hover:text-indigo-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Catalog Area with A-Z Quick Index */}
        <div className="relative flex-1 flex overflow-hidden">
          <div id="sideContentScroll" className="pl-5 sm:pl-6 pr-8 flex-1 overflow-y-auto pb-4 custom-scrollbar">
            <div className="flex items-center justify-between mb-2 select-none">
              <div className="text-[9px] text-gray-500 uppercase tracking-widest">
                {currentTab === 'songs' ? 'All Songs' : currentTab === 'setlists' ? 'Setlist Folders' : 'Starred Favorites'}
              </div>
            </div>

            {currentTab === 'setlists' ? (
              <div className="space-y-3 mt-2 select-none">
                {(() => {
                  const metaRecords = allSharedSetlists;
                  const filteredMetaRecords = metaRecords.filter((meta) => {
                    const setName = meta.PresetName || '';
                    if (setName.toLowerCase().includes(search.toLowerCase())) return true;
                    
                    try {
                      const parsed = JSON.parse(meta.RoadmapJSON);
                      const songIds: string[] = Array.isArray(parsed.songIds) ? parsed.songIds : [];
                      return songIds.some((id) => {
                        const s = songs.find((song) => String(song.SongID) === String(id));
                        return s && s.Title && s.Title.toLowerCase().includes(search.toLowerCase());
                      });
                    } catch {
                      return false;
                    }
                  });

                  filteredMetaRecords.sort((a, b) => a.PresetName.localeCompare(b.PresetName));

                  if (filteredMetaRecords.length === 0) {
                    return (
                      <div className="text-xs text-gray-500 italic p-6 text-center bg-black/10 rounded-xl border border-white/5">
                        No matching setlist folders found.
                      </div>
                    );
                  }

                  return filteredMetaRecords.map((meta) => {
                    const setName = meta.PresetName;
                    let songIds: string[] = [];
                    try {
                      const parsed = JSON.parse(meta.RoadmapJSON);
                      songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
                    } catch {}

                    const isExpanded = !!expandedSets[setName];
                    const folderSongs = songIds
                      .map((id) => songs.find((s) => String(s.SongID) === String(id)))
                      .filter(Boolean) as Song[];

                    return (
                      <div
                        key={setName}
                        className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl overflow-hidden transition-all shadow-md"
                      >
                        {/* Folder Header */}
                        <div
                          onClick={() => toggleSetExpanded(setName)}
                          className="group flex items-center justify-between p-3 bg-indigo-900/10 hover:bg-indigo-900/20 cursor-pointer select-none transition-colors border-b border-indigo-500/5 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <span className="text-sm transition-transform duration-200 shrink-0">
                              {isExpanded ? '📂' : '📁'}
                            </span>
                            <div className="marquee-container relative overflow-hidden flex-1 min-w-0 select-none">
                              <span className="inline-block text-xs font-black tracking-wide text-gray-200 uppercase whitespace-nowrap truncate w-full group-hover:w-max group-hover:overflow-visible group-hover:text-clip group-hover:animate-hover-marquee">
                                {setName}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono font-extrabold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                              {songIds.length}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {deleteConfirmSet === setName ? (
                              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-lg">
                                <span className="text-[9px] text-rose-300 font-bold select-none">Delete?</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDeleteSetlist) {
                                      onDeleteSetlist(setName);
                                    }
                                    setDeleteConfirmSet(null);
                                  }}
                                  className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black rounded cursor-pointer transition-all active:scale-90"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmSet(null);
                                  }}
                                  className="px-1.5 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/20 text-indigo-200 text-[9px] font-bold rounded cursor-pointer transition-all active:scale-90"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <>
                                {folderSongs.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onSelectSongFromSetlist) {
                                        onSelectSongFromSetlist(folderSongs[0], setName);
                                        onClose();
                                      }
                                    }}
                                    className={
                                      activeSetlistFolder === setName
                                        ? "px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-350 border border-emerald-500/30 rounded-md text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                                        : "px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 hover:text-white rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                                    }
                                    title={activeSetlistFolder === setName ? "Setlist is Live" : "Start Setlist"}
                                  >
                                    {activeSetlistFolder === setName ? (
                                      <>
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping shrink-0" />
                                        <span>LIVE</span>
                                      </>
                                    ) : (
                                      <>▶ Start</>
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmSet(setName);
                                  }}
                                  className="p-1 hover:bg-rose-500/10 text-gray-500 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                                  title="Delete Setlist Folder"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </>
                            )}
                            <span className={`text-[10px] text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </div>
                        </div>

                        {/* Folder Contents (Songs list) */}
                        {isExpanded && (
                          <div className="p-2 space-y-1 bg-black/10 divide-y divide-indigo-500/5">
                            {folderSongs.length === 0 ? (
                              <div className="text-[10px] text-gray-500 italic p-3 text-center">
                                Folder is empty. Open a song sheet and click "Setlists" to add it!
                              </div>
                            ) : (
                              folderSongs.map((s, idx) => {
                                const isCurrent = currentSong && String(s.SongID) === String(currentSong.SongID);
                                return (
                                  <div
                                    key={s.SongID}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', String(s.SongID));
                                      setDraggedItem({ setName, index: idx });
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      if (draggedItem && draggedItem.setName === setName && draggedItem.index !== idx) {
                                        setDragOverIndex(idx);
                                      }
                                    }}
                                    onDragLeave={() => {
                                      setDragOverIndex(null);
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (draggedItem && draggedItem.setName === setName) {
                                        const dragIndex = draggedItem.index;
                                        if (dragIndex !== idx) {
                                          const updated = [...songIds];
                                          const [removed] = updated.splice(dragIndex, 1);
                                          updated.splice(idx, 0, removed);
                                          if (onSaveSetlistOrder) {
                                            onSaveSetlistOrder(setName, updated);
                                          }
                                        }
                                      }
                                      setDraggedItem(null);
                                      setDragOverIndex(null);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedItem(null);
                                      setDragOverIndex(null);
                                    }}
                                    onClick={() => {
                                      if (onSelectSongFromSetlist) {
                                        onSelectSongFromSetlist(s, setName);
                                        onClose();
                                      }
                                    }}
                                    className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                                      isCurrent
                                        ? 'bg-indigo-600/20 border-l-2 border-l-indigo-400 shadow-inner'
                                        : 'hover:bg-white/5'
                                    } ${
                                      draggedItem && draggedItem.setName === setName && draggedItem.index === idx
                                        ? 'opacity-30 bg-indigo-950/40 border border-dashed border-indigo-500/50'
                                        : ''
                                    } ${
                                      dragOverIndex === idx
                                        ? 'border-t-2 border-t-indigo-400 bg-indigo-900/10'
                                        : ''
                                    }`}
                                  >
                                    {/* Left section: drag handle and clickable info */}
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      {/* Drag Handle Grip */}
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                        }}
                                        className="cursor-grab active:cursor-grabbing p-1 text-indigo-400/30 hover:text-indigo-300 transition-colors shrink-0"
                                        title="Drag to reorder"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
                                          <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
                                          <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                                          <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                                          <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
                                          <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
                                        </svg>
                                      </div>

                                      <div className="min-w-0 flex-1 pr-2">
                                        <div className="text-[11px] font-bold text-gray-200 truncate group-hover:text-white">
                                          {s.Title}
                                        </div>
                                        <div className="text-[9px] text-gray-500 truncate">
                                          {s.Artist || 'Unknown Artist'}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right section: move controls & remove */}
                                    <div className="flex items-center gap-1 select-none shrink-0">
                                      <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                        <button
                                          disabled={idx === 0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveSong(setName, songIds, idx, -1);
                                          }}
                                          className="p-1 text-[9px] text-indigo-400 hover:text-indigo-200 disabled:opacity-25 rounded transition-all active:scale-125 cursor-pointer"
                                          title="Move Up"
                                        >
                                          ▲
                                        </button>
                                        <button
                                          disabled={idx === folderSongs.length - 1}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveSong(setName, songIds, idx, 1);
                                          }}
                                          className="p-1 text-[9px] text-indigo-400 hover:text-indigo-200 disabled:opacity-25 rounded transition-all active:scale-125 cursor-pointer"
                                          title="Move Down"
                                        >
                                          ▼
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (onRemoveSongFromSetlist) {
                                              onRemoveSongFromSetlist(setName, String(s.SongID));
                                            }
                                          }}
                                          className="p-1 text-[10px] text-gray-400 hover:text-rose-400 rounded transition-all active:scale-125 cursor-pointer"
                                          title="Remove from Setlist"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      {isCurrent && (
                                        <span className="text-[10px] text-violet-400 ml-1">⚡</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.length > 0 ? (
                  filtered.map((s) => {
                    const title = s.Title || '';
                    const firstChar = title.trim().charAt(0).toUpperCase();
                    const displayLetter = firstChar >= 'A' && firstChar <= 'Z' ? firstChar : '#';
                    const isSelected = currentSong && String(s.SongID) === String(currentSong.SongID);

                    let letterHeader: React.ReactNode = null;
                    if (displayLetter !== currentLetter) {
                      currentLetter = displayLetter;
                      lettersInList.push(currentLetter);
                      letterHeader = (
                        <div
                          id={`anchor-${currentLetter}`}
                          className="flex items-center justify-between gap-2 pt-2 pb-0.5 px-2 select-none scroll-mt-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="uppercase font-bold bg-indigo-500/10 border border-indigo-500/20 text-[9px] text-indigo-300 w-5 h-5 rounded-md flex items-center justify-center shadow-inner font-mono">
                              {currentLetter}
                            </span>
                            <span className="text-[8px] text-gray-500 font-mono font-bold">
                              ({counts[currentLetter]})
                            </span>
                          </div>
                          <div className="flex-1 h-[1px] bg-gradient-to-r from-indigo-500/20 via-indigo-500/5 to-transparent"></div>
                        </div>
                      );
                    }

                    return (
                      <React.Fragment key={s.SongID}>
                        {whiteKeysAndBlackKeysHeadersHack(currentLetter, displayLetter) && letterHeaderElement(displayLetter, counts[displayLetter])}
                        <div
                          className={`relative py-1.5 px-2 mb-px rounded-lg cursor-pointer transition-all flex items-center justify-between group border-b border-indigo-500/10 last:border-0 ${
                            isSelected
                              ? 'bg-indigo-600/30 border-l-2 border-l-indigo-400 shadow-inner'
                              : 'hover:bg-white/5'
                          }`}
                          onClick={() => {
                            window.scrollTo(0, 0);
                            changeSongHandler(s);
                          }}
                        >
                          <div className="min-w-0 pr-2 relative z-20 pointer-events-none">
                            <div
                              className={`text-[12px] font-medium leading-tight truncate ${
                                isSelected ? 'text-indigo-100' : 'text-gray-200 group-hover:text-white'
                              } transition-colors`}
                            >
                              {s.Title}
                            </div>
                            <div className="text-[9px] text-gray-500 truncate mt-0.5">
                              {s.Artist || 'Unknown Artist'} &bull; ID: {s.SongID}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0 relative z-20 pointer-events-none">
                            {favorites.includes(String(s.SongID)) && (
                              <span className="text-[10px] text-amber-400">★</span>
                            )}
                            {setlists.includes(String(s.SongID)) && (
                              <span className="text-[10px] text-violet-400">⚡</span>
                            )}
                          </div>

                          {/* Version badge */}
                          <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-30 bg-indigo-900/70 backdrop-blur-md border border-indigo-500/30 text-indigo-100 text-[9px] font-mono px-1.5 py-0.5 rounded shadow-[0_4px_12px_rgba(0,0,0,0.4)] translate-x-2 group-hover:translate-x-0 flex items-center gap-0.5">
                            <span className="text-indigo-400">v</span>
                            {s.Version || '1.0'}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <div className="p-3 text-xs text-gray-600 select-none">No songs found...</div>
                )}
              </div>
            )}
          </div>

          {/* A-Z Quick Jump Track */}
          {currentTab !== 'setlists' && (
            <div className="absolute right-1.5 inset-y-0 w-5 flex flex-col justify-center items-center gap-0.5 text-[8px] font-bold text-gray-500 select-none py-2 z-10">
              {lettersInList.map((letter) => (
                <button
                  key={letter}
                  onClick={() => scrollToLetter(letter)}
                  className="hover:text-indigo-400 transition-colors w-4 h-4 flex items-center justify-center active:scale-125 cursor-pointer"
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Capabilities Panel */}
        <div className="p-5 sm:p-6 pt-4 border-t border-indigo-500/20 bg-indigo-950/30 backdrop-blur-md flex-shrink-0 shadow-[inset_0_10px_20px_rgba(0,0,0,0.2)]">
          <div className="select-none flex flex-col space-y-2">
            <button
              onClick={() => {
                if (onRunDiagnostics) onRunDiagnostics();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 bg-rose-500/10 text-rose-300 py-3 px-4 rounded-xl border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer font-bold"
            >
              <span className="text-sm">🩺</span>
              <span className="text-[10px] uppercase tracking-widest font-black">Database Diagnostics</span>
            </button>
            <p className="text-[8.5px] text-gray-500 text-center italic leading-tight">
              Review current sheets row records, connection limits, and latency diagnosis.
            </p>
          </div>
        </div>
      </div>

      {/* Dimmed Background Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] transition-opacity cursor-pointer"
        />
      )}
    </>
  );

  // Small internal helper variables/funcs to keep JSX tidy
  function whiteKeysAndBlackKeysHeadersHack(lastL: string, curL: string) {
    if (lastL !== curL) {
      currentLetter = curL;
      lettersInList.push(curL);
      return true;
    }
    return false;
  }

  function letterHeaderElement(letter: string, count: number) {
    return (
      <div
        id={`anchor-${letter}`}
        className="flex items-center justify-between gap-2 pt-2 pb-0.5 px-2 select-none scroll-mt-2"
      >
        <div className="flex items-center gap-2">
          <span className="uppercase font-bold bg-indigo-500/10 border border-indigo-500/20 text-[9px] text-indigo-300 w-5 h-5 rounded-md flex items-center justify-center shadow-inner font-mono">
            {letter}
          </span>
          <span className="text-[8px] text-gray-500 font-mono font-bold">({count})</span>
        </div>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-indigo-500/20 via-indigo-500/5 to-transparent"></div>
      </div>
    );
  }

  function changeSongHandler(s: Song) {
    onChangeSong(s);
    onClose();
  }
};
