import React, { useState } from 'react';
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
}) => {
  const [search, setSearch] = useState('');

  const clearSearch = () => setSearch('');

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
                {currentTab === 'songs' ? 'All Songs' : currentTab === 'setlists' ? 'Live Setlist' : 'Starred Favorites'}
              </div>
            </div>

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
          </div>

          {/* A-Z Quick Jump Track */}
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
        </div>

        {/* Drawer Capabilities Panel */}
        <div className="p-5 sm:p-6 pt-4 border-t border-indigo-500/20 bg-indigo-950/30 backdrop-blur-md flex-shrink-0 space-y-4 shadow-[inset_0_10px_20px_rgba(0,0,0,0.2)] overflow-y-auto">
          <div className="select-none">
            <h3 className="text-[9px] text-indigo-400/80 font-bold uppercase tracking-widest mb-2.5">
              Live Capabilities
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 font-semibold select-none mb-4">
              <div
                onClick={() => triggerCapability('focus')}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-indigo-400 text-xs">⚡</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Focus Line</span>
              </div>
              <div
                onClick={() => triggerCapability('transpose')}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-amber-400 text-xs">🔄</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Transpose</span>
              </div>
              <div
                onClick={() => triggerCapability('metronome')}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-rose-400 text-xs">⏱</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Metronome</span>
              </div>
              <div
                onClick={() => triggerCapability('autoscroll')}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-emerald-400 text-xs">📜</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Autoscroll</span>
              </div>
            </div>

            <h3 className="text-[9px] text-indigo-400/80 font-bold uppercase tracking-widest mb-2.5 sm:hidden">
              App Tools (Mobile)
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 font-semibold select-none sm:hidden mb-2">
              <div
                onClick={onToggleFullScreen}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-sky-400 text-xs">⛶</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Fullscreen</span>
              </div>
              <div
                onClick={() => {
                  onOpenShortcuts();
                  onClose();
                }}
                className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-fuchsia-400 text-xs">⌨</span>
                <span className="truncate text-[9px] uppercase tracking-wide">Shortcuts</span>
              </div>
            </div>
            
            <div className="mt-2 flex">
              <button
                onClick={() => {
                  if (onRunDiagnostics) onRunDiagnostics();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-rose-500/10 text-rose-300 p-2 rounded-xl border border-rose-500/20 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-xs">🩺</span>
                <span className="truncate text-[9px] uppercase tracking-widest font-bold">Database Diagnostics</span>
              </button>
            </div>

            <p className="text-[8px] text-gray-500 mt-2.5 text-center italic leading-tight">
              Tap any line block to isolate & focus; use on-the-fly metronome pulse and scroll engine.
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
