import React, { useState, useEffect, useRef } from 'react';
import { Song, SongLine, RoadmapBlock } from './types';
import {
  transposeChord,
  getNumberForChord,
  getModulatedKeyName,
  NOTES,
  NOTE_TO_INDEX,
} from './utils';
import { ShortcutsModal } from './components/ShortcutsModal';
import { SongEditModal } from './components/SongEditModal';
import { MusicianModal } from './components/MusicianModal';
import { SidebarCatalog } from './components/SidebarCatalog';
import { DatabaseDiagnosticModal } from './components/DatabaseDiagnosticModal';
import { FALLBACK_SONGS, FALLBACK_SONG_LINES } from './fallbackData';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXCeXackc_suAUMKCGJ6qIjMygAADB9zHmoJ5EqWU_OTmBxkgH9uHLP4nY427farS5/exec';
const LOCAL_STORAGE_KEY = 'user_added_songs';

export interface BlockRepetitionInfo {
  isRepeat: boolean;
  repeatCount: number;
  totalInRun: number;
  runStartIndex: number;
}

export const areBlocksIdentical = (b1: RoadmapBlock, b2: RoadmapBlock) => {
  if (!b1 || !b2) return false;
  if (b1.name !== b2.name) return false;
  if (b1.keyOffset !== b2.keyOffset) return false;
  const arr1 = b1.enabledLines || [];
  const arr2 = b2.enabledLines || [];
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};

export const areBlocksChordsIdentical = (
  b1: RoadmapBlock,
  b2: RoadmapBlock,
  sectionTemplates: { [key: string]: SongLine[] }
) => {
  if (!b1 || !b2) return false;
  if (b1.keyOffset !== b2.keyOffset) return false;

  const lines1 = sectionTemplates[b1.name] || [];
  const lines2 = sectionTemplates[b2.name] || [];

  const enabled1 = b1.enabledLines || [];
  const enabled2 = b2.enabledLines || [];

  const activeLines1 = lines1.filter((_, i) => enabled1.includes(i));
  const activeLines2 = lines2.filter((_, i) => enabled2.includes(i));

  if (activeLines1.length !== activeLines2.length) return false;
  for (let i = 0; i < activeLines1.length; i++) {
    if ((activeLines1[i].Chords || '') !== (activeLines2[i].Chords || '')) {
      return false;
    }
  }
  return true;
};

export const getRoadmapRepetitionInfo = (roadmap: RoadmapBlock[]) => {
  const info: BlockRepetitionInfo[] = [];
  if (roadmap.length === 0) return info;

  let currentRunStartIdx = 0;
  let currentCount = 1;

  for (let i = 0; i < roadmap.length; i++) {
    info.push({
      isRepeat: false,
      repeatCount: 1,
      totalInRun: 1,
      runStartIndex: i,
    });
  }

  for (let i = 1; i < roadmap.length; i++) {
    const prevBlock = roadmap[i - 1];
    const currBlock = roadmap[i];
    if (areBlocksIdentical(prevBlock, currBlock)) {
      currentCount++;
      info[i] = {
        isRepeat: true,
        repeatCount: currentCount,
        totalInRun: currentCount,
        runStartIndex: currentRunStartIdx,
      };
    } else {
      for (let j = currentRunStartIdx; j < i; j++) {
        info[j].totalInRun = currentCount;
      }
      currentRunStartIdx = i;
      currentCount = 1;
    }
  }
  for (let j = currentRunStartIdx; j < roadmap.length; j++) {
    info[j].totalInRun = currentCount;
  }

  return info;
};

export default function App() {
  // App States
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'songs' | 'setlists' | 'favorites'>('songs');
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(() => {
    try {
      const synced = localStorage.getItem('catalog_last_synced');
      return synced ? parseInt(synced, 10) : null;
    } catch {
      return null;
    }
  });

  // Favorites & Setlists persistent storage
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('favs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [setlists, setSetlists] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('setlists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Selected Song Sheets & Keys
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [currentKey, setCurrentKey] = useState('C');
  const [songLines, setSongLines] = useState<SongLine[]>([]);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);

  // View Settings
  const [lyricZoom, setLyricZoom] = useState(0.6);
  const [displayMode, setDisplayMode] = useState<'both' | 'chords' | 'numbers'>('both');
  const [showLyrics, setShowLyrics] = useState(true);
  const [sheetLayoutMode, setSheetLayoutMode] = useState<'sequence' | 'compact'>('sequence');
  const [controlsExpanded, setControlsExpanded] = useState(false);

  // Autoscroll Engine
  const [isScrollingActive, setIsScrollingActive] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3.0);

  // Metronome Engine
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  // Performance Arrangement / Roadmap
  const [activeRoadmap, setActiveRoadmap] = useState<RoadmapBlock[]>([]);
  const [sectionTemplates, setSectionTemplates] = useState<{ [key: string]: SongLine[] }>({});
  const [originalRoadmap, setOriginalRoadmap] = useState<RoadmapBlock[]>([]);
  const [arrangerOpen, setArrangerOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [syncedSheetArrangements, setSyncedSheetArrangements] = useState<any[]>([]);

  // Drag and Drop ordering
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);

  // Collapsed Section States
  const [sectionCollapsedStates, setSectionCollapsedStates] = useState<{ [key: number]: boolean }>({});

  // Credentials Unlock
  const [appUser, setAppUser] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // Dialog Toggles
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMusicianModalOpen, setIsMusicianModalOpen] = useState(false);
  const [selectedChord, setSelectedChord] = useState('');

  // Scroll to Top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Toast System
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);

  // Wake lock API ref
  const wakeLockRef = useRef<any>(null);

  // Derived repetition info for arrangement road map flow
  const repInfo = getRoadmapRepetitionInfo(activeRoadmap);

  // Toast trigger
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Fetch initial catalog
  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout for multiple possible fetches

      // 1. Fetch SyncVersion (to minimize Google calls)
      let metaData: any[] = [];
      let songsVersion: string | null = null;
      let linesVersion: string | null = null;
      let arrVersion: string | null = null;

      try {
        const metaRes = await fetch(`${SCRIPT_URL}?tab=SyncVersion`, { signal: controller.signal });
        const metaText = await metaRes.text();
        metaData = JSON.parse(metaText);
        if (Array.isArray(metaData) && metaData.length > 0) {
          localStorage.setItem('cached_metadata', JSON.stringify(metaData));
          
          const songsRow = metaData.find(m => m.TabName === 'Songs');
          songsVersion = songsRow ? String(songsRow.Version || songsRow.LastUpdated || songsRow.Date || songsRow.version) : null;
          
          const linesRow = metaData.find(m => m.TabName === 'SongLines');
          linesVersion = linesRow ? String(linesRow.Version || linesRow.LastUpdated || linesRow.Date || linesRow.version) : null;
          
          const arrRow = metaData.find(m => m.TabName === 'Arrangements');
          arrVersion = arrRow ? String(arrRow.Version || arrRow.LastUpdated || arrRow.Date || arrRow.version) : null;
        }
      } catch (e) {
        console.warn('Metadata fetch failed, falling back to full sync.', e);
      }

      const cachedSongsVersion = localStorage.getItem('cached_songs_version');
      const cachedLinesVersion = localStorage.getItem('cached_song_lines_version');
      const cachedArrVersion = localStorage.getItem('cached_arrangements_version');

      const needsSongsUpdate = !songsVersion || cachedSongsVersion !== songsVersion || !localStorage.getItem('cached_songs');
      const needsLinesUpdate = !linesVersion || cachedLinesVersion !== linesVersion || !localStorage.getItem('cached_song_lines');
      const needsArrUpdate = !arrVersion || cachedArrVersion !== arrVersion || !localStorage.getItem('cached_arrangements');

      let updatesPerformed = false;

      if (needsSongsUpdate || needsLinesUpdate || needsArrUpdate) {
        showToast('Downloading new updates...', 'info');
      } else {
        console.log('All caches up to date.');
      }

      // 2. Fetch Songs ONLY if needed
      let remoteSongs: Song[] = [];
      if (!needsSongsUpdate) {
        remoteSongs = JSON.parse(localStorage.getItem('cached_songs') || '[]');
      } else {
        const res = await fetch(`${SCRIPT_URL}?tab=Songs`, { signal: controller.signal });
        const textData = await res.text();
        let list: Song[] = [];
        try { list = JSON.parse(textData); } catch { throw new Error('Invalid Songs payload.'); }
        if (list && (list as any).error) throw new Error((list as any).error);

        remoteSongs = Array.isArray(list) ? list : [];
        localStorage.setItem('cached_songs', JSON.stringify(remoteSongs));
        if (songsVersion) localStorage.setItem('cached_songs_version', songsVersion);
        updatesPerformed = true;
      }

      // 3. Fetch SongLines ONLY if needed
      if (needsLinesUpdate) {
        const linesRes = await fetch(`${SCRIPT_URL}?tab=SongLines`, { signal: controller.signal });
        const linesText = await linesRes.text();
        let linesList: SongLine[] = [];
        try { linesList = JSON.parse(linesText); } catch { console.warn('Invalid SongLines payload'); }
        if (!((linesList as any).error)) {
            localStorage.setItem('cached_song_lines', JSON.stringify(linesList));
            if (linesVersion) localStorage.setItem('cached_song_lines_version', linesVersion);
            updatesPerformed = true;
        }
      }

      // 4. Fetch Arrangements ONLY if needed
      if (needsArrUpdate) {
        const arrRes = await fetch(`${SCRIPT_URL}?tab=Arrangements`, { signal: controller.signal });
        const arrText = await arrRes.text();
        let arrList: any[] = [];
        try { arrList = JSON.parse(arrText); } catch { console.warn('Invalid Arrangements payload'); }
        if (!((arrList as any).error) && Array.isArray(arrList)) {
            localStorage.setItem('cached_arrangements', JSON.stringify(arrList));
            if (arrVersion) localStorage.setItem('cached_arrangements_version', arrVersion);
            updatesPerformed = true;
        }
      }

      if (updatesPerformed) {
          showToast('All updates applied successfully!', 'success');
      } else if (metaData.length > 0) {
          showToast('Library is up to date.', 'success');
      }
      
      clearTimeout(timeoutId);

      const now = Date.now();
      localStorage.setItem('catalog_last_synced', now.toString());
      setLastSynced(now);
      setIsOfflineMode(false);

      const combinedSongs = [...remoteSongs];
      FALLBACK_SONGS.forEach(fs => {
        if (!combinedSongs.some(s => String(s.SongID) === String(fs.SongID))) {
          combinedSongs.push(fs);
        }
      });
      setSongs(combinedSongs);
    } catch (e: any) {
      console.warn('Failed connecting to database catalog, using cached / offline fallback', e);
      setIsOfflineMode(true);
      let cachedSongs: Song[] = [];
      try {
        const cacheRaw = localStorage.getItem('cached_songs');
        if (cacheRaw) {
          cachedSongs = JSON.parse(cacheRaw);
        }
      } catch (err) {}

      const combinedSongs = [...cachedSongs];
      FALLBACK_SONGS.forEach(fs => {
        if (!combinedSongs.some(s => String(s.SongID) === String(fs.SongID))) {
          combinedSongs.push(fs);
        }
      });
      setSongs(combinedSongs);
      showToast('Loaded offline cached catalog', 'success');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Screen Wake Lock handle
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // Safe fail
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null;
      });
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentSong) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [currentSong]);

  // Persistent storage updates
  const toggleFav = (id: string | number) => {
    const sId = String(id);
    let next: string[];
    if (favorites.includes(sId)) {
      next = favorites.filter((x) => x !== sId);
      showToast('Removed from Favorites', 'info');
    } else {
      next = [...favorites, sId];
      showToast('Starred in Favorites!', 'success');
    }
    setFavorites(next);
    localStorage.setItem('favs', JSON.stringify(next));
  };

  const toggleSetlist = (id: string | number) => {
    const sId = String(id);
    let next: string[];
    if (setlists.includes(sId)) {
      next = setlists.filter((x) => x !== sId);
      showToast('Removed from Setlist Queue', 'info');
    } else {
      next = [...setlists, sId];
      showToast('Added to live performance queue!', 'success');
    }
    setSetlists(next);
    localStorage.setItem('setlists', JSON.stringify(next));
  };

  // Metronome Intervals Loop
  useEffect(() => {
    if (!isMetronomeActive) return;

    const intervalMs = 60000 / bpm;
    let pulseTimeout: any;

    const intervalId = setInterval(() => {
      const dot = document.getElementById('metronomeDot');
      const header = document.getElementById('stageHeader');

      if (dot) {
        dot.classList.remove('opacity-20', 'scale-90');
        dot.classList.add('opacity-100', 'scale-110', 'shadow-[0_0_12px_#f43f5e]');
      }
      if (header) {
        header.classList.add('edge-pulse');
      }

      pulseTimeout = setTimeout(() => {
        const innerDot = document.getElementById('metronomeDot');
        const innerHeader = document.getElementById('stageHeader');
        if (innerDot) {
          innerDot.classList.add('opacity-20', 'scale-90');
          innerDot.classList.remove('opacity-100', 'scale-110', 'shadow-[0_0_12px_#f43f5e]');
        }
        if (innerHeader) {
          innerHeader.classList.remove('edge-pulse');
        }
      }, 120);
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      clearTimeout(pulseTimeout);
    };
  }, [isMetronomeActive, bpm]);

  // Autoscroll Loop (accurate delta-time)
  useEffect(() => {
    if (!isScrollingActive) return;

    let lastFrameTime = performance.now();
    const scrollContainer = document.querySelector('.song-scroll-container');
    let exactScrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
    let expectedScrollY = exactScrollY;
    let animationId: number;

    function step(currentTime: number) {
      const deltaTime = currentTime - lastFrameTime;
      const cappedDelta = Math.min(deltaTime, 50); 
      lastFrameTime = currentTime;
      
      const container = document.querySelector('.song-scroll-container');
      const targetEl = container || window;
      const currentScroll = container ? container.scrollTop : window.scrollY;

      if (Math.abs(currentScroll - expectedScrollY) > 2) {
        exactScrollY = currentScroll;
      }
      
      const pixelsPerSecond = scrollSpeed * 12; 
      const pixelsToScroll = (pixelsPerSecond * cappedDelta) / 1000;
      
      exactScrollY += pixelsToScroll;
      
      targetEl.scrollTo({
        top: exactScrollY,
        left: 0,
        behavior: 'instant' as any
      });
      
      expectedScrollY = container ? container.scrollTop : window.scrollY;
      
      const maxScroll = container 
        ? container.scrollHeight - container.clientHeight 
        : document.documentElement.scrollHeight - window.innerHeight;

      if (Math.ceil(currentScroll) >= maxScroll - 2) {
        setIsScrollingActive(false);
        return;
      }
      
      animationId = requestAnimationFrame(step);
    }

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [isScrollingActive, scrollSpeed]);

  // Change active selected song
  const changeSong = async (song: Song) => {
    setIsLoading(true);
    setCurrentSong(song);
    setCurrentKey(song.OriginalKey || 'C');
    setFocusedLineId(null);
    setEditingBlockId(null);
    setIsScrollingActive(false);
    setIsMetronomeActive(false);
    setArrangerOpen(false);
    setSectionCollapsedStates({});

    try {
      requestWakeLock();
      let filteredLines: SongLine[] = [];

      if (String(song.SongID).startsWith('fallback-')) {
        filteredLines = FALLBACK_SONG_LINES.filter(
          (line) => line && String(line.SongID) === String(song.SongID)
        );
      } else {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          let fetchLines = true;
          // Check Metadata for SongLines version
          let linesVersion: string | null = null;
          try {
            const metaRaw = localStorage.getItem('cached_metadata');
            if (metaRaw) {
              const metaData = JSON.parse(metaRaw);
              const row = metaData.find((m: any) => m.TabName === 'SongLines');
              linesVersion = row ? String(row.Version || row.LastUpdated || row.Date || row.version) : null;
              const cachedLinesVersion = localStorage.getItem('cached_song_lines_version');
              
              if (linesVersion && cachedLinesVersion === linesVersion && localStorage.getItem('cached_song_lines')) {
                fetchLines = false;
                const cachedLines = JSON.parse(localStorage.getItem('cached_song_lines') || '[]');
                filteredLines = cachedLines.filter(
                  (line: any) => line && String(line.SongID) === String(song.SongID)
                );
                console.log('Using cached SongLines based on metadata version.');
              }
            }
          } catch (e) {}

          if (fetchLines) {
            const res = await fetch(`${SCRIPT_URL}?tab=SongLines`, { signal: controller.signal });
            const textData = await res.text();
            let allLines: SongLine[] = [];
            try {
              allLines = JSON.parse(textData);
            } catch {
              throw new Error('Invalid song sheets formatting payload.');
            }

            if (allLines && (allLines as any).error) {
              throw new Error((allLines as any).error);
            }

            localStorage.setItem('cached_song_lines', JSON.stringify(allLines));
            if (linesVersion) {
              localStorage.setItem('cached_song_lines_version', linesVersion);
            }

            filteredLines = allLines.filter(
              (line) => line && String(line.SongID) === String(song.SongID)
            );
          }
          
          clearTimeout(timeoutId);
        } catch (remoteError) {
          console.warn('Failed loading remote song lines, checking cache and fallback data', remoteError);
          let cachedLines: SongLine[] = [];
          try {
            const cacheRaw = localStorage.getItem('cached_song_lines');
            if (cacheRaw) {
              cachedLines = JSON.parse(cacheRaw);
            }
          } catch (e) {}

          filteredLines = cachedLines.filter(
            (line) => line && String(line.SongID) === String(song.SongID)
          );

          if (filteredLines.length === 0) {
            filteredLines = FALLBACK_SONG_LINES.filter(
              (line) => line && String(line.SongID) === String(song.SongID)
            );
          }
          
          if (filteredLines.length === 0) {
            throw remoteError;
          }
          showToast('Loaded offline cached song chords and lyrics', 'success');
        }
      }

      setSongLines(filteredLines);

      // Initialize Performance Arrangement Roadmap
      const templates: { [key: string]: SongLine[] } = {};
      filteredLines.forEach((l) => {
        const secName = l.SectionName || l.Section || l.section || 'Section';
        if (!templates[secName]) {
          templates[secName] = [];
        }
        templates[secName].push(l);
      });
      setSectionTemplates(templates);

      const roadmap: RoadmapBlock[] = [];
      const original: RoadmapBlock[] = [];
      let lastSec = '';
      let blockIdCounter = 0;

      filteredLines.forEach((l) => {
        const secName = l.SectionName || l.Section || l.section || 'Section';
        if (secName !== lastSec) {
          const lineIndices = Array.from(
            { length: templates[secName].length },
            (_, idx) => idx
          );
          const block = {
            id: `block-${blockIdCounter++}`,
            name: secName,
            enabledLines: lineIndices,
            keyOffset: 0,
          };
          roadmap.push(block);
          original.push({ ...block, enabledLines: [...lineIndices] });
          lastSec = secName;
        }
      });

      setActiveRoadmap(roadmap);
      setOriginalRoadmap(original);

      // Fetch shared presets
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        let fetchArr = true;
        let arrVersion: string | null = null;
        try {
          const metaRaw = localStorage.getItem('cached_metadata');
          if (metaRaw) {
            const metaData = JSON.parse(metaRaw);
            const row = metaData.find((m: any) => m.TabName === 'Arrangements');
            arrVersion = row ? String(row.Version || row.LastUpdated || row.Date || row.version) : null;
            const cachedArrVersion = localStorage.getItem('cached_arrangements_version');
            
            if (arrVersion && cachedArrVersion === arrVersion && localStorage.getItem('cached_arrangements')) {
              fetchArr = false;
              const list = JSON.parse(localStorage.getItem('cached_arrangements') || '[]');
              if (Array.isArray(list)) {
                setSyncedSheetArrangements(
                  list.filter((arr: any) => String(arr.SongID) === String(song.SongID))
                );
                console.log('Using cached Arrangements based on metadata version.');
              }
            }
          }
        } catch (e) {}

        if (fetchArr) {
          const presetsRes = await fetch(`${SCRIPT_URL}?tab=Arrangements`, { signal: controller.signal });
          const presetsText = await presetsRes.text();
          const list = JSON.parse(presetsText);
          if (Array.isArray(list)) {
            localStorage.setItem('cached_arrangements', JSON.stringify(list));
            if (arrVersion) {
              localStorage.setItem('cached_arrangements_version', arrVersion);
            }
            setSyncedSheetArrangements(
              list.filter((arr) => String(arr.SongID) === String(song.SongID))
            );
          }
        }
        
        clearTimeout(timeoutId);
      } catch (remoteError) {
        console.warn('Failed to fetch remote arrangements, checking cache', remoteError);
        try {
          const cacheRaw = localStorage.getItem('cached_arrangements');
          if (cacheRaw) {
            const list = JSON.parse(cacheRaw);
            if (Array.isArray(list)) {
              const matchedArrangements = list.filter((arr) => String(arr.SongID) === String(song.SongID));
              setSyncedSheetArrangements(matchedArrangements);
              if (matchedArrangements.length > 0) {
                showToast('Loaded cached offline arrangement roadmap', 'info');
              }
              return;
            }
          }
        } catch (e) {}
        setSyncedSheetArrangements([]);
      }
    } catch (e: any) {
      showToast(e.message || 'Error syncing song sheets data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (currentSong) {
          setIsScrollingActive((prev) => !prev);
          showToast(!isScrollingActive ? 'Autoscrolling Sheet' : 'Autoscroll Paused', 'info');
        }
      } else if (e.key === '[') {
        if (currentSong) {
          shiftKey(-1);
        }
      } else if (e.key === ']') {
        if (currentSong) {
          shiftKey(1);
        }
      } else if (e.key === '=') {
        adjustZoom(0.1);
      } else if (e.key === '-') {
        adjustZoom(-0.1);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullScreen();
      } else if (e.key === 'Escape') {
        setIsFormModalOpen(false);
        setIsAdminModalOpen(false);
        setIsShortcutsOpen(false);
        setIsMusicianModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSong, isScrollingActive, currentKey]);

  // UI Helpers
  const shiftKey = (direction: number) => {
    const currentIdx = NOTES.indexOf(currentKey);
    if (currentIdx === -1) return;
    const newIdx = (currentIdx + direction + 12) % 12;
    setCurrentKey(NOTES[newIdx]);
    showToast(`Transposed Key to: ${NOTES[newIdx]}`, 'success');
  };

  const adjustZoom = (amount: number) => {
    setLyricZoom((prev) => Math.max(0.6, Math.min(1.5, prev + amount)));
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        showToast('Fullscreen navigation not supported in this frame.', 'error');
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Tap Tempo calculations
  const handleTapTempo = () => {
    const now = Date.now();
    let updatedTaps = [...tapTimestamps];
    if (updatedTaps.length > 0 && now - updatedTaps[updatedTaps.length - 1] > 3000) {
      updatedTaps = [];
    }
    updatedTaps.push(now);
    setTapTimestamps(updatedTaps);

    if (updatedTaps.length > 1) {
      const intervals: number[] = [];
      for (let i = 1; i < updatedTaps.length; i++) {
        intervals.push(updatedTaps[i] - updatedTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      setBpm(Math.max(40, Math.min(250, calculatedBpm)));

      // Suggest autoscroll speed
      const suggestedSpeed = Math.max(0.1, Math.min(20, calculatedBpm / 25));
      setScrollSpeed(suggestedSpeed);
      showToast('Tempo & Scroll Rate Synced!', 'success');
    } else {
      showToast('Keep tapping to sync BPM...', 'info');
    }
  };

  // Drag and Drop Roadmap Handlers
  const handleDragStart = (idx: number) => {
    setDraggedBlockIndex(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (draggedBlockIndex !== null && draggedBlockIndex !== targetIdx) {
      const next = [...activeRoadmap];
      const [item] = next.splice(draggedBlockIndex, 1);
      next.splice(targetIdx, 0, item);
      setActiveRoadmap(next);
      showToast('Arrangement sequence updated!', 'success');
    }
    setDraggedBlockIndex(null);
  };

  const deleteRoadmapBlock = (idx: number) => {
    if (activeRoadmap.length <= 1) {
      showToast('Arrangement must contain at least one section block!', 'error');
      return;
    }
    const next = [...activeRoadmap];
    const removed = next[idx];
    next.splice(idx, 1);
    setActiveRoadmap(next);
    if (editingBlockId === removed.id) {
      setEditingBlockId(null);
    }
    showToast('Section removed from sequence', 'info');
  };

  const addRoadmapBlock = (sectionName: string) => {
    const templateLines = sectionTemplates[sectionName] || [];
    const lineIndices = Array.from({ length: templateLines.length }, (_, idx) => idx);
    const uniqueId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setActiveRoadmap([
      ...activeRoadmap,
      {
        id: uniqueId,
        name: sectionName,
        enabledLines: lineIndices,
        keyOffset: 0,
      },
    ]);
    showToast(`Appended ${sectionName} to live layout!`, 'success');
  };

  const resetRoadmapBlocks = () => {
    setActiveRoadmap(
      originalRoadmap.map((b) => ({
        ...b,
        enabledLines: [...(b.enabledLines || [])],
        keyOffset: 0,
      }))
    );
    setEditingBlockId(null);
    showToast('Restored default song arrangement', 'info');
  };

  const adjustBlockModulation = (blockId: string, direction: number) => {
    const next = activeRoadmap.map((b) => {
      if (b.id === blockId) {
        const offset = Math.max(-11, Math.min(11, (b.keyOffset || 0) + direction));
        const targetKey = getModulatedKeyName(currentKey, offset);
        showToast(`Modulated block key to: ${targetKey}`, 'success');
        return { ...b, keyOffset: offset };
      }
      return b;
    });
    setActiveRoadmap(next);
  };

  const toggleLineInBlock = (blockId: string, lIdx: number) => {
    const next = activeRoadmap.map((b) => {
      if (b.id === blockId) {
        let lines = [...(b.enabledLines || [])];
        if (lines.includes(lIdx)) {
          if (lines.length <= 1) {
            showToast('A roadmap block must render at least one active line!', 'error');
            return b;
          }
          lines = lines.filter((x) => x !== lIdx);
        } else {
          lines.push(lIdx);
          lines.sort((a, b) => a - b);
        }
        return { ...b, enabledLines: lines };
      }
      return b;
    });
    setActiveRoadmap(next);
  };

  // Shared Presets
  const getPresets = () => {
    const obj: { [key: string]: any } = {};
    syncedSheetArrangements.forEach((p) => {
      try {
        obj[p.PresetName] = JSON.parse(p.RoadmapJSON);
      } catch {
        // fail safe
      }
    });

    try {
      const local = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
      if (local) {
        const localObj = JSON.parse(local);
        Object.keys(localObj).forEach((k) => {
          if (!obj[k]) obj[k] = localObj[k];
        });
      }
    } catch {
      // safe fail
    }

    return obj;
  };

  const loadPresetArrangement = (name: string) => {
    const presets = getPresets();
    if (presets[name]) {
      setActiveRoadmap(
        presets[name].map((b: any) => ({
          id: b.id,
          name: b.name,
          enabledLines: [...(b.enabledLines || [])],
          keyOffset: b.keyOffset || 0,
        }))
      );
      setEditingBlockId(null);
      showToast(`Loaded arrangement: ${name}`, 'success');
    }
  };

  const savePresetArrangement = async () => {
    const nameEl = document.getElementById('presetNameInput') as HTMLInputElement;
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      showToast('Please enter an arrangement preset name first', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        action: 'saveArrangement',
        songId: String(currentSong?.SongID),
        name: name,
        roadmap: activeRoadmap,
      };

      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const textResponse = await res.text();
      const result = JSON.parse(textResponse);

      if (result.status === 'success') {
        showToast(`Preset "${name}" synced with the shared catalog!`, 'success');
      } else {
        throw new Error(result.message || 'Spreadsheet save failed');
      }
    } catch {
      // offline fallback
      const presets = getPresets();
      presets[name] = activeRoadmap;
      localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(presets));
      showToast(`Saved locally on this device as "${name}"`, 'success');
    } finally {
      if (nameEl) nameEl.value = '';
      // Refetch shared presets
      try {
        const presetsRes = await fetch(`${SCRIPT_URL}?tab=Arrangements`);
        const presetsText = await presetsRes.text();
        const list = JSON.parse(presetsText);
        if (Array.isArray(list)) {
          localStorage.setItem('cached_arrangements', JSON.stringify(list));
          setSyncedSheetArrangements(
            list.filter((arr) => String(arr.SongID) === String(currentSong?.SongID))
          );
        }
      } catch {
        // safe ignore
      }
      setIsLoading(false);
    }
  };

  const deletePresetArrangement = async (name: string) => {
    setIsLoading(true);
    try {
      const payload = {
        action: 'deleteArrangement',
        songId: String(currentSong?.SongID),
        name: name,
      };

      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.status === 'success') {
        showToast(`Deleted from shared library: ${name}`, 'info');
      } else {
        throw new Error();
      }
    } catch {
      // Delete local
      const presets = getPresets();
      if (presets[name]) {
        delete presets[name];
        localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(presets));
        showToast(`Deleted local preset: ${name}`, 'info');
      }
    } finally {
      // Refetch
      try {
        const presetsRes = await fetch(`${SCRIPT_URL}?tab=Arrangements`);
        const list = JSON.parse(await presetsRes.text());
        if (Array.isArray(list)) {
          localStorage.setItem('cached_arrangements', JSON.stringify(list));
          setSyncedSheetArrangements(
            list.filter((arr) => String(arr.SongID) === String(currentSong?.SongID))
          );
        }
      } catch {
        // safe ignore
      }
      setIsLoading(false);
    }
  };

  // Authenticate Admin View
  const handleVerifyAdmin = async () => {
    if (!adminUsernameInput || !adminPasswordInput) {
      showToast('Enter both Username and Passkey!', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        action: 'verifyAdmin',
        user: adminUsernameInput.trim(),
        passkey: adminPasswordInput.trim(),
      };

      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.success) {
        setAppUser(adminUsernameInput.trim());
        setAppSecret(adminPasswordInput.trim());
        setIsAdminModalOpen(false);
        showToast('Successfully Authenticated!', 'success');
      } else {
        showToast('Incorrect Username or Passkey!', 'error');
      }
    } catch {
      showToast('Authentication server issue. Try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLockToggle = () => {
    if (appUser && appSecret) {
      setAppUser('');
      setAppSecret('');
      showToast('Admin mode locked. Returned to View Only.', 'info');
    } else {
      setAdminUsernameInput('');
      setAdminPasswordInput('');
      setIsAdminModalOpen(true);
    }
  };

  const handleTriggerCapability = (cap: 'focus' | 'transpose' | 'metronome' | 'autoscroll') => {
    if (!currentSong) {
      showToast('Select a song from the Menu first!', 'info');
      return;
    }

    if (cap === 'focus') {
      showToast('Focus Mode: Tap directly on any lyric line to isolate it!', 'info');
      const firstLine = document.querySelector('.line-block');
      if (firstLine) {
        setFocusedLineId('line-block-0');
        firstLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (cap === 'transpose') {
      shiftKey(1);
    } else if (cap === 'metronome') {
      setIsMetronomeActive((prev) => !prev);
      showToast(!isMetronomeActive ? 'Metronome Activated!' : 'Metronome Paused', !isMetronomeActive ? 'success' : 'info');
    } else if (cap === 'autoscroll') {
      setIsScrollingActive((prev) => !prev);
      showToast(!isScrollingActive ? 'Autoscrolling Song Sheet!' : 'Autoscroll Paused', !isScrollingActive ? 'success' : 'info');
    }
    setIsNavOpen(false);
  };

  // Diatonic Chords HTML parser
  const renderFamilyChordsList = () => {
    if (!currentSong) return null;
    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
    const degrees = ['1', '2', '3', '4', '5', '6', '7'];

    const keyIdx = NOTE_TO_INDEX[currentKey];
    if (keyIdx === undefined) return null;

    const useSharps = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'].includes(currentKey);
    const scaleNotes = useSharps 
      ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] 
      : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="text-[10px] sm:text-xs text-indigo-400 uppercase tracking-widest font-extrabold flex-shrink-0 select-none drop-shadow-sm">
          Family Chords:
        </span>
        <div className="flex flex-wrap gap-2 sm:gap-2.5 font-mono">
          {degrees.map((deg, i) => {
            const noteIdx = (keyIdx + intervals[i]) % 12;
            const rawChord = `${scaleNotes[noteIdx]}${qualities[i]}`;

            return (
              <span
                key={deg}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedChord(rawChord);
                  setIsMusicianModalOpen(true);
                }}
                className="bg-indigo-500/20 border border-indigo-500/30 backdrop-blur-sm px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-indigo-50 font-bold shadow-sm transition-all hover:bg-sky-500/40 hover:text-white hover:scale-105 active:scale-95 cursor-help text-xs sm:text-sm"
              >
                <span className="text-indigo-400/80 mr-1.5">{deg}</span>
                {rawChord}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Convert raw string text of chord lines to clickable highlights
  const parseClickableChords = (transposedLine: string, blockKeyName: string) => {
    if (!transposedLine) return '';
    return transposedLine.split(/(\s+|-)/).map((part, pIdx) => {
      if (part.trim() && !part.includes('-')) {
        return (
          <span
            key={pIdx}
            className="hover:text-sky-300 hover:underline cursor-help transition-all duration-150 inline-block px-0.5 active:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedChord(part.trim());
              setIsMusicianModalOpen(true);
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={pIdx}>{part}</span>;
    });
  };

  return (
    <div className="text-gray-100 min-h-screen selection:bg-indigo-500/30 selection:text-white bg-fixed">
      {/* Header Sticky Ingress */}
      <header
        id="stageHeader"
        className="sticky top-0 bg-[#0f111a]/80 backdrop-blur-xl py-2 px-3 sm:px-4 z-[80] flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)] border-b border-white/5 transition-all duration-150"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsNavOpen(true)}
            className="p-1.5 sm:p-2 btn-5d rounded-lg text-indigo-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="hidden sm:inline drop-shadow-md">MENU</span>
          </button>
          <button
            onClick={() => {
              setCurrentSong(null);
              setIsScrollingActive(false);
              setIsMetronomeActive(false);
            }}
            className="p-1.5 sm:p-2 btn-5d rounded-lg text-emerald-400 font-bold text-xs flex items-center justify-center cursor-pointer"
            title="Home Dashboard"
          >
            <svg className="w-4 h-4 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </button>
          <h1 className="text-sm sm:text-base font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-white select-none truncate max-w-[160px] sm:max-w-none drop-shadow-sm">
            Worship Chordbook
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          {lastSynced && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${
                isOfflineMode 
                  ? 'bg-amber-950/30 border-amber-500/20 text-amber-400'
                  : 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400'
              }`}
              title={isOfflineMode ? `Offline Mode - Last Synced: ${new Date(lastSynced).toLocaleString()}` : "Live - Connected to Database"}
            >
              <span className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-amber-500' : 'bg-emerald-500'} ${!isOfflineMode && 'animate-pulse'}`}></span>
              <span>{isOfflineMode ? 'Offline' : 'Live'}</span>
            </div>
          )}
          <button
            onClick={toggleFullScreen}
            className="p-1.5 sm:p-2 btn-5d rounded-lg text-gray-400 hover:text-white hidden sm:flex items-center justify-center cursor-pointer"
            title="Toggle Fullscreen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          <button
            onClick={() => setIsShortcutsOpen(true)}
            className="hidden sm:block p-1.5 sm:p-2 btn-5d rounded-lg text-gray-400 hover:text-white cursor-pointer"
            title="Keyboard Shortcuts"
          >
            ⌨
          </button>
          <button
            onClick={handleAdminLockToggle}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 btn-5d rounded-lg text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer"
          >
            <span className="text-xs">{appUser && appSecret ? '🔓' : '🔒'}</span>
            <span className="hidden sm:inline drop-shadow-md">
              {appUser && appSecret ? 'Admin' : 'View Only'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main id="appView" className="max-w-5xl mx-auto p-2 sm:p-3 md:p-4 pb-32">
        {!currentSong ? (
          /* Home view dashboard */
          <div className="p-6 md:p-10 bg-indigo-950/10 backdrop-blur-xl rounded-2xl sm:rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-indigo-500/20 transition-all overflow-hidden relative">
            <div className="flex items-center gap-4 sm:gap-6 mb-2 animate-blur-fade relative z-10">
              <div className="flex-shrink-0">
                <svg
                  className="w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_10px_20px_rgba(99,102,241,0.5)] animate-music-float"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="music-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#312e81" />
                    </linearGradient>
                    <linearGradient id="music-shine" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#music-grad1)" />
                  <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#music-shine)" opacity="0.5" />
                  <path
                    d="M45 80 v-40 l35 -10 v40"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="drop-shadow(0 4px 8px rgba(0,0,0,0.4))"
                  />
                  <circle cx="35" cy="80" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.4))" />
                  <circle cx="70" cy="70" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.4))" />
                </svg>
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white select-none leading-tight">
                Welcome to <br className="hidden sm:block" />
                <span className="text-shimmer drop-shadow-[0_2px_10px_rgba(139,92,246,0.3)]">
                  Worship Chordbook
                </span>
              </h2>
            </div>

            <p className="text-sm sm:text-lg text-indigo-200/80 mb-10 max-w-2xl font-medium mt-4 select-none animate-blur-fade delay-100 relative z-10">
              Your intelligent, stage-ready digital music stand. Select a song from the library to begin
              playing, or jump straight into your curated sets below.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8 animate-blur-fade delay-200 relative z-10">
              <div
                onClick={() => {
                  setCurrentTab('songs');
                  setIsNavOpen(true);
                }}
                className="group cursor-pointer bg-gradient-to-br from-black/40 to-indigo-950/40 hover:from-indigo-900/40 hover:to-blue-900/40 p-8 rounded-[2rem] border border-white/5 hover:border-sky-500/50 transition-all duration-500 shadow-2xl hover:shadow-[0_20px_40px_rgba(56,189,248,0.2)] active:scale-95 flex flex-col items-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <svg
                  className="w-20 h-20 mb-5 group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 drop-shadow-[0_15px_25px_rgba(56,189,248,0.4)] relative z-10"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="cat-grad1" x1="20%" y1="0%" x2="80%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#312e81" />
                    </linearGradient>
                    <linearGradient id="cat-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7dd3fc" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="cat-shine" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                      <stop offset="50%" stopColor="#ffffff" stopOpacity="0.1" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect x="25" y="25" width="60" height="75" rx="12" fill="url(#cat-grad1)" />
                  <rect x="35" y="15" width="60" height="75" rx="12" fill="url(#cat-grad2)" />
                  <rect x="35" y="15" width="60" height="75" rx="12" fill="url(#cat-shine)" />
                  <path
                    d="M50 40h30M50 55h20"
                    stroke="#ffffff"
                    strokeWidth="5"
                    strokeLinecap="round"
                    filter="drop-shadow(0 4px 6px rgba(0,0,0,0.4))"
                  />
                </svg>
                <h3 className="text-white font-bold text-xl mb-1 tracking-wide relative z-10">
                  Browse Catalog
                </h3>
                <p className="text-sm text-sky-300/80 font-mono relative z-10">
                  {songs.length} total songs
                </p>
              </div>

              <div
                onClick={() => {
                  setCurrentTab('setlists');
                  setIsNavOpen(true);
                }}
                className="group cursor-pointer bg-gradient-to-br from-black/40 to-indigo-950/40 hover:from-purple-900/40 hover:to-fuchsia-900/40 p-8 rounded-[2rem] border border-white/5 hover:border-fuchsia-500/50 transition-all duration-500 shadow-2xl hover:shadow-[0_20px_40px_rgba(192,132,252,0.2)] active:scale-95 flex flex-col items-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <svg
                  className="w-20 h-20 mb-5 group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 drop-shadow-[0_15px_25px_rgba(192,132,252,0.4)] relative z-10"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="set-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4c1d95" />
                      <stop offset="100%" stopColor="#1e1b4b" />
                    </linearGradient>
                    <linearGradient id="set-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#e879f9" />
                      <stop offset="100%" stopColor="#9333ea" />
                    </linearGradient>
                    <linearGradient id="set-shine" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect x="20" y="20" width="80" height="80" rx="25" fill="url(#set-grad1)" />
                  <path
                    d="M65 15 L35 60 h25 L45 105 L90 50 H65 L80 15 Z"
                    fill="url(#set-grad2)"
                    filter="drop-shadow(0 5px 15px rgba(0,0,0,0.5))"
                  />
                  <path d="M65 15 L35 60 h25 L45 105 L90 50 H65 L80 15 Z" fill="url(#set-shine)" />
                </svg>
                <h3 className="text-white font-bold text-xl mb-1 tracking-wide relative z-10">
                  Live Setlist
                </h3>
                <p className="text-sm text-fuchsia-300/80 font-mono relative z-10">
                  {setlists.length} songs queued
                </p>
              </div>

              <div
                onClick={() => {
                  setCurrentTab('favorites');
                  setIsNavOpen(true);
                }}
                className="group cursor-pointer bg-gradient-to-br from-black/40 to-indigo-950/40 hover:from-amber-900/40 hover:to-orange-900/40 p-8 rounded-[2rem] border border-white/5 hover:border-amber-500/50 transition-all duration-500 shadow-2xl hover:shadow-[0_20px_40px_rgba(251,191,36,0.2)] active:scale-95 flex flex-col items-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <svg
                  className="w-20 h-20 mb-5 group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-500 drop-shadow-[0_15px_25px_rgba(251,191,36,0.4)] relative z-10"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="fav-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#78350f" />
                      <stop offset="100%" stopColor="#451a03" />
                    </linearGradient>
                    <linearGradient id="fav-grad2" x1="0%" y1="10%" x2="100%" y2="90%">
                      <stop offset="0%" stopColor="#fef08a" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                    <linearGradient id="fav-shine" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                    <radialGradient id="fav-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
                      <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <rect x="20" y="20" width="80" height="80" rx="40" fill="url(#fav-grad1)" />
                  <path
                    d="M60 20 l12 28 h30 l-24 18 9 29 -27 -18 -27 18 9 -29 -24 -18 h30 z"
                    fill="url(#fav-grad2)"
                    filter="drop-shadow(0 10px 15px rgba(0,0,0,0.5))"
                  />
                  <path
                    d="M60 20 l12 28 h30 l-24 18 9 29 -27 -18 -27 18 9 -29 -24 -18 h30 z"
                    fill="url(#fav-shine)"
                  />
                  <circle
                    cx="60"
                    cy="55"
                    r="15"
                    fill="url(#fav-glow)"
                    opacity="0.6"
                    style={{ mixBlendMode: 'screen' }}
                  />
                </svg>
                <h3 className="text-white font-bold text-xl mb-1 tracking-wide relative z-10">Favorites</h3>
                <p className="text-sm text-amber-300/80 font-mono relative z-10">{favorites.length} starred charts</p>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE SHEET WORKSPACE VIEW */
          <div
            className="p-2.5 sm:p-3 md:p-4 bg-gradient-to-br from-indigo-950/40 via-[#0a0b16]/60 to-[#05060a]/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-indigo-500/20 flex flex-col"
            style={{ maxHeight: 'calc(100vh - 65px)' }}
          >
            {/* Song Header Toolbar */}
            <div className="flex-shrink-0">
              <div className="flex justify-between items-start gap-4 w-full">
                <div className="flex-1 min-w-0 flex flex-col pt-1">
                  <div className="flex items-center gap-2 sm:gap-3 w-full">
                    <h2 className="text-base sm:text-xl font-bold tracking-tight text-white select-none leading-none truncate shrink min-w-0">
                      {currentSong.Title}
                    </h2>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleFav(String(currentSong.SongID))}
                        className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[9px] btn-5d transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                          favorites.includes(String(currentSong.SongID))
                            ? 'text-amber-400 font-bold border-amber-500/40 shadow-[0_0_10px_rgba(251,191,36,0.15)]'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {favorites.includes(String(currentSong.SongID)) ? '★ Fav' : '☆ Fav'}
                      </button>
                      <button
                        onClick={() => toggleSetlist(String(currentSong.SongID))}
                        className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] sm:text-[9px] btn-5d transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                          setlists.includes(String(currentSong.SongID))
                            ? 'text-violet-400 font-bold border-violet-500/40 shadow-[0_0_10px_rgba(139,92,246,0.15)]'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {setlists.includes(String(currentSong.SongID)) ? '⚡ Set' : '☆ Set'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[9px] text-indigo-300/80 font-medium select-none truncate mt-1.5">
                    {currentSong.Artist || 'Unknown Artist'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setArrangerOpen((prev) => !prev)}
                    className="justify-center px-2.5 py-1.5 rounded text-[9px] btn-5d-primary text-white font-bold flex items-center gap-1.5 shadow-md cursor-pointer uppercase tracking-wider transition-all active:scale-95 shrink-0"
                  >
                    🗺️ Arrangement Director
                  </button>
                  {appUser && appSecret && (
                    <button
                      onClick={() => setIsFormModalOpen(true)}
                      className="justify-center px-2.5 py-1.5 rounded text-[9px] btn-5d-primary text-white font-bold flex items-center gap-1 shadow-md cursor-pointer transition-all active:scale-95 shrink-0"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      Edit Song
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Arrangement Panel & Family Chords */}
              <div className="mt-2 space-y-1.5">
                <div className="hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full overflow-hidden">
                    <span className="text-[9px] sm:text-[10px] text-indigo-300 uppercase tracking-widest font-extrabold flex items-center gap-1.5 select-none whitespace-nowrap px-1">
                      <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                        />
                      </svg>
                      Roadmap:
                    </span>
                    <div className="flex flex-wrap items-center gap-1 overflow-x-auto max-w-full custom-scrollbar">
                      {activeRoadmap.map((block, idx) => {
                        const isRep = repInfo[idx]?.isRepeat;
                        const runStart = repInfo[idx]?.runStartIndex ?? idx;
                        const totalRun = repInfo[idx]?.totalInRun ?? 1;

                        return (
                          <button
                            key={`${block.id}-${idx}`}
                            onClick={() => {
                              const target = document.getElementById(`sec-wrapper-${runStart}`);
                              if (target) {
                                setSectionCollapsedStates((prev) => ({ ...prev, [runStart]: false }));
                                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className={`px-2.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 active:scale-95 border border-indigo-500/30 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-indigo-100 transition-all select-none flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer`}
                            title={`Jump to ${block.name} (Section #${idx + 1})`}
                          >
                            <span className="text-[8px] bg-indigo-500/40 text-white rounded px-1 shadow-inner">
                              {idx + 1}
                            </span>
                            {block.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => setArrangerOpen((prev) => !prev)}
                    className="w-full sm:w-auto px-2.5 py-1 btn-5d-primary text-white text-[8px] font-bold uppercase tracking-widest rounded flex items-center justify-center gap-1.5 flex-shrink-0 shadow-md cursor-pointer"
                  >
                    🗺️ Arrange Flow
                  </button>
                </div>

                {/* Arrange flow drawer panel */}
                <div className={`panel-wrap ${arrangerOpen ? 'is-open' : ''}`}>
                  <div className="panel-inner">
                    <div className="pt-2.5">
                      <div className="mb-2.5 p-3 bg-black/40 rounded-xl border border-indigo-500/20 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-white/5 pb-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5 select-none">
                              <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold">
                                Shared Band Presets
                              </div>
                              <span className="text-[7px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex-shrink-0 font-bold uppercase tracking-widest font-mono select-none">
                                ☁️ Cloud Sync
                              </span>
                            </div>
                            <div className="space-y-1 overflow-y-auto max-h-[80px] pr-1 custom-scrollbar">
                              {Object.keys(getPresets()).length > 0 ? (
                                Object.keys(getPresets()).map((name) => (
                                  <div
                                    key={name}
                                    className="flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-[10px]"
                                  >
                                    <button
                                      onClick={() => loadPresetArrangement(name)}
                                      className="flex-1 text-left font-bold text-gray-300 hover:text-white uppercase truncate pr-2 cursor-pointer"
                                    >
                                      {name}
                                    </button>
                                    <button
                                      onClick={() => deletePresetArrangement(name)}
                                      className="text-rose-400/60 hover:text-rose-400 px-2.5 py-1 font-bold text-xs cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[9px] text-gray-500 italic py-2 text-center">
                                  No arrangements saved yet...
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col justify-between">
                            <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold mb-1.5 select-none">
                              Save Arrangement
                            </div>
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                id="presetNameInput"
                                placeholder="Preset name (e.g. Acoustic)"
                                className="w-full bg-black/50 p-2 rounded-lg text-[10px] text-white border border-white/5 outline-none focus:ring-1 focus:ring-indigo-500/30"
                              />
                              <button
                                onClick={savePresetArrangement}
                                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all active:scale-95 cursor-pointer"
                              >
                                Save Active Flow
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold mb-1.5 select-none">
                            Configure sequence flow (Drag blocks to reorder)
                          </div>
                          <div className="flex flex-wrap gap-2 overflow-x-auto pb-6 pt-3 -mt-2 custom-scrollbar">
                            {activeRoadmap.map((block, idx) => {
                              const blockKey = getModulatedKeyName(currentKey, block.keyOffset || 0);
                              const modSign = (block.keyOffset || 0) >= 0 ? '+' : '';
                              const templateLines = sectionTemplates[block.name] || [];

                              return (
                                <div
                                  key={block.id}
                                  draggable
                                  onDragStart={() => handleDragStart(idx)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => handleDrop(idx)}
                                  onClick={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)}
                                  className={`flex flex-col items-center border rounded-lg p-2 min-w-[105px] select-none relative group transition-all cursor-grab active:cursor-grabbing mt-1 ${
                                    editingBlockId === block.id
                                      ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)] scale-105 z-10'
                                      : 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/15'
                                  }`}
                                >
                                  <span className="text-[8px] text-gray-500 font-mono font-bold absolute top-1 left-1.5">
                                    #{idx + 1}
                                  </span>
                                  <span className="text-xs sm:text-sm font-bold text-indigo-300 uppercase mt-3 mb-1.5 flex items-center justify-center gap-1 flex-wrap">
                                    {block.name}
                                    {repInfo[idx]?.isRepeat && (
                                      <span className="text-[7.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1 font-mono font-black scale-90">
                                        {repInfo[idx].repeatCount}x
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[8px] font-mono text-gray-400 mb-2">
                                    {(block.enabledLines || []).length}/{templateLines.length} lines
                                  </span>

                                  <div
                                    className="flex items-center justify-between w-full mt-1 pt-1 border-t border-white/5 select-none"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-[8px] text-amber-400 font-mono font-bold">
                                      {blockKey}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => adjustBlockModulation(block.id, -1)}
                                        className="w-5 h-5 rounded bg-black/40 hover:bg-white/10 text-xs flex items-center justify-center text-indigo-300 font-bold transition-colors cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <span className="text-[9px] text-indigo-200 font-mono font-bold px-0.5">
                                        {modSign}
                                        {block.keyOffset || 0}
                                      </span>
                                      <button
                                        onClick={() => adjustBlockModulation(block.id, 1)}
                                        className="w-5 h-5 rounded bg-black/40 hover:bg-white/10 text-xs flex items-center justify-center text-indigo-300 font-bold transition-colors cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex gap-1.5 mt-2 w-full justify-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (idx > 0) {
                                          const next = [...activeRoadmap];
                                          const temp = next[idx];
                                          next[idx] = next[idx - 1];
                                          next[idx - 1] = temp;
                                          setActiveRoadmap(next);
                                          showToast('Shifted left', 'success');
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-black/30 hover:bg-white/10 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteRoadmapBlock(idx);
                                      }}
                                      className="w-6 h-6 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (idx < activeRoadmap.length - 1) {
                                          const next = [...activeRoadmap];
                                          const temp = next[idx];
                                          next[idx] = next[idx + 1];
                                          next[idx + 1] = temp;
                                          setActiveRoadmap(next);
                                          showToast('Shifted right', 'success');
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-black/30 hover:bg-white/10 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer"
                                    >
                                      ▶
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Line Dissector panel */}
                        {editingBlockId && activeRoadmap.find((b) => b.id === editingBlockId) && (
                          <div className="p-3 bg-indigo-950/10 rounded-xl border border-indigo-500/20 mt-2 select-none animate-fadeIn">
                            <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-white/5">
                              <span className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                                <span>✂️ Line Dissector:</span>{' '}
                                <b className="text-white">
                                  {activeRoadmap.find((b) => b.id === editingBlockId)?.name}
                                </b>
                              </span>
                              <span className="text-[8px] text-gray-500 font-mono">
                                Toggle lines in active block to filter
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {(
                                sectionTemplates[
                                  activeRoadmap.find((b) => b.id === editingBlockId)?.name || ''
                                ] || []
                              ).map((line, lIdx) => {
                                const activeBlock = activeRoadmap.find((b) => b.id === editingBlockId);
                                const isEnabled = (activeBlock?.enabledLines || []).includes(lIdx);

                                return (
                                  <div
                                    key={lIdx}
                                    onClick={() => toggleLineInBlock(editingBlockId, lIdx)}
                                    className={`flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer ${
                                      isEnabled
                                        ? 'bg-white/5 border border-indigo-500/30'
                                        : 'bg-black/20 border border-transparent opacity-40'
                                    } text-[10px] hover:bg-white/10`}
                                  >
                                    <div className="flex items-center gap-2 truncate pr-2">
                                      <span className="font-mono text-[9px] text-gray-500">
                                        L{lIdx + 1}
                                      </span>
                                      <div className="truncate">
                                        <span
                                          className={`text-amber-400/90 font-mono text-[8px] block ${
                                            isEnabled ? '' : 'line-through italic'
                                          }`}
                                        >
                                          {line.Chords || '[No Chords]'}
                                        </span>
                                        <span
                                          className={`text-gray-200 text-[9px] block truncate ${
                                            isEnabled ? '' : 'italic'
                                          }`}
                                        >
                                          {line.Lyrics || '[Instrumental]'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <span
                                        className={`text-[7px] font-bold uppercase tracking-wider ${
                                          isEnabled ? 'text-indigo-400' : 'text-gray-600'
                                        }`}
                                      >
                                        {isEnabled ? 'Active' : 'Muted'}
                                      </span>
                                      <div
                                        className={`w-6 h-3 rounded-full relative transition-colors duration-200 ${
                                          isEnabled ? 'bg-indigo-500' : 'bg-white/10'
                                        }`}
                                      >
                                        <div
                                          className={`w-2.5 h-2.5 rounded-full bg-white absolute top-[1px] transition-all duration-200 ${
                                            isEnabled ? 'left-[13px]' : 'left-[1px]'
                                          }`}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 select-none">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">
                              Inject Block:
                            </span>
                            {Object.keys(sectionTemplates).map((sec) => (
                              <button
                                key={sec}
                                onClick={() => addRoadmapBlock(sec)}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-[8px] font-bold uppercase tracking-widest text-emerald-300 transition-all active:scale-95 cursor-pointer"
                              >
                                + {sec}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={resetRoadmapBlocks}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-[8px] font-bold uppercase tracking-widest text-rose-300 transition-all active:scale-95 cursor-pointer"
                          >
                            Reset Default
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Family chords visual references */}
                <div className="pt-2 sm:pt-3 border-t border-indigo-500/20">
                  {renderFamilyChordsList()}
                </div>
              </div>
            </div>

            {/* Performance Controls Toolbar Drawer */}
            <div id="lyricsFullscreenWrap" className="mt-2 flex flex-col flex-1 relative min-h-0 bg-transparent transition-all">
              <div className="flex justify-between items-center mb-1.5 pr-1 sm:pr-2">
                <span className="text-[9px] sm:text-[10px] text-indigo-400 uppercase tracking-widest font-extrabold select-none flex-shrink-0">
                  Sheet View
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    id="controlsToggleBtn"
                    onClick={() => setControlsExpanded((prev) => !prev)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-indigo-300 rounded flex items-center gap-1 text-[9px] font-bold transition-all border border-white/5 shadow-sm active:scale-95 cursor-pointer"
                  >
                    {controlsExpanded ? '▲ Hide Tools' : '▼ Show Tools'}
                  </button>
                  <button
                    onClick={toggleFullScreen}
                    className="fs-hide-btn px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold transition-all border border-white/5 shadow-sm active:scale-95 cursor-pointer"
                    title="Fullscreen Lyrics"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                      />
                    </svg>
                    <span className="hidden sm:inline">Fullscreen</span>
                  </button>
                </div>
              </div>

              {/* Toolbar contents */}
              <div className={`panel-wrap ${controlsExpanded ? 'is-open' : ''}`}>
                <div className="panel-inner">
                  <div className="pt-1 pb-1.5">
                    <div className="grid grid-cols-12 gap-2 w-full p-2 bg-[#0d0f1e]/40 rounded-xl border border-indigo-500/20 shadow-sm select-none">
                      
                      {/* Widget 1: Key & Zoom */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center justify-between gap-2.5 bg-black/25 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <div className="flex flex-col flex-1">
                          <span className="text-[7.5px] text-indigo-300 uppercase tracking-widest font-black font-mono">Transpose</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <button
                              onClick={() => shiftKey(-1)}
                              className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center font-black text-xs text-indigo-300 transition-all cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-[10px] font-bold text-amber-400 font-mono">
                              {currentKey}
                            </span>
                            <button
                              onClick={() => shiftKey(1)}
                              className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center font-black text-xs text-indigo-300 transition-all cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="h-6 w-[1px] bg-white/10 self-center" />
                        <div className="flex flex-col items-end flex-1">
                          <span className="text-[7.5px] text-indigo-300 uppercase tracking-widest font-black font-mono">Zoom</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <button
                              onClick={() => adjustZoom(-0.1)}
                              className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center font-black text-[9px] text-gray-300 active:scale-90 transition-all cursor-pointer"
                            >
                              A-
                            </button>
                            <button
                              onClick={() => adjustZoom(0.1)}
                              className="w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center font-black text-[9px] text-gray-300 active:scale-90 transition-all cursor-pointer"
                            >
                              A+
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Widget 2: Display & Toggles */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-4 flex flex-col justify-between gap-1 bg-black/25 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300 uppercase tracking-widest font-black font-mono">View & Layout Options</span>
                        <div className="grid grid-cols-3 gap-1 items-center mt-0.5">
                          <select
                            value={displayMode}
                            onChange={(e) => setDisplayMode(e.target.value as any)}
                            className="col-span-1 bg-white/5 hover:bg-white/10 text-[8px] py-1 px-1 rounded text-gray-200 outline-none border border-white/5 transition-all cursor-pointer font-bold text-center appearance-none"
                          >
                            <option value="chords" className="bg-[#0a0b16]">Chords</option>
                            <option value="numbers" className="bg-[#0a0b16]">Numbers</option>
                            <option value="both" className="bg-[#0a0b16]">Both</option>
                          </select>
                          <button
                            onClick={() => setShowLyrics((prev) => !prev)}
                            className={`col-span-1 text-[8px] uppercase font-bold tracking-wider px-1 py-1 rounded transition-all flex items-center justify-center gap-0.5 active:scale-90 border cursor-pointer ${
                              showLyrics
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30'
                                : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white'
                            }`}
                            title="Toggle Lyrics visibility on the sheet"
                          >
                            {showLyrics ? 'Lyrics On' : 'Lyrics Off'}
                          </button>
                          <button
                            onClick={() => setSheetLayoutMode((prev) => (prev === 'sequence' ? 'compact' : 'sequence'))}
                            className={`col-span-1 text-[8px] uppercase font-bold tracking-wider px-1 py-1 rounded transition-all flex items-center justify-center gap-0.5 active:scale-90 border cursor-pointer ${
                              sheetLayoutMode === 'compact'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25 shadow-sm'
                                : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20 shadow-sm'
                            }`}
                            title="Switch between Flow View and Compact View"
                          >
                            {sheetLayoutMode === 'compact' ? 'Show Flow' : 'Show Compact'}
                          </button>
                        </div>
                      </div>

                      {/* Widget 3: Autoscroll */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-2 flex flex-col justify-between gap-1 bg-black/25 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300 uppercase tracking-widest font-black font-mono">Autoscroll</span>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <button
                            onClick={() => setIsScrollingActive((prev) => !prev)}
                            className={`text-[8px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-all flex items-center gap-1 active:scale-90 shadow-sm whitespace-nowrap cursor-pointer ${
                              isScrollingActive
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {isScrollingActive ? '⏸️ Stop' : '▶️ Play'}
                          </button>
                          
                          <div className="flex items-center justify-center gap-1 bg-black/40 rounded-md px-1 py-0.5 border border-white/5 shadow-inner">
                            <button
                              onClick={() => setScrollSpeed((prev) => Math.max(0.1, prev - 0.2))}
                              className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-gray-300 font-bold active:scale-90 cursor-pointer select-none transition-colors"
                              title="Decrease Speed"
                            >
                              -
                            </button>
                            <span className="text-[9px] font-mono font-bold text-gray-300 w-5 text-center select-none">
                              {scrollSpeed.toFixed(1)}
                            </span>
                            <button
                              onClick={() => setScrollSpeed((prev) => Math.min(10, prev + 0.2))}
                              className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-gray-300 font-bold active:scale-90 cursor-pointer select-none transition-colors"
                              title="Increase Speed"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Widget 4: Metronome & Tempo */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between gap-1 bg-black/25 border border-white/5 rounded-lg px-2 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300 uppercase tracking-widest font-black font-mono">Metronome & Tempo</span>
                        <div className="flex items-center justify-center gap-1.5 mt-0.5">
                          <button
                            onClick={() => setIsMetronomeActive((prev) => !prev)}
                            className={`text-[8px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-all flex items-center gap-1 active:scale-90 border shadow-sm whitespace-nowrap cursor-pointer ${
                              isMetronomeActive
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 shadow-inner'
                                : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
                            }`}
                          >
                            <span
                              id="metronomeDot"
                              className="w-1.5 h-1.5 rounded-full bg-rose-500 opacity-20 scale-90 transition-all duration-100"
                            />
                            Metro
                          </button>
                          <button
                            onClick={handleTapTempo}
                            className="text-[8px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all active:scale-90 border border-rose-500/20 shadow-sm cursor-pointer"
                          >
                            TAP
                          </button>
                          <input
                            type="number"
                            min="40"
                            max="250"
                            value={bpm}
                            onChange={(e) => setBpm(Math.max(40, Math.min(250, parseInt(e.target.value) || 120)))}
                            className="w-10 bg-black/40 text-center rounded p-1 text-[9px] font-mono font-bold text-rose-300 outline-none focus:ring-1 focus:ring-rose-500/30 border border-white/5 shadow-inner"
                          />
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>


              {/* Roadmap Flow Progression bar above chords & lyrics */}
              {activeRoadmap.length > 0 && (
                <div className="mb-2 bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-3 py-1.5 flex items-center gap-2 select-none overflow-x-auto custom-scrollbar shadow-inner backdrop-blur-sm shrink-0">
                  <div className="flex items-center gap-1.5 text-[8px] font-mono font-black uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5 shrink-0 shadow-sm select-none">
                    <span>🧭</span> ROADMAP
                  </div>
                  <div className="flex items-center gap-1 flex-nowrap py-0.5">
                    {activeRoadmap.map((block, idx) => {
                      const blockRep = repInfo[idx];
                      if (blockRep?.isRepeat) {
                        return null; // Skip rendering identical consecutive repeats
                      }

                      let badgeStyle = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20';
                      const nameLower = block.name.toLowerCase();
                      if (nameLower.includes('chorus')) {
                        badgeStyle = 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20';
                      } else if (nameLower.includes('verse')) {
                        badgeStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20';
                      } else if (nameLower.includes('bridge')) {
                        badgeStyle = 'bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/20';
                      } else if (nameLower.includes('intro') || nameLower.includes('outro')) {
                        badgeStyle = 'bg-sky-500/10 text-sky-300 border-sky-500/20 hover:bg-sky-500/20';
                      }

                      return (
                        <div key={block.id} className="flex items-center gap-1 shrink-0">
                          {idx > 0 && (
                            <span className="text-gray-600 text-[9px] font-bold font-mono px-0.5 select-none">➔</span>
                          )}
                          <button
                            onClick={() => {
                              const element = document.getElementById(`sec-wrapper-${idx}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                element.classList.add('ring-2', 'ring-indigo-500/50', 'rounded-xl');
                                setTimeout(() => {
                                  element.classList.remove('ring-2', 'ring-indigo-500/50');
                                }, 1500);
                              }
                            }}
                            className={`px-2 py-0.5 text-[9px] font-semibold rounded-md border transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${badgeStyle} shadow-sm`}
                            title={`Click to jump to ${block.name}`}
                          >
                            <span>{block.name}</span>
                            {block.keyOffset && block.keyOffset !== 0 ? (
                              <span className="text-[7px] bg-red-500/20 text-red-300 px-0.5 rounded">
                                {block.keyOffset > 0 ? `+${block.keyOffset}` : block.keyOffset}
                              </span>
                            ) : null}
                            {blockRep && blockRep.totalInRun > 1 && (
                              <span className="text-[7.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1 font-mono font-black select-none ml-0.5">
                                {blockRep.totalInRun}x
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}


              {/* Scrollable song sheet grid */}
              <div
                className={`pr-1 sm:pr-2 pb-16 song-scroll-container flex-1 overflow-y-auto custom-scrollbar w-full ${
                  focusedLineId ? 'focused-parent' : ''
                } ${controlsExpanded ? 'mt-0' : 'mt-1'}`}
              >
                {activeRoadmap.map((block, idx) => {
                  let blockDisplayName = block.name;

                  // In compact mode, only render the first occurrence of unique sections.
                  if (sheetLayoutMode === 'compact') {
                    if (!showLyrics) {
                      // Merge by identical chord progression
                      const firstIdx = activeRoadmap.findIndex(b => areBlocksChordsIdentical(b, block, sectionTemplates));
                      if (firstIdx !== idx) {
                        return null;
                      }
                      // Find all unique section names with identical chords/keys in the roadmap to merge their names
                      const identicalBlocks = activeRoadmap.filter(b => areBlocksChordsIdentical(b, block, sectionTemplates));
                      const uniqueNames = Array.from(new Set(identicalBlocks.map(b => b.name)));
                      blockDisplayName = uniqueNames.join(' / ');
                    } else {
                      // Standard compact mode by name
                      const firstIdx = activeRoadmap.findIndex(b => b.name === block.name);
                      if (firstIdx !== idx) {
                        return null;
                      }
                    }
                  }

                  const blockRep = repInfo[idx];
                  
                  // If this block is an identical repetition of the previous block, we skip rendering it entirely.
                  // This is because we display the multiplier label (e.g. 2x, 3x) on the very first instance.
                  if (sheetLayoutMode === 'sequence' && blockRep?.isRepeat) {
                    return null;
                  }

                  const templateLines = sectionTemplates[block.name] || [];
                  const blockOffset = block.keyOffset || 0;
                  const blockKeyName = getModulatedKeyName(currentKey, blockOffset);
                  const isSectionCollapsed = sectionCollapsedStates[idx] === true;

                  const originalIdx = NOTE_TO_INDEX[currentSong.OriginalKey || 'C'] || 0;
                  const currentIdx = NOTE_TO_INDEX[currentKey] || 0;
                  const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

                  let textColor = 'text-indigo-400';
                  let lineColor = 'bg-indigo-500/20';
                  const nameLower = block.name.toLowerCase();
                  if (nameLower.includes('chorus')) {
                    textColor = 'text-amber-400';
                    lineColor = 'bg-amber-500/20';
                  } else if (nameLower.includes('verse')) {
                    textColor = 'text-emerald-400';
                    lineColor = 'bg-emerald-500/20';
                  } else if (nameLower.includes('bridge')) {
                    textColor = 'text-purple-400';
                    lineColor = 'bg-purple-500/20';
                  } else if (nameLower.includes('intro') || nameLower.includes('outro')) {
                    textColor = 'text-sky-400';
                    lineColor = 'bg-sky-500/20';
                  }

                  // Non-consecutive duplicates: Check if this block is an identical repetition of a PREVIOUS block in the flow
                  if (sheetLayoutMode === 'sequence') {
                    const firstIdenticalIdx = activeRoadmap.findIndex((b, bIdx) => bIdx < idx && areBlocksIdentical(b, block));
                    if (firstIdenticalIdx !== -1) {
                      // Skip rendering full chords/lyrics, instead render a beautiful compact repeat card!
                      return (
                        <div
                          key={block.id}
                          id={`sec-wrapper-${idx}`}
                          className="group mb-2 bg-white/[0.02] border border-dashed border-white/10 hover:border-white/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between transition-all select-none"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-[8px] font-mono font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded px-1.5 py-0.5 shadow-sm animate-pulse flex items-center gap-1 shrink-0">
                              <span>🔁</span> REPLAY
                            </span>
                            <span className={`text-[11px] font-bold ${textColor} truncate`}>
                              {block.name}
                            </span>
                            <span className="text-[8px] text-gray-400 font-mono hidden sm:inline truncate">
                              (Identical chords & structure as Section #{firstIdenticalIdx + 1})
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const element = document.getElementById(`sec-wrapper-${firstIdenticalIdx}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                element.classList.add('ring-2', 'ring-indigo-500/50', 'rounded-xl');
                                setTimeout(() => {
                                  element.classList.remove('ring-2', 'ring-indigo-500/50');
                                }, 1500);
                              }
                            }}
                            className="text-[8px] text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 rounded px-2 py-0.5 font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm shrink-0"
                            title="Scroll up to the original section chords and lyrics"
                          >
                            <span>👁️ View Original</span>
                          </button>
                        </div>
                      );
                    }
                  }

                  return (
                    <div
                      key={block.id}
                      id={`sec-wrapper-${idx}`}
                      className="group mb-2 transition-all"
                    >
                      {/* Section header minimal bar */}
                      <div
                        onClick={() =>
                          setSectionCollapsedStates((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className="cursor-pointer py-0.5 flex items-center justify-between select-none hover:opacity-85 active:scale-[0.99] transition-all"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 pr-2">
                          <span 
                            className={`font-mono uppercase tracking-widest font-black ${textColor} shrink-0 flex items-center gap-1.5`}
                            style={{ fontSize: `${Math.max(12, 14 * lyricZoom)}px` }}
                          >
                            {blockDisplayName}
                            {blockRep && blockRep.totalInRun > 1 && (
                              <span className="text-[8px] bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-md px-1.5 py-0.5 font-mono font-black select-none animate-pulse">
                                {blockRep.totalInRun}x
                              </span>
                            )}
                          </span>
                          
                          {/* Elegant thin horizontal line */}
                          <div className={`h-[1px] flex-1 ${lineColor} opacity-70`} />

                          {blockOffset !== 0 && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md px-1.5 py-0.5 font-mono uppercase whitespace-nowrap shrink-0">
                              Key: {blockKeyName} ({blockOffset >= 0 ? '+' : ''}{blockOffset})
                            </span>
                          )}
                        </div>
                        <span
                          className="chevron-icon text-indigo-400/40 text-[9px] flex-shrink-0 ml-1"
                          style={{ transform: isSectionCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                        >
                          ▼
                        </span>
                      </div>

                      {/* Lines view body */}
                      <div className={`panel-wrap ${!isSectionCollapsed ? 'is-open' : ''}`}>
                        <div className="panel-inner">
                          <div className="py-0.5 pl-3 sm:pl-4 space-y-0.5 bg-transparent">
                            {(() => {
                              // 1. Get only enabled lines
                              const enabledLinesList = templateLines
                                .map((l, lIdx) => ({ l, lIdx }))
                                .filter(({ lIdx }) => (block.enabledLines || []).includes(lIdx));

                              // 2. Pre-process and resolve chords, numbers, and lyrics
                              const processedLines = enabledLinesList.map(({ l, lIdx }) => {
                                const transposed = transposeChord(l.Chords || '', totalSemitonesOffset);
                                const numbers = getNumberForChord(transposed, blockKeyName, currentKey);
                                const lyrics = l.Lyrics || '';
                                return {
                                  l,
                                  lIdx,
                                  transposed,
                                  numbers,
                                  lyrics,
                                };
                              });

                              // 3. Find the best multi-line chord progression loop (pattern length L, repeat count K)
                              let bestL = -1;
                              let bestK = -1;
                              const N = processedLines.length;

                              if (!showLyrics && N >= 4) {
                                for (let L = 2; L <= Math.floor(N / 2); L++) {
                                  let K = 1;
                                  while ((K + 1) * L <= N) {
                                    let matches = true;
                                    for (let offset = 0; offset < L; offset++) {
                                      const originalChord = processedLines[offset].transposed;
                                      const nextChord = processedLines[K * L + offset].transposed;
                                      if (originalChord !== nextChord) {
                                        matches = false;
                                        break;
                                      }
                                    }
                                    if (matches) {
                                      K++;
                                    } else {
                                      break;
                                    }
                                  }

                                  if (K >= 2) {
                                    // Make sure at least one line in the pattern has non-empty chords
                                    let hasChords = false;
                                    for (let offset = 0; offset < L; offset++) {
                                      if (processedLines[offset].transposed && processedLines[offset].transposed.trim() !== '') {
                                        hasChords = true;
                                        break;
                                      }
                                    }

                                    if (hasChords) {
                                      // Pick the loop that covers the most lines (K * L).
                                      // If there is a tie, we prefer the smaller L (the fundamental loop).
                                      if (bestL === -1 || (K * L > bestK * bestL) || (K * L === bestK * bestL && L < bestL)) {
                                        bestL = L;
                                        bestK = K;
                                      }
                                    }
                                  }
                                }
                              }

                              // 4. Render with Loop-Grouping if a pattern is detected
                              if (bestL >= 2 && bestK >= 2) {
                                const loopLength = bestL;
                                const repeatCount = bestK;
                                const loopedLinesCount = loopLength * repeatCount;

                                // Check if lyrics are identical across all rounds or are hidden/disabled
                                const lyricsAreIdenticalOrHidden = !showLyrics || (() => {
                                  for (let r = 1; r < repeatCount; r++) {
                                    for (let offset = 0; offset < loopLength; offset++) {
                                      const lineA = processedLines[offset];
                                      const lineB = processedLines[r * loopLength + offset];
                                      if ((lineA.lyrics || '') !== (lineB.lyrics || '')) {
                                        return false;
                                      }
                                    }
                                  }
                                  return true;
                                })();

                                const loopContainers = [];

                                if (lyricsAreIdenticalOrHidden) {
                                  // Render only the first round with a repeat badge, hiding duplicate rounds completely!
                                  const runLines = processedLines.slice(0, loopLength);
                                  loopContainers.push(
                                    <div
                                      key="loop-run-single"
                                      className="border-l border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/[0.08] hover:border-amber-500/50 rounded-r-xl px-2 py-1.5 my-1.5 space-y-1 transition-all"
                                    >
                                      <div className="flex items-center gap-2 mb-1 select-none">
                                        <span className="text-[9px] font-mono font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded px-2 py-0.5 flex items-center gap-1.5 shadow-sm animate-pulse">
                                          <span>🔁</span> Play {repeatCount}x
                                        </span>
                                        <span className="text-[8px] text-amber-300 font-mono tracking-wide">
                                          (chords progression repeats)
                                        </span>
                                      </div>

                                      <div className="space-y-1">
                                        {runLines.map((lineData) => {
                                          const { lIdx, transposed, numbers, lyrics } = lineData;
                                          const lineUniqueId = `line-block-${idx}-${lIdx}`;

                                          return (
                                            <div
                                              key={lIdx}
                                              onClick={() =>
                                                setFocusedLineId((prev) => (prev === lineUniqueId ? null : lineUniqueId))
                                              }
                                              className={`line-block animate-fadeIn ${
                                                focusedLineId === lineUniqueId ? 'focused' : ''
                                              }`}
                                            >
                                              {displayMode !== 'numbers' && transposed && (
                                                <div
                                                  className="chord-line mb-0.5"
                                                  style={{ fontSize: `${lyricZoom * 1.05}rem` }}
                                                >
                                                  {parseClickableChords(transposed, blockKeyName)}
                                                </div>
                                              )}
                                              {displayMode !== 'chords' && numbers && (
                                                <div
                                                  className="num-line mb-0.5"
                                                  style={{ fontSize: `${lyricZoom * 0.9}rem` }}
                                                >
                                                  {numbers}
                                                </div>
                                              )}
                                              {showLyrics && lyrics && (
                                                <div
                                                  className="lyric-line text-gray-200"
                                                  style={{ fontSize: `${lyricZoom}rem` }}
                                                >
                                                  {lyrics}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                } else {
                                  // Lyrics are shown and are different: render all rounds so the user can read the lyrics
                                  for (let r = 0; r < repeatCount; r++) {
                                    const runLines = processedLines.slice(r * loopLength, (r + 1) * loopLength);
                                    loopContainers.push(
                                      <div
                                        key={`loop-run-${r}`}
                                        className="border-l border-indigo-500/25 bg-indigo-500/5 hover:bg-indigo-500/[0.08] hover:border-indigo-500/50 rounded-r-xl px-2 py-1.5 my-1.5 space-y-1 transition-all"
                                      >
                                        <div className="flex items-center gap-2 mb-1 select-none">
                                          {r === 0 ? (
                                            <>
                                              <span className="text-[9px] font-mono font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded px-2 py-0.5 flex items-center gap-1.5 shadow-sm">
                                                <span>🔁</span> Chord Loop ({repeatCount}x) — Round 1
                                              </span>
                                              <span className="text-[8px] text-indigo-300 font-mono tracking-wide">
                                                (chords progression pattern repeats)
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <span className="text-[9px] font-mono font-black uppercase tracking-wider text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 rounded px-2 py-0.5 flex items-center gap-1.5 shadow-sm">
                                                <span>🔁</span> Round {r + 1}
                                              </span>
                                              <span className="text-[8px] text-gray-400 font-mono tracking-wide">
                                                (identical chords as Round 1)
                                              </span>
                                            </>
                                          )}
                                        </div>

                                        <div className="space-y-1">
                                          {runLines.map((lineData) => {
                                            const { lIdx, transposed, numbers, lyrics } = lineData;
                                            const lineUniqueId = `line-block-${idx}-${lIdx}`;

                                            return (
                                              <div
                                                key={lIdx}
                                                onClick={() =>
                                                  setFocusedLineId((prev) => (prev === lineUniqueId ? null : lineUniqueId))
                                                }
                                                className={`line-block animate-fadeIn ${
                                                  focusedLineId === lineUniqueId ? 'focused' : ''
                                                }`}
                                              >
                                                {displayMode !== 'numbers' && transposed && (
                                                  <div
                                                    className="chord-line mb-0.5"
                                                    style={{ fontSize: `${lyricZoom * 1.05}rem` }}
                                                  >
                                                    {parseClickableChords(transposed, blockKeyName)}
                                                  </div>
                                                )}
                                                {displayMode !== 'chords' && numbers && (
                                                  <div
                                                    className="num-line mb-0.5"
                                                    style={{ fontSize: `${lyricZoom * 0.9}rem` }}
                                                  >
                                                    {numbers}
                                                  </div>
                                                )}
                                                {showLyrics && lyrics && (
                                                  <div
                                                    className="lyric-line text-gray-200"
                                                    style={{ fontSize: `${lyricZoom}rem` }}
                                                  >
                                                    {lyrics}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  }
                                }

                                const remainingLines = processedLines.slice(loopedLinesCount);

                                return (
                                  <div className="space-y-1">
                                    {loopContainers}
                                    {remainingLines.length > 0 && (
                                      <div className="pt-1.5 space-y-1 border-t border-gray-800/25">
                                        {remainingLines.map((lineData) => {
                                          const { lIdx, transposed, numbers, lyrics } = lineData;
                                          const lineUniqueId = `line-block-${idx}-${lIdx}`;

                                          return (
                                            <div
                                              key={lIdx}
                                              onClick={() =>
                                                setFocusedLineId((prev) => (prev === lineUniqueId ? null : lineUniqueId))
                                              }
                                              className={`line-block animate-fadeIn ${
                                                focusedLineId === lineUniqueId ? 'focused' : ''
                                              }`}
                                            >
                                              {displayMode !== 'numbers' && transposed && (
                                                <div
                                                  className="chord-line mb-0.5"
                                                  style={{ fontSize: `${lyricZoom * 1.05}rem` }}
                                                >
                                                  {parseClickableChords(transposed, blockKeyName)}
                                                </div>
                                              )}
                                              {displayMode !== 'chords' && numbers && (
                                                <div
                                                  className="num-line mb-0.5"
                                                  style={{ fontSize: `${lyricZoom * 0.9}rem` }}
                                                >
                                                  {numbers}
                                                </div>
                                              )}
                                              {showLyrics && lyrics && (
                                                <div
                                                  className="lyric-line text-gray-200"
                                                  style={{ fontSize: `${lyricZoom}rem` }}
                                                >
                                                  {lyrics}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // 5. Compute consecutive runs of identical lines (Fallback)
                              interface LineRun {
                                startIndex: number;
                                endIndex: number;
                                count: number;
                              }

                              const lineRuns: LineRun[] = [];
                              let i = 0;
                              while (i < processedLines.length) {
                                let j = i + 1;
                                while (j < processedLines.length) {
                                  const lineA = processedLines[i];
                                  const lineB = processedLines[j];

                                  const chordsIdentical = lineA.transposed === lineB.transposed;
                                  const lyricsIdentical = !showLyrics || lineA.lyrics === lineB.lyrics;

                                  if (chordsIdentical && lyricsIdentical) {
                                    j++;
                                  } else {
                                    break;
                                  }
                                }

                                lineRuns.push({
                                  startIndex: i,
                                  endIndex: j - 1,
                                  count: j - i,
                                });

                                i = j;
                              }

                              // 6. Render grouped lines (Fallback)
                              return lineRuns.map((run) => {
                                const firstLine = processedLines[run.startIndex];
                                const { lIdx, transposed, numbers, lyrics } = firstLine;
                                const lineUniqueId = `line-block-${idx}-${lIdx}`;

                                return (
                                  <div
                                    key={lIdx}
                                    onClick={() =>
                                      setFocusedLineId((prev) => (prev === lineUniqueId ? null : lineUniqueId))
                                    }
                                    className={`line-block animate-fadeIn ${
                                      focusedLineId === lineUniqueId ? 'focused' : ''
                                    }`}
                                  >
                                    {displayMode !== 'numbers' && transposed && (
                                      <div
                                        className="chord-line mb-0.5 flex items-center gap-2 flex-wrap"
                                        style={{ fontSize: `${lyricZoom * 1.05}rem` }}
                                      >
                                        <span>{parseClickableChords(transposed, blockKeyName)}</span>
                                        {run.count > 1 && (
                                          <span className="text-[7.5px] bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide">
                                            {run.count}x
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {displayMode !== 'chords' && numbers && (
                                      <div
                                        className="num-line mb-0.5 flex items-center gap-2 flex-wrap"
                                        style={{ fontSize: `${lyricZoom * 0.9}rem` }}
                                      >
                                        <span>{numbers}</span>
                                        {run.count > 1 && displayMode === 'numbers' && (
                                          <span className="text-[7.5px] bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide">
                                            {run.count}x
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {showLyrics && lyrics && (
                                      <div
                                        className="lyric-line text-gray-200 flex items-center gap-2 flex-wrap"
                                        style={{ fontSize: `${lyricZoom}rem` }}
                                      >
                                        <span>{lyrics}</span>
                                        {run.count > 1 && !transposed && !numbers && (
                                          <span className="text-[7.5px] bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide">
                                            {run.count}x
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating back-to-top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed bottom-6 left-4 sm:left-6 z-50 p-3 btn-5d-primary text-white rounded-full transition-all duration-300 cursor-pointer ${
          showScrollTop ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Sidebar Navigation Catalog */}
      <SidebarCatalog
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        songs={songs}
        favorites={favorites}
        setlists={setlists}
        currentTab={currentTab}
        onSetTab={setCurrentTab}
        currentSong={currentSong}
        onChangeSong={changeSong}
        onOpenAddSongForm={() => setIsFormModalOpen(true)}
        isAdmin={!!(appUser && appSecret)}
        onToggleAdmin={handleAdminLockToggle}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleFullScreen={toggleFullScreen}
        triggerCapability={handleTriggerCapability}
        onRunDiagnostics={() => setIsDiagnosticModalOpen(true)}
      />

      {/* Shortcuts Modal dialog */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* Admin lock password dialog */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[600] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-3xl p-6 rounded-3xl w-full max-w-sm shadow-[0_20px_50px_rgba(49,46,129,0.5)] border border-indigo-500/20">
            <div className="flex justify-center mb-4">
              <svg
                className="w-14 h-14 animate-music-float drop-shadow-[0_10px_20px_rgba(99,102,241,0.5)]"
                viewBox="0 0 120 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="admin-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#312e81" />
                  </linearGradient>
                  <linearGradient id="admin-shine" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#admin-grad1)" />
                <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#admin-shine)" opacity="0.6" />
                <path
                  d="M45 80 v-40 l35 -10 v40"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
                />
                <circle cx="35" cy="80" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))" />
                <circle cx="70" cy="70" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-4 text-white text-center tracking-wide select-none">
              Admin Authentication
            </h3>
            <input
              type="text"
              placeholder="Username"
              value={adminUsernameInput}
              onChange={(e) => setAdminUsernameInput(e.target.value)}
              className="w-full bg-indigo-900/30 text-indigo-100 p-3.5 rounded-xl text-sm text-center outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] placeholder-indigo-300/50 transition-all border border-indigo-500/30 mb-3"
            />
            <input
              type="password"
              placeholder="Passkey"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              className="w-full bg-indigo-900/30 text-indigo-100 p-3.5 rounded-xl text-sm text-center outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] placeholder-indigo-300/50 transition-all border border-indigo-500/30 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleVerifyAdmin}
                className="flex-1 py-3 btn-5d-primary text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                UNLOCK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Musician interactive intelligence dialog */}
      <MusicianModal
        isOpen={isMusicianModalOpen}
        onClose={() => setIsMusicianModalOpen(false)}
        chordName={selectedChord}
        songKey={currentSong ? currentKey : 'C'}
        onOpenFretboardHelp={() => {}}
        onOpenKeysHelp={() => {}}
      />

      {/* Add / Edit Song Sheet Dialog */}
      <SongEditModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        editingSong={currentSong}
        songLines={songLines}
        appUser={appUser}
        appSecret={appSecret}
        scriptUrl={SCRIPT_URL}
        onSubmitSuccess={fetchCatalog}
        showToast={showToast}
        setLoading={setIsLoading}
      />

      {/* Global loading indicator overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-[#07080e]/95 backdrop-blur-xl z-[900] flex flex-col items-center justify-center transition-opacity duration-300 select-none">
          <div className="relative flex items-center justify-center w-28 h-28">
            <div className="absolute inset-0 bg-indigo-500/20 blur-[40px] rounded-full" />
            <div className="ripple-ring" />
            <div className="ripple-ring" />
            <div className="ripple-ring" />
            <svg
              className="w-16 h-16 animate-music-float relative z-10 drop-shadow-[0_10px_25px_rgba(99,102,241,0.7)]"
              viewBox="0 0 120 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="load-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#312e81" />
                </linearGradient>
                <linearGradient id="load-shine" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#load-grad1)" />
              <rect x="10" y="10" width="100" height="100" rx="30" fill="url(#load-shine)" opacity="0.6" />
              <path
                d="M45 80 v-40 l35 -10 v40"
                fill="none"
                stroke="#ffffff"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
              />
              <circle cx="35" cy="80" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))" />
              <circle cx="70" cy="70" r="12" fill="#ffffff" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))" />
            </svg>
          </div>
          <div className="mt-10 text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-sky-300 text-[11px] font-extrabold tracking-[0.3em] uppercase animate-pulse drop-shadow-lg">
            Loading Catalog...
          </div>
        </div>
      )}

      {/* Database Diagnostic Modal */}
      <DatabaseDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        scriptUrl={SCRIPT_URL}
      />

      {/* Real-time Toasts notifications */}
      <div id="toastContainer" className="fixed bottom-6 right-4 sm:right-6 z-[950] flex flex-col gap-2 pointer-events-none w-full max-w-[90vw] sm:max-w-xs">
        {toasts.map((toast) => {
          let theme = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
          let symbol = 'ℹ';
          if (toast.type === 'success') {
            theme = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
            symbol = '✓';
          } else if (toast.type === 'error') {
            theme = 'bg-rose-500/10 text-rose-300 border-rose-500/20';
            symbol = '✕';
          }
          return (
            <div
              key={toast.id}
              className={`p-4 rounded-2xl backdrop-blur-xl shadow-2xl text-xs font-semibold tracking-wide border pointer-events-auto flex items-center gap-2 w-full animate-fadeIn ${theme}`}
            >
              <span className="text-base flex-shrink-0">{symbol}</span>
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
