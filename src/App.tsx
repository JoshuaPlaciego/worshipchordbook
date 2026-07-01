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
import SetlistSelectorDialog from './components/SetlistSelectorDialog';
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

export const areRoadmapsIdentical = (r1: any, r2: any): boolean => {
  if (!r1 || !r2) return false;
  
  const blocks1 = Array.isArray(r1) ? r1 : (r1.roadmap && Array.isArray(r1.roadmap) ? r1.roadmap : []);
  const blocks2 = Array.isArray(r2) ? r2 : (r2.roadmap && Array.isArray(r2.roadmap) ? r2.roadmap : []);
  
  if (blocks1.length !== blocks2.length) return false;
  for (let i = 0; i < blocks1.length; i++) {
    const b1 = blocks1[i];
    const b2 = blocks2[i];
    if (!b1 || !b2) return false;
    if (b1.name !== b2.name) return false;
    if ((b1.keyOffset || 0) !== (b2.keyOffset || 0)) return false;
    const el1 = b1.enabledLines || [];
    const el2 = b2.enabledLines || [];
    if (el1.length !== el2.length) return false;
    for (let j = 0; j < el1.length; j++) {
      if (el1[j] !== el2[j]) return false;
    }
  }
  return true;
};

export const resolveFriendlyArrangementName = (
  songID: string | number,
  roadmapBlocks: any[],
  syncedSheetArrangements: any[]
): string => {
  if (!roadmapBlocks || roadmapBlocks.length === 0) return '';

  for (const arr of syncedSheetArrangements) {
    if (String(arr.SongID) !== String(songID)) continue;
    if (arr.PresetName && arr.PresetName.startsWith('Set:')) continue;
    try {
      const presetData = JSON.parse(arr.RoadmapJSON);
      const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
      const blocksArray = isObject ? (presetData.roadmap || []) : presetData;
      if (areRoadmapsIdentical(blocksArray, roadmapBlocks)) {
        return arr.PresetName;
      }
    } catch {}
  }

  try {
    const local = localStorage.getItem(`custom_arrangements_${songID}`);
    if (local) {
      const localObj = JSON.parse(local);
      for (const k of Object.keys(localObj)) {
        if (k.startsWith('Set:')) continue;
        const presetData = localObj[k];
        const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
        const blocksArray = isObject ? (presetData.roadmap || []) : presetData;
        if (areRoadmapsIdentical(blocksArray, roadmapBlocks)) {
          return k;
        }
      }
    }
  } catch {}

  return '';
};

export const parsePresetDate = (presetName: string): { baseName: string; dateStr: string } => {
  const regex = /\s*\((January|February|March|April|May|June|July|August|September|October|November|December)-\d{2}-\d{2}\)$/i;
  const match = presetName.match(regex);
  if (match) {
    const matchedPart = match[0];
    const dateStr = matchedPart.trim().slice(1, -1); // remove parentheses
    const baseName = presetName.replace(matchedPart, '').trim();
    return { baseName, dateStr };
  }
  return { baseName: presetName, dateStr: 'Other / No Date' };
};

export const getPresetInputDisplayName = (name: string): string => {
  if (!name) return '';
  if (name.startsWith('Set: ')) {
    return name.slice(5).toUpperCase();
  }
  const { baseName } = parsePresetDate(name);
  return baseName.toUpperCase();
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

export const areBlocksLyricsAndChordsIdentical = (
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
    const l1 = activeLines1[i];
    const l2 = activeLines2[i];
    if ((l1.Chords || '') !== (l2.Chords || '')) return false;
    if ((l1.Lyrics || '') !== (l2.Lyrics || '')) return false;
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
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
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

  const [setlists, setSetlists] = useState<string[]>([]);

  // Selected Song Sheets & Keys
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [formEditingSong, setFormEditingSong] = useState<Song | null>(null);
  const [currentKey, setCurrentKey] = useState('C');
  const [songLines, setSongLines] = useState<SongLine[]>([]);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);

  // View Settings
  const [lyricZoom, setLyricZoom] = useState(0.6);
  const [displayMode, setDisplayMode] = useState<'both' | 'chords' | 'numbers'>('both');
  const [showLyrics, setShowLyrics] = useState(true);
  const [sheetLayoutMode, setSheetLayoutMode] = useState<'sequence' | 'compact'>('sequence');
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<'current' | 'all' | 'custom'>('current');
  const [pdfSelectedSongIds, setPdfSelectedSongIds] = useState<string[]>([]);
  const [pdfSongKeys, setPdfSongKeys] = useState<{ [songId: string]: string }>({});
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
  const [isArrangementLocked, setIsArrangementLocked] = useState<boolean>(false);
  const [roadmapBackup, setRoadmapBackup] = useState<RoadmapBlock[] | null>(null);
  const [nameBackup, setNameBackup] = useState<string>('');
  const [currentArrangementName, setCurrentArrangementName] = useState<string>('');
  const [expandedArrangementDates, setExpandedArrangementDates] = useState<{ [dateStr: string]: boolean }>({});
  const [syncedSheetArrangements, setSyncedSheetArrangements] = useState<any[]>([]);
  const [cloudArrangementUpdateNotice, setCloudArrangementUpdateNotice] = useState<{
    name: string;
    newRoadmap: any[];
    newKey?: string;
  } | null>(null);
  const [cloudArrangementDeletionNotice, setCloudArrangementDeletionNotice] = useState<{
    name: string;
    newSongArrangements: any[];
    allArrs: any[];
  } | null>(null);

  // Confirmation Modals states
  const [pendingArrangementToLoad, setPendingArrangementToLoad] = useState<string | null>(null);
  const [saveArrangementConfirmation, setSaveArrangementConfirmation] = useState<{
    name: string;
    isOverwrite: boolean;
    shouldPromptApplyToSetlist: boolean;
    roadmap: any[];
  } | null>(null);
  const [deleteArrangementConfirmation, setDeleteArrangementConfirmation] = useState<{
    name: string;
    isActive: boolean;
  } | null>(null);
  const [arrangementReplacementModal, setArrangementReplacementModal] = useState<{
    songId: string;
    deletedName: string;
    availablePresets: any[];
  } | null>(null);

  // Drag and Drop ordering
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);

  // Collapsed Section States
  const [sectionCollapsedStates, setSectionCollapsedStates] = useState<{ [key: number]: boolean }>({});

  // Collapsed Panel States (Family Chords, Performance Panel, Roadmap Flow)
  const [isFamilyChordsCollapsed, setIsFamilyChordsCollapsed] = useState(true);
  const [isPerformancePanelCollapsed, setIsPerformancePanelCollapsed] = useState(true);
  const [isRoadmapFlowCollapsed, setIsRoadmapFlowCollapsed] = useState(true);

  // Settings Modal pending state
  const [pendingSong, setPendingSong] = useState<Song | null>(null);
  const [pendingSetlistName, setPendingSetlistName] = useState<string>('');
  const [modalDisplayMode, setModalDisplayMode] = useState<'both' | 'chords' | 'numbers'>('both');
  const [modalShowLyrics, setModalShowLyrics] = useState(true);
  const [modalSheetLayoutMode, setModalSheetLayoutMode] = useState<'sequence' | 'compact'>('sequence');

  // Title marquee auto-scroll width detection
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);

  // Capture PWA install prompt
  useEffect(() => {
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforePrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
    };
  }, []);

  useEffect(() => {
    if (currentSong) {
      // Small timeout to allow React to paint the updated title before measuring scrollWidth
      const timer = setTimeout(() => {
        if (containerRef.current && textRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const textWidth = textRef.current.scrollWidth;
          setIsTitleOverflowing(textWidth > containerWidth);
        } else {
          setIsTitleOverflowing(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setIsTitleOverflowing(false);
    }
  }, [currentSong]);

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

  // Setlist Manager & Arrangements State
  const [isSetlistManagerOpen, setIsSetlistManagerOpen] = useState(false);
  const [activeSetlistFolder, setActiveSetlistFolder] = useState<string>('');
  const [allSharedArrangements, setAllSharedArrangements] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('cached_arrangements');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [allSharedSetlists, setAllSharedSetlists] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('cached_setlists_meta');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((row: any) => ({
            PresetName: row.Set || row.PresetName || '',
            RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
          }));
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const isSetlistLocked = (setName: string) => {
    const meta = allSharedSetlists.find((sl) => sl.PresetName === setName);
    if (!meta) return false;
    try {
      const parsed = JSON.parse(meta.RoadmapJSON);
      return !!parsed.locked;
    } catch {
      return false;
    }
  };

  const toggleSetlistLock = async (setName: string) => {
    if (!appUser || !appSecret) {
      showToast('Admin authentication required to lock/unlock setlists.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      if (!existingMeta) {
        showToast('Setlist not found.', 'error');
        return;
      }

      let songIds: string[] = [];
      let isLocked = false;
      try {
        const parsed = JSON.parse(existingMeta.RoadmapJSON);
        songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        isLocked = !!parsed.locked;
      } catch {}

      const nextLockState = !isLocked;

      const payloadMeta = {
        action: 'saveSetlist',
        name: setName,
        roadmap: { songIds, lastUpdated: Date.now(), locked: nextLockState },
      };

      const resMeta = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== 'success') {
        throw new Error(resMetaJson.message || 'Failed to update setlist lock');
      }

      showToast(`Setlist "${setName}" is now ${nextLockState ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`, 'success');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast('Error updating setlist lock status', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutoscroll = () => {
    if (!currentSong) return;
    if (!isScrollingActive) {
      const container = document.querySelector('.song-scroll-container');
      const isContainerScrollable = container && container.scrollHeight > container.clientHeight && getComputedStyle(container).overflowY !== 'visible';
      const maxScroll = isContainerScrollable
        ? container.scrollHeight - container.clientHeight 
        : document.documentElement.scrollHeight - window.innerHeight;

      if (maxScroll <= 5) {
        showToast('Entire sheet fits in view. No scrolling needed!', 'info');
        return;
      }
      setIsScrollingActive(true);
      showToast('Autoscrolling Song Sheet!', 'success');
    } else {
      setIsScrollingActive(false);
      showToast('Autoscroll Paused', 'info');
    }
  };

  const refetchArrangements = async () => {
    try {
      const [presetsRes, setlistsRes] = await Promise.all([
        fetch(`${SCRIPT_URL}?tab=Arrangements`),
        fetch(`${SCRIPT_URL}?tab=Setlists`)
      ]);
      const [presetsText, setlistsText] = await Promise.all([
        presetsRes.text(),
        setlistsRes.text()
      ]);
      
      const presetsList = JSON.parse(presetsText);
      let returnedPresets: any[] = [];
      if (Array.isArray(presetsList)) {
        returnedPresets = presetsList.map((row: any) => ({
          SongID: String(row.SongID),
          PresetName: String(row.PresetName),
          RoadmapJSON: String(row.RoadmapJSON),
        }));
        localStorage.setItem('cached_arrangements', JSON.stringify(returnedPresets));
        setAllSharedArrangements(returnedPresets);
        if (currentSong) {
          const matching = returnedPresets.filter((arr: any) => String(arr.SongID) === String(currentSong.SongID));
          setSyncedSheetArrangements(matching);
          handleBackgroundArrangementChange(matching, returnedPresets);
        }
      }

      const setlistsList = JSON.parse(setlistsText);
      let returnedSetlists: any[] = [];
      if (Array.isArray(setlistsList)) {
        returnedSetlists = setlistsList.map((row: any) => ({
          PresetName: row.Set || row.PresetName || '',
          RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
        }));
        localStorage.setItem('cached_setlists_meta', JSON.stringify(returnedSetlists));
        setAllSharedSetlists(returnedSetlists);
      }
      return { presets: returnedPresets, setlists: returnedSetlists };
    } catch (e) {
      console.warn('Error refetching arrangements and setlists', e);
      return { presets: [], setlists: [] };
    }
  };

  const saveSongToSetlist = async (setName: string) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, 'error');
      return;
    }
    if (!currentSong) return;
    setIsLoading(true);
    try {
      const capturedSettings = {
        key: currentKey,
        roadmap: activeRoadmap,
      };

      const payloadArrangement = {
        action: 'saveArrangement',
        songId: String(currentSong.SongID),
        name: `Set: ${setName}`,
        roadmap: capturedSettings,
      };

      const resArr = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadArrangement),
      });
      const resArrJson = await resArr.json();
      if (resArrJson.status !== 'success') {
        throw new Error(resArrJson.message || 'Failed to save arrangement');
      }

      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      let songIds: string[] = [];
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {}
      }

      const sId = String(currentSong.SongID);
      if (!songIds.includes(sId)) {
        songIds.push(sId);
      }

      const payloadMeta = {
        action: 'saveSetlist',
        name: setName,
        roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) },
      };

      const resMeta = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== 'success') {
        throw new Error(resMetaJson.message || 'Failed to save setlist metadata');
      }

      showToast(`Song "${currentSong.Title}" added to "${setName}" with arrangement captured!`, 'success');
      setIsSetlistManagerOpen(false);
      setCurrentTab('songs');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save to Setlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const removeSongFromSetlist = async (setName: string, songIdToRemove: string) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, 'error');
      return;
    }
    setIsLoading(true);
    try {
      const payloadDelete = {
        action: 'deleteArrangement',
        songId: songIdToRemove,
        name: `Set: ${setName}`,
      };
      await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadDelete),
      });

      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      if (existingMeta) {
        let songIds: string[] = [];
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {}

        const updatedSongIds = songIds.filter((id) => String(id) !== String(songIdToRemove));

        const payloadMeta = {
          action: 'saveSetlist',
          name: setName,
          roadmap: { songIds: updatedSongIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) },
        };

        await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payloadMeta),
        });
      }

      showToast(`Removed from Setlist: ${setName}`, 'info');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast('Error removing song from Setlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSetlistOrder = async (setName: string, updatedSongIds: string[]) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, 'error');
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: 'saveSetlist',
        name: setName,
        roadmap: { songIds: updatedSongIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) },
      };

      const resMeta = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== 'success') {
        throw new Error(resMetaJson.message || 'Failed to save setlist order');
      }

      showToast(`Setlist order updated for "${setName}"`, 'success');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast('Error updating setlist order', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const createNewSetlistFolder = async (setName: string) => {
    if (!setName.trim()) {
      showToast('Please enter a setlist name', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: 'saveSetlist',
        name: setName.trim(),
        roadmap: { songIds: [], lastUpdated: Date.now() },
      };

      const resMeta = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== 'success') {
        throw new Error(resMetaJson.message || 'Failed to create setlist folder');
      }

      showToast(`Setlist folder "${setName.trim()}" created!`, 'success');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast('Error creating setlist folder', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSetlistFolder = async (setName: string) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, 'error');
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: 'deleteSetlist',
        name: setName,
      };
      await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });

      const setPresets = allSharedArrangements.filter(
        (arr) => arr.PresetName === `Set: ${setName}`
      );

      for (const preset of setPresets) {
        const payloadDelete = {
          action: 'deleteArrangement',
          songId: String(preset.SongID),
          name: `Set: ${setName}`,
        };
        await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payloadDelete),
        });
      }

      showToast(`Setlist folder "${setName}" deleted!`, 'success');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast('Error deleting setlist folder', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const selectSongFromSetlist = async (song: Song, setName: string) => {
    setPendingSong(song);
    setPendingSetlistName(setName);
    setModalDisplayMode(displayMode);
    setModalShowLyrics(showLyrics);
    setModalSheetLayoutMode(sheetLayoutMode);
  };

  // Scroll to Top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Toast System
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);

  // Wake lock API ref
  const wakeLockRef = useRef<any>(null);

  // Derived repetition info for arrangement road map flow
  const repInfo = getRoadmapRepetitionInfo(activeRoadmap);

  // Toast trigger
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Fetch initial catalog
  const fetchCatalog = async () => {
    // Initialize arrangements and setlists from cache immediately on fetch start
    try {
      const arrCache = localStorage.getItem('cached_arrangements');
      if (arrCache) {
        setAllSharedArrangements(JSON.parse(arrCache));
      }
      const setlistsCache = localStorage.getItem('cached_setlists_meta');
      if (setlistsCache) {
        setAllSharedSetlists(JSON.parse(setlistsCache));
      }
    } catch (err) {}

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
            setAllSharedArrangements(arrList);
            if (arrVersion) localStorage.setItem('cached_arrangements_version', arrVersion);
            updatesPerformed = true;
        }
      }

      // Sync Setlists as well
      try {
        const setlistsRes = await fetch(`${SCRIPT_URL}?tab=Setlists`, { signal: controller.signal });
        const setlistsText = await setlistsRes.text();
        const setlistsList = JSON.parse(setlistsText);
        if (Array.isArray(setlistsList)) {
          const mappedSetlists = setlistsList.map((row: any) => ({
            PresetName: row.Set || row.PresetName || '',
            RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
          }));
          localStorage.setItem('cached_setlists_meta', JSON.stringify(mappedSetlists));
          setAllSharedSetlists(mappedSetlists);
        }
      } catch (e) {
        console.warn('Error syncing setlists on catalog fetch', e);
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

  const updateCapturedSettings = (id: string | number) => {
    const sId = String(id);
    try {
      const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
      const dict = JSON.parse(rawSaved);
      dict[sId] = {
        key: currentKey,
        roadmap: activeRoadmap,
      };
      localStorage.setItem('captured_song_settings', JSON.stringify(dict));
      showToast('Setlist arrangement updated successfully!', 'success');
    } catch (err) {
      console.error('Error updating captured settings:', err);
      showToast('Failed to update arrangement', 'error');
    }
  };

  // Synchronize in-memory setlist queue state from the active setlist folder
  useEffect(() => {
    if (activeSetlistFolder && allSharedSetlists.length > 0) {
      const setMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === activeSetlistFolder
      );
      if (setMeta) {
        try {
          const parsed = JSON.parse(setMeta.RoadmapJSON);
          const songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
          setSetlists(songIds);
        } catch (e) {
          console.error('Error syncing setlist queue:', e);
        }
      }
    } else if (!activeSetlistFolder) {
      setSetlists([]);
    }
  }, [activeSetlistFolder, allSharedSetlists]);

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
    const container = document.querySelector('.song-scroll-container');
    const isContainerScrollable = container && container.scrollHeight > container.clientHeight && getComputedStyle(container).overflowY !== 'visible';
    
    let exactScrollY = isContainerScrollable ? container.scrollTop : window.scrollY;
    let expectedScrollY = exactScrollY;
    let animationId: number;

    function step(currentTime: number) {
      const deltaTime = currentTime - lastFrameTime;
      const cappedDelta = Math.min(deltaTime, 50); 
      lastFrameTime = currentTime;
      
      const currentScroll = isContainerScrollable ? container.scrollTop : window.scrollY;

      if (Math.abs(currentScroll - expectedScrollY) > 2) {
        exactScrollY = currentScroll;
      }
      
      const pixelsPerSecond = scrollSpeed * 12; 
      const pixelsToScroll = (pixelsPerSecond * cappedDelta) / 1000;
      
      exactScrollY += pixelsToScroll;
      
      if (isContainerScrollable) {
        container.scrollTo({
          top: exactScrollY,
          left: 0,
          behavior: 'instant' as any
        });
      } else {
        window.scrollTo({
          top: exactScrollY,
          left: 0,
          behavior: 'instant' as any
        });
      }
      
      expectedScrollY = isContainerScrollable ? container.scrollTop : window.scrollY;
      
      const maxScroll = isContainerScrollable 
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

  // Intercept selection and show settings modal first
  const changeSong = async (song: Song) => {
    setModalDisplayMode(displayMode);
    setModalShowLyrics(showLyrics);
    setModalSheetLayoutMode(sheetLayoutMode);
    setPendingSong(song);
  };

  // Delayed collaborative cleanup execution when user clicks to resolve a deletion notice
  const handleApplyArrangementDeletion = async (
    deletedName: string,
    newSongArrangements: any[],
    allArrs: any[]
  ) => {
    if (!currentSong) return;

    // 1. Clear local cached settings to prevent state locking
    const rawSaved = localStorage.getItem('captured_song_settings');
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        if (dict[String(currentSong.SongID)]) {
          delete dict[String(currentSong.SongID)];
          localStorage.setItem('captured_song_settings', JSON.stringify(dict));
        }
      } catch (e) {}
    }

    // Also clean up from local device custom arrangements
    try {
      const localRaw = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`);
      if (localRaw) {
        const localObj = JSON.parse(localRaw);
        let deletedAny = false;
        Object.keys(localObj).forEach((k) => {
          const kBase = parsePresetDate(k).baseName.toLowerCase().trim();
          const targetBase = parsePresetDate(deletedName).baseName.toLowerCase().trim();
          if (k.toLowerCase().trim() === deletedName.toLowerCase().trim() || kBase === targetBase) {
            delete localObj[k];
            deletedAny = true;
          }
        });
        if (deletedAny) {
          localStorage.setItem(`custom_arrangements_${currentSong.SongID}`, JSON.stringify(localObj));
        }
      }
    } catch (e) {}

    // Reset on screen
    setCurrentArrangementName('');
    setCloudArrangementUpdateNotice(null);
    setCloudArrangementDeletionNotice(null);

    // Safely revert the active screen to the song's default structure
    await executeSongLoad(currentSong, true, undefined, allArrs.length > 0 ? allArrs : undefined);

    // Collect available presets remaining for this song
    const remainingPresets: any[] = [];
    newSongArrangements.forEach((arr) => {
      if (arr.PresetName.startsWith('Set: ')) return;
      try {
        const parsed = JSON.parse(arr.RoadmapJSON);
        remainingPresets.push({
          name: arr.PresetName,
          roadmap: Array.isArray(parsed) ? parsed : (parsed.roadmap || []),
          key: parsed.key || currentKey,
        });
      } catch {}
    });

    // Present the Arrangement Replacement Selection Dialog
    setArrangementReplacementModal({
      songId: String(currentSong.SongID),
      deletedName: parsePresetDate(deletedName).baseName,
      availablePresets: remainingPresets
    });

    showToast(`Cleared deleted arrangement. Reverted to default structure.`, 'info');
  };

  // Real-time collaborative band-sync check for arrangement modification or deletion
  const handleBackgroundArrangementChange = (
    newSongArrangements: any[],
    allArrs: any[]
  ) => {
    if (!currentSong || !currentArrangementName) return;

    // Do not check custom arrangement names created for sets ("Set: <SetlistName>")
    if (currentArrangementName.startsWith('Set: ')) return;

    // Find the currently active arrangement in the remote list
    const remoteArr = newSongArrangements.find(
      (a) => a.PresetName.toLowerCase().trim() === currentArrangementName.toLowerCase().trim()
    );

    if (remoteArr) {
      try {
        const parsedRemote = JSON.parse(remoteArr.RoadmapJSON);
        const remoteRoadmap = Array.isArray(parsedRemote) ? parsedRemote : (parsedRemote.roadmap || []);
        
        const remoteJSON = JSON.stringify(remoteRoadmap);
        const localJSON = JSON.stringify(activeRoadmap);
        
        if (remoteJSON !== localJSON) {
          setCloudArrangementUpdateNotice({
            name: currentArrangementName,
            newRoadmap: remoteRoadmap,
            newKey: parsedRemote.key
          });
        } else {
          setCloudArrangementUpdateNotice(null);
        }
      } catch (e) {
        console.warn('Failed to parse remote arrangement during background sync:', e);
      }
    } else {
      // 🚨 Oh! The arrangement was deleted on the cloud by a bandmate!
      // Rather than force-reloading their screen instantly, show the non-intrusive banner.
      if (!cloudArrangementDeletionNotice) {
        setCloudArrangementDeletionNotice({
          name: currentArrangementName,
          newSongArrangements,
          allArrs
        });
        showToast(`⚠️ Active arrangement "${parsePresetDate(currentArrangementName).baseName}" was deleted on the cloud.`, 'warning');
      }
    }
  };

  // Periodic Background Collaboration Sync Loop (every 15 seconds)
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      // Only sync if the browser page is currently active/visible to avoid unnecessary sheet hits
      if (document.visibilityState !== 'visible') return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const metaRes = await fetch(`${SCRIPT_URL}?tab=SyncVersion`, { signal: controller.signal });
        clearTimeout(timeoutId);

        const metaText = await metaRes.text();
        const metaData = JSON.parse(metaText);
        if (Array.isArray(metaData) && metaData.length > 0) {
          const arrRow = metaData.find(m => m.TabName === 'Arrangements');
          const remoteArrVersion = arrRow ? String(arrRow.Version || arrRow.LastUpdated || arrRow.Date || arrRow.version) : null;
          const cachedArrVersion = localStorage.getItem('cached_arrangements_version');

          const setlistsRow = metaData.find(m => m.TabName === 'Setlists');
          const remoteSetlistsVersion = setlistsRow ? String(setlistsRow.Version || setlistsRow.LastUpdated || setlistsRow.Date || setlistsRow.version) : null;
          const cachedSetlistsVersion = localStorage.getItem('cached_setlists_version') || localStorage.getItem('cached_setlists_meta_version');

          if (
            (remoteArrVersion && remoteArrVersion !== cachedArrVersion) ||
            (remoteSetlistsVersion && remoteSetlistsVersion !== cachedSetlistsVersion)
          ) {
            console.log('Background Sync: Collaborative updates detected on the cloud. Syncing...');
            const result = await refetchArrangements();
            
            if (remoteArrVersion) {
              localStorage.setItem('cached_arrangements_version', remoteArrVersion);
            }
            if (remoteSetlistsVersion) {
              localStorage.setItem('cached_setlists_version', remoteSetlistsVersion);
            }

            if (result && Array.isArray(result.presets)) {
              if (currentSong) {
                const songIdStr = String(currentSong.SongID);
                const matching = result.presets.filter((arr: any) => String(arr.SongID) === songIdStr);
                handleBackgroundArrangementChange(matching, result.presets);
              }
            }
          }
        }
      } catch (e) {
        console.debug('Background collaborative sync silent error:', e);
      }
    }, 15000);

    return () => clearInterval(syncInterval);
  }, [currentSong, currentArrangementName, activeRoadmap, currentKey]);

  // Change active selected song (actual loading execution)
  const executeSongLoad = async (
    song: Song,
    forceDefaultArrangement: boolean = false,
    activeFolderOverride?: string,
    arrsOverride?: any[]
  ) => {
    setIsLoading(true);
    setCurrentSong(song);
    setCurrentArrangementName('');
    setCloudArrangementUpdateNotice(null);
    setCloudArrangementDeletionNotice(null);

    const arrangementsToUse = arrsOverride || allSharedArrangements;

    // Look up captured settings if any exist
    const rawSaved = localStorage.getItem('captured_song_settings');
    let savedSettings: any = null;
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        savedSettings = dict[String(song.SongID)];
      } catch (e) {
        console.error('Error reading saved settings', e);
      }
    }

    // Determine if there is an active setlist folder
    const activeFolder = activeFolderOverride !== undefined ? activeFolderOverride : activeSetlistFolder;
    let setlistPresetKey = '';
    if (activeFolder && !forceDefaultArrangement) {
      const setPreset = arrangementsToUse.find(
        (arr) => String(arr.SongID) === String(song.SongID) && arr.PresetName === `Set: ${activeFolder}`
      );
      if (setPreset) {
        try {
          const settings = JSON.parse(setPreset.RoadmapJSON);
          if (settings && settings.key) {
            setlistPresetKey = settings.key;
          }
        } catch {}
      }
    }

    if (setlistPresetKey) {
      setCurrentKey(setlistPresetKey);
      setBpm(song.BPM || 120);
    } else if (savedSettings) {
      setCurrentKey(savedSettings.key || song.OriginalKey || 'C');
      setBpm(savedSettings.bpm || song.BPM || 120);
    } else {
      setCurrentKey(song.OriginalKey || 'C');
      setBpm(song.BPM || 120);
    }

    setFocusedLineId(null);
    setEditingBlockId(null);
    setIsArrangementLocked(!!activeFolder && !forceDefaultArrangement);
    setIsScrollingActive(false);
    setIsMetronomeActive(false);
    setArrangerOpen(false);
    setSectionCollapsedStates({});

    // Reset collapsible panels to collapsed by default when song loads
    setIsFamilyChordsCollapsed(true);
    setIsPerformancePanelCollapsed(true);
    setIsRoadmapFlowCollapsed(true);

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

      // Restore captured arrangement/roadmap if present in active setlist or captured settings
      let loadedCustomRoadmap = false;
      const activeFolder = activeFolderOverride !== undefined ? activeFolderOverride : activeSetlistFolder;
      if (!forceDefaultArrangement && activeFolder) {
        const setPreset = arrangementsToUse.find(
          (arr) => String(arr.SongID) === String(song.SongID) && arr.PresetName === `Set: ${activeFolder}`
        );
        if (setPreset) {
          try {
            const settings = JSON.parse(setPreset.RoadmapJSON);
            if (settings && settings.roadmap && settings.roadmap.length > 0) {
              const mappedRoadmap = settings.roadmap.map((b: any) => ({
                id: b.id,
                name: b.name,
                enabledLines: [...(b.enabledLines || [])],
                keyOffset: b.keyOffset || 0,
              }));
              setActiveRoadmap(mappedRoadmap);
              loadedCustomRoadmap = true;
              
              // Resolve the friendly arrangement name instead of "Set: <Folder>"
              let foundName = '';
              if (settings.arrangementName) {
                foundName = settings.arrangementName;
              } else {
                foundName = resolveFriendlyArrangementName(
                  song.SongID,
                  mappedRoadmap,
                  syncedSheetArrangements
                );
              }
              setCurrentArrangementName(foundName);
            }
          } catch (e) {
            console.error('Error parsing setlist arrangement inside load:', e);
          }
        }
      }

      if (!forceDefaultArrangement && !loadedCustomRoadmap) {
        const rawSavedArr = localStorage.getItem('captured_song_settings');
        if (rawSavedArr) {
          try {
            const dict = JSON.parse(rawSavedArr);
            const savedSettings = dict[String(song.SongID)];
            if (savedSettings && savedSettings.roadmap && savedSettings.roadmap.length > 0) {
              setActiveRoadmap(savedSettings.roadmap);
              loadedCustomRoadmap = true;
            }
          } catch (e) {
            console.error('Error loading captured roadmap:', e);
          }
        }
      }

      if (!loadedCustomRoadmap) {
        setActiveRoadmap(roadmap);
      }
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
          const [presetsRes, setlistsRes] = await Promise.all([
            fetch(`${SCRIPT_URL}?tab=Arrangements`, { signal: controller.signal }),
            fetch(`${SCRIPT_URL}?tab=Setlists`, { signal: controller.signal })
          ]);
          const [presetsText, setlistsText] = await Promise.all([
            presetsRes.text(),
            setlistsRes.text()
          ]);
          
          const presetsList = JSON.parse(presetsText);
          if (Array.isArray(presetsList)) {
            localStorage.setItem('cached_arrangements', JSON.stringify(presetsList));
            setAllSharedArrangements(presetsList);
            if (arrVersion) {
              localStorage.setItem('cached_arrangements_version', arrVersion);
            }
            setSyncedSheetArrangements(
              presetsList.filter((arr) => String(arr.SongID) === String(song.SongID))
            );
          }

          const setlistsList = JSON.parse(setlistsText);
          if (Array.isArray(setlistsList)) {
            const mappedSetlists = setlistsList.map((row: any) => ({
              PresetName: row.Set || row.PresetName || '',
              RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
            }));
            localStorage.setItem('cached_setlists_meta', JSON.stringify(mappedSetlists));
            setAllSharedSetlists(mappedSetlists);
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
              setAllSharedArrangements(list);
              const matchedArrangements = list.filter((arr) => String(arr.SongID) === String(song.SongID));
              setSyncedSheetArrangements(matchedArrangements);
              if (matchedArrangements.length > 0) {
                showToast('Loaded cached offline arrangement roadmap', 'info');
              }
            }
          }
          const cacheSetlistsRaw = localStorage.getItem('cached_setlists_meta');
          if (cacheSetlistsRaw) {
            const setlistsList = JSON.parse(cacheSetlistsRaw);
            if (Array.isArray(setlistsList)) {
              const mappedSetlists = setlistsList.map((row: any) => ({
                PresetName: row.Set || row.PresetName || '',
                RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
              }));
              setAllSharedSetlists(mappedSetlists);
            }
          }
          return;
        } catch (e) {}
        setSyncedSheetArrangements([]);
      }
    } catch (e: any) {
      showToast(e.message || 'Error syncing song sheets data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-resolve internal "Set: <Folder>" arrangement name to friendly preset name if roadmap matches exactly
  useEffect(() => {
    if (!currentSong || !activeRoadmap || activeRoadmap.length === 0) return;
    
    // Only resolve if currentArrangementName is empty or starts with "Set:"
    const isInternalName = !currentArrangementName || currentArrangementName.startsWith('Set:');
    if (!isInternalName) return;

    const presets = getPresets();
    for (const presetName of Object.keys(presets)) {
      if (presetName.startsWith('Set:')) continue;
      
      const presetData = presets[presetName];
      const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
      const blocksArray = isObject ? (presetData.roadmap || []) : presetData;
      
      if (!Array.isArray(blocksArray) || blocksArray.length !== activeRoadmap.length) continue;
      
      let isMatch = true;
      for (let i = 0; i < blocksArray.length; i++) {
        const b1 = blocksArray[i];
        const b2 = activeRoadmap[i];
        if (!b1 || !b2) {
          isMatch = false;
          break;
        }
        if (b1.name !== b2.name) {
          isMatch = false;
          break;
        }
        if ((b1.keyOffset || 0) !== (b2.keyOffset || 0)) {
          isMatch = false;
          break;
        }
        const el1 = b1.enabledLines || [];
        const el2 = b2.enabledLines || [];
        if (el1.length !== el2.length) {
          isMatch = false;
          break;
        }
        for (let j = 0; j < el1.length; j++) {
          if (el1[j] !== el2[j]) {
            isMatch = false;
            break;
          }
        }
      }
      
      if (isMatch) {
        // We found an exact matching custom preset! Use its original name
        setCurrentArrangementName(presetName);
        break;
      }
    }
  }, [activeRoadmap, syncedSheetArrangements, allSharedArrangements, currentSong]);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (currentSong) {
          toggleAutoscroll();
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
        if (arrangerOpen && !isArrangementLocked) {
          cancelArrangementEdit();
          return;
        }
        setIsFormModalOpen(false);
        setIsAdminModalOpen(false);
        setIsShortcutsOpen(false);
        setIsMusicianModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSong, isScrollingActive, currentKey, arrangerOpen, isArrangementLocked, roadmapBackup, nameBackup]);

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
    const doc = document as any;
    const docEl = document.documentElement as any;

    const isFullscreen = !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    if (!isFullscreen) {
      const requestFS =
        docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.msRequestFullscreen;

      if (requestFS) {
        requestFS.call(docEl).catch(() => {
          showToast('Fullscreen navigation not supported in this frame.', 'error');
        });
      } else {
        showToast('Fullscreen is not supported by your browser.', 'error');
      }
    } else {
      const exitFS =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen;

      if (exitFS) {
        exitFS.call(doc);
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
    setDraggedBlockIndex(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (isArrangementLocked) return;
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
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
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
      return;
    }
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
    const seenNormalized = new Set<string>();

    syncedSheetArrangements.forEach((p) => {
      if (p.PresetName && p.PresetName.startsWith('Set: ')) {
        return;
      }
      const norm = p.PresetName.trim().toLowerCase();
      if (seenNormalized.has(norm)) {
        return;
      }
      try {
        obj[p.PresetName] = JSON.parse(p.RoadmapJSON);
        seenNormalized.add(norm);
      } catch {
        // fail safe
      }
    });

    try {
      const local = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
      if (local) {
        const localObj = JSON.parse(local);
        Object.keys(localObj).forEach((k) => {
          const norm = k.trim().toLowerCase();
          if (!seenNormalized.has(norm)) {
            obj[k] = localObj[k];
            seenNormalized.add(norm);
          }
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
      const presetData = presets[name];
      const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
      const blocksArray = isObject ? (presetData.roadmap || []) : presetData;

      if (!Array.isArray(blocksArray)) {
        showToast('Invalid arrangement format', 'error');
        return;
      }

      setActiveRoadmap(
        blocksArray.map((b: any) => ({
          id: b.id,
          name: b.name,
          enabledLines: [...(b.enabledLines || [])],
          keyOffset: b.keyOffset || 0,
        }))
      );
      
      if (isObject && presetData.key) {
        setCurrentKey(presetData.key);
      }

      setEditingBlockId(null);
      setIsArrangementLocked(true);
      setCurrentArrangementName(name);
      showToast(`Loaded arrangement: ${name}. It is locked.`, 'success');
    }
  };

  const updateSetlistArrangementDirectly = async (
    songId: string,
    roadmap: any[],
    targetKey: string,
    optArrangementName?: string
  ) => {
    if (activeSetlistFolder && isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
      showToast('This setlist is locked by an admin. Key/arrangement applied locally only.', 'info');
      try {
        const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
        const dict = JSON.parse(rawSaved);
        dict[songId] = { key: targetKey, roadmap: roadmap, arrangementName: optArrangementName || currentArrangementName };
        localStorage.setItem('captured_song_settings', JSON.stringify(dict));
      } catch (err) {
        console.error('Error saving local fallback:', err);
      }
      return;
    }
    setIsLoading(true);
    try {
      const targetArrName = optArrangementName !== undefined ? optArrangementName : currentArrangementName;
      const capturedSettings = {
        key: targetKey,
        roadmap: roadmap,
        arrangementName: targetArrName,
      };
      
      // 1. Save to spreadsheet via POST
      const payloadArrangement = {
        action: 'saveArrangement',
        songId: songId,
        name: `Set: ${activeSetlistFolder}`,
        roadmap: capturedSettings,
      };
      
      await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadArrangement),
      });

      // 2. Add song to setlist metadata if not present
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === activeSetlistFolder
      );
      let songIds: string[] = [];
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {}
      }
      if (!songIds.includes(songId)) {
        songIds.push(songId);
      }
      const payloadMeta = {
        action: 'saveSetlist',
        name: activeSetlistFolder,
        roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder) },
      };
      await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });

      showToast(`Setlist arrangement updated in the shared catalog!`, 'success');
    } catch (err) {
      console.error('Error syncing setlist arrangement:', err);
    } finally {
      // Offline fallback & Cache update
      try {
        const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
        const dict = JSON.parse(rawSaved);
        dict[songId] = { key: targetKey, roadmap: roadmap };
        localStorage.setItem('captured_song_settings', JSON.stringify(dict));
        showToast('Saved setlist arrangement locally', 'success');
      } catch (err) {
        console.error('Error saving local fallback:', err);
      }
      
      // Refetch shared arrangements and setlists to keep state in sync
      try {
        await refetchArrangements();
      } catch (e) {
        console.warn('Failed to refetch arrangements', e);
      }
      setIsLoading(false);
    }
  };

  const executeSaveArrangement = async (name: string, shouldApplyToSetlist: boolean, roadmapToSave: any[]) => {
    setIsLoading(true);
    try {
      const payload = {
        action: 'saveArrangement',
        songId: String(currentSong?.SongID),
        name: name,
        roadmap: roadmapToSave,
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

      if (shouldApplyToSetlist && activeSetlistFolder && currentSong) {
        if (isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
          const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
          const dict = JSON.parse(rawSaved);
          dict[String(currentSong.SongID)] = { key: currentKey, roadmap: roadmapToSave, arrangementName: name };
          localStorage.setItem('captured_song_settings', JSON.stringify(dict));
          showToast(`This setlist is locked by an admin. Your arrangement changes are saved locally only.`, 'info');
        } else {
          const capturedSettings = {
            key: currentKey,
            roadmap: roadmapToSave,
            arrangementName: name,
          };
          const payloadArrangement = {
            action: 'saveArrangement',
            songId: String(currentSong.SongID),
            name: `Set: ${activeSetlistFolder}`,
            roadmap: capturedSettings,
          };
          await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadArrangement),
          });

          const existingMeta = allSharedSetlists.find(
            (sl) => sl.PresetName === activeSetlistFolder
          );
          let songIds: string[] = [];
          if (existingMeta) {
            try {
              const parsed = JSON.parse(existingMeta.RoadmapJSON);
              songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
            } catch {}
          }
          const sId = String(currentSong.SongID);
          if (!songIds.includes(sId)) {
            songIds.push(sId);
          }
          const payloadMeta = {
            action: 'saveSetlist',
            name: activeSetlistFolder,
            roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder) },
          };
          await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadMeta),
          });

          showToast(`Successfully loaded arrangement to active setlist: ${activeSetlistFolder}`, 'success');
        }
      }
    } catch {
      // offline fallback - write only local-only presets to custom_arrangements_${currentSong?.SongID}
      let localObj: { [key: string]: any } = {};
      try {
        const localRaw = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (localRaw) {
          localObj = JSON.parse(localRaw);
        }
      } catch {}
      localObj[name] = roadmapToSave;
      localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(localObj));
      showToast(`Saved locally on this device as "${name}"`, 'success');

      if (shouldApplyToSetlist && currentSong) {
        const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
        const dict = JSON.parse(rawSaved);
        dict[String(currentSong.SongID)] = { key: currentKey, roadmap: roadmapToSave, arrangementName: name };
        localStorage.setItem('captured_song_settings', JSON.stringify(dict));
        showToast(`Loaded arrangement to active setlist locally on this device`, 'success');
      }
    } finally {
      // Capture backups before clearing
      const cachedBackupRoadmap = roadmapBackup;
      const cachedBackupName = nameBackup;

      setIsArrangementLocked(true);
      setRoadmapBackup(null);
      setNameBackup('');
      
      let latestArrs: any[] = [];
      try {
        const fetched = await refetchArrangements();
        latestArrs = fetched?.presets || [];
      } catch (e) {
        console.warn('Failed to refetch arrangements:', e);
      }

      if (!shouldApplyToSetlist && activeSetlistFolder && currentSong) {
        // Since user clicked "Keep Original" (meaning shouldApplyToSetlist is false and we are inside a setlist context),
        // we must restore/reload the original setlist arrangement on screen.
        if (cachedBackupRoadmap !== null) {
          setActiveRoadmap(cachedBackupRoadmap);
          setCurrentArrangementName(cachedBackupName || '');
          showToast(`Setlist arrangement kept intact and restored on screen.`, 'info');
        } else {
          await executeSongLoad(currentSong, false, undefined, latestArrs.length > 0 ? latestArrs : undefined);
          showToast(`Setlist arrangement kept intact and restored on screen.`, 'info');
        }
      } else {
        // Otherwise (or if there's no active setlist folder), keep the saved arrangement active on screen
        setCurrentArrangementName(name);
      }
      setIsLoading(false);
    }
  };

  const savePresetArrangement = async () => {
    let name = currentArrangementName.trim().toUpperCase();
    if (!name) {
      showToast('Please enter an arrangement preset name first', 'error');
      return;
    }

    // Clean up "Set: " prefix if present
    if (name.startsWith('SET: ')) {
      name = name.slice(5);
    }
    if (name.startsWith('Set: ')) {
      name = name.slice(5);
    }
    
    // Clean up any existing date suffix from the name before appending the new one
    const { baseName } = parsePresetDate(name);
    const enteredBaseName = baseName.toUpperCase();

    const months = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    const d = new Date();
    const monthName = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const dateStr = `${monthName}-${day}-${year}`;

    const newFullName = `${enteredBaseName} (${dateStr})`;

    const presets = getPresets();
    
    // Find if there is an existing preset with the same base name (ignoring date suffix)
    const existingPresetKey = Object.keys(presets).find(k => {
      const { baseName: pBase } = parsePresetDate(k);
      return pBase.toUpperCase() === enteredBaseName;
    });

    const isModifyingExisting = !!existingPresetKey;

    if (isModifyingExisting) {
      // Modifying an existing arrangement: Ask user to confirm
      setSaveArrangementConfirmation({
        name: newFullName,
        oldName: existingPresetKey,
        isOverwrite: true,
        shouldPromptApplyToSetlist: false,
        roadmap: activeRoadmap,
      });
    } else {
      // New arrangement
      const shouldPromptApplyToSetlist = !!activeSetlistFolder && !!currentSong;
      if (shouldPromptApplyToSetlist) {
        // Prompt options: load to current setlist or keep original & just save
        setSaveArrangementConfirmation({
          name: newFullName,
          isOverwrite: false,
          shouldPromptApplyToSetlist: true,
          roadmap: activeRoadmap,
        });
      } else {
        await executeSaveArrangement(newFullName, false, activeRoadmap);
      }
    }
  };

  const cancelArrangementEdit = () => {
    if (roadmapBackup !== null) {
      setActiveRoadmap(roadmapBackup);
      setRoadmapBackup(null);
    }
    if (nameBackup !== '') {
      setCurrentArrangementName(nameBackup);
      setNameBackup('');
    }
    setIsArrangementLocked(true);
    showToast('Cancelled editing. Reverted changes.', 'info');
  };

  const deletePresetArrangement = async (name: string, isCurrentlyActive: boolean) => {
    setIsLoading(true);
    const { baseName } = parsePresetDate(name);
    try {
      // 1. Clear local memory/cache capturing this arrangement
      const rawSaved = localStorage.getItem('captured_song_settings');
      if (rawSaved) {
        try {
          const dict = JSON.parse(rawSaved);
          if (dict[String(currentSong?.SongID)]) {
            delete dict[String(currentSong?.SongID)];
            localStorage.setItem('captured_song_settings', JSON.stringify(dict));
          }
        } catch (e) {}
      }

      // 2. Clear current arrangement name if it is active
      if (isCurrentlyActive) {
        setCurrentArrangementName('');
      }

      // 3. Delete the arrangement from the cloud database
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
        showToast(`Deleted from shared library: ${baseName}`, 'info');
      } else {
        throw new Error();
      }
    } catch {
      showToast(`Could not delete from cloud, but cleaning up locally.`, 'info');
    } finally {
      // Always delete from the local-only storage to avoid locking it locally!
      try {
        const localRaw = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (localRaw) {
          const localObj = JSON.parse(localRaw);
          let deletedAny = false;
          Object.keys(localObj).forEach((k) => {
            // Case-insensitive/base-name match to completely clean up duplicate casings
            const kBase = parsePresetDate(k).baseName.toLowerCase().trim();
            const targetBase = baseName.toLowerCase().trim();
            if (k.toLowerCase().trim() === name.toLowerCase().trim() || kBase === targetBase) {
              delete localObj[k];
              deletedAny = true;
            }
          });
          if (deletedAny) {
            localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(localObj));
          }
        }
      } catch (e) {
        console.warn('Failed to clean local custom_arrangements:', e);
      }

      // 4. If active and inside a setlist context, delete the setlist-specific arrangement from db
      if (isCurrentlyActive && activeSetlistFolder && currentSong) {
        try {
          const payloadSet = {
            action: 'deleteArrangement',
            songId: String(currentSong.SongID),
            name: `Set: ${activeSetlistFolder}`,
          };
          await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadSet),
          });
        } catch (e) {
          console.warn("Failed to delete setlist mapping:", e);
        }
      }

      // 5. Refetch shared catalog
      let latestArrs: any[] = [];
      try {
        const fetched = await refetchArrangements();
        latestArrs = fetched?.presets || [];
      } catch (e) {
        console.warn('Failed to refetch arrangements:', e);
      }

      // 6. Trigger Replacement Modal if it was currently active
      if (isCurrentlyActive && currentSong) {
        const presets = getPresets();
        const remainingKeys = Object.keys(presets).filter((k) => !k.startsWith('Set:'));
        const availableList = remainingKeys.map((k) => {
          const p = presets[k];
          return {
            name: k,
            roadmap: Array.isArray(p) ? p : (p.roadmap || []),
            key: p.key || currentKey
          };
        });

        // Load default arrangement on screen
        await executeSongLoad(currentSong, true, undefined, latestArrs.length > 0 ? latestArrs : undefined);

        setArrangementReplacementModal({
          songId: String(currentSong.SongID),
          deletedName: baseName,
          availablePresets: availableList
        });
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
      toggleAutoscroll();
    }
    setIsNavOpen(false);
  };

  // Diatonic Chords HTML parser
  const renderFamilyChordsList = (simplified = false) => {
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
        {!simplified && (
          <span className="text-[10px] sm:text-xs text-indigo-400 uppercase tracking-widest font-extrabold flex-shrink-0 select-none drop-shadow-sm">
            Family Chords:
          </span>
        )}
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

  // Helper to dynamically compile roadmap, templates, and key for any song
  const getSongPreviewData = (song: Song) => {
    let filteredLines: SongLine[] = [];
    try {
      const rawLines = localStorage.getItem('cached_song_lines');
      if (rawLines) {
        const allLines = JSON.parse(rawLines);
        if (Array.isArray(allLines)) {
          filteredLines = allLines.filter(
            (line: any) => line && String(line.SongID) === String(song.SongID)
          );
        }
      }
    } catch (e) {
      console.warn("Error reading cached song lines:", e);
    }

    if (filteredLines.length === 0) {
      filteredLines = FALLBACK_SONG_LINES.filter(
        (line) => line && String(line.SongID) === String(song.SongID)
      );
    }

    // Build templates
    const templates: { [key: string]: SongLine[] } = {};
    filteredLines.forEach((l) => {
      const secName = l.SectionName || l.Section || l.section || 'Section';
      if (!templates[secName]) {
        templates[secName] = [];
      }
      templates[secName].push(l);
    });

    // Resolve key & roadmap
    let activeKey = song.OriginalKey || 'C';
    let activeRoadmapToUse: RoadmapBlock[] = [];

    // Initialize standard roadmap
    let lastSec = '';
    let blockIdCounter = 0;
    const standardRoadmap: RoadmapBlock[] = [];
    filteredLines.forEach((l) => {
      const secName = l.SectionName || l.Section || l.section || 'Section';
      if (secName !== lastSec) {
        const lineIndices = Array.from(
          { length: templates[secName].length },
          (_, idx) => idx
        );
        standardRoadmap.push({
          id: `block-${blockIdCounter++}`,
          name: secName,
          enabledLines: lineIndices,
          keyOffset: 0,
        });
        lastSec = secName;
      }
    });

    activeRoadmapToUse = standardRoadmap;

    // Read saved settings
    const rawSaved = localStorage.getItem('captured_song_settings');
    let savedSettings: any = null;
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        savedSettings = dict[String(song.SongID)];
      } catch {}
    }

    if (savedSettings) {
      activeKey = savedSettings.key || song.OriginalKey || 'C';
      if (savedSettings.roadmap && savedSettings.roadmap.length > 0) {
        activeRoadmapToUse = savedSettings.roadmap;
      }
    }

    // Active setlist arrangement override
    if (activeSetlistFolder) {
      const setPreset = allSharedArrangements.find(
        (arr) => String(arr.SongID) === String(song.SongID) && arr.PresetName === `Set: ${activeSetlistFolder}`
      );
      if (setPreset) {
        try {
          const settings = JSON.parse(setPreset.RoadmapJSON);
          if (settings) {
            if (settings.key) {
              activeKey = settings.key;
            }
            if (settings.roadmap && settings.roadmap.length > 0) {
              activeRoadmapToUse = settings.roadmap.map((b: any) => ({
                id: b.id,
                name: b.name,
                enabledLines: [...(b.enabledLines || [])],
                keyOffset: b.keyOffset || 0,
              }));
            }
          }
        } catch {}
      }
    }

    // Use current interactive adjustments if it's the currently viewed song
    if (currentSong && String(song.SongID) === String(currentSong.SongID)) {
      activeKey = currentKey;
      activeRoadmapToUse = activeRoadmap;
    }

    // PDF specific song-key override
    if (pdfSongKeys[String(song.SongID)]) {
      activeKey = pdfSongKeys[String(song.SongID)];
    }

    return {
      key: activeKey,
      roadmap: activeRoadmapToUse,
      sectionTemplates: templates,
      title: (song.Title || "Untitled").toUpperCase(),
      artist: (song.Artist || "Unknown Artist").toUpperCase(),
      song,
    };
  };

  // Export selected Sheet View(s) to a perfectly formatted printable PDF layout
  const exportToPDF = () => {
    if (!currentSong) return;

    // Resolve which songs are to be printed
    const isInsideSetlistContext = !!activeSetlistFolder && setlists.length > 1;
    let songsToPrint: any[] = [];

    if (!isInsideSetlistContext || pdfScope === 'current') {
      songsToPrint = [getSongPreviewData(currentSong)];
    } else if (pdfScope === 'all') {
      const resolvedSetSongs = setlists
        .map((id) => songs.find((s) => String(s.SongID) === String(id)))
        .filter((s): s is Song => !!s);
      songsToPrint = resolvedSetSongs.map(s => getSongPreviewData(s));
    } else if (pdfScope === 'custom') {
      const resolvedSetSongs = setlists
        .map((id) => songs.find((s) => String(s.SongID) === String(id)))
        .filter((s): s is Song => !!s);
      songsToPrint = resolvedSetSongs
        .filter(s => pdfSelectedSongIds.includes(String(s.SongID)))
        .map(s => getSongPreviewData(s));
    } else {
      songsToPrint = [getSongPreviewData(currentSong)];
    }

    if (songsToPrint.length === 0) {
      showToast("No songs selected to export", "error");
      return;
    }

    // Set page title as the single song title or the setlist title
    const docTitle = songsToPrint.length === 1 
      ? `${songsToPrint[0].title} - ${songsToPrint[0].artist}`
      : `${activeSetlistFolder.toUpperCase()} SETLIST BOOKLET`;

    let bodyHTML = "";

    songsToPrint.forEach((songData, sIdx) => {
      const { key: songKey, roadmap: songRoadmap, sectionTemplates: songTemplates, title, artist, song } = songData;

      // Build Flow Roadmap (Sequenced Transposed Horizontal, CAPS LOCK ALL)
      const roadmapFiltered = songRoadmap.filter((block: any, idx: number) => {
        const isDuplicate = songRoadmap.findIndex((b: any, bIdx: number) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates)) !== -1;
        return !isDuplicate;
      });
      const roadmapParts = roadmapFiltered.map((block: any) => {
        const blockOffset = block.keyOffset || 0;
        const blockKeyName = getModulatedKeyName(songKey, blockOffset);
        return `${block.name.toUpperCase()} (${blockKeyName.toUpperCase()})`;
      });
      const roadmapHorizontal = roadmapParts.join(" ➔ ");

      // Assemble Sections for this song
      let sheetHTML = "";
      const repInfo = getRoadmapRepetitionInfo(songRoadmap);

      songRoadmap.forEach((block: any, idx: number) => {
        let blockDisplayName = block.name;

        // Check if this block is an entirely identical repetition of a PREVIOUS block in the flow
        if (sheetLayoutMode === 'sequence') {
          const firstIdenticalIdx = songRoadmap.findIndex((b: any, bIdx: number) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates));
          if (firstIdenticalIdx !== -1) {
            sheetHTML += `
              <div class="print-section-repeat" style="padding: 6px 10px; margin-bottom: 8px; border: 1px dashed rgba(99,102,241,0.3); border-radius: 8px; background-color: rgba(99,102,241,0.03); font-size: 10px; color: #4f46e5; font-weight: bold; display: flex; align-items: center; gap: 6px; page-break-inside: avoid;">
                <span>🔁 REPLAY: ${block.name.toUpperCase()}</span>
                <span style="font-size: 8.5px; font-weight: normal; color: #64748b; margin-left: 4px;">(Identical chords & lyrics as Section #${firstIdenticalIdx + 1} - ${songRoadmap[firstIdenticalIdx].name})</span>
              </div>
            `;
            return; // Skip rendering full chords and lyrics for this duplicate
          }
        }

        // Match the app's exact compact mode skipping logic
        if (sheetLayoutMode === 'compact') {
          if (!showLyrics) {
            const firstIdx = songRoadmap.findIndex((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
            if (firstIdx !== idx) return;
            const identicalBlocks = songRoadmap.filter((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
            const uniqueNames = Array.from(new Set(identicalBlocks.map((b: any) => b.name)));
            blockDisplayName = uniqueNames.join(' / ');
          } else {
            const firstIdx = songRoadmap.findIndex((b: any) => b.name === block.name);
            if (firstIdx !== idx) return;
          }
        }

        const blockRep = repInfo[idx];
        const templateLines = songTemplates[block.name] || [];
        const blockOffset = block.keyOffset || 0;
        const blockKeyName = getModulatedKeyName(songKey, blockOffset);

        const originalIdx = NOTE_TO_INDEX[song.OriginalKey || 'C'] || 0;
        const currentIdx = NOTE_TO_INDEX[songKey] || 0;
        const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

        sheetHTML += `
          <div class="print-section">
            <h3 class="print-section-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <span>${blockDisplayName.toUpperCase()} ${blockOffset !== 0 ? `(KEY: ${blockKeyName.toUpperCase()})` : ''}</span>
              ${blockRep && blockRep.totalInRun > 1 ? `
                <span class="print-run-badge" style="margin-left: auto;">${blockRep.totalInRun}X</span>
              ` : ''}
            </h3>
            <div class="print-lines">
        `;

        if (!showLyrics) {
          if (sheetLayoutMode === 'compact') {
            const identicalBlocks = songRoadmap.filter((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
            const renderedHints: any[] = [];
            const seenNames = new Set();
            
            identicalBlocks.forEach((b: any) => {
              if (seenNames.has(b.name)) return;
              seenNames.add(b.name);
              const lines = songTemplates[b.name] || [];
              const firstLyric = lines.find((l: any) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
              if (firstLyric) {
                renderedHints.push({ name: b.name, lyric: firstLyric });
              }
            });

            // Group by lyric
            const groups: { lyric: string; names: string[] }[] = [];
            renderedHints.forEach(h => {
              const normLyric = h.lyric.trim();
              const existingGroup = groups.find(g => g.lyric.trim().toLowerCase() === normLyric.toLowerCase());
              if (existingGroup) {
                existingGroup.names.push(h.name);
              } else {
                groups.push({ lyric: h.lyric, names: [h.name] });
              }
            });

            if (groups.length > 0) {
              sheetHTML += `<div class="print-hint-container">`;
              groups.forEach(g => {
                const badgeText = g.names.map(n => n.toUpperCase()).join(' & ');
                const labelSuffix = g.names.length > 1 ? ` <span style="font-size: 8px; opacity: 0.6; font-weight: normal; margin-left: 4px;">(Shared first line for ${g.names.length} sections)</span>` : '';
                sheetHTML += `
                  <div class="print-hint-line">
                    <span class="print-hint-badge">${badgeText}</span>
                    <span class="print-hint-text">“${g.lyric}”${labelSuffix}</span>
                  </div>
                `;
              });
              sheetHTML += `</div>`;
            }
          } else {
            const lines = songTemplates[block.name] || [];
            const firstLyric = lines.find((l: any) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
            if (firstLyric) {
              sheetHTML += `
                <div class="print-hint-container">
                  <div class="print-hint-line">
                    <span class="print-hint-badge">${block.name.toUpperCase()}</span>
                    <span class="print-hint-text">“${firstLyric}”</span>
                  </div>
                </div>
              `;
            }
          }
        }

        // Get only enabled lines for this block
        const enabledLinesList = templateLines
          .map((l: any, lIdx: number) => ({ l, lIdx }))
          .filter(({ lIdx }: any) => (block.enabledLines || []).includes(lIdx));

        const processedLines = enabledLinesList.map(({ l, lIdx }: any) => {
          const transposed = transposeChord(l.Chords || '', totalSemitonesOffset);
          const numbers = getNumberForChord(transposed, blockKeyName, songKey);
          const lyrics = l.Lyrics || '';
          return {
            l,
            lIdx,
            transposed,
            numbers,
            lyrics,
          };
        });

        // Find the best multi-line chord progression loop (pattern length L, repeat count K)
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
                if (bestL === -1 || (K * L > bestK * bestL) || (K * L === bestK * bestL && L < bestL)) {
                  bestL = L;
                  bestK = K;
                }
              }
            }
          }
        }

        // Render with Loop-Grouping if a pattern is detected
        if (bestL >= 2 && bestK >= 2) {
          const loopLength = bestL;
          const repeatCount = bestK;
          const loopedLinesCount = loopLength * repeatCount;

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

          if (lyricsAreIdenticalOrHidden) {
            const runLines = processedLines.slice(0, loopLength);
            sheetHTML += `
              <div class="print-loop-container print-loop-amber">
                <div class="print-loop-badge-row">
                  <span class="print-loop-badge">🔁 PLAY ${repeatCount}X</span>
                  <span class="print-loop-subtitle">(chords progression repeats)</span>
                </div>
                <div class="print-loop-lines">
            `;
            runLines.forEach((lineData) => {
              const { transposed, numbers, lyrics } = lineData;
              sheetHTML += `<div class="print-line">`;
              if (displayMode !== 'numbers' && transposed) {
                sheetHTML += `<div class="print-chord-line">${transposed}</div>`;
              }
              if (displayMode !== 'chords' && numbers) {
                sheetHTML += `<div class="print-num-line">${numbers}</div>`;
              }
              if (showLyrics && lyrics) {
                sheetHTML += `<div class="print-lyric-line">${lyrics}</div>`;
              }
              sheetHTML += `</div>`;
            });
            sheetHTML += `
                </div>
              </div>
            `;
          } else {
            for (let r = 0; r < repeatCount; r++) {
              const runLines = processedLines.slice(r * loopLength, (r + 1) * loopLength);
              const isFirst = (r === 0);
              sheetHTML += `
                <div class="print-loop-container print-loop-indigo">
                  <div class="print-loop-badge-row">
                    ${isFirst ? `
                      <span class="print-loop-badge" style="background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a;">🔁 CHORD LOOP (${repeatCount}X) — ROUND 1</span>
                      <span class="print-loop-subtitle">(chords progression pattern repeats)</span>
                    ` : `
                      <span class="print-loop-badge" style="background-color: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;">🔁 ROUND ${r + 1}</span>
                      <span class="print-loop-subtitle">(identical chords as Round 1)</span>
                    `}
                  </div>
                  <div class="print-loop-lines">
              `;
              runLines.forEach((lineData) => {
                const { transposed, numbers, lyrics } = lineData;
                sheetHTML += `<div class="print-line">`;
                if (displayMode !== 'numbers' && transposed) {
                  sheetHTML += `<div class="print-chord-line">${transposed}</div>`;
                }
                if (displayMode !== 'chords' && numbers) {
                  sheetHTML += `<div class="print-num-line">${numbers}</div>`;
                }
                if (showLyrics && lyrics) {
                  sheetHTML += `<div class="print-lyric-line">${lyrics}</div>`;
                }
                sheetHTML += `</div>`;
              });
              sheetHTML += `
                  </div>
                </div>
              `;
            }
          }

          const remainingLines = processedLines.slice(loopedLinesCount);
          if (remainingLines.length > 0) {
            sheetHTML += `<div class="print-remaining-lines">`;
            remainingLines.forEach((lineData) => {
              const { transposed, numbers, lyrics } = lineData;
              sheetHTML += `<div class="print-line">`;
              if (displayMode !== 'numbers' && transposed) {
                sheetHTML += `<div class="print-chord-line">${transposed}</div>`;
              }
              if (displayMode !== 'chords' && numbers) {
                sheetHTML += `<div class="print-num-line">${numbers}</div>`;
              }
              if (showLyrics && lyrics) {
                sheetHTML += `<div class="print-lyric-line">${lyrics}</div>`;
              }
              sheetHTML += `</div>`;
            });
            sheetHTML += `</div>`;
          }
        } else {
          // Fallback: Compute consecutive runs of identical lines
          const lineRuns: { startIndex: number; endIndex: number; count: number }[] = [];
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

          lineRuns.forEach((run) => {
            const firstLine = processedLines[run.startIndex];
            const { transposed, numbers, lyrics } = firstLine;

            sheetHTML += `<div class="print-line">`;
            if (displayMode !== 'numbers' && transposed) {
              sheetHTML += `
                <div class="print-chord-line" style="display: flex; align-items: center; gap: 8px;">
                  <span>${transposed}</span>
                  ${run.count > 1 ? `
                    <span class="print-run-badge">${run.count}x</span>
                  ` : ''}
                </div>
              `;
            }
            if (displayMode !== 'chords' && numbers) {
              sheetHTML += `
                <div class="print-num-line">${numbers}</div>
              `;
            }
            if (showLyrics && lyrics) {
              sheetHTML += `
                <div class="print-lyric-line">${lyrics}</div>
              `;
            }
            sheetHTML += `</div>`;
          });
        }

        sheetHTML += `
            </div>
          </div>
        `;
      });

      bodyHTML += `
        <div class="print-song-page">
          <div class="header-container">
            <div class="title-row">
              <div>
                <h1 class="song-title">
                  ${isInsideSetlistContext && pdfScope !== 'current' ? `<span class="song-index-badge">#${setlists.indexOf(String(song.SongID)) + 1}</span> ` : ''}
                  ${title}
                </h1>
                <h2 class="song-artist">BY ${artist}</h2>
              </div>
              <div class="song-key">${`KEY: ${songKey}`.toUpperCase()}</div>
            </div>
          </div>

          <div class="roadmap-container">
            <div class="roadmap-title">FLOW ROADMAP (TRANSPOSED SEQUENCE)</div>
            <div class="roadmap-sequence">${roadmapHorizontal}</div>
          </div>

          <div class="sheet-body">
            ${sheetHTML}
          </div>
        </div>
      `;
    });

    // Mount Hidden Print IFrame
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.bottom = '0';
    iframe.style.right = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 15mm 15mm 15mm 15mm;
            }
            body {
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-song-page {
              page-break-after: always;
              break-after: page;
            }
            .print-song-page:last-child {
              page-break-after: avoid;
              break-after: avoid;
            }
            .header-container {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 16px;
            }
            .title-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .song-title {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              margin: 0;
              letter-spacing: -0.5px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .song-index-badge {
              font-size: 13px;
              background-color: #0f172a;
              color: #ffffff;
              padding: 2px 6px;
              border-radius: 4px;
              font-weight: 900;
            }
            .song-artist {
              font-size: 11px;
              font-weight: 700;
              color: #475569;
              margin: 2px 0 0 0;
            }
            .song-key {
              font-size: 12px;
              font-weight: 900;
              color: #4f46e5;
              border: 1.5px solid #4f46e5;
              padding: 4px 10px;
              border-radius: 6px;
              font-family: monospace;
              letter-spacing: 0.5px;
            }
            .roadmap-container {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 10px 12px;
              margin-bottom: 20px;
            }
            .roadmap-title {
              font-size: 9px;
              font-weight: 900;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              margin-bottom: 4px;
            }
            .roadmap-sequence {
              font-size: 10px;
              font-weight: 700;
              color: #1e293b;
              line-height: 1.4;
            }
            .print-section {
              margin-bottom: 18px;
              break-inside: avoid;
            }
            .print-section-header {
              font-size: 12px;
              font-weight: 900;
              color: #1e1b4b;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 3px;
              margin-top: 0;
              margin-bottom: 10px;
              letter-spacing: 0.5px;
            }
            .print-lines {
              padding-left: 8px;
            }
            .print-line {
              margin-bottom: 10px;
              break-inside: avoid;
            }
            .print-chord-line {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              font-weight: bold;
              color: #4f46e5;
              white-space: pre;
              line-height: 1.1;
              margin-bottom: 1.5px;
            }
            .print-num-line {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10px;
              font-weight: bold;
              color: #64748b;
              white-space: pre;
              line-height: 1.1;
              margin-bottom: 1.5px;
            }
            .print-lyric-line {
              font-size: 11px;
              color: #334155;
              line-height: 1.35;
            }
            .print-hint-container {
              margin-bottom: 8px;
              padding: 4px 6px;
              background-color: #f1f5f9;
              border-left: 2px solid #6366f1;
              border-radius: 0 4px 4px 0;
            }
            .print-hint-line {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 10px;
              font-style: italic;
              color: #475569;
              line-height: 1.3;
            }
            .print-hint-badge {
              font-size: 8px;
              font-weight: 900;
              font-style: normal;
              color: #4f46e5;
              background-color: #e0e7ff;
              padding: 1px 4px;
              border-radius: 3px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .print-hint-text {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .print-loop-container {
              border-left: 3px solid #cbd5e1;
              padding: 6px 10px;
              border-radius: 0 6px 6px 0;
              margin: 10px 0;
              break-inside: avoid;
            }
            .print-loop-amber {
              border-left-color: #f59e0b;
              background-color: #fffbeb;
            }
            .print-loop-indigo {
              border-left-color: #6366f1;
              background-color: #f5f3ff;
            }
            .print-loop-badge-row {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 6px;
            }
            .print-loop-badge {
              font-size: 8px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 2px 6px;
              border-radius: 4px;
            }
            .print-loop-amber .print-loop-badge {
              background-color: #fef3c7;
              color: #b45309;
              border: 1px solid #fde68a;
            }
            .print-loop-indigo .print-loop-badge {
              background-color: #e0e7ff;
              color: #4338ca;
              border: 1px solid #c7d2fe;
            }
            .print-loop-subtitle {
              font-size: 8px;
              color: #64748b;
              font-family: monospace;
            }
            .print-loop-lines {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .print-run-badge {
              font-size: 8px;
              font-weight: 900;
              color: #b45309;
              background-color: #fef3c7;
              border: 1px solid #fde68a;
              padding: 1px 4px;
              border-radius: 3px;
              font-family: monospace;
            }
            .print-remaining-lines {
              margin-top: 10px;
              border-top: 1px dashed #cbd5e1;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="sheet-body-container">
            ${bodyHTML}
          </div>

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() {
                window.frameElement.parentNode.removeChild(window.frameElement);
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();
  };

  // Export Complete User Manual to PDF Layout
  const exportManualToPDF = () => {
    const docTitle = "ChordSheet Live Flow - Complete User Guide & Stage Manual";

    const bodyHTML = `
      <div class="print-song-page">
        <div class="header-container" style="border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 24px;">
          <div class="title-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div>
              <h1 class="song-title" style="font-size: 24px; font-weight: 900; color: #1e1b4b; margin: 0; letter-spacing: -1.5px; display: flex; align-items: center; gap: 8px;">
                🎸 CHORDSHEET LIVE FLOW
              </h1>
              <h2 class="song-artist" style="font-size: 11px; font-weight: 700; color: #4f46e5; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
                Complete Stage Manual & Technical Guide
              </h2>
            </div>
            <div class="song-key" style="font-size: 10px; font-weight: 900; color: #4f46e5; border: 1.5px solid #4f46e5; padding: 4px 10px; border-radius: 6px; font-family: monospace; letter-spacing: 0.5px;">
              VERSION 2.1
            </div>
          </div>
        </div>

        <div style="margin-bottom: 24px; font-size: 12px; line-height: 1.6; color: #334155;">
          <p style="font-size: 13px; font-weight: bold; color: #0f172a; margin-bottom: 6px;">Welcome to Worship Chordbook - ChordSheet Live Flow!</p>
          <p>This manual provides complete documentation on operating, configuring, and installing this interactive digital music stand. ChordSheet Live Flow is designed for live stage musicians, worship leaders, and music directors seeking dynamic transposing, automatic scrolling, setlist mapping, and robust offline capability.</p>
        </div>

        <div class="print-section" style="margin-bottom: 18px; break-inside: avoid;">
          <h3 class="print-section-header" style="font-size: 13px; font-weight: 900; color: #1e1b4b; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 10px; letter-spacing: 0.5px; text-transform: uppercase;">
            1. Core Functional Component Manual
          </h3>
          <div style="font-size: 11px; line-height: 1.6; color: #334155; padding-left: 8px;">
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">🔄 Dynamic Transposition & Musical Keys</strong>
              <span>Our transposition engine supports full 12-key modulation. Change the key of any song on the fly using the transposition buttons in the control bar. The chords will re-transpose instantly across all sections of your active arrangement, including inline repeats.</span>
            </div>
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">⏱️ Advanced Metronome & Speed Controllers</strong>
              <span>Includes an interactive metronome with speed tap tempo. Adjust target BPM via manual step or by clicking the TAP button to sync immediately. The visual flash indicator stays aligned with your active beat, supporting dual-channel tempo monitoring on stage.</span>
            </div>
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">📜 Smart Auto-Scroll with Speed Tracking</strong>
              <span>Activate hands-free autoscrolling during live sets. Speed parameters adapt dynamically based on your screen height and scrolling speed. Seamlessly start, pause, or reset with standard foot pedals or touchscreen taps.</span>
            </div>
          </div>
        </div>

        <div class="print-section" style="margin-bottom: 18px; break-inside: avoid; page-break-before: always; break-before: page;">
          <h3 class="print-section-header" style="font-size: 13px; font-weight: 900; color: #1e1b4b; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 10px; letter-spacing: 0.5px; text-transform: uppercase;">
            2. Interactive Visual Helpers & Diagnostics
          </h3>
          <div style="font-size: 11px; line-height: 1.6; color: #334155; padding-left: 8px;">
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">🎹 Interactive Piano Keyboards & Guitar Fretboards</strong>
              <span>Tap on any chord name inside a sheet section to display its direct finger-placements on our live virtual instrument helper. Interactive diagrams show exact fingering on the keyboard and fretboard.</span>
            </div>
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">⚡ Live Setlist Organizers & Custom Preset Drafting</strong>
              <span>Create setlists, sequence songs in your performance order, and map customized structures. You can drag and drop to re-sequence songs inside any folder, modify chord arrangements, and save presets permanently to local cache and synchronized database registers.</span>
            </div>
            <div style="margin-bottom: 10px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">🩺 Local Real-Time Database Diagnostics</strong>
              <span>Review network latency, sync status, and storage performance directly. The Diagnostic panel provides detailed readouts of the sync payload, active Google Sheets cells, and offline cache integrity.</span>
            </div>
          </div>
        </div>

        <div class="print-section" style="margin-bottom: 18px; break-inside: avoid; page-break-before: always; break-before: page;">
          <h3 class="print-section-header" style="font-size: 13px; font-weight: 900; color: #1e1b4b; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 10px; letter-spacing: 0.5px; text-transform: uppercase;">
            3. Mobile PWA Installation & Offline Pre-Caching
          </h3>
          <div style="font-size: 11px; line-height: 1.6; color: #334155; padding-left: 8px;">
            <p style="margin-bottom: 12px;">This web application is configured as an installable Progressive Web App (PWA), turning the website into a standalone native-feeling application with full offline capabilities on your mobile device.</p>
            
            <div style="margin-bottom: 12px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">🍏 iOS Installation (Safari Browser)</strong>
              <ol style="margin-top: 4px; padding-left: 18px;">
                <li style="margin-bottom: 3px;">Open the application URL in your native <strong>Safari</strong> browser.</li>
                <li style="margin-bottom: 3px;">Tap the <strong>Share</strong> button (box with an upward arrow) in the browser navigation bar.</li>
                <li style="margin-bottom: 3px;">Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li style="margin-bottom: 3px;">Tap <strong>Add</strong> in the upper right. The app will launch as a distraction-free, fullscreen application!</li>
              </ol>
            </div>

            <div style="margin-bottom: 12px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">🤖 Android Installation (Google Chrome / Samsung Internet)</strong>
              <ol style="margin-top: 4px; padding-left: 18px;">
                <li style="margin-bottom: 3px;">Open the application URL in <strong>Chrome</strong>.</li>
                <li style="margin-bottom: 3px;">A prompt "Add ChordSheet to Home Screen" or an <strong>Install App</strong> button will appear dynamically in the sidebar. Click it!</li>
                <li style="margin-bottom: 3px;">Alternatively, tap the <strong>Menu</strong> (three dots in upper right) and choose <strong>Install App</strong>.</li>
              </ol>
            </div>

            <div style="margin-bottom: 12px;">
              <strong style="color: #0f172a; font-size: 11.5px; display: block;">📶 Seamless Offline Mode</strong>
              <span>Once installed, the PWA Service Worker caches the interface, fonts, and assets automatically. In the absence of network connection, the app switches to offline cache mode, enabling full access to your setlists, transposition features, local arrangements, metronomes, and visuals. All edits are saved to LocalStorage and synced automatically when network service is restored!</span>
            </div>
          </div>
        </div>

        <div class="print-section" style="margin-bottom: 18px; break-inside: avoid; page-break-before: always; break-before: page;">
          <h3 class="print-section-header" style="font-size: 13px; font-weight: 900; color: #1e1b4b; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 10px; letter-spacing: 0.5px; text-transform: uppercase;">
            4. Performance Keyboard Shortcuts Reference
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155; text-align: left; margin-top: 8px;">
            <thead>
              <tr style="border-bottom: 2px solid #0f172a;">
                <th style="padding: 6px 4px; font-weight: bold; color: #0f172a; width: 30%;">KEYSTROKE</th>
                <th style="padding: 6px 4px; font-weight: bold; color: #0f172a;">STAGE ACTION / COMMAND RESPONSE</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">Spacebar</td>
                <td style="padding: 6px 4px;">Pause or Resume auto-scroller scrolling action</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">Arrow Up / Down</td>
                <td style="padding: 6px 4px;">Increase / Decrease auto-scrolling speed on active sheet</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">M</td>
                <td style="padding: 6px 4px;">Toggle Metronome audio beat and visual pulse indicator</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">T</td>
                <td style="padding: 6px 4px;">Tap Tempo (tap multiple times to set BPM speed)</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">F</td>
                <td style="padding: 6px 4px;">Toggle Stage Fullscreen view for distraction-free performance</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; font-family: monospace; font-weight: bold; color: #4f46e5;">Esc</td>
                <td style="padding: 6px 4px;">Close any open modal panels or exit fullscreen view</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Mount Hidden Print IFrame
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.bottom = '0';
    iframe.style.right = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 15mm 15mm 15mm 15mm;
            }
            body {
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-song-page {
              page-break-after: always;
              break-after: page;
            }
            .print-song-page:last-child {
              page-break-after: avoid;
              break-after: avoid;
            }
          </style>
        </head>
        <body>
          <div class="sheet-body-container">
            ${bodyHTML}
          </div>

          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() {
                window.frameElement.parentNode.removeChild(window.frameElement);
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();
    showToast("Opening system print dialog for ChordSheet Live Flow Manual...", "success");
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
          >
            {/* Song Header Toolbar */}
            <div className="flex-shrink-0 border-b border-indigo-500/10 pb-2 mb-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <div ref={containerRef} className="overflow-hidden whitespace-nowrap relative min-w-0 shrink-0 max-w-[240px] sm:max-w-xs md:max-w-sm">
                    <div className={`inline-block ${isTitleOverflowing ? 'animate-marquee' : ''}`}>
                      <h2 ref={textRef} className="text-sm sm:text-base md:text-lg font-black tracking-tight text-white select-none inline-block">
                        {currentSong.Title}
                      </h2>
                      {isTitleOverflowing && (
                        <h2 className="text-sm sm:text-base md:text-lg font-black tracking-tight text-white select-none inline-block ml-8">
                          {currentSong.Title}
                        </h2>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-indigo-300/70 font-semibold select-none truncate">
                    by {currentSong.Artist || 'Unknown Artist'}
                  </span>
                  
                  {/* Play Context Mode Indicator Badge */}
                  <div className="flex items-center gap-1.5 mt-1 sm:mt-0 shrink-0">
                    {activeSetlistFolder ? (
                      <div className="flex items-center gap-1 bg-violet-500/15 border border-violet-500/30 text-violet-300 px-2.5 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase select-none shadow-[0_0_10px_rgba(139,92,246,0.15)] animate-fadeIn">
                        <span>📂 Setlist: {activeSetlistFolder}</span>
                        <button
                          onClick={() => {
                            setActiveSetlistFolder('');
                            showToast(`Switched "${currentSong.Title}" to Standalone mode`, 'info');
                          }}
                          className="ml-1 hover:text-rose-400 text-violet-400 transition-colors cursor-pointer font-extrabold text-[10px] px-0.5"
                          title="Switch to Standalone Song"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="bg-slate-500/15 border border-slate-500/25 text-slate-300 px-2.5 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase select-none flex items-center gap-1 shadow-inner animate-fadeIn">
                        <span>👤 Standalone Song</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Squeezed beautifully aligned controls row - Resized smaller for both web and mobile viewing */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 select-none">
                  <button
                    onClick={() => toggleFav(String(currentSong.SongID))}
                    className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider btn-5d transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                      favorites.includes(String(currentSong.SongID))
                        ? 'text-amber-400 border-amber-500/40 shadow-[0_0_12px_rgba(251,191,36,0.2)] bg-amber-500/10'
                        : 'text-gray-400 hover:text-white bg-white/5 border border-white/5'
                    }`}
                    title="Toggle Favorite"
                  >
                    <span className="text-xs">{favorites.includes(String(currentSong.SongID)) ? '★' : '☆'}</span>
                    <span>Fav</span>
                  </button>
                  {/* Dynamic Set / Update Set Button Group */}
                  {(() => {
                    const matchingSetsForSong = allSharedSetlists
                      .filter((sl) => {
                        try {
                          const parsed = JSON.parse(sl.RoadmapJSON);
                          const songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
                          return songIds.some((id: any) => String(id) === String(currentSong.SongID));
                        } catch {
                          return false;
                        }
                      })
                      .map((sl) => sl.PresetName);

                    const isInAnySet = matchingSetsForSong.length > 0;

                    return (
                      <button
                        onClick={() => setIsSetlistManagerOpen(true)}
                        className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                          isInAnySet
                            ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                            : 'text-gray-400 hover:text-white bg-white/5 border border-white/5'
                        }`}
                        title="Add Song to Setlist folders and capture arrangement"
                      >
                        <span className="text-xs">⚡</span>
                        <span>{isInAnySet ? `Set (${matchingSetsForSong.length})` : 'Set'}</span>
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => setArrangerOpen((prev) => !prev)}
                    className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                      arrangerOpen
                        ? 'bg-indigo-600 text-white shadow-inner border border-indigo-400/30'
                        : 'btn-5d-primary text-white border border-indigo-500/30'
                    }`}
                  >
                    <span>🗺️ Arrangement</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsPDFPreviewOpen(true);
                      setPdfScope('current');
                      setPdfSelectedSongIds(setlists.length > 0 ? setlists.map(String) : (currentSong ? [String(currentSong.SongID)] : []));
                    }}
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer text-indigo-400 bg-white/5 border border-indigo-500/20 hover:bg-indigo-500/10 hover:text-white"
                    title="Open PDF Preview Modal"
                  >
                    <span>📄</span>
                    <span>PDF</span>
                  </button>
                  {appUser && appSecret && (
                    <button
                      onClick={() => {
                        setFormEditingSong(currentSong);
                        setIsFormModalOpen(true);
                      }}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-black btn-5d-primary text-white flex items-center gap-1 transition-all active:scale-95 cursor-pointer uppercase tracking-wider border border-indigo-500/30"
                    >
                      <span>✏️ Edit</span>
                    </button>
                  )}

                  {/* Setlist Navigation (Prev / Next transition) */}
                  {(() => {
                    const currentIndexInSet = setlists.indexOf(String(currentSong.SongID));
                    if (currentIndexInSet !== -1) {
                      const prevSongID = currentIndexInSet > 0 ? setlists[currentIndexInSet - 1] : null;
                      const nextSongID = currentIndexInSet < setlists.length - 1 ? setlists[currentIndexInSet + 1] : null;
                      const prevSong = prevSongID ? songs.find((s) => String(s.SongID) === prevSongID) : null;
                      const nextSong = nextSongID ? songs.find((s) => String(s.SongID) === nextSongID) : null;

                      return (
                        <div className="flex items-center gap-1 border-l border-indigo-500/10 pl-1.5 ml-1">
                          {prevSong && (
                            <button
                              onClick={() => {
                                executeSongLoad(prevSong);
                              }}
                              className="px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                              title={`Go back to: ${prevSong.Title}`}
                            >
                              <span>⏮️</span>
                            </button>
                          )}
                          {nextSong && (
                            <button
                              onClick={() => {
                                executeSongLoad(nextSong);
                              }}
                              className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500/20 shadow-md shadow-emerald-500/10 transition-all active:scale-95 flex items-center gap-1 cursor-pointer uppercase tracking-wider"
                              title={`Transition to: ${nextSong.Title}`}
                            >
                              <span>Next</span>
                              <span>⏭️</span>
                            </button>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Arrange flow drawer panel */}
              <div className={`panel-wrap ${arrangerOpen ? 'is-open' : ''}`}>
                  <div className="panel-inner">
                    <div className="pt-2.5">
                      <div className={`mb-2.5 p-3 rounded-xl border space-y-3 transition-all duration-300 ${
                        isArrangementLocked 
                          ? 'bg-black/40 border-indigo-500/20 shadow-none' 
                          : 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      }`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-white/5 pb-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5 select-none">
                              <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold">
                                Shared Band Presets
                              </div>
                              <button
                                onClick={async () => {
                                  setIsLoading(true);
                                  try {
                                    await refetchArrangements();
                                    showToast('Cloud presets refreshed successfully!', 'success');
                                  } catch (e) {
                                    showToast('Could not sync with cloud.', 'error');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                className="text-[7px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 px-1.5 py-0.5 rounded flex-shrink-0 font-bold uppercase tracking-widest font-mono transition-all active:scale-95 cursor-pointer flex items-center gap-1 select-none"
                              >
                                <span>☁️</span> Cloud Sync
                              </button>
                            </div>
                            <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1 custom-scrollbar">
                              {(() => {
                                const presets = getPresets();
                                const groupedPresets: { [dateStr: string]: { originalName: string; baseName: string }[] } = {};
                                
                                Object.keys(presets).forEach((originalName) => {
                                  const { baseName, dateStr } = parsePresetDate(originalName);
                                  if (!groupedPresets[dateStr]) {
                                    groupedPresets[dateStr] = [];
                                  }
                                  groupedPresets[dateStr].push({ originalName, baseName });
                                });

                                if (Object.keys(presets).length === 0) {
                                  return (
                                    <div className="text-[9px] text-gray-500 italic py-2 text-center">
                                      No arrangements saved yet...
                                    </div>
                                  );
                                }

                                return Object.keys(groupedPresets).map((dateStr) => {
                                  const items = groupedPresets[dateStr];
                                  const isExpanded = expandedArrangementDates[dateStr] !== false;
                                  return (
                                    <div key={dateStr} className="space-y-1">
                                      {/* Collapsible Date Header */}
                                      <button
                                        onClick={() => {
                                          setExpandedArrangementDates(prev => ({
                                            ...prev,
                                            [dateStr]: !isExpanded
                                          }));
                                        }}
                                        className="w-full flex items-center justify-between py-1 px-2 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg text-[8px] font-black uppercase tracking-wider text-indigo-300 border border-indigo-500/10 transition-all cursor-pointer"
                                      >
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="shrink-0 text-[10px]">📅</span>
                                          <span className="truncate">{dateStr}</span>
                                          <span className="text-[7.5px] text-indigo-400/80 font-mono">({items.length})</span>
                                        </div>
                                        <span className="text-[7px] text-indigo-400 font-bold">
                                          {isExpanded ? '▼' : '▶'}
                                        </span>
                                      </button>

                                      {/* List of arrangements under this date */}
                                      {isExpanded && (
                                        <div className="pl-1 space-y-1 animate-fadeIn">
                                          {items.map(({ originalName, baseName }) => {
                                            const isActive = currentArrangementName === originalName || 
                                                             currentArrangementName === baseName ||
                                                             getPresetInputDisplayName(currentArrangementName) === baseName;
                                            return (
                                              <div
                                                key={originalName}
                                                className={`flex items-center justify-between p-1.5 rounded-xl border transition-all text-[10px] ${
                                                  isActive
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                                                    : 'bg-white/5 hover:bg-white/10 border-white/5'
                                                }`}
                                              >
                                                <button
                                                  onClick={() => {
                                                    if (isActive) {
                                                      if (currentSong) {
                                                        executeSongLoad(currentSong, true);
                                                        showToast('Deselected arrangement. Restored default song flow.', 'info');
                                                      }
                                                    } else {
                                                      if (activeSetlistFolder && currentSong) {
                                                        const presets = getPresets();
                                                        const clickedPresetData = presets[originalName];
                                                        if (clickedPresetData && areRoadmapsIdentical(clickedPresetData, activeRoadmap)) {
                                                          setCurrentArrangementName(originalName);
                                                          showToast(`"${baseName}" arrangement is already active for this song.`, 'info');
                                                        } else {
                                                          setPendingArrangementToLoad(originalName);
                                                        }
                                                      } else {
                                                        loadPresetArrangement(originalName);
                                                        setCurrentArrangementName(originalName);
                                                      }
                                                    }
                                                  }}
                                                  className={`flex-1 text-left font-bold truncate pr-1.5 cursor-pointer text-[9px] uppercase ${
                                                    isActive ? 'text-emerald-400' : 'text-gray-300 hover:text-white'
                                                  }`}
                                                  title={isActive ? 'Click to deselect / restore default flow' : `Load preset: ${originalName}`}
                                                >
                                                  {isActive ? `✓ ${baseName}` : baseName}
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    setDeleteArrangementConfirmation({
                                                      name: originalName,
                                                      isActive: isActive
                                                    });
                                                  }}
                                                  className="text-rose-400/60 hover:text-rose-400 px-1.5 py-0.5 font-bold text-[10px] cursor-pointer"
                                                  title="Delete arrangement"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-col justify-between">
                            <div className="text-[9px] text-indigo-400 uppercase tracking-widest font-bold mb-1.5 select-none">
                              {currentArrangementName && !currentArrangementName.startsWith('Set:') ? 'Save / Modify Arrangement' : 'Save New Arrangement'}
                            </div>
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                id="presetNameInput"
                                value={getPresetInputDisplayName(currentArrangementName)}
                                onChange={(e) => setCurrentArrangementName(e.target.value.toUpperCase())}
                                disabled={isArrangementLocked}
                                placeholder={isArrangementLocked ? "Arrangement is locked" : "Preset name (e.g. Acoustic)"}
                                className="w-full bg-black/50 p-2 rounded-lg text-[10px] text-white border border-white/5 outline-none focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                              />
                              <button
                                onClick={savePresetArrangement}
                                disabled={isArrangementLocked}
                                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                Save Active Flow
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Lock / Unlocked Status Banner */}
                        {isArrangementLocked ? (
                          <div className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fadeIn">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs shrink-0">🔒</span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-amber-300 truncate">Arrangement Locked</div>
                                <div className="text-[8.5px] text-gray-400 truncate">Unlock to modify sequence blocks or lines.</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => {
                                  if (currentSong) {
                                    executeSongLoad(currentSong, true);
                                    showToast('Restored default song arrangement.', 'info');
                                  }
                                }}
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg text-[8.5px] font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                                title="Unload arrangement and restore original song sequence"
                              >
                                Default Flow
                              </button>
                              <button
                                onClick={() => {
                                  setRoadmapBackup(activeRoadmap.map(b => ({
                                    id: b.id,
                                    name: b.name,
                                    enabledLines: b.enabledLines ? [...b.enabledLines] : [],
                                    keyOffset: b.keyOffset || 0
                                  })));
                                  setNameBackup(currentArrangementName);
                                  setIsArrangementLocked(false);
                                  showToast('Arrangement is now in editing mode. Changes will be saved.', 'info');
                                }}
                                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                              >
                                Modify
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-fadeIn">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs shrink-0">✍️</span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold text-emerald-300 truncate">Active Editing Mode</div>
                                <div className="text-[8.5px] text-emerald-400/80 truncate">Esc or Cancel button to revert/cancel edit attempt.</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={cancelArrangementEdit}
                                className="px-2.5 py-1 bg-rose-500/25 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-[7.5px] font-mono font-black uppercase tracking-widest select-none">
                                Unlocked
                              </span>
                            </div>
                          </div>
                        )}

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
                                  draggable={!isArrangementLocked}
                                  onDragStart={() => handleDragStart(idx)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => handleDrop(idx)}
                                  onClick={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)}
                                  className={`flex flex-col items-center border rounded-lg p-2 min-w-[105px] select-none relative group transition-all mt-1 ${
                                    isArrangementLocked ? 'cursor-not-allowed opacity-75' : 'cursor-grab active:cursor-grabbing'
                                  } ${
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
                                        disabled={isArrangementLocked}
                                        onClick={() => adjustBlockModulation(block.id, -1)}
                                        className="w-5 h-5 rounded bg-black/40 hover:bg-white/10 text-xs flex items-center justify-center text-indigo-300 font-bold transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                                      >
                                        -
                                      </button>
                                      <span className="text-[9px] text-indigo-200 font-mono font-bold px-0.5">
                                        {modSign}
                                        {block.keyOffset || 0}
                                      </span>
                                      <button
                                        disabled={isArrangementLocked}
                                        onClick={() => adjustBlockModulation(block.id, 1)}
                                        className="w-5 h-5 rounded bg-black/40 hover:bg-white/10 text-xs flex items-center justify-center text-indigo-300 font-bold transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex gap-1.5 mt-2 w-full justify-center">
                                    <button
                                      disabled={isArrangementLocked || idx === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isArrangementLocked) {
                                          showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
                                          return;
                                        }
                                        if (idx > 0) {
                                          const next = [...activeRoadmap];
                                          const temp = next[idx];
                                          next[idx] = next[idx - 1];
                                          next[idx - 1] = temp;
                                          setActiveRoadmap(next);
                                          showToast('Shifted left', 'success');
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-black/30 hover:bg-white/10 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      disabled={isArrangementLocked}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteRoadmapBlock(idx);
                                      }}
                                      className="w-6 h-6 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      disabled={isArrangementLocked || idx === activeRoadmap.length - 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isArrangementLocked) {
                                          showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", 'warning');
                                          return;
                                        }
                                        if (idx < activeRoadmap.length - 1) {
                                          const next = [...activeRoadmap];
                                          const temp = next[idx];
                                          next[idx] = next[idx + 1];
                                          next[idx + 1] = temp;
                                          setActiveRoadmap(next);
                                          showToast('Shifted right', 'success');
                                        }
                                      }}
                                      className="w-6 h-6 rounded bg-black/30 hover:bg-white/10 active:scale-125 text-[10px] flex items-center justify-center transition-all shadow-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
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
                                    className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                                      isArrangementLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                                    } ${
                                      isEnabled
                                        ? 'bg-white/5 border border-indigo-500/30'
                                        : 'bg-black/20 border border-transparent opacity-40'
                                    } text-[10px] ${
                                      isArrangementLocked ? '' : 'hover:bg-white/10'
                                    }`}
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
                                disabled={isArrangementLocked}
                                onClick={() => addRoadmapBlock(sec)}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-[8px] font-bold uppercase tracking-widest text-emerald-300 transition-all active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                              >
                                + {sec}
                              </button>
                            ))}
                          </div>
                          <button
                            disabled={isArrangementLocked}
                            onClick={resetRoadmapBlocks}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-[#16121f] text-rose-400 active:scale-125 border border-rose-500/30 rounded text-[8px] font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
                          >
                            Reset Default
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Real-time Cloud Arrangement Modified Notice */}
              {cloudArrangementUpdateNotice && (
                <div className="mt-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn select-none">
                  <div className="flex items-start gap-2 text-amber-300">
                    <span className="text-sm shrink-0 animate-pulse mt-0.5 sm:mt-0">🔄</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-wider">Arrangement Updated on Cloud</span>
                      <span className="text-[9.5px] text-gray-300 font-medium leading-relaxed">
                        A bandmate just modified the active arrangement: <strong className="text-amber-400 font-bold uppercase">{parsePresetDate(cloudArrangementUpdateNotice.name).baseName}</strong>.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                    <button
                      onClick={async () => {
                        // Accept and load the updated arrangement
                        setActiveRoadmap(cloudArrangementUpdateNotice.newRoadmap);
                        if (cloudArrangementUpdateNotice.newKey) {
                          setCurrentKey(cloudArrangementUpdateNotice.newKey);
                        }
                        setCloudArrangementUpdateNotice(null);
                        showToast(`Updated to bandmate's latest arrangement!`, 'success');
                      }}
                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    >
                      Load Latest
                    </button>
                    <button
                      onClick={() => setCloudArrangementUpdateNotice(null)}
                      className="px-2 py-1.5 bg-transparent hover:bg-white/5 text-gray-400 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time Cloud Arrangement Deleted Notice */}
              {cloudArrangementDeletionNotice && (
                <div className="mt-2.5 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn select-none">
                  <div className="flex items-start gap-2 text-rose-300">
                    <span className="text-sm shrink-0 animate-pulse mt-0.5 sm:mt-0">🔄</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Arrangement Deleted on Cloud</span>
                      <span className="text-[9.5px] text-gray-300 font-medium leading-relaxed">
                        A bandmate just deleted the active arrangement: <strong className="text-rose-400 font-bold uppercase">"{parsePresetDate(cloudArrangementDeletionNotice.name).baseName}"</strong>.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                    <button
                      onClick={async () => {
                        await handleApplyArrangementDeletion(
                          cloudArrangementDeletionNotice.name,
                          cloudArrangementDeletionNotice.newSongArrangements,
                          cloudArrangementDeletionNotice.allArrs
                        );
                      }}
                      className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={() => setCloudArrangementDeletionNotice(null)}
                      className="px-2 py-1.5 bg-transparent hover:bg-white/5 text-gray-400 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Consolidated Collapsible Controls Panel */}
              <div className="mt-2.5 flex-shrink-0 bg-[#0d0f1e]/40 backdrop-blur-md rounded-xl p-2.5 border border-indigo-500/25 space-y-2 select-none shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]">
              
              {/* 1. Collapsible Roadmap Flow */}
              <div className="border-b border-white/5 last:border-0 pb-1.5 last:pb-0">
                <div
                  onClick={() => setIsRoadmapFlowCollapsed(!isRoadmapFlowCollapsed)}
                  className="flex items-center justify-between cursor-pointer select-none text-[9px] sm:text-[10px] text-indigo-300 font-extrabold uppercase tracking-widest px-1 py-0.5 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🧭</span> Roadmap Flow
                  </span>
                  <span className="text-[10px] font-mono font-black text-indigo-400">
                    {isRoadmapFlowCollapsed ? '▼' : '▲'}
                  </span>
                </div>
                <div className={`panel-wrap ${!isRoadmapFlowCollapsed ? 'is-open' : ''}`}>
                  <div className="panel-inner pt-1.5 px-1">
                    {activeRoadmap.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 w-full py-0.5">
                        {(() => {
                          const renderedBlocks: any[] = [];
                          activeRoadmap.forEach((block, idx) => {
                            const isDuplicate = activeRoadmap.findIndex((b, bIdx) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, sectionTemplates)) !== -1;
                            if (isDuplicate) {
                              return;
                            }
                            renderedBlocks.push({ block, originalIdx: idx });
                          });

                          return renderedBlocks.map(({ block, originalIdx: idx }, rIdx) => {
                            const blockRep = repInfo[idx];
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
                                {rIdx > 0 && (
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
                                  <span>{block.name.toUpperCase()}</span>
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
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="text-[9px] text-gray-500 italic">No roadmap defined for this song.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Collapsible Performance Panel */}
              <div className="border-b border-white/5 last:border-0 pb-1.5 last:pb-0">
                <div
                  onClick={() => setIsPerformancePanelCollapsed(!isPerformancePanelCollapsed)}
                  className="flex items-center justify-between cursor-pointer select-none text-[9px] sm:text-[10px] text-indigo-300 font-extrabold uppercase tracking-widest px-1 py-0.5 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>⚙️</span> Performance Settings
                  </span>
                  <span className="text-[10px] font-mono font-black text-indigo-400">
                    {isPerformancePanelCollapsed ? '▼' : '▲'}
                  </span>
                </div>
                <div className={`panel-wrap ${!isPerformancePanelCollapsed ? 'is-open' : ''}`}>
                  <div className="panel-inner pt-1.5 px-1">
                    <div className="grid grid-cols-12 gap-2 w-full p-2 bg-black/25 rounded-xl border border-indigo-500/10 shadow-sm select-none">
                      
                      {/* Widget 1: Key & Zoom */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center justify-between gap-2.5 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <div className="flex flex-col flex-1">
                          <span className="text-[7.5px] text-indigo-300/80 uppercase tracking-widest font-black font-mono">Transpose</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <button
                              onClick={() => shiftKey(-1)}
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center font-black text-xs text-indigo-300 transition-all cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-[10px] font-bold text-amber-400 font-mono">
                              {currentKey}
                            </span>
                            <button
                              onClick={() => shiftKey(1)}
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center font-black text-xs text-indigo-300 transition-all cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="h-6 w-[1px] bg-white/10 self-center" />
                        <div className="flex flex-col items-end flex-1">
                          <span className="text-[7.5px] text-indigo-300/80 uppercase tracking-widest font-black font-mono">Zoom</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <button
                              onClick={() => adjustZoom(-0.1)}
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center font-black text-[9px] text-gray-300 active:scale-90 transition-all cursor-pointer"
                            >
                              A-
                            </button>
                            <button
                              onClick={() => adjustZoom(0.1)}
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center font-black text-[9px] text-gray-300 active:scale-90 transition-all cursor-pointer"
                            >
                              A+
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Widget 2: Display & Toggles */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-4 flex flex-col justify-between gap-1 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300/80 uppercase tracking-widest font-black font-mono">View & Layout Options</span>
                        <div className="grid grid-cols-3 gap-1 items-center mt-0.5">
                          <select
                            value={displayMode}
                            onChange={(e) => setDisplayMode(e.target.value as any)}
                            className="col-span-1 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-1 px-1 rounded-lg text-[8px] outline-none border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer font-bold text-center appearance-none"
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
                          >
                            {sheetLayoutMode === 'compact' ? 'Show Flow' : 'Show Compact'}
                          </button>
                        </div>
                      </div>

                      {/* Widget 3: Autoscroll */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-2 flex flex-col justify-between gap-1 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300/80 uppercase tracking-widest font-black font-mono">Autoscroll</span>
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
                          
                          <div className="flex items-center justify-center gap-1 bg-black/40 rounded px-1 py-0.5 border border-white/5 shadow-inner">
                            <button
                              onClick={() => setScrollSpeed((prev) => Math.max(0.1, prev - 0.2))}
                              className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-gray-300 font-bold active:scale-90 cursor-pointer select-none transition-colors"
                            >
                              -
                            </button>
                            <span className="text-[9px] font-mono font-bold text-gray-300 w-5 text-center select-none">
                              {scrollSpeed.toFixed(1)}
                            </span>
                            <button
                              onClick={() => setScrollSpeed((prev) => Math.min(10, prev + 0.2))}
                              className="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-gray-300 font-bold active:scale-90 cursor-pointer select-none transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Widget 4: Metronome & Tempo */}
                      <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col justify-between gap-1 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 shadow-inner">
                        <span className="text-[7.5px] text-indigo-300/80 uppercase tracking-widest font-black font-mono">Metronome & Tempo</span>
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
                              className={`w-1.5 h-1.5 rounded-full bg-rose-500 scale-90 transition-all duration-100 ${isMetronomeActive ? 'opacity-100 animate-pulse' : 'opacity-20'}`}
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

              {/* 3. Collapsible Family Chords */}
              <div className="border-b border-white/5 last:border-0 pb-1.5 last:pb-0">
                <div
                  onClick={() => setIsFamilyChordsCollapsed(!isFamilyChordsCollapsed)}
                  className="flex items-center justify-between cursor-pointer select-none text-[9px] sm:text-[10px] text-indigo-300 font-extrabold uppercase tracking-widest px-1 py-0.5 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🎸</span> Family Chords
                  </span>
                  <span className="text-[10px] font-mono font-black text-indigo-400">
                    {isFamilyChordsCollapsed ? '▼' : '▲'}
                  </span>
                </div>
                <div className={`panel-wrap ${!isFamilyChordsCollapsed ? 'is-open' : ''}`}>
                  <div className="panel-inner pt-1.5 px-1">
                    {renderFamilyChordsList(true)}
                  </div>
                </div>
              </div>

            </div>

            {/* Chords & Lyrics Sheet Main Body Panel */}
            <div id="lyricsFullscreenWrap" className="mt-2.5 flex flex-col relative bg-transparent transition-all">
              <div className="flex justify-between items-center mb-1.5 pr-1 sm:pr-2">
                <span className="text-[9px] sm:text-[10px] text-indigo-400 uppercase tracking-widest font-extrabold select-none flex-shrink-0">
                  Sheet View
                </span>
              </div>

              {/* Scrollable song sheet grid - styled beautifully as a white physical binder sheet */}
              <div
                className={`p-4 sm:p-6 md:p-8 pb-20 song-scroll-container w-full sheet-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.3)] ${
                  focusedLineId ? 'focused-parent' : ''
                } mt-1.5`}
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
                  
                   // Reveal consecutive repeating sections fully as requested
                   // if (sheetLayoutMode === 'sequence' && blockRep?.isRepeat) {
                   //   return null;
                   // }

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
                    const firstIdenticalIdx = activeRoadmap.findIndex((b, bIdx) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, sectionTemplates));
                    if (firstIdenticalIdx !== -1) {
                      // Skip rendering full chords/lyrics, instead render a beautiful compact repeat card!
                      return (
                        <div
                          key={block.id}
                          id={`sec-wrapper-${idx}`}
                          className="group mb-2 bg-white/[0.02] border border-dashed border-indigo-500/20 hover:border-indigo-400/40 rounded-xl px-2.5 py-1.5 flex items-center justify-between transition-all select-none shadow-[0_2px_8px_rgba(0,0,0,0.2)] animate-fadeIn"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-[8px] font-mono font-black uppercase tracking-wider text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 rounded px-1.5 py-0.5 shadow-sm animate-pulse flex items-center gap-1 shrink-0">
                              <span>🔁</span> REPLAY
                            </span>
                            <span className={`text-[11px] font-bold ${textColor} truncate`}>
                              {block.name}
                            </span>
                            <span className="text-[8px] text-gray-400 font-mono hidden sm:inline truncate">
                              (Identical chords & lyrics as Section #{firstIdenticalIdx + 1} - {activeRoadmap[firstIdenticalIdx].name})
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
                            {blockDisplayName.toUpperCase()}
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

                      {/* Embedded Lyric Hint when lyrics are hidden */}
                      {!showLyrics && !isSectionCollapsed && (
                        <div className="mt-1 mb-2.5 flex flex-col gap-1 text-[11px] text-gray-400 italic font-medium pl-3 sm:pl-4 select-none animate-fadeIn">
                          {(() => {
                            if (sheetLayoutMode === 'compact') {
                              const identicalBlocks = activeRoadmap.filter(b => areBlocksChordsIdentical(b, block, sectionTemplates));
                              const renderedHints: any[] = [];
                              const seenNames = new Set();
                              
                              identicalBlocks.forEach(b => {
                                if (seenNames.has(b.name)) return;
                                seenNames.add(b.name);
                                const lines = sectionTemplates[b.name] || [];
                                const firstLyric = lines.find(l => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                if (firstLyric) {
                                  renderedHints.push({ name: b.name, lyric: firstLyric });
                                }
                              });

                              if (renderedHints.length > 0) {
                                // Group by lyric
                                const groups: { lyric: string; names: string[] }[] = [];
                                renderedHints.forEach(h => {
                                  const normLyric = h.lyric.trim();
                                  const existingGroup = groups.find(g => g.lyric.trim().toLowerCase() === normLyric.toLowerCase());
                                  if (existingGroup) {
                                    existingGroup.names.push(h.name);
                                  } else {
                                    groups.push({ lyric: h.lyric, names: [h.name] });
                                  }
                                });

                                return groups.map((g, gIdx) => (
                                  <div key={gIdx} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[8px] font-black uppercase tracking-wider text-indigo-400/80 not-italic bg-indigo-500/10 px-1.5 py-0.5 border border-indigo-500/20 rounded-md shrink-0">
                                      {g.names.map(n => n.toUpperCase()).join(' & ')}
                                    </span>
                                    <span className="truncate text-gray-300">“{g.lyric}”</span>
                                    {g.names.length > 1 && (
                                      <span className="text-[7.5px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded">
                                        Shared 1st line
                                      </span>
                                    )}
                                  </div>
                                ));
                              }
                            } else {
                              const lines = sectionTemplates[block.name] || [];
                              const firstLyric = lines.find(l => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                              if (firstLyric) {
                                return (
                                  <div className="flex items-center gap-1.5 text-gray-300">
                                    <span className="text-indigo-400/60 not-italic font-bold text-[9px] uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 border border-indigo-500/20 rounded-md shrink-0">HINT</span>
                                    <span className="truncate">“{firstLyric}”</span>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      )}

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

                {/* Next Song Transition Banner */}
                {(() => {
                  const currentIndexInSet = setlists.indexOf(String(currentSong.SongID));
                  if (currentIndexInSet !== -1 && currentIndexInSet < setlists.length - 1) {
                    const nextSongID = setlists[currentIndexInSet + 1];
                    const nextSong = songs.find((s) => String(s.SongID) === nextSongID);
                    if (nextSong) {
                      return (
                        <div className="mt-12 pt-8 border-t border-indigo-100/10">
                          <button
                            onClick={() => executeSongLoad(nextSong)}
                            className="w-full text-left p-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all hover:shadow-xl hover:shadow-indigo-600/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] group cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/90 block mb-1">
                                  Up Next in Setlist
                                </span>
                                <h3 className="text-base sm:text-lg font-black tracking-tight leading-snug truncate text-white">
                                  {nextSong.Title}
                                </h3>
                                <span className="text-xs text-indigo-100/80 truncate block mt-0.5 font-medium">
                                  by {nextSong.Artist || 'Unknown Artist'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 bg-white/10 group-hover:bg-white/20 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors shrink-0">
                                <span>Next</span>
                                <span className="text-base sm:text-lg group-hover:translate-x-1 transition-transform duration-200 inline-block">⏭️</span>
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
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
        onOpenAddSongForm={() => {
          setFormEditingSong(null);
          setIsFormModalOpen(true);
        }}
        isAdmin={!!(appUser && appSecret)}
        onToggleAdmin={handleAdminLockToggle}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleFullScreen={toggleFullScreen}
        triggerCapability={handleTriggerCapability}
        onRunDiagnostics={() => setIsDiagnosticModalOpen(true)}
        allSharedSetlists={allSharedSetlists}
        onSaveSetlistOrder={saveSetlistOrder}
        onDeleteSetlist={deleteSetlistFolder}
        onRemoveSongFromSetlist={removeSongFromSetlist}
        onSelectSongFromSetlist={selectSongFromSetlist}
        onCreateSetlist={createNewSetlistFolder}
        onToggleSetlistLock={toggleSetlistLock}
        activeSetlistFolder={activeSetlistFolder}
        onDownloadManual={exportManualToPDF}
        onOpenInstallGuide={() => setIsInstallModalOpen(true)}
      />

      {/* Shortcuts Modal dialog */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* Setlist Selector Dialog */}
      {currentSong && (
        <SetlistSelectorDialog
          isOpen={isSetlistManagerOpen}
          onClose={() => setIsSetlistManagerOpen(false)}
          currentSong={currentSong}
          allSharedSetlists={allSharedSetlists}
          onAddSongToSet={saveSongToSetlist}
          onRemoveSongFromSet={removeSongFromSetlist}
          onCreateNewSetlist={createNewSetlistFolder}
        />
      )}

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
        editingSong={formEditingSong}
        songLines={formEditingSong ? songLines : []}
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

      {/* Pre-load View & Layout Settings Modal */}
      {pendingSong && (
        <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 select-none flex flex-col space-y-4">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-indigo-200 tracking-wider uppercase font-sans">
                  Load & Configure
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 font-mono">
                  {pendingSong.Title}
                </p>
              </div>
              <button
                onClick={() => setPendingSong(null)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Content Form */}
            <div className="space-y-3.5">
              
              {/* Option 1: Display Mode */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-widest font-mono">
                  Display Mode
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['chords', 'numbers', 'both'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setModalDisplayMode(mode)}
                      className={`px-2 py-1.5 rounded-lg text-[9.5px] uppercase tracking-wider font-bold border transition-all active:scale-95 cursor-pointer ${
                        modalDisplayMode === mode
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-inner'
                          : 'bg-white/5 text-gray-400 border-white/5 hover:text-gray-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option 2: Lyrics Toggle */}
              <div className="flex items-center justify-between py-1 border-t border-b border-white/5">
                <div className="flex flex-col">
                  <span className="text-[10.5px] text-gray-300 font-bold font-sans">Show Lyrics</span>
                  <span className="text-[8.5px] text-gray-500 font-mono">Display text sheet with chords</span>
                </div>
                <button
                  onClick={() => setModalShowLyrics(!modalShowLyrics)}
                  className={`px-3 py-1 rounded-lg text-[9.5px] uppercase font-bold border tracking-wider transition-all active:scale-90 cursor-pointer ${
                    modalShowLyrics
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
                  }`}
                >
                  {modalShowLyrics ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Option 3: Sheet Layout Mode */}
              <div className="flex items-center justify-between py-1">
                <div className="flex flex-col">
                  <span className="text-[10.5px] text-gray-300 font-bold font-sans">Sheet Layout</span>
                  <span className="text-[8.5px] text-gray-500 font-mono">Flow/Sequence vs Compact View</span>
                </div>
                <div className="flex gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 shadow-inner">
                  <button
                    onClick={() => setModalSheetLayoutMode('sequence')}
                    className={`px-2 py-1 rounded-md text-[8.5px] uppercase font-black transition-all cursor-pointer ${
                      modalSheetLayoutMode === 'sequence'
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Flow
                  </button>
                  <button
                    onClick={() => setModalSheetLayoutMode('compact')}
                    className={`px-2 py-1 rounded-md text-[8.5px] uppercase font-black transition-all cursor-pointer ${
                      modalSheetLayoutMode === 'compact'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => {
                  setPendingSong(null);
                  setPendingSetlistName('');
                }}
                className="flex-1 py-2 rounded-xl text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95 transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDisplayMode(modalDisplayMode);
                  setShowLyrics(modalShowLyrics);
                  setSheetLayoutMode(modalSheetLayoutMode);
                  if (pendingSetlistName) {
                    setActiveSetlistFolder(pendingSetlistName);
                    executeSongLoad(pendingSong, false, pendingSetlistName);
                    showToast(`Loaded "${pendingSong.Title}" with arrangement for "${pendingSetlistName}"`, 'success');
                    setPendingSetlistName('');
                  } else {
                    setActiveSetlistFolder('');
                    executeSongLoad(pendingSong, true, '');
                  }
                  setPendingSong(null);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white active:scale-95 transition-all font-bold text-[10px] uppercase tracking-wider shadow-md shadow-indigo-500/10 cursor-pointer"
              >
                Generate
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Database Diagnostic Modal */}
      <DatabaseDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        scriptUrl={SCRIPT_URL}
      />

      {/* PWA Installation Guide & Quick Setup Modal */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 bg-[#020205]/90 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="w-full max-w-md bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-5 sm:p-6 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📱</span>
                <div>
                  <h3 className="text-white font-black text-xs uppercase tracking-wider">Install Mobile App</h3>
                  <p className="text-[9px] text-indigo-400 font-semibold uppercase tracking-widest mt-0.5">ChordSheet Live Flow</p>
                </div>
              </div>
              <button
                onClick={() => setIsInstallModalOpen(false)}
                className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Direct PWA Install Trigger if Supported by Browser */}
            {deferredInstallPrompt ? (
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex flex-col items-center text-center space-y-3">
                <div className="text-2xl animate-bounce">⚡</div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wide">Direct Install Available!</h4>
                  <p className="text-[10px] text-gray-300">Click the button below to install directly to your device home screen.</p>
                </div>
                <button
                  onClick={async () => {
                    if (deferredInstallPrompt) {
                      deferredInstallPrompt.prompt();
                      const { outcome } = await deferredInstallPrompt.userChoice;
                      if (outcome === 'accepted') {
                        setDeferredInstallPrompt(null);
                        setIsInstallModalOpen(false);
                        showToast('Thank you for installing ChordSheet Live Flow!', 'success');
                      }
                    }
                  }}
                  className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-lg shadow-indigo-500/20"
                >
                  Install Now
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                <p className="text-[10.5px] text-emerald-400 font-medium">
                  📶 <strong>Fully offline pre-cached</strong>. Once added to home screen, you can run the app offline on stage with zero load delay!
                </p>
              </div>
            )}

            {/* Detailed Mobile OS Installation Instructions */}
            <div className="space-y-4">
              
              {/* iOS Safari Guide */}
              <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-white font-bold text-[11px] uppercase tracking-wide">
                  <span>🍏</span>
                  <span>iOS Safari Installation</span>
                </div>
                <ol className="text-[10px] text-gray-300 space-y-2 list-decimal pl-4 leading-relaxed">
                  <li>Open this website inside the native <strong>Safari browser</strong>.</li>
                  <li>Tap the <strong>Share</strong> icon <span className="inline-block bg-white/10 px-1 py-0.5 rounded text-[9px] font-semibold text-white">⎋</span> (rectangle with an arrow pointing up).</li>
                  <li>Scroll down the menu and choose <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top-right corner to complete.</li>
                </ol>
              </div>

              {/* Android Chrome Guide */}
              <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-white font-bold text-[11px] uppercase tracking-wide">
                  <span>🤖</span>
                  <span>Android Chrome / Edge</span>
                </div>
                <ol className="text-[10px] text-gray-300 space-y-2 list-decimal pl-4 leading-relaxed">
                  <li>Open this website inside <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.</li>
                  <li>Tap the menu button <span className="inline-block bg-white/10 px-1 py-0.5 rounded text-[9px] font-semibold text-white">⋮</span> (three vertical dots) in the top right.</li>
                  <li>Select <strong>Install App</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm by tapping <strong>Install</strong>.</li>
                </ol>
              </div>

              {/* Benefits Badge */}
              <div className="grid grid-cols-2 gap-2 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                <div className="p-2 bg-white/5 rounded-lg border border-white/5 flex flex-col items-center gap-1">
                  <span>📴 Offline Ready</span>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/5 flex flex-col items-center gap-1">
                  <span>🚀 Fast Performance</span>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/5 flex flex-col items-center gap-1">
                  <span>🎨 Fullscreen Stage</span>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/5 flex flex-col items-center gap-1">
                  <span>🔋 Battery Optimized</span>
                </div>
              </div>

            </div>

            {/* Footer */}
            <button
              onClick={() => setIsInstallModalOpen(false)}
              className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
            >
              Done / Close
            </button>

          </div>
        </div>
      )}

      {/* Setlist Arrangement Change Confirmation Modal */}
      {pendingArrangementToLoad && (
        <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 flex flex-col space-y-4">
            <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
              <span>📋</span>
              <span>Confirm Arrangement Change</span>
            </div>
            
            <div className="space-y-1.5 text-xs text-gray-300 leading-relaxed">
              <p>
                You are loading a different arrangement for <strong className="text-white">"{currentSong?.Title}"</strong>:
              </p>
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-emerald-400 font-black tracking-wide rounded-xl text-center uppercase text-[11px]">
                {getPresetInputDisplayName(pendingArrangementToLoad)}
              </div>
              <p className="text-[10.5px] text-gray-400 mt-2">
                Would you like to also update the active set list <strong className="text-indigo-400">"{activeSetlistFolder}"</strong> to use this arrangement, or keep the original set list arrangement and load it locally?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1.5">
              <button
                onClick={async () => {
                  const nameToLoad = pendingArrangementToLoad;
                  setPendingArrangementToLoad(null);
                  
                  // 1. Load the arrangement
                  loadPresetArrangement(nameToLoad);
                  setCurrentArrangementName(nameToLoad);
                  
                  // 2. Find and extract the roadmap
                  const presets = getPresets();
                  const presetData = presets[nameToLoad];
                  const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
                  const blocksArray = isObject ? (presetData.roadmap || []) : presetData;
                  const newRoadmap = Array.isArray(blocksArray) ? blocksArray : [];
                  const newKey = (isObject && presetData.key) ? presetData.key : (currentSong?.OriginalKey || 'C');
                  
                  // 3. Update active setlist with this roadmap
                  if (currentSong) {
                    await updateSetlistArrangementDirectly(String(currentSong.SongID), newRoadmap, newKey);
                  }
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                Update Setlist & Load
              </button>

              <button
                onClick={() => {
                  const nameToLoad = pendingArrangementToLoad;
                  setPendingArrangementToLoad(null);
                  
                  // Load preset arrangement locally
                  loadPresetArrangement(nameToLoad);
                  setCurrentArrangementName(nameToLoad);
                  
                  showToast('Arrangement loaded temporarily. Setlist remains unchanged.', 'info');
                }}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                Keep Original Setlist / Load Locally Only
              </button>

              <button
                onClick={() => {
                  setPendingArrangementToLoad(null);
                }}
                className="w-full py-2 bg-transparent hover:bg-white/5 text-gray-400 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save / Overwrite / Apply to Setlist Confirmation Modal */}
      {saveArrangementConfirmation && (
        <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 flex flex-col space-y-4">
            <div className={`flex items-center gap-2 font-bold text-xs uppercase tracking-wider ${
              saveArrangementConfirmation.isOverwrite ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              <span>{saveArrangementConfirmation.isOverwrite ? '⚠️' : '📋'}</span>
              <span>{saveArrangementConfirmation.isOverwrite ? 'Confirm Arrangement Update' : 'New Arrangement Added'}</span>
            </div>

            <div className="space-y-2.5 text-xs text-gray-300 leading-relaxed">
              {saveArrangementConfirmation.isOverwrite ? (
                <div className="space-y-2">
                  <p className="text-[10.5px]">
                    You are modifying an existing arrangement:
                  </p>
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 font-black tracking-wide rounded-xl text-center uppercase text-[11px]">
                    {getPresetInputDisplayName(saveArrangementConfirmation.name)}
                  </div>
                  <p className="text-[10.5px] text-gray-400 mt-2 font-bold">
                    Do you want to confirm?
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10.5px]">
                    This new arrangement will be added:
                  </p>
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black tracking-wide rounded-xl text-center uppercase text-[11px]">
                    {getPresetInputDisplayName(saveArrangementConfirmation.name)}
                  </div>
                  <p className="text-[10.5px] text-gray-400 mt-2">
                    Do you want to load this for this song in your current set list or just keep the original arrangement and just save this new arrangement?
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1.5">
              {saveArrangementConfirmation.isOverwrite ? (
                <button
                  onClick={async () => {
                    const { name, roadmap } = saveArrangementConfirmation;
                    setSaveArrangementConfirmation(null);
                    await executeSaveArrangement(name, !!activeSetlistFolder, roadmap);
                  }}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
                >
                  Confirm & Save
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      const { name, roadmap } = saveArrangementConfirmation;
                      setSaveArrangementConfirmation(null);
                      await executeSaveArrangement(name, true, roadmap);
                    }}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Load & Update Setlist
                  </button>
                  <button
                    onClick={async () => {
                      const { name, roadmap } = saveArrangementConfirmation;
                      setSaveArrangementConfirmation(null);
                      await executeSaveArrangement(name, false, roadmap);
                    }}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Save to Catalog Only (Keep Original)
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  setSaveArrangementConfirmation(null);
                }}
                className="w-full py-2 bg-transparent hover:bg-white/5 text-gray-400 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Arrangement Confirmation Modal */}
      {deleteArrangementConfirmation && (
        <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-rose-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 flex flex-col space-y-4">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-rose-400">
              <span>⚠️</span>
              <span>Confirm Deletion</span>
            </div>

            <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
              <p className="text-[10.5px]">
                Are you sure you want to permanently delete the arrangement:
              </p>
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 font-black tracking-wide rounded-xl text-center uppercase text-[11px]">
                {getPresetInputDisplayName(deleteArrangementConfirmation.name)}
              </div>
              
              {deleteArrangementConfirmation.isActive && (
                <div className="p-3 bg-amber-500/15 border border-amber-500/20 rounded-xl space-y-1.5 mt-2">
                  <p className="text-[10px] text-amber-300 font-black uppercase tracking-wider flex items-center gap-1">
                    <span>🚨 Critical Warning:</span>
                  </p>
                  <p className="text-[9.5px] text-gray-400 leading-normal font-medium">
                    This arrangement is currently active on screen! If deleted, the song will reset to its default arrangement, and you will be asked to choose a replacement to update your setlist mapping.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1.5">
              <button
                onClick={async () => {
                  const { name, isActive } = deleteArrangementConfirmation;
                  setDeleteArrangementConfirmation(null);
                  await deletePresetArrangement(name, isActive);
                }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                Yes, Delete Permanently
              </button>
              <button
                onClick={() => {
                  setDeleteArrangementConfirmation(null);
                }}
                className="w-full py-2 bg-transparent hover:bg-white/5 text-gray-400 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arrangement Replacement Selection Modal */}
      {arrangementReplacementModal && (
        <div className="fixed inset-0 bg-[#020205]/90 backdrop-blur-md z-[900] flex items-center justify-center p-4 animate-fadeIn select-none">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 flex flex-col space-y-4">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-indigo-400">
              <span>🔄</span>
              <span>Choose Replacement</span>
            </div>

            <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
              <p className="text-[10.5px]">
                The arrangement <span className="text-rose-400 font-bold uppercase">"{arrangementReplacementModal.deletedName}"</span> has been deleted and no longer exists.
              </p>
              <p className="text-[10.5px] text-gray-400">
                Choose a replacement arrangement for this song in the current setlist:
              </p>

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                {arrangementReplacementModal.availablePresets.length > 0 ? (
                  arrangementReplacementModal.availablePresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={async () => {
                        setArrangementReplacementModal(null);
                        const friendlyName = parsePresetDate(preset.name).baseName;
                        
                        // If inside a setlist context, map this replacement arrangement to the setlist permanently
                        if (activeSetlistFolder && currentSong) {
                          await updateSetlistArrangementDirectly(
                            String(currentSong.SongID),
                            preset.roadmap,
                            preset.key,
                            preset.name
                          );
                          // Reload song with the new arrangement
                          await executeSongLoad(currentSong, false);
                          showToast(`Setlist arrangement replaced with: ${friendlyName}`, 'success');
                        } else {
                          // Just load it on screen
                          loadPresetArrangement(preset.name);
                          setCurrentArrangementName(preset.name);
                          showToast(`Loaded arrangement: ${friendlyName}`, 'success');
                        }
                      }}
                      className="w-full flex items-center justify-between p-2 bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-500/10 hover:border-indigo-500/30 rounded-xl text-[10px] text-indigo-300 hover:text-white text-left font-black uppercase transition-all cursor-pointer"
                    >
                      <span>{parsePresetDate(preset.name).baseName}</span>
                      <span className="text-[7.5px] bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-400 font-mono font-bold">LOAD & UPDATE</span>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-4 text-[9px] text-gray-500 italic">
                    No other saved arrangements found for this song.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1.5">
              <button
                onClick={async () => {
                  setArrangementReplacementModal(null);
                  if (currentSong) {
                    // Clear any setlist mapping to restore the default arrangement mapping
                    if (activeSetlistFolder) {
                      try {
                        const payloadSet = {
                          action: 'deleteArrangement',
                          songId: String(currentSong.SongID),
                          name: `Set: ${activeSetlistFolder}`,
                        };
                        await fetch(SCRIPT_URL, {
                          method: 'POST',
                          body: JSON.stringify(payloadSet),
                        });
                      } catch {}
                    }
                    await executeSongLoad(currentSong, true);
                    showToast('Restored default song arrangement mapping.', 'info');
                  }
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                Restore Default Song Structure
              </button>
              
              <button
                onClick={() => {
                  setArrangementReplacementModal(null);
                  showToast('Dismissed. Temporary default arrangement loaded on screen.', 'info');
                }}
                className="w-full py-2 bg-transparent hover:bg-white/5 text-gray-400 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Keep Empty / Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive A4 PDF Print Preview Modal */}
      {isPDFPreviewOpen && currentSong && (() => {
        // Compute preview songs data dynamically inside a scoped render block to stay robust and responsive
        const isInsideSetlistContext = !!activeSetlistFolder && setlists.length > 1;
        
        let previewSongsData: any[] = [];
        if (!isInsideSetlistContext || pdfScope === 'current') {
          previewSongsData = [getSongPreviewData(currentSong)];
        } else if (pdfScope === 'all') {
          const resolvedSetSongs = setlists
            .map((id) => songs.find((s) => String(s.SongID) === String(id)))
            .filter((s): s is Song => !!s);
          previewSongsData = resolvedSetSongs.map(s => getSongPreviewData(s));
        } else if (pdfScope === 'custom') {
          const resolvedSetSongs = setlists
            .map((id) => songs.find((s) => String(s.SongID) === String(id)))
            .filter((s): s is Song => !!s);
          previewSongsData = resolvedSetSongs
            .filter(s => pdfSelectedSongIds.includes(String(s.SongID)))
            .map(s => getSongPreviewData(s));
        } else {
          previewSongsData = [getSongPreviewData(currentSong)];
        }

        return (
          <div className="fixed inset-0 bg-[#020205]/90 backdrop-blur-md z-[800] flex items-center justify-center p-4 md:p-6 select-none animate-fadeIn">
            <div className="w-full max-w-5xl h-[90vh] bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-scaleIn">
              
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl sm:text-2xl">📄</span>
                  <div>
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-indigo-300">
                      PDF Print Preview
                    </h2>
                    <p className="text-[10px] text-gray-400 font-medium">
                      Inspect your layout, customize options in real-time, and download/print the A4 song sheet.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPDFPreviewOpen(false)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all active:scale-95 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Main Body - Sidebar + Live Paper Preview Container */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                
                {/* Left/Top Column: Real-time Controls */}
                <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 p-5 shrink-0 bg-indigo-950/15 overflow-y-auto">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4">
                    Print Customization
                  </h3>

                  <div className="space-y-4">
                    
                    {/* Include in Export - Only shown if activeSetlistFolder is active and has multiple songs */}
                    {isInsideSetlistContext && (
                      <div className="space-y-2 select-none border-b border-white/5 pb-4">
                        <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                          Include in Export
                        </label>
                        <select
                          value={pdfScope}
                          onChange={(e) => setPdfScope(e.target.value as any)}
                          className="w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
                        >
                          <option value="current" className="bg-[#0c0d1b]">Viewed Song Only</option>
                          <option value="all" className="bg-[#0c0d1b]">All Songs in Setlist</option>
                          <option value="custom" className="bg-[#0c0d1b]">Select Songs...</option>
                        </select>

                        {/* Custom Checkbox Selection List - active only when custom is selected */}
                        {pdfScope === 'custom' && (
                          <div className="mt-3 bg-[#020205]/60 border border-white/5 rounded-xl p-2.5 max-h-[160px] overflow-y-auto custom-scrollbar space-y-2">
                            <span className="text-[8px] font-black uppercase text-indigo-400 tracking-wider block">
                              CHECK SONGS TO INCLUDE
                            </span>
                            {setlists
                              .map((id) => songs.find((s) => String(s.SongID) === String(id)))
                              .filter((s): s is Song => !!s)
                              .map((song, sIdx) => {
                                const sIdStr = String(song.SongID);
                                const isChecked = pdfSelectedSongIds.includes(sIdStr);
                                return (
                                  <label
                                    key={song.SongID}
                                    className="flex items-center gap-2 text-[10px] font-semibold text-gray-300 hover:text-white cursor-pointer select-none leading-tight"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setPdfSelectedSongIds(prev => prev.filter(id => id !== sIdStr));
                                        } else {
                                          setPdfSelectedSongIds(prev => [...prev, sIdStr]);
                                        }
                                      }}
                                      className="accent-indigo-500 rounded border-white/10"
                                    />
                                    <span className="truncate">
                                      <span className="text-gray-500 font-bold mr-1">#{sIdx + 1}</span>
                                      {song.Title}
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Chords Display Mode */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                        Display Mode
                      </label>
                      <select
                        value={displayMode}
                        onChange={(e) => setDisplayMode(e.target.value as any)}
                        className="w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
                      >
                        <option value="both" className="bg-[#0c0d1b]">Show Chords & Numbers</option>
                        <option value="chords" className="bg-[#0c0d1b]">Chords Only</option>
                        <option value="numbers" className="bg-[#0c0d1b]">Numbers Only</option>
                      </select>
                    </div>

                    {/* Lyrics Visibility */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                        Lyrics Visibility
                      </label>
                      <select
                        value={showLyrics ? 'true' : 'false'}
                        onChange={(e) => setShowLyrics(e.target.value === 'true')}
                        className="w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
                      >
                        <option value="true" className="bg-[#0c0d1b]">Show Lyrics</option>
                        <option value="false" className="bg-[#0c0d1b]">Hide Lyrics</option>
                      </select>
                    </div>

                    {/* Sheet Layout Mode */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                        Sheet Layout Mode
                      </label>
                      <select
                        value={sheetLayoutMode}
                        onChange={(e) => setSheetLayoutMode(e.target.value as any)}
                        className="w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
                      >
                        <option value="sequence" className="bg-[#0c0d1b]">Flow Sequence</option>
                        <option value="compact" className="bg-[#0c0d1b]">Compact</option>
                      </select>
                    </div>

                    {/* Active Key Quick Selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                        Transposed Key (Viewed Song)
                      </label>
                      <div className="flex items-center justify-between gap-1 bg-[#020205]/40 p-1.5 rounded-xl border border-white/5">
                        <button
                          onClick={() => {
                            const keys = Object.keys(NOTE_TO_INDEX);
                            const currIdx = keys.indexOf(currentKey);
                            const prevIdx = (currIdx - 1 + keys.length) % keys.length;
                            setCurrentKey(keys[prevIdx]);
                          }}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 text-[10px] font-bold text-indigo-300 cursor-pointer animate-press"
                        >
                          ◀
                        </button>
                        <span className="text-xs font-mono font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg shadow-inner min-w-[50px] text-center select-none">
                          {currentKey}
                        </span>
                        <button
                          onClick={() => {
                            const keys = Object.keys(NOTE_TO_INDEX);
                            const currIdx = keys.indexOf(currentKey);
                            const nextIdx = (currIdx + 1) % keys.length;
                            setCurrentKey(keys[nextIdx]);
                          }}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 text-[10px] font-bold text-indigo-300 cursor-pointer animate-press"
                        >
                          ▶
                        </button>
                      </div>
                    </div>

                    {/* Song Transposition Customizer (Only shown if exporting multiple songs) */}
                    {previewSongsData.length > 1 && (
                      <div className="space-y-2 border-t border-white/5 pt-4 animate-fadeIn">
                        <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                          <span>🎹</span> Transpose Individual Songs
                        </label>
                        <div className="space-y-2 bg-[#020205]/40 p-2.5 rounded-xl border border-indigo-500/10 max-h-[220px] overflow-y-auto custom-scrollbar">
                          {previewSongsData.map((songData, sIdx) => {
                            const songIdStr = String(songData.song.SongID);
                            const resolvedKey = pdfSongKeys[songIdStr] || songData.key;
                            return (
                              <div key={songIdStr} className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[9.5px] font-extrabold text-white truncate uppercase">
                                    {sIdx + 1}. {songData.song.Title}
                                  </div>
                                  <div className="text-[8.5px] text-indigo-300 font-mono">
                                    Orig: {songData.song.OriginalKey || 'C'}
                                  </div>
                                </div>
                                <select
                                  value={resolvedKey}
                                  onChange={(e) => {
                                    const newKey = e.target.value;
                                    setPdfSongKeys(prev => ({
                                      ...prev,
                                      [songIdStr]: newKey
                                    }));
                                    showToast(`Transposed "${songData.song.Title}" to ${newKey}`, 'success');
                                  }}
                                  className="bg-indigo-950/50 text-indigo-200 border border-indigo-500/30 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer hover:bg-indigo-900/60 transition-all shadow-sm"
                                >
                                  {NOTES.map((k) => (
                                    <option key={k} value={k} className="bg-[#0c0d1b] text-indigo-100 font-bold">
                                      Key of {k}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Context Note block */}
                    <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1.5 select-none">
                      <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                        <span>💡</span> Live Adjustments
                      </span>
                      <p className="text-[9.5px] text-gray-400 leading-normal font-medium">
                        Changing settings on the left will immediately re-render your preview on the right and update the final printed file.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Interactive paper canvas */}
                <div className="flex-1 bg-black/45 p-4 sm:p-6 overflow-y-auto flex items-start justify-center custom-scrollbar select-text">
                  
                  {/* Physical A4 Sheet Container */}
                  <div className="w-full max-w-[210mm] bg-white text-slate-900 shadow-2xl rounded-lg p-6 sm:p-10 font-sans border border-slate-200 space-y-12">
                    
                    {previewSongsData.map((songData, sIdx) => {
                      const { key: songKey, roadmap: songRoadmap, sectionTemplates: songTemplates, title, artist, song } = songData;
                      const repInfo = getRoadmapRepetitionInfo(songRoadmap);
                      return (
                        <div key={song.SongID} className={`print-song-page-preview ${sIdx > 0 ? 'border-t-2 border-slate-200 pt-10 mt-10' : ''}`}>
                          {/* Header Container */}
                          <div className="border-b-2 border-slate-900 pb-2 mb-4 flex justify-between items-end">
                            <div>
                              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none uppercase flex items-center gap-2">
                                {setlists.length > 1 && pdfScope !== 'current' && (
                                  <span className="text-[11px] bg-slate-900 text-white font-extrabold px-1.5 py-0.5 rounded">
                                    #{setlists.indexOf(String(song.SongID)) + 1}
                                  </span>
                                )}
                                <span>{title}</span>
                              </h1>
                              <h2 className="text-[10px] font-bold text-slate-500 mt-1 uppercase">
                                BY {artist}
                              </h2>
                            </div>
                            <div className="text-xs font-black text-indigo-600 border border-indigo-600 px-2 py-0.5 rounded-md font-mono select-none">
                              KEY: {songKey.toUpperCase()}
                            </div>
                          </div>

                          {/* Flow Roadmap Box */}
                          <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 mb-5 select-none">
                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">
                              FLOW ROADMAP (TRANSPOSED SEQUENCE)
                            </div>
                            <div className="text-[9.5px] font-bold text-slate-800 leading-normal">
                              {(() => {
                                const renderedRoadmap: any[] = [];
                                songRoadmap.forEach((block: any, idx: number) => {
                                  const isDuplicate = songRoadmap.findIndex((b: any, bIdx: number) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates)) !== -1;
                                  if (isDuplicate) return;
                                  renderedRoadmap.push({ block, originalIdx: idx });
                                });

                                return renderedRoadmap.map(({ block, originalIdx: idx }, rIdx) => {
                                  const blockOffset = block.keyOffset || 0;
                                  const blockKeyName = getModulatedKeyName(songKey, blockOffset);
                                  return (
                                    <span key={block.id}>
                                      {rIdx > 0 && <span className="text-slate-400 mx-1">➔</span>}
                                      <span className="uppercase text-indigo-900 font-bold">
                                        {block.name} <span className="text-[8.5px] text-indigo-600 font-extrabold">({blockKeyName})</span>
                                      </span>
                                    </span>
                                  );
                                });
                              })()}
                            </div>
                          </div>
 
                           {/* Live Sheet Render */}
                           <div className="space-y-4">
                             {songRoadmap.map((block: any, idx: number) => {
                               let blockDisplayName = block.name;
 
                               if (sheetLayoutMode === 'sequence') {
                                 const firstIdenticalIdx = songRoadmap.findIndex((b: any, bIdx: number) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates));
                                 if (firstIdenticalIdx !== -1) {
                                   return (
                                     <div
                                       key={block.id}
                                       className="p-2 mb-2 bg-slate-50 border border-dashed border-indigo-200 rounded text-[10px] font-bold text-indigo-600 flex items-center justify-between select-none"
                                     >
                                       <span>🔁 REPLAY: {block.name.toUpperCase()} (Same chords & lyrics as section #{firstIdenticalIdx + 1} - {songRoadmap[firstIdenticalIdx].name})</span>
                                     </div>
                                   );
                                 }
                               }

                               if (sheetLayoutMode === 'compact') {
                                if (!showLyrics) {
                                  const firstIdx = songRoadmap.findIndex((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
                                  if (firstIdx !== idx) return null;
                                  const identicalBlocks = songRoadmap.filter((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
                                  const uniqueNames = Array.from(new Set(identicalBlocks.map((b: any) => b.name)));
                                  blockDisplayName = uniqueNames.join(' / ');
                                } else {
                                  const firstIdx = songRoadmap.findIndex((b: any) => b.name === block.name);
                                  if (firstIdx !== idx) return null;
                                }
                              }

                              const blockRep = repInfo[idx];
                              const templateLines = songTemplates[block.name] || [];
                              const blockOffset = block.keyOffset || 0;
                              const blockKeyName = getModulatedKeyName(songKey, blockOffset);

                              const originalIdx = NOTE_TO_INDEX[song.OriginalKey || 'C'] || 0;
                              const currentIdx = NOTE_TO_INDEX[songKey] || 0;
                              const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

                              return (
                                <div key={block.id} className="break-inside-avoid">
                                  {/* Section Header */}
                                  <h3 className="text-[11px] font-black text-indigo-950 uppercase tracking-wide border-b border-slate-200 pb-0.5 mb-1.5 select-none flex items-center justify-between">
                                    <span>
                                      {blockDisplayName} {blockOffset !== 0 ? `(KEY: ${blockKeyName})` : ''}
                                    </span>
                                    {blockRep && blockRep.totalInRun > 1 && (
                                      <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 font-mono font-black select-none">
                                        {blockRep.totalInRun}x
                                      </span>
                                    )}
                                  </h3>

                                  {/* Embedded Lyrics Hints if hidden */}
                                  {!showLyrics && (
                                    <div className="mb-2 p-1.5 bg-slate-100 border-l-2 border-indigo-500 rounded-r text-[10px] font-medium text-slate-600 italic select-none">
                                      {(() => {
                                        if (sheetLayoutMode === 'compact') {
                                          const identicalBlocks = songRoadmap.filter((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
                                          const renderedHints: any[] = [];
                                          const seenNames = new Set();
                                          
                                          identicalBlocks.forEach((b: any) => {
                                            if (seenNames.has(b.name)) return;
                                            seenNames.add(b.name);
                                            const lines = songTemplates[b.name] || [];
                                            const firstLyric = lines.find((l: any) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                            if (firstLyric) {
                                              renderedHints.push({ name: b.name, lyric: firstLyric });
                                            }
                                          });

                                          if (renderedHints.length > 0) {
                                            // Group by lyric
                                            const groups: { lyric: string; names: string[] }[] = [];
                                            renderedHints.forEach(h => {
                                              const normLyric = h.lyric.trim();
                                              const existingGroup = groups.find(g => g.lyric.trim().toLowerCase() === normLyric.toLowerCase());
                                              if (existingGroup) {
                                                existingGroup.names.push(h.name);
                                              } else {
                                                groups.push({ lyric: h.lyric, names: [h.name] });
                                              }
                                            });

                                            return groups.map((g, gIdx) => (
                                              <div key={gIdx} className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-1 rounded border border-indigo-100 not-italic">
                                                  {g.names.map(n => n.toUpperCase()).join(' & ')}
                                                </span>
                                                <span className="truncate">“{g.lyric}”</span>
                                                {g.names.length > 1 && (
                                                  <span className="text-[7px] font-bold text-emerald-600 uppercase bg-emerald-50 px-1 rounded border border-emerald-100">
                                                    Shared 1st line
                                                  </span>
                                                )}
                                              </div>
                                            ));
                                          }
                                        } else {
                                          const lines = songTemplates[block.name] || [];
                                          const firstLyric = lines.find((l: any) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                          if (firstLyric) {
                                            return (
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-indigo-600 not-italic">Hint:</span>
                                                <span className="truncate">“{firstLyric}”</span>
                                              </div>
                                            );
                                          }
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  )}

                                  {/* Section Lines */}
                                  <div className="pl-1.5 space-y-1">
                                    {(() => {
                                      const enabledLinesList = templateLines
                                        .map((l: any, lIdx: number) => ({ l, lIdx }))
                                        .filter(({ lIdx }: any) => (block.enabledLines || []).includes(lIdx));

                                      const processedLines = enabledLinesList.map(({ l, lIdx }: any) => {
                                        const transposed = transposeChord(l.Chords || '', totalSemitonesOffset);
                                        const numbers = getNumberForChord(transposed, blockKeyName, songKey);
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
                                          const runLines = processedLines.slice(0, loopLength);
                                          loopContainers.push(
                                            <div
                                              key="loop-run-single"
                                              className="border-l-3 border-amber-500 bg-amber-50 rounded-r-lg px-2.5 py-2 my-2 space-y-1"
                                            >
                                              <div className="flex items-center gap-2 mb-1 select-none">
                                                <span className="text-[8px] font-mono font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm">
                                                  <span>🔁</span> PLAY {repeatCount}X
                                                </span>
                                                <span className="text-[8px] text-amber-600 font-mono tracking-wide">
                                                  (chords progression repeats)
                                                </span>
                                              </div>

                                              <div className="space-y-1">
                                                {runLines.map((lineData) => {
                                                  const { lIdx, transposed, numbers, lyrics } = lineData;
                                                  return (
                                                    <div key={lIdx} className="break-inside-avoid">
                                                      {displayMode !== 'numbers' && transposed && (
                                                        <div className="font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5">
                                                          {transposed}
                                                        </div>
                                                      )}
                                                      {displayMode !== 'chords' && numbers && (
                                                        <div className="font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5">
                                                          {numbers}
                                                        </div>
                                                      )}
                                                      {showLyrics && lyrics && (
                                                        <div className="text-[11px] text-slate-800 leading-tight">
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
                                                className="border-l-3 border-indigo-500 bg-indigo-50 rounded-r-lg px-2.5 py-2 my-2 space-y-1"
                                              >
                                                <div className="flex items-center gap-2 mb-1 select-none">
                                                  {r === 0 ? (
                                                    <>
                                                      <span className="text-[8px] font-mono font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm">
                                                        <span>🔁</span> CHORD LOOP ({repeatCount}X) — ROUND 1
                                                      </span>
                                                      <span className="text-[8px] text-indigo-600 font-mono tracking-wide">
                                                        (chords progression pattern repeats)
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <span className="text-[8px] font-mono font-black uppercase tracking-wider text-indigo-800 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm">
                                                        <span>🔁</span> ROUND {r + 1}
                                                      </span>
                                                      <span className="text-[8px] text-gray-500 font-mono tracking-wide">
                                                        (identical chords as Round 1)
                                                      </span>
                                                    </>
                                                  )}
                                                </div>

                                                <div className="space-y-1">
                                                  {runLines.map((lineData) => {
                                                    const { lIdx, transposed, numbers, lyrics } = lineData;
                                                    return (
                                                      <div key={lIdx} className="break-inside-avoid">
                                                        {displayMode !== 'numbers' && transposed && (
                                                          <div className="font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5">
                                                            {transposed}
                                                          </div>
                                                        )}
                                                        {displayMode !== 'chords' && numbers && (
                                                          <div className="font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5">
                                                            {numbers}
                                                          </div>
                                                        )}
                                                        {showLyrics && lyrics && (
                                                          <div className="text-[11px] text-slate-800 leading-tight">
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
                                              <div className="pt-2 space-y-1 border-t border-dashed border-slate-200">
                                                {remainingLines.map((lineData) => {
                                                  const { lIdx, transposed, numbers, lyrics } = lineData;
                                                  return (
                                                    <div key={lIdx} className="break-inside-avoid">
                                                      {displayMode !== 'numbers' && transposed && (
                                                        <div className="font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5">
                                                          {transposed}
                                                        </div>
                                                      )}
                                                      {displayMode !== 'chords' && numbers && (
                                                        <div className="font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5">
                                                          {numbers}
                                                        </div>
                                                      )}
                                                      {showLyrics && lyrics && (
                                                        <div className="text-[11px] text-slate-800 leading-tight">
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

                                        return (
                                          <div key={lIdx} className="break-inside-avoid">
                                            {displayMode !== 'numbers' && transposed && (
                                              <div className="font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5 flex items-center gap-2 flex-wrap">
                                                <span>{transposed}</span>
                                                {run.count > 1 && (
                                                  <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide">
                                                    {run.count}x
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            {displayMode !== 'chords' && numbers && (
                                              <div className="font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5 flex items-center gap-2 flex-wrap">
                                                <span>{numbers}</span>
                                                {run.count > 1 && displayMode === 'numbers' && (
                                                  <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide">
                                                    {run.count}x
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            {showLyrics && lyrics && (
                                              <div className="text-[11px] text-slate-800 leading-tight">
                                                {lyrics}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Modal Footer Controls */}
              <div className="px-5 py-4 border-t border-white/5 bg-[#080812] flex items-center justify-between shrink-0 gap-3">
                <button
                  onClick={() => setIsPDFPreviewOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    exportToPDF();
                    setIsPDFPreviewOpen(false);
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-500/10 cursor-pointer flex items-center gap-1.5"
                >
                  <span>🖨️</span>
                  <span>Print / Save as PDF</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

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
          } else if (toast.type === 'warning') {
            theme = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
            symbol = '⚠️';
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
