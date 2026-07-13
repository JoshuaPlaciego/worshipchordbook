import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { DeviceWorkspaceModal } from './components/DeviceWorkspaceModal';
import { DatabaseDiagnosticModal } from './components/DatabaseDiagnosticModal';
import { ArrangementDAWModal } from './components/ArrangementDAWModal';
import SetlistSelectorDialog from './components/SetlistSelectorDialog';
import { InstallAndConfigureModal } from './components/InstallAndConfigureModal';
import { AdminDatabaseModal } from './components/AdminDatabaseModal';
import { LiveConcertClock } from './components/LiveConcertClock';
import { MarqueeTitle } from './components/MarqueeTitle';
import {
  saveHandleToDB,
  getHandleFromDB,
  removeHandleFromDB,
  verifyPermission,
  writeJsonToFile,
  readJsonFromFile,
  listFilesInSubfolder,
  exportAllToDevice,
  importAllFromDevice
} from './lib/deviceSync';
import { FALLBACK_SONGS, FALLBACK_SONG_LINES } from './fallbackData';
import { 
  Music, Sparkles, Folder, Star, Info, List, 
  Settings, Clock, Compass, Activity, Database, Play, Eye, 
  Terminal, BarChart2, Shield, Calendar, Layers, ChevronRight
} from 'lucide-react';

const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXCeXackc_suAUMKCGJ6qIjMygAADB9zHmoJ5EqWU_OTmBxkgH9uHLP4nY427farS5/exec';

export const getStoredScriptUrls = (): string[] => {
  try {
    const stored = localStorage.getItem('custom_script_urls');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const single = localStorage.getItem('custom_script_url');
  if (single) return [single];
  return [DEFAULT_SCRIPT_URL];
};

export const getStoredAlertEmails = (): string[] => {
  try {
    const stored = localStorage.getItem('custom_alert_emails');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

let SCRIPT_URL = getStoredScriptUrls()[0];
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

  // Global cursor loading state helpers
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

    if (isLoading) {
      incrementProcessing();
    } else {
      decrementProcessing();
    }

    return () => {
      if (isLoading) {
        decrementProcessing();
      }
    };
  }, [isLoading]);

  const [currentTab, setCurrentTab] = useState<'songs' | 'setlists' | 'favorites'>('songs');
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isAdminDatabaseModalOpen, setIsAdminDatabaseModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [currentScriptUrls, setCurrentScriptUrls] = useState<string[]>(getStoredScriptUrls);
  const [currentScriptUrl, setCurrentScriptUrl] = useState(SCRIPT_URL);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [alertEmails, setAlertEmails] = useState<string[]>(getStoredAlertEmails);

  // Helper to fetch central cluster node directory from primary node
  const syncClusterDirectory = async (primaryUrl: string): Promise<string[] | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${primaryUrl}?tab=Setlists`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const text = await res.text();
      const setlists = JSON.parse(text);
      if (Array.isArray(setlists)) {
        const clusterRow = setlists.find(row => (row.Set || row.PresetName) === 'SYSTEM_CONFIG_CLUSTER_NODES');
        if (clusterRow) {
          const rawJson = clusterRow['Songs & Arrangements'] || clusterRow.RoadmapJSON || '{}';
          const data = JSON.parse(rawJson);
          if (data && Array.isArray(data.urls) && data.urls.length > 0) {
            return data.urls as string[];
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch central cluster directory:', err);
    }
    return null;
  };

  // Helper to save central cluster node directory to primary node
  const saveClusterDirectoryToCloud = async (urls: string[]): Promise<boolean> => {
    try {
      const payload = {
        action: 'saveSetlist',
        name: 'SYSTEM_CONFIG_CLUSTER_NODES',
        roadmap: { urls, lastUpdated: Date.now() },
      };
      const res = await fetch(urls[0], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resJson = await res.json();
      return resJson.status === 'success';
    } catch (err) {
      console.warn('Error saving cluster directory to cloud:', err);
      return false;
    }
  };

  // Helper to save central alert emails configuration to primary node
  const saveAlertEmailsToCloud = async (emails: string[]): Promise<boolean> => {
    try {
      const urls = getStoredScriptUrls();
      const payload = {
        action: 'saveSetlist',
        name: 'SYSTEM_CONFIG_ALERT_EMAILS',
        roadmap: { emails, lastUpdated: Date.now() },
      };
      const res = await fetch(urls[0], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resJson = await res.json();
      return resJson.status === 'success';
    } catch (err) {
      console.warn('Error saving alert emails configuration to cloud:', err);
      return false;
    }
  };

  const handleSaveAlertEmails = async (emails: string[]) => {
    localStorage.setItem('custom_alert_emails', JSON.stringify(emails));
    setAlertEmails(emails);

    // If logged in as admin and a sheet node is connected, propagate to cloud
    if (appUser && appSecret && currentScriptUrls.length > 0) {
      showToast('Propagating Alert Emails to central cloud directory...', 'info');
      const cloudSuccess = await saveAlertEmailsToCloud(emails);
      if (cloudSuccess) {
        showToast('Alert Emails successfully saved to Central Cloud Directory!', 'success');
      } else {
        showToast('⚠️ Local alert emails updated, but failed to sync to cloud. Ensure Apps Script is correct.', 'warning');
      }
    } else {
      showToast('Alert Emails list updated locally!', 'success');
    }
  };

  const handleSaveScriptUrls = async (urls: string[]) => {
    localStorage.setItem('custom_script_urls', JSON.stringify(urls));
    if (urls.length > 0) {
      localStorage.setItem('custom_script_url', urls[0]);
      SCRIPT_URL = urls[0];
      setCurrentScriptUrl(urls[0]);
    } else {
      localStorage.removeItem('custom_script_url');
      SCRIPT_URL = DEFAULT_SCRIPT_URL;
      setCurrentScriptUrl(DEFAULT_SCRIPT_URL);
    }
    setCurrentScriptUrls(urls);

    // If logged in as admin and a sheet node is connected, propagate cluster list to cloud
    if (appUser && appSecret && urls.length > 0) {
      showToast('Propagating Cluster update to cloud directory...', 'info');
      const cloudSuccess = await saveClusterDirectoryToCloud(urls);
      if (cloudSuccess) {
        showToast('Spreadsheet Cluster successfully saved to Central Cloud Directory!', 'success');
      } else {
        showToast('⚠️ Local cluster updated, but failed to sync to cloud directory. Ensure Apps Script is correct.', 'warning');
      }
    } else {
      showToast('Spreadsheet Cluster config updated locally!', 'success');
    }

    setTimeout(() => {
      fetchCatalog();
    }, 100);
  };

  const handleSaveScriptUrl = (url: string) => {
    // Legacy support: updates the cluster with just this one URL or prepends it
    const updatedUrls = [url];
    handleSaveScriptUrls(updatedUrls);
  };

  const handleResetScriptUrl = () => {
    localStorage.removeItem('custom_script_urls');
    localStorage.removeItem('custom_script_url');
    SCRIPT_URL = DEFAULT_SCRIPT_URL;
    setCurrentScriptUrl(DEFAULT_SCRIPT_URL);
    setCurrentScriptUrls([DEFAULT_SCRIPT_URL]);
    showToast('Database Cluster reset to default.', 'info');
    setTimeout(() => {
      fetchCatalog();
    }, 100);
  };
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

  // Local Setlists & Mode toggles
  const [localSetlists, setLocalSetlists] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('worship_local_setlists');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [setlistsTabMode, setSetlistsTabMode] = useState<'online' | 'local'>(() => {
    return (localStorage.getItem('setlists_tab_mode') as 'online' | 'local') || 'online';
  });

  const [activeSetlistType, setActiveSetlistType] = useState<'online' | 'local'>(() => {
    return (localStorage.getItem('active_setlist_type') as 'online' | 'local') || 'online';
  });

  // Device Directory handle state
  const [deviceDirHandle, setDeviceDirHandle] = useState<any | null>(null);
  const [deviceDirName, setDeviceDirName] = useState<string>('');
  const [deviceDirPermission, setDeviceDirPermission] = useState<boolean>(false);
  const [isDeviceOnboardingOpen, setIsDeviceOnboardingOpen] = useState<boolean>(false);

  // Sync state on load
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const handle = await getHandleFromDB();
        if (handle) {
          setDeviceDirHandle(handle);
          setDeviceDirName(handle.name);
          // Query if permission is already granted
          const status = await handle.queryPermission({ mode: 'readwrite' });
          if (status === 'granted') {
            setDeviceDirPermission(true);
          } else {
            setDeviceDirPermission(false);
          }
        } else {
          // Check if visited before
          const hasConnectedBefore = localStorage.getItem('has_connected_device_dir_v1');
          if (!hasConnectedBefore) {
            setIsDeviceOnboardingOpen(true);
          }
        }
      } catch (err) {
        console.error('Error loading workspace handle:', err);
      }
    }
    loadWorkspace();
  }, []);

  const handleConnectDeviceFolder = async () => {
    try {
      if (typeof (window as any).showDirectoryPicker !== 'function') {
        showToast('Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.', 'error');
        return;
      }
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      if (handle) {
        const permitted = await verifyPermission(handle, true);
        if (permitted) {
          setDeviceDirHandle(handle);
          setDeviceDirName(handle.name);
          setDeviceDirPermission(true);
          await saveHandleToDB(handle);
          localStorage.setItem('has_connected_device_dir_v1', 'true');
          setIsDeviceOnboardingOpen(false);
          showToast(`Connected Workspace Folder: "${handle.name}"`, 'success');

          // Export current state
          try {
            const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
            await exportAllToDevice(handle, songs, localSetlists, localArrs);
            showToast('Synchronized current database to your device workspace folder!', 'success');
          } catch (syncErr) {
            console.error('Initial export failed:', syncErr);
            showToast('Connected, but initial database sync failed.', 'warning');
          }
        } else {
          showToast('Read/Write permission is required to sync to device workspace.', 'error');
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Directory selection failed:', err);
        showToast('Failed to select workspace folder.', 'error');
      }
    }
  };

  const handleRequestWorkspacePermission = async () => {
    if (!deviceDirHandle) return;
    try {
      const permitted = await verifyPermission(deviceDirHandle, true);
      if (permitted) {
        setDeviceDirPermission(true);
        showToast('Access to Device Workspace restored!', 'success');
      } else {
        showToast('Permission denied. Cannot write to device folder.', 'error');
      }
    } catch (err) {
      console.error('Failed to request permission:', err);
      showToast('Error requesting directory permission.', 'error');
    }
  };

  const handleDisconnectDeviceFolder = async () => {
    try {
      await removeHandleFromDB();
      setDeviceDirHandle(null);
      setDeviceDirName('');
      setDeviceDirPermission(false);
      showToast('Device Workspace folder disconnected.', 'info');
    } catch (err) {
      console.error('Error disconnecting directory:', err);
    }
  };

  const handleSyncExportToDevice = async () => {
    if (!deviceDirHandle) return;
    setIsLoading(true);
    try {
      const permitted = await verifyPermission(deviceDirHandle, true);
      if (!permitted) {
        showToast('Permission required to save files.', 'error');
        setIsLoading(false);
        return;
      }
      const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
      await exportAllToDevice(deviceDirHandle, songs, localSetlists, localArrs);
      showToast('Successfully exported all songs, arrangements, and setlists to your device!', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Check console.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncImportFromDevice = async () => {
    if (!deviceDirHandle) return;
    setIsLoading(true);
    try {
      const permitted = await verifyPermission(deviceDirHandle, true);
      if (!permitted) {
        showToast('Permission required to read files.', 'error');
        setIsLoading(false);
        return;
      }
      const data = await importAllFromDevice(deviceDirHandle);
      
      if (data.songs && data.songs.length > 0) {
        setSongs((prevSongs) => {
          const songMap = new Map(prevSongs.map((s) => [String(s.SongID), s]));
          for (const s of data.songs) {
            songMap.set(String(s.SongID), s);
          }
          const merged = Array.from(songMap.values());
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
          return merged;
        });
      }

      if (data.localSetlists && data.localSetlists.length > 0) {
        setLocalSetlists((prevSets) => {
          const setMap = new Map(prevSets.map((s) => [s.PresetName, s]));
          for (const s of data.localSetlists) {
            setMap.set(s.PresetName, s);
          }
          const merged = Array.from(setMap.values());
          localStorage.setItem('worship_local_setlists', JSON.stringify(merged));
          return merged;
        });
      }

      if (data.localArrs && data.localArrs.length > 0) {
        const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
        const arrMap = new Map(localArrs.map((arr: any) => [`${arr.SongID}_${arr.PresetName}`, arr]));
        for (const arr of data.localArrs) {
          arrMap.set(`${arr.SongID}_${arr.PresetName}`, arr);
        }
        const merged = Array.from(arrMap.values());
        localStorage.setItem('local_setlist_arrangements', JSON.stringify(merged));
      }

      showToast('Successfully imported and merged database from your device workspace!', 'success');
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Import failed. Check console.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoMirrorToDevice = async () => {
    if (deviceDirHandle && deviceDirPermission) {
      try {
        const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
        await exportAllToDevice(deviceDirHandle, songs, localSetlists, localArrs);
      } catch (err) {
        console.error('Background auto-mirror failed:', err);
      }
    }
  };

  const handleImportSetlistJSON = async (json: any) => {
    if (!json || json.type !== 'worship_setlist') {
      showToast('Invalid setlist format! Must be a Worship Setlist JSON.', 'error');
      return;
    }
    
    const folderName = json.name || 'Imported Setlist';
    const songIds = Array.isArray(json.songIds) ? json.songIds : [];
    const arrangements = Array.isArray(json.arrangements) ? json.arrangements : [];

    if (setlistsTabMode === 'local') {
      // Save to localSetlists
      const updatedLocal = [
        ...localSetlists.filter((sl) => sl.PresetName !== folderName),
        {
          PresetName: folderName,
          RoadmapJSON: JSON.stringify({ songIds, lastUpdated: Date.now(), locked: false })
        }
      ];
      setLocalSetlists(updatedLocal);
      localStorage.setItem('worship_local_setlists', JSON.stringify(updatedLocal));

      // Save arrangements
      const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
      const filteredLocalArrs = localArrs.filter((arr: any) => arr.PresetName !== `Set: ${folderName}`);
      const nextLocalArrs = [...filteredLocalArrs, ...arrangements];
      localStorage.setItem('local_setlist_arrangements', JSON.stringify(nextLocalArrs));

      showToast(`Setlist "${folderName}" imported to local sets successfully!`, 'success');
    } else {
      // Save to remote (online) sets if admin
      const isViewerMode = !(appUser && appSecret);
      if (isViewerMode) {
        showToast('Cannot import to online sets in Viewer Mode. Please switch to LOCAL sets.', 'warning');
        return;
      }
      setIsLoading(true);
      try {
        // Save metadata
        const payloadMeta = {
          action: 'saveSetlist',
          name: folderName,
          roadmap: { songIds, lastUpdated: Date.now(), locked: false },
        };
        await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payloadMeta),
        });
        
        // Save each arrangement in the setlist
        for (const arr of arrangements) {
          const payloadArr = {
            action: 'saveArrangement',
            songId: arr.SongID,
            presetName: arr.PresetName,
            roadmapJSON: arr.RoadmapJSON,
          };
          await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadArr),
          });
        }
        showToast(`Setlist "${folderName}" imported and synced online successfully!`, 'success');
        await refetchArrangements();
      } catch (err) {
        showToast('Failed to import and sync online', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleExportSetlistJSON = (setName: string) => {
    // Find the setlist metadata
    const setlistMeta = (setlistsTabMode === 'local' ? localSetlists : allSharedSetlists).find(
      (sl) => sl.PresetName === setName
    );
    if (!setlistMeta) {
      showToast(`Setlist "${setName}" not found!`, 'error');
      return;
    }

    let songIds: string[] = [];
    try {
      const parsed = JSON.parse(setlistMeta.RoadmapJSON);
      songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
    } catch {}

    // Find all arrangements for this setlist
    let arrangements: any[] = [];
    if (setlistsTabMode === 'local') {
      const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
      arrangements = localArrs.filter((arr: any) => arr.PresetName === `Set: ${setName}`);
    } else {
      arrangements = allSharedArrangements.filter((arr: any) => arr.PresetName === `Set: ${setName}`);
    }

    const exportData = {
      type: "worship_setlist",
      name: setName,
      songIds: songIds,
      arrangements: arrangements
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = setName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    a.download = `setlist_${safeName}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported "${setName}" setlist JSON successfully!`, 'success');
  };

  // Selected Song Sheets & Keys
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [formEditingSong, setFormEditingSong] = useState<Song | null>(null);
  const [currentKey, setCurrentKey] = useState('C');
  const [capo, setCapo] = useState<number>(0);
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
  const [pdfShowHeaders, setPdfShowHeaders] = useState(false);
  const [pdfShowMetadata, setPdfShowMetadata] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);

  // Autoscroll Engine
  const [isScrollingActive, setIsScrollingActive] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3.0);

  // Metronome Engine
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  // Performance Mode view
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [performanceTheme, setPerformanceTheme] = useState<'dark' | 'light'>('dark');

  // Performance Arrangement / Roadmap
  const [activeRoadmap, setActiveRoadmap] = useState<RoadmapBlock[]>([]);
  const [sectionTemplates, setSectionTemplates] = useState<{ [key: string]: SongLine[] }>({});
  const [loadedSnapshotSections, setLoadedSnapshotSections] = useState<{ [key: string]: SongLine[] } | null>(null);

  // Cross-song section/line pulling state
  const [isPullingFromOtherSong, setIsPullingFromOtherSong] = useState(false);
  const [pullSourceSongId, setPullSourceSongId] = useState<string | number | ''>('');
  const [pullSourceSectionName, setPullSourceSectionName] = useState<string>('');

  const effectiveSectionTemplates = useMemo(() => {
    const result: { [key: string]: SongLine[] } = {};
    
    // First, populate all live sectionTemplates
    Object.keys(sectionTemplates).forEach((secName) => {
      result[secName] = sectionTemplates[secName];
    });
    
    // If we have loaded snapshot sections, overlay them. Snapshots are the absolute source of truth for saved arrangements.
    if (loadedSnapshotSections) {
      Object.keys(loadedSnapshotSections).forEach((secName) => {
        result[secName] = loadedSnapshotSections[secName];
      });
    }
    
    return result;
  }, [sectionTemplates, loadedSnapshotSections]);

  const [originalRoadmap, setOriginalRoadmap] = useState<RoadmapBlock[]>([]);
  const [arrangerOpen, setArrangerOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [isArrangementLocked, setIsArrangementLocked] = useState<boolean>(false);
  const [roadmapBackup, setRoadmapBackup] = useState<RoadmapBlock[] | null>(null);
  const [nameBackup, setNameBackup] = useState<string>('');
  const [currentArrangementName, setCurrentArrangementName] = useState<string>('');
  const [expandedArrangementSetlists, setExpandedArrangementSetlists] = useState<{ [setName: string]: boolean }>({});
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
  const isAdmin = !!(appUser && appSecret);
  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  // Dialog Toggles
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isSecurityCutoffModalOpen, setIsSecurityCutoffModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMusicianModalOpen, setIsMusicianModalOpen] = useState(false);
  const [selectedChord, setSelectedChord] = useState('');
  const [dashboardSetlistType, setDashboardSetlistType] = useState<'online' | 'local'>('online');

  // Load & Configure Modal States
  const [pendingSongLoad, setPendingSongLoad] = useState<{
    song: Song;
    forceDefaultArrangement: boolean;
    activeFolderOverride?: string;
    arrsOverride?: any[];
  } | null>(null);
  const [loadConfigDisplayMode, setLoadConfigDisplayMode] = useState<'both' | 'chords' | 'numbers'>('both');
  const [loadConfigShowLyrics, setLoadConfigShowLyrics] = useState<boolean>(true);
  const [loadConfigSheetLayoutMode, setLoadConfigSheetLayoutMode] = useState<'sequence' | 'compact'>('sequence');

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

  const getSetlistArrangement = (setId: string, songId: string) => {
    try {
      const localArrsRaw = localStorage.getItem('local_setlist_arrangements');
      if (localArrsRaw) {
        const localArrs = JSON.parse(localArrsRaw);
        const found = localArrs.find(
          (arr: any) =>
            String(arr.SongID) === String(songId) &&
            arr.PresetName.toLowerCase().trim() === `set: ${setId}`.toLowerCase().trim()
        );
        if (found) return found;
      }
    } catch (err) {
      console.error('Error reading local setlist arrangement', err);
    }

    return allSharedArrangements.find(
      (arr: any) =>
        String(arr.SongID) === String(songId) &&
        arr.PresetName.toLowerCase().trim() === `set: ${setId}`.toLowerCase().trim()
    ) || null;
  };
  (window as any).getSetlistArrangement = getSetlistArrangement;
  (window as any).areRoadmapsIdentical = areRoadmapsIdentical;

  const exportToPDF = () => {
    window.print();
  };
  (window as any).exportToPDF = exportToPDF;

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
      const urls = getStoredScriptUrls();
      const results = await Promise.all(
        urls.map(async (url) => {
          try {
            const fetchTab = async (tabName: string) => {
              try {
                const res = await fetch(`${url}?tab=${tabName}`);
                if (!res.ok) return [];
                const text = await res.text();
                const parsed = JSON.parse(text);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            };
            const [presetsList, setlistsList] = await Promise.all([
              fetchTab('Arrangements'),
              fetchTab('Setlists')
            ]);
            return {
              presets: presetsList,
              setlists: setlistsList,
            };
          } catch (e) {
            console.warn(`Failed to refetch arrangements from node ${url}`, e);
            return null;
          }
        })
      );

      const mergedArrMap = new Map<string, any>();
      const mergedSetlistsMap = new Map<string, any>();

      for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i];
        if (!r) continue;

        if (Array.isArray(r.presets)) {
          r.presets.forEach((row: any) => {
            if (row && row.SongID && row.PresetName) {
              const key = `${row.SongID}_${row.PresetName}`;
              mergedArrMap.set(key, {
                SongID: String(row.SongID),
                PresetName: String(row.PresetName),
                RoadmapJSON: String(row.RoadmapJSON),
              });
            }
          });
        }

        if (Array.isArray(r.setlists)) {
          r.setlists.forEach((row: any) => {
            const name = row.Set || row.PresetName || '';
            if (name && name !== 'SYSTEM_CONFIG_CLUSTER_NODES' && name !== 'SYSTEM_CONFIG_ALERT_EMAILS') {
              mergedSetlistsMap.set(name, {
                PresetName: name,
                RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}',
              });
            }
          });
        }
      }

      const returnedPresets = Array.from(mergedArrMap.values());
      const returnedSetlists = Array.from(mergedSetlistsMap.values());

      localStorage.setItem('cached_arrangements', JSON.stringify(returnedPresets));
      setAllSharedArrangements(returnedPresets);
      if (currentSong) {
        const matching = returnedPresets.filter((arr: any) => String(arr.SongID) === String(currentSong.SongID));
        setSyncedSheetArrangements(matching);
        handleBackgroundArrangementChange(matching, returnedPresets);
      }

      localStorage.setItem('cached_setlists_meta', JSON.stringify(returnedSetlists));
      setAllSharedSetlists(returnedSetlists);

      return { presets: returnedPresets, setlists: returnedSetlists };
    } catch (e) {
      console.warn('Error refetching arrangements and setlists', e);
      return { presets: [], setlists: [] };
    }
  };

  const saveSongToSetlist = async (setName: string, arrangementName: string, customLayout?: { key?: string; roadmap?: any[]; snapshotSections?: any }) => {
    const isViewer = !(appUser && appSecret);
    if (setlistsTabMode === 'local' || isViewer) {
      if (!currentSong) return;
      setIsLoading(true);
      try {
        const capturedSettings = {
          key: customLayout?.key || currentKey,
          roadmap: customLayout?.roadmap || originalRoadmap,
          arrangementName: arrangementName,
          snapshotSections: customLayout?.snapshotSections || sectionTemplates,
        };

        // 1. Save to local_setlist_arrangements in localStorage
        const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
        const updatedArrs = [
          ...localArrs.filter((arr: any) => !(String(arr.SongID) === String(currentSong.SongID) && arr.PresetName === `Set: ${setName}`)),
          {
            SongID: String(currentSong.SongID),
            PresetName: `Set: ${setName}`,
            RoadmapJSON: JSON.stringify(capturedSettings)
          }
        ];
        localStorage.setItem('local_setlist_arrangements', JSON.stringify(updatedArrs));

        // 1b. Mirror to general local custom arrangements so it is selectable in the DAW Arranger modal
        if (arrangementName && arrangementName.trim()) {
          const targetName = arrangementName.trim();
          if (!targetName.toLowerCase().startsWith('set:')) {
            const localRawArr = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`) || '{}';
            try {
              const localObjArr = JSON.parse(localRawArr);
              localObjArr[targetName] = {
                key: customLayout?.key || currentKey,
                roadmap: customLayout?.roadmap || originalRoadmap,
                snapshotSections: customLayout?.snapshotSections || sectionTemplates,
              };
              localStorage.setItem(`custom_arrangements_${currentSong.SongID}`, JSON.stringify(localObjArr));
            } catch (e) {
              console.warn('Error mirroring setlist custom arrangement locally:', e);
            }
          }
        }

        // 2. Add song ID to localSetlists (clone from online if viewer and not exists)
        let existingMeta = localSetlists.find((sl) => sl.PresetName === setName);
        if (!existingMeta && isViewer) {
          const onlineMeta = allSharedSetlists.find((sl) => sl.PresetName === setName);
          if (onlineMeta) {
            existingMeta = {
              PresetName: setName,
              RoadmapJSON: onlineMeta.RoadmapJSON,
            };
            localSetlists.push(existingMeta);
          }
        }

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

        const nextSetlists = localSetlists.map((sl) => {
          if (sl.PresetName === setName) {
            return {
              ...sl,
              RoadmapJSON: JSON.stringify({ songIds, lastUpdated: Date.now(), locked: false })
            };
          }
          return sl;
        });

        const hasSet = nextSetlists.some((sl) => sl.PresetName === setName);
        const finalSetlists = hasSet ? nextSetlists : [
          ...nextSetlists,
          {
            PresetName: setName,
            RoadmapJSON: JSON.stringify({ songIds, lastUpdated: Date.now(), locked: false })
          }
        ];

        setLocalSetlists(finalSetlists);
        localStorage.setItem('worship_local_setlists', JSON.stringify(finalSetlists));

        showToast(`Added to local setlist "${setName}" as "${arrangementName}"${isViewer ? ' (Saved locally as Viewer)' : ''}`, 'success');
        setIsSetlistManagerOpen(false);
        setCurrentTab('songs');
        handleAutoMirrorToDevice();
      } catch (err) {
        console.error('Error saving song to local setlist', err);
        showToast('Failed to save to local setlist', 'error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, 'error');
      return;
    }
    if (!currentSong) return;

    setIsLoading(true);
    try {
      const capturedSettings = {
        key: customLayout?.key || currentKey,
        roadmap: customLayout?.roadmap || originalRoadmap,
        arrangementName: arrangementName,
        snapshotSections: customLayout?.snapshotSections || sectionTemplates,
      };

      // Mirror to general local custom arrangements so it is selectable in the DAW Arranger modal
      if (arrangementName && arrangementName.trim()) {
        const targetName = arrangementName.trim();
        if (!targetName.toLowerCase().startsWith('set:')) {
          const localRawArr = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`) || '{}';
          try {
            const localObjArr = JSON.parse(localRawArr);
            localObjArr[targetName] = {
              key: customLayout?.key || currentKey,
              roadmap: customLayout?.roadmap || originalRoadmap,
              snapshotSections: customLayout?.snapshotSections || sectionTemplates,
            };
            localStorage.setItem(`custom_arrangements_${currentSong.SongID}`, JSON.stringify(localObjArr));
          } catch (e) {
            console.warn('Error mirroring setlist custom arrangement locally in online save:', e);
          }
        }
      }

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

      showToast(`Added to "${setName}" as "${arrangementName}"`, 'success');
      setIsSetlistManagerOpen(false);
      setCurrentTab('songs');
      await refetchArrangements();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save to Setlist', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };


  const removeSongFromSetlist = async (setName: string, songIdToRemove: string) => {
    const isViewer = !(appUser && appSecret);
    if (setlistsTabMode === 'local' || isViewer) {
      setIsLoading(true);
      try {
        // Ensure local version exists if cloning from online
        let existingMeta = localSetlists.find((sl) => sl.PresetName === setName);
        if (!existingMeta && isViewer) {
          const onlineMeta = allSharedSetlists.find((sl) => sl.PresetName === setName);
          if (onlineMeta) {
            existingMeta = {
              PresetName: setName,
              RoadmapJSON: onlineMeta.RoadmapJSON,
            };
            localSetlists.push(existingMeta);
          }
        }

        // Remove arrangement from local_setlist_arrangements
        try {
          const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
          const updatedArrs = localArrs.filter(
            (arr: any) => !(String(arr.SongID) === String(songIdToRemove) && arr.PresetName === `Set: ${setName}`)
          );
          localStorage.setItem('local_setlist_arrangements', JSON.stringify(updatedArrs));
        } catch {}

        // Remove songId from localSetlists
        if (existingMeta) {
          let songIds: string[] = [];
          try {
            const parsed = JSON.parse(existingMeta.RoadmapJSON);
            songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
          } catch {}

          const updatedSongIds = songIds.filter((id) => String(id) !== String(songIdToRemove));
          const nextSetlists = localSetlists.map((sl) => {
            if (sl.PresetName === setName) {
              return {
                ...sl,
                RoadmapJSON: JSON.stringify({ songIds: updatedSongIds, lastUpdated: Date.now(), locked: false })
              };
            }
            return sl;
          });

          const hasSet = nextSetlists.some((sl) => sl.PresetName === setName);
          const finalSetlists = hasSet ? nextSetlists : [
            ...nextSetlists,
            {
              PresetName: setName,
              RoadmapJSON: JSON.stringify({ songIds: updatedSongIds, lastUpdated: Date.now(), locked: false })
            }
          ];

          setLocalSetlists(finalSetlists);
          localStorage.setItem('worship_local_setlists', JSON.stringify(finalSetlists));
        }
        showToast(`Removed from local setlist: ${setName}${isViewer ? ' (Saved locally as Viewer)' : ''}`, 'info');
        handleAutoMirrorToDevice();
      } catch (err) {
        console.error('Error removing song from local setlist', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

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
      fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadDelete),
      }).catch(err => console.warn('Background deleteArrangement failed:', err));

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

        fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payloadMeta),
        }).catch(err => console.warn('Background saveSetlist failed:', err));
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
    const isViewer = !(appUser && appSecret);
    if (setlistsTabMode === 'local' || isViewer) {
      setIsLoading(true);
      try {
        // Ensure local version exists if cloning from online
        let existingMeta = localSetlists.find((sl) => sl.PresetName === setName);
        if (!existingMeta && isViewer) {
          const onlineMeta = allSharedSetlists.find((sl) => sl.PresetName === setName);
          if (onlineMeta) {
            existingMeta = {
              PresetName: setName,
              RoadmapJSON: onlineMeta.RoadmapJSON,
            };
            localSetlists.push(existingMeta);
          }
        }

        const nextSetlists = localSetlists.map((sl) => {
          if (sl.PresetName === setName) {
            return {
              ...sl,
              RoadmapJSON: JSON.stringify({ songIds: updatedSongIds, lastUpdated: Date.now(), locked: false })
            };
          }
          return sl;
        });

        const hasSet = nextSetlists.some((sl) => sl.PresetName === setName);
        const finalSetlists = hasSet ? nextSetlists : [
          ...nextSetlists,
          {
            PresetName: setName,
            RoadmapJSON: JSON.stringify({ songIds: updatedSongIds, lastUpdated: Date.now(), locked: false })
          }
        ];

        setLocalSetlists(finalSetlists);
        localStorage.setItem('worship_local_setlists', JSON.stringify(finalSetlists));
        showToast(`Local setlist order updated for "${setName}"${isViewer ? ' (Saved locally as Viewer)' : ''}`, 'success');
        handleAutoMirrorToDevice();
      } catch (err) {
        console.error('Error updating local setlist order', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

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
    const isViewer = !(appUser && appSecret);
    if (setlistsTabMode === 'local' || isViewer) {
      setIsLoading(true);
      try {
        const nameToUse = setName.trim();
        if (localSetlists.some((sl) => sl.PresetName === nameToUse)) {
          showToast(`A local setlist named "${nameToUse}" already exists!`, 'warning');
          return;
        }
        const newSet = {
          PresetName: nameToUse,
          RoadmapJSON: JSON.stringify({ songIds: [], lastUpdated: Date.now(), locked: false })
        };
        const nextSetlists = [...localSetlists, newSet];
        setLocalSetlists(nextSetlists);
        localStorage.setItem('worship_local_setlists', JSON.stringify(nextSetlists));
        showToast(`Local setlist folder "${nameToUse}" created!${isViewer ? ' (Saved locally as Viewer)' : ''}`, 'success');
        handleAutoMirrorToDevice();
      } catch (err) {
        console.error('Error creating local setlist folder', err);
      } finally {
        setIsLoading(false);
      }
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
    const isViewer = !(appUser && appSecret);
    if (setlistsTabMode === 'local' || isViewer) {
      setIsLoading(true);
      try {
        const nextSetlists = localSetlists.filter((sl) => sl.PresetName !== setName);
        setLocalSetlists(nextSetlists);
        localStorage.setItem('worship_local_setlists', JSON.stringify(nextSetlists));

        // Delete arrangements for this setlist
        try {
          const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
          const updatedArrs = localArrs.filter((arr: any) => arr.PresetName !== `Set: ${setName}`);
          localStorage.setItem('local_setlist_arrangements', JSON.stringify(updatedArrs));
        } catch {}

        showToast(`Local setlist folder "${setName}" deleted!${isViewer ? ' (Deleted locally as Viewer)' : ''}`, 'success');
        handleAutoMirrorToDevice();
      } catch (err) {
        console.error('Error deleting local setlist folder', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

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
      fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      }).catch(err => console.warn('Background deleteSetlist failed:', err));

      const setPresets = allSharedArrangements.filter(
        (arr) => arr.PresetName === `Set: ${setName}`
      );

      for (const preset of setPresets) {
        const payloadDelete = {
          action: 'deleteArrangement',
          songId: String(preset.SongID),
          name: `Set: ${setName}`,
        };
        fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payloadDelete),
        }).catch(err => console.warn('Background deleteArrangement failed:', err));
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

  const applyLocalSongsAndOverrides = (baseSongs: Song[]): Song[] => {
    const list = [...baseSongs];
    
    // 1. Blend in local custom songs
    try {
      const localSongsRaw = localStorage.getItem('local_custom_songs');
      if (localSongsRaw) {
        const localSongs = JSON.parse(localSongsRaw);
        if (Array.isArray(localSongs)) {
          localSongs.forEach((ls) => {
            if (!list.some((s) => String(s.SongID) === String(ls.SongID))) {
              list.push(ls);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error applying local custom songs:', e);
    }

    // 2. Apply metadata overrides to each song in list
    list.forEach((s, idx) => {
      try {
        const overrideRaw = localStorage.getItem(`local_song_override_${s.SongID}`);
        if (overrideRaw) {
          const override = JSON.parse(overrideRaw);
          list[idx] = {
            ...s,
            Title: override.Title || override.title || s.Title,
            Artist: override.Artist || override.artist || s.Artist,
            OriginalKey: override.OriginalKey || override.key || s.OriginalKey,
            Version: override.Version || override.version || s.Version,
          };
        }
      } catch (e) {
        console.warn('Error applying local song override:', e);
      }
    });

    return list;
  };

  const getUsedSectionNames = (): string[] => {
    const names = new Set<string>();

    // 1. From active roadmap
    if (activeRoadmap) {
      activeRoadmap.forEach((block) => {
        if (block.name) {
          names.add(block.name.trim().toLowerCase());
        }
      });
    }

    // 2. From syncedSheetArrangements
    if (syncedSheetArrangements) {
      syncedSheetArrangements.forEach((arr) => {
        try {
          const parsed = JSON.parse(arr.RoadmapJSON);
          if (parsed) {
            const blocks = parsed.roadmap || parsed;
            if (Array.isArray(blocks)) {
              blocks.forEach((block: any) => {
                if (block && block.name) {
                  names.add(block.name.trim().toLowerCase());
                }
              });
            }
          }
        } catch {}
      });
    }

    // 3. From local arrangements
    if (currentSong) {
      try {
        const local = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`);
        if (local) {
          const localObj = JSON.parse(local);
          Object.values(localObj).forEach((parsed: any) => {
            if (parsed) {
              const blocks = parsed.roadmap || parsed;
              if (Array.isArray(blocks)) {
                blocks.forEach((block: any) => {
                  if (block && block.name) {
                    names.add(block.name.trim().toLowerCase());
                  }
                });
              }
            }
          });
        }
      } catch {}
    }

    return Array.from(names);
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
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout for multiple fetches

      const urls = getStoredScriptUrls();
      
      // Fetch from ALL urls in the cluster in parallel!
      const fetchResults = await Promise.all(
        urls.map(async (url, idx) => {
          try {
            const fetchTab = async (tabName: string) => {
              try {
                const res = await fetch(`${url}?tab=${tabName}`, { signal: controller.signal });
                if (!res.ok) return [];
                const text = await res.text();
                const parsed = JSON.parse(text);
                return Array.isArray(parsed) ? parsed : [];
              } catch (err) {
                console.warn(`Error fetching tab ${tabName} from ${url}:`, err);
                return [];
              }
            };

            const [songsList, linesList, arrList, setlistsList] = await Promise.all([
              fetchTab('Songs'),
              fetchTab('SongLines'),
              fetchTab('Arrangements'),
              fetchTab('Setlists')
            ]);

            return {
              songs: songsList,
              lines: linesList,
              arrangements: arrList,
              setlists: setlistsList
            };
          } catch (e) {
            console.warn(`Failed to fetch from cluster node ${idx + 1}: ${url}`, e);
            return null;
          }
        })
      );

      // Now merge results from last to first (first node wins if duplicate keys exist)
      const mergedSongsMap = new Map<string, Song>();
      const mergedLinesMap = new Map<string, SongLine>();
      const mergedArrMap = new Map<string, any>();
      const mergedSetlistsMap = new Map<string, any>();

      // Record total stats for cluster reporting
      let totalSongsCount = 0;
      let totalLinesCount = 0;

      for (let i = fetchResults.length - 1; i >= 0; i--) {
        const res = fetchResults[i];
        if (!res) continue;

        res.songs.forEach((s) => {
          if (s && s.SongID) {
            mergedSongsMap.set(String(s.SongID), s);
            totalSongsCount++;
          }
        });

        res.lines.forEach((l) => {
          if (l && l.LineID) {
            mergedLinesMap.set(String(l.LineID), l);
            totalLinesCount++;
          }
        });

        res.arrangements.forEach((arr) => {
          if (arr && arr.SongID && arr.PresetName) {
            const key = `${arr.SongID}_${arr.PresetName}`;
            mergedArrMap.set(key, arr);
          }
        });

        res.setlists.forEach((row) => {
          const name = row.Set || row.PresetName || '';
          if (name === 'SYSTEM_CONFIG_ALERT_EMAILS') {
            try {
              const rawJson = row['Songs & Arrangements'] || row.RoadmapJSON || '{}';
              const parsed = JSON.parse(rawJson);
              if (parsed && Array.isArray(parsed.emails)) {
                localStorage.setItem('custom_alert_emails', JSON.stringify(parsed.emails));
                setAlertEmails(parsed.emails);
              }
            } catch (err) {
              console.warn('Failed to parse SYSTEM_CONFIG_ALERT_EMAILS config:', err);
            }
          } else if (name && name !== 'SYSTEM_CONFIG_CLUSTER_NODES') {
            mergedSetlistsMap.set(name, {
              PresetName: name,
              RoadmapJSON: row['Songs & Arrangements'] || row.RoadmapJSON || '{}'
            });
          }
        });
      }

      const remoteSongs = Array.from(mergedSongsMap.values());
      const remoteLines = Array.from(mergedLinesMap.values());
      const remoteArrangements = Array.from(mergedArrMap.values());
      const remoteSetlists = Array.from(mergedSetlistsMap.values());

      // Cache the fully merged results
      localStorage.setItem('cached_songs', JSON.stringify(remoteSongs));
      localStorage.setItem('cached_song_lines', JSON.stringify(remoteLines));
      localStorage.setItem('cached_arrangements', JSON.stringify(remoteArrangements));
      localStorage.setItem('cached_setlists_meta', JSON.stringify(remoteSetlists));

      // Display capacity stats in storage warn if primary gets big
      const primarySongsCount = fetchResults[0]?.songs.length || 0;
      const primaryLinesCount = fetchResults[0]?.lines.length || 0;
      const cellsEstimate = primarySongsCount * 12 + primaryLinesCount * 5; // songs have ~12 cols, lines have ~5 cols
      
      // Store stats for diagnostic reporting
      localStorage.setItem('primary_sheet_cells_est', cellsEstimate.toString());
      localStorage.setItem('primary_sheet_songs_count', primarySongsCount.toString());
      localStorage.setItem('primary_sheet_lines_count', primaryLinesCount.toString());

      const CAPACITY_LIMIT_CELLS = 10000000;
      const FAILOVER_THRESHOLD_CELLS = 8000000; // 80% capacity trigger

      if (cellsEstimate > FAILOVER_THRESHOLD_CELLS) {
        // Active write node is nearly full! Attempt Auto-Jump Initiative to a healthy replica
        let healthyReplicaIdx = -1;
        for (let j = 1; j < fetchResults.length; j++) {
          const res = fetchResults[j];
          if (res) {
            const sCount = res.songs.length;
            const lCount = res.lines.length;
            const estCells = sCount * 12 + lCount * 5;
            if (estCells < FAILOVER_THRESHOLD_CELLS) {
              healthyReplicaIdx = j;
              break;
            }
          }
        }

        if (healthyReplicaIdx !== -1) {
          const originalUrls = [...urls];
          const promotedUrl = originalUrls[healthyReplicaIdx];
          // Shift promotedUrl to index 0, moving the old primary to the end or just swapping
          const shiftedUrls = [promotedUrl, ...originalUrls.filter((_, idx) => idx !== healthyReplicaIdx)];
          
          console.log(`🚀 DATABASE AUTO-FAILOVER: Primary write node is nearly full (${(cellsEstimate/CAPACITY_LIMIT_CELLS*100).toFixed(1)}%). Auto-jumping to healthy replica node: ${promotedUrl}`);
          
          // Save updated cluster configuration locally
          localStorage.setItem('custom_script_urls', JSON.stringify(shiftedUrls));
          localStorage.setItem('custom_script_url', shiftedUrls[0]);
          SCRIPT_URL = shiftedUrls[0];
          setCurrentScriptUrl(shiftedUrls[0]);
          setCurrentScriptUrls(shiftedUrls);
          
          // Propagate cluster registry update to the cloud directory using the newly promoted node
          if (appUser && appSecret) {
            showToast('⚠️ Primary node near full. Propagating auto-failover cluster registry to central directory...', 'warning');
            await saveClusterDirectoryToCloud(shiftedUrls);
          }
          
          showToast(`🚀 DATABASE AUTO-FAILOVER ACTIVATED! Active write node was nearly full (${(cellsEstimate/CAPACITY_LIMIT_CELLS*100).toFixed(1)}%). Auto-promoted healthy replica node with available space to primary position.`, 'success');
          
          // Re-trigger catalog load with newly promoted node
          setTimeout(() => {
            fetchCatalog();
          }, 1500);
          
          clearTimeout(timeoutId);
          return; // Stop current execution since we are re-loading with shifted registry
        } else {
          // If no other database, or none with space, do nothing as it should return to normal flow
          showToast('⚠️ Active database is nearly full! Please prepare a new blank copy of Google Sheets and register it in Admin Database Suite to expand capacity.', 'warning');
          
          // Trigger Email Notifications since database has reached 8,000,000 cells and no backup database is found!
          // We also trigger for every 250,000 cells from the 8,000,000 storage base line.
          const thresholdBase = 8000000;
          const intervalSize = 250000;
          const currentIntervalCount = Math.floor((cellsEstimate - thresholdBase) / intervalSize);
          const currentLevel = thresholdBase + currentIntervalCount * intervalSize;
          const lastNotified = parseInt(localStorage.getItem('last_notified_cell_level') || '0', 10);

          if (currentLevel > lastNotified && alertEmails.length > 0) {
            const recipientsStr = alertEmails.join(',');
            const emailSubject = `🚨 CRITICAL: Worship Chord Book Database Capacity Alert (${(cellsEstimate).toLocaleString()} cells)`;
            const emailBody = `Attention Worship Chord Book Administrators,

This is an automated alert from your Worship Chord Book PWA.

The primary write node database has reached critical capacity (~${cellsEstimate.toLocaleString()} cells) and has NO backup/replica nodes available for auto-failover:
• Primary Node: ${urls[0]}
• Current Cells in Use: ~${cellsEstimate.toLocaleString()} cells (Limit: 10,000,000)
• Capacity Level: ${(cellsEstimate / 10000000 * 100).toFixed(2)}%

⚠️ ACTION REQUIRED:
No healthy, under-capacity replica nodes were detected in your database cluster. To expand storage capacity and prevent data write failures, please make a copy of your Google Sheet database and add it as a new node in the Administration Suite.

Next automated alert will trigger if capacity increases by another 250,000 cells.

Thank you,
Worship Setup Assistant`;

            const payload = {
              action: 'sendAlertEmail',
              subject: emailSubject,
              body: emailBody,
              recipients: recipientsStr,
            };

            fetch(urls[0], {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }).then(res => res.json())
              .then(resJson => {
                if (resJson.status === 'success') {
                  console.log(`Successfully sent database capacity alert email to: ${recipientsStr}`);
                  localStorage.setItem('last_notified_cell_level', currentLevel.toString());
                  showToast('📬 Automated administrator capacity alert email successfully sent!', 'success');
                } else {
                  console.error('Failed to send database capacity alert email:', resJson.message);
                }
              }).catch(err => {
                console.error('Network error sending alert email:', err);
              });
          }
        }
      } else if (cellsEstimate > 4000000) { // Google Sheets warning threshold
        showToast('⚠️ Primary sheet database is getting large. Please prepare a backup database node for future use.', 'warning');
      }

      setAllSharedArrangements(remoteArrangements);
      setAllSharedSetlists(remoteSetlists);

      showToast(
        urls.length > 1 
          ? `Successfully synchronized cluster! Loaded ${remoteSongs.length} songs and ${remoteArrangements.length} presets.`
          : 'All updates applied successfully!', 
        'success'
      );
      
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
      setSongs(applyLocalSongsAndOverrides(combinedSongs));
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
      setSongs(applyLocalSongsAndOverrides(combinedSongs));
      showToast('Loaded offline cached catalog', 'success');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initClusterAndCatalog = async () => {
      const storedUrls = getStoredScriptUrls();
      const primaryUrl = storedUrls[0];
      
      // Attempt background directory synchronization
      try {
        const remoteUrls = await syncClusterDirectory(primaryUrl);
        if (remoteUrls && Array.isArray(remoteUrls) && remoteUrls.length > 0) {
          const storedStr = JSON.stringify(storedUrls);
          const remoteStr = JSON.stringify(remoteUrls);
          if (storedStr !== remoteStr) {
            console.log('Central Cluster Directory sync: nodes updated!', remoteUrls);
            localStorage.setItem('custom_script_urls', remoteStr);
            localStorage.setItem('custom_script_url', remoteUrls[0]);
            SCRIPT_URL = remoteUrls[0];
            setCurrentScriptUrl(remoteUrls[0]);
            setCurrentScriptUrls(remoteUrls);
          }
        }
      } catch (err) {
        console.warn('Central Cluster Directory sync failed', err);
      }
      
      // Load the catalog with either the newly synced cluster or the current cluster
      await fetchCatalog();
    };

    initClusterAndCatalog();

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
    if (activeSetlistFolder) {
      const setMeta = (activeSetlistType === 'local' ? localSetlists : allSharedSetlists).find(
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
  }, [activeSetlistFolder, allSharedSetlists, localSetlists, activeSetlistType]);

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
    executeSongLoad(currentSong, true, undefined, (allArrs && allArrs.length > 0) ? allArrs : undefined);

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

  // Automatically expand active setlist folder when arranger/arrangement panel is opened
  useEffect(() => {
    if (arrangerOpen && activeSetlistFolder) {
      setExpandedArrangementSetlists((prev) => ({
        ...prev,
        [activeSetlistFolder]: true,
      }));
    }
  }, [arrangerOpen, activeSetlistFolder]);

  // Change active selected song (actual loading execution)
  const executeSongLoad = async (
    song: Song,
    forceDefaultArrangement: boolean = false,
    activeFolderOverride?: string,
    arrsOverride?: any[]
  ) => {
    setIsLoading(true);
    setCurrentSong(song);
    setCapo(0);
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
      const setPreset = (window as any).getSetlistArrangement(activeFolder, String(song.SongID));
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

      const packedLinesRaw = (song as any).SongLinesJSON || (song as any).SongLines || (song as any).LinesJSON;
      if (packedLinesRaw) {
        try {
          const parsed = typeof packedLinesRaw === 'string' ? JSON.parse(packedLinesRaw) : packedLinesRaw;
          if (Array.isArray(parsed)) {
            filteredLines = parsed.map((l: any) => ({
              ...l,
              SongID: String(song.SongID),
            }));
          }
        } catch (e) {
          console.warn('Error parsing packed lines on song object:', e);
        }
      }

      if (filteredLines.length > 0) {
        console.log('Loaded song lines from packed SongLinesJSON cell.');
      } else if (String(song.SongID).startsWith('fallback-')) {
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
            const textData = (await (res as any).text());
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

      const localSongLinesKey = `local_song_lines_${song.SongID}`;
      const localLinesRaw = localStorage.getItem(localSongLinesKey);
      if (localLinesRaw) {
        try {
          const parsedLocal = JSON.parse(localLinesRaw);
          if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
            filteredLines = parsedLocal;
          }
        } catch (e) {
          console.warn('Error reading local song lines override:', e);
        }
      }

      // Normalize and sort song lines (both from sheet and fallback)
      const normalizedLines = filteredLines.map((l, index) => {
        const chordsVal = l.Chords !== undefined ? l.Chords : ((l as any).chords !== undefined ? (l as any).chords : '');
        const lyricsVal = l.Lyrics !== undefined ? l.Lyrics : ((l as any).lyrics !== undefined ? (l as any).lyrics : '');
        const sectionVal = l.SectionName || l.Section || (l as any).section || 'Section';
        const orderVal = l.Order !== undefined && (l.Order as any) !== '' ? Number(l.Order) : ((l as any).order !== undefined && (l as any).order !== '' ? Number((l as any).order) : index + 1);
        
        return {
          ...l,
          SongID: String(l.SongID),
          SectionName: sectionVal,
          Section: sectionVal,
          section: sectionVal,
          Order: orderVal,
          order: orderVal,
          Chords: chordsVal,
          chords: chordsVal,
          Lyrics: lyricsVal,
          lyrics: lyricsVal
        };
      });

      // Sort normalized lines by order
      normalizedLines.sort((a, b) => a.Order - b.Order);

      setSongLines(normalizedLines);

      // Initialize Performance Arrangement Roadmap
      const templates: { [key: string]: SongLine[] } = {};
      normalizedLines.forEach((l) => {
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

      normalizedLines.forEach((l) => {
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
        const setPreset = (window as any).getSetlistArrangement(activeFolder, String(song.SongID));
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
              
              if (settings.snapshotSections) {
                setLoadedSnapshotSections(settings.snapshotSections);
              } else {
                setLoadedSnapshotSections(null);
              }

              
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
              
              if (savedSettings.snapshotSections) {
                setLoadedSnapshotSections(savedSettings.snapshotSections);
              } else {
                setLoadedSnapshotSections(null);
              }

            }
          } catch (e) {
            console.error('Error loading captured roadmap:', e);
          }
        }
      }

      if (!loadedCustomRoadmap) {
        setActiveRoadmap(roadmap);
        setLoadedSnapshotSections(null);

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
            (presetsRes as any).text(),
            (setlistsRes as any).text()
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
      if (p.PresetName && p.PresetName.toLowerCase().trim().startsWith('set:')) {
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
          if (k && k.toLowerCase().trim().startsWith('set:')) {
            return;
          }
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

    try {
      const localArrsRaw = localStorage.getItem('local_setlist_arrangements');
      if (localArrsRaw) {
        const localArrs = JSON.parse(localArrsRaw);
        localArrs.forEach((arr: any) => {
          if (String(arr.SongID) === String(currentSong?.SongID) && arr.PresetName) {
            if (arr.PresetName.toLowerCase().trim().startsWith('set:')) {
              return;
            }
            const norm = arr.PresetName.trim().toLowerCase();
            if (!seenNormalized.has(norm)) {
              obj[arr.PresetName] = JSON.parse(arr.RoadmapJSON);
              seenNormalized.add(norm);
            }
          }
        });
      }
    } catch {
      // safe fail
    }

    return obj;
  };

  const loadPresetArrangement = (name: string, source?: 'online' | 'local') => {
    let presetData: any = null;
    let found = false;

    if (source === 'online') {
      const match = syncedSheetArrangements.find((p) => p.PresetName === name);
      if (match) {
        try {
          presetData = JSON.parse(match.RoadmapJSON);
          found = true;
        } catch {}
      }
    } else if (source === 'local') {
      try {
        const local = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (local) {
          const localObj = JSON.parse(local);
          if (localObj[name]) {
            presetData = localObj[name];
            found = true;
          }
        }
      } catch {}

      if (!found) {
        try {
          const localArrsRaw = localStorage.getItem('local_setlist_arrangements');
          if (localArrsRaw) {
            const localArrs = JSON.parse(localArrsRaw);
            const match = localArrs.find(
              (arr: any) =>
                String(arr.SongID) === String(currentSong?.SongID) &&
                arr.PresetName.toLowerCase().trim() === name.toLowerCase().trim()
            );
            if (match) {
              presetData = JSON.parse(match.RoadmapJSON);
              found = true;
            }
          }
        } catch {}
      }
    } else {
      if (name.startsWith('Set: ')) {
        const match = syncedSheetArrangements.find((p) => p.PresetName === name);
        if (match) {
          try {
            presetData = JSON.parse(match.RoadmapJSON);
            found = true;
          } catch {}
        }
      }

      if (!found) {
        const presets = getPresets();
        if (presets[name]) {
          presetData = presets[name];
          found = true;
        }
      }
    }

    if (found && presetData) {
      const isObject = presetData && typeof presetData === 'object' && !Array.isArray(presetData);
      const blocksArray = isObject ? (presetData.roadmap || []) : presetData;

      if (!Array.isArray(blocksArray)) {
        showToast('Invalid arrangement format', 'error');
        return;
      }

      if (isObject && presetData.snapshotSections) {
        setLoadedSnapshotSections(presetData.snapshotSections);
      } else {
        setLoadedSnapshotSections(null);
      }


      setActiveRoadmap(
        blocksArray.map((b: any, idx: number) => ({
          id: b.id || `block-${idx}`,
          name: b.name || 'Section',
          enabledLines: b.enabledLines ? [...b.enabledLines] : [],
          keyOffset: b.keyOffset || 0,
        }))
      );
      
      if (isObject && presetData.key) {
        setCurrentKey(presetData.key);
      } else {
        setCurrentKey(currentSong?.OriginalKey || 'C');
      }

      setEditingBlockId(null);
      setIsArrangementLocked(true);

      let friendlyName = name;
      if (name.startsWith('Set: ')) {
        friendlyName = (isObject && presetData.arrangementName) ? presetData.arrangementName : 'Custom Arrangement';
      }
      setCurrentArrangementName(friendlyName);
      showToast(`Loaded arrangement: ${friendlyName}. It is locked.`, 'success');
    } else {
      showToast(`Could not find arrangement preset: ${name}`, 'error');
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
        dict[songId] = {
          key: targetKey,
          roadmap: roadmap,
          arrangementName: optArrangementName || currentArrangementName,
          snapshotSections: sectionTemplates,
        };
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
        snapshotSections: sectionTemplates,
      };
      
      // 1. Save to spreadsheet via POST
      const payloadArrangement = {
        action: 'saveArrangement',
        songId: songId,
        name: `Set: ${activeSetlistFolder}`,
        roadmap: capturedSettings,
      };
      
      fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadArrangement),
      }).catch(err => console.warn('Background saveArrangement failed:', err));

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
      fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      }).catch(err => console.warn('Background saveSetlist failed:', err));

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

  const executeSaveArrangement = async (name: string, shouldApplyToSetlist: boolean, roadmapToSave: any[], saveLocallyOnly: boolean = false) => {
    setIsLoading(true);
    try {
      const isViewerMode = !(appUser && appSecret) || saveLocallyOnly;

      if (saveLocallyOnly || isViewerMode) {
        throw new Error('LocalOnlyViewerMode');
      }

      const richRoadmap = {
        roadmap: roadmapToSave,
        key: currentKey,
        arrangementName: name,
        snapshotSections: effectiveSectionTemplates,
      };

      const payload = {
        action: 'saveArrangement',
        songId: String(currentSong?.SongID),
        name: name,
        roadmap: richRoadmap,
      };

      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const textResponse = (await (res as any).text());
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
          dict[String(currentSong.SongID)] = {
            key: currentKey,
            roadmap: roadmapToSave,
            arrangementName: name,
            snapshotSections: effectiveSectionTemplates,
          };
          localStorage.setItem('captured_song_settings', JSON.stringify(dict));
          showToast(`This setlist is locked by an admin. Your arrangement changes are saved locally only.`, 'info');
        } else {
          const capturedSettings = {
            key: currentKey,
            roadmap: roadmapToSave,
            arrangementName: name,
            snapshotSections: effectiveSectionTemplates,
          };
          const payloadArrangement = {
            action: 'saveArrangement',
            songId: String(currentSong.SongID),
            name: `Set: ${activeSetlistFolder}`,
            roadmap: capturedSettings,
          };
          fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadArrangement),
          }).catch(err => console.warn('Background saveArrangement failed:', err));

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
          fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadMeta),
          }).catch(err => console.warn('Background saveSetlist failed:', err));

          showToast(`Successfully loaded arrangement to active setlist: ${activeSetlistFolder}`, 'success');
        }
      }
    } catch (err: any) {
      // offline fallback - write only local-only presets to custom_arrangements_${currentSong?.SongID}
      let localObj: { [key: string]: any } = {};
      try {
        const localRaw = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (localRaw) {
          localObj = JSON.parse(localRaw);
        }
      } catch {}

      const richRoadmap = {
        roadmap: roadmapToSave,
        key: currentKey,
        arrangementName: name,
        snapshotSections: effectiveSectionTemplates,
      };

      localObj[name] = richRoadmap;
      localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(localObj));

      if (err && err.message === 'LocalOnlyViewerMode') {
        showToast(`Saved locally on this device as "${name}" (Viewer Mode)`, 'success');
      } else {
        showToast(`Saved locally on this device as "${name}"`, 'success');
      }

      if (shouldApplyToSetlist && currentSong) {
        const capturedSettings = {
          key: currentKey,
          roadmap: roadmapToSave,
          arrangementName: name,
          snapshotSections: effectiveSectionTemplates,
        };

        if (activeSetlistFolder) {
          // Save to local_setlist_arrangements in localStorage so that we have it saved for that setlist specifically
          try {
            const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
            const updatedArrs = [
              ...localArrs.filter((arr: any) => !(String(arr.SongID) === String(currentSong.SongID) && arr.PresetName.toLowerCase().trim() === `Set: ${activeSetlistFolder}`.toLowerCase().trim())),
              {
                SongID: String(currentSong.SongID),
                PresetName: `Set: ${activeSetlistFolder}`,
                RoadmapJSON: JSON.stringify(capturedSettings)
              }
            ];
            localStorage.setItem('local_setlist_arrangements', JSON.stringify(updatedArrs));
          } catch {}

          // Ensure localSetlist copy is synchronized
          let existingMeta = localSetlists.find((sl) => sl.PresetName.toLowerCase().trim() === activeSetlistFolder.toLowerCase().trim());
          if (!existingMeta) {
            const onlineMeta = allSharedSetlists.find((sl) => sl.PresetName.toLowerCase().trim() === activeSetlistFolder.toLowerCase().trim());
            existingMeta = {
              PresetName: onlineMeta?.PresetName || activeSetlistFolder,
              RoadmapJSON: onlineMeta?.RoadmapJSON || JSON.stringify({ songIds: [], lastUpdated: Date.now(), locked: false }),
            };
            localSetlists.push(existingMeta);
          }

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

          const nextSetlists = localSetlists.map((sl) => {
            if (sl.PresetName.toLowerCase().trim() === activeSetlistFolder.toLowerCase().trim()) {
              return {
                ...sl,
                RoadmapJSON: JSON.stringify({ songIds, lastUpdated: Date.now(), locked: false })
              };
            }
            return sl;
          });

          const hasSet = nextSetlists.some((sl) => sl.PresetName.toLowerCase().trim() === activeSetlistFolder.toLowerCase().trim());
          const finalSetlists = hasSet ? nextSetlists : [
            ...nextSetlists,
            {
              PresetName: activeSetlistFolder,
              RoadmapJSON: JSON.stringify({ songIds, lastUpdated: Date.now(), locked: false })
            }
          ];

          setLocalSetlists(finalSetlists);
          localStorage.setItem('worship_local_setlists', JSON.stringify(finalSetlists));
          showToast(`Saved arrangement to local setlist copy of "${activeSetlistFolder}" (Viewer Mode)`, 'success');
        }

        const rawSaved = localStorage.getItem('captured_song_settings') || '{}';
        const dict = JSON.parse(rawSaved);
        dict[String(currentSong.SongID)] = capturedSettings;
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
          executeSongLoad(currentSong, false, undefined, latestArrs.length > 0 ? latestArrs : undefined);
          showToast(`Setlist arrangement kept intact and restored on screen.`, 'info');
        }
      } else {
        // Otherwise (or if there's no active setlist folder), keep the saved arrangement active on screen
        setCurrentArrangementName(name);
      }
      setIsLoading(false);
      handleAutoMirrorToDevice();
    }
  };

  const savePresetArrangement = async () => {
    const isLockedSetlist = activeSetlistFolder && isSetlistLocked(activeSetlistFolder);
    const isLockedSetlistViewer = isLockedSetlist && !(appUser && appSecret);
    
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
    
    // Clean up any existing date suffix from the name
    const { baseName } = parsePresetDate(name);
    const enteredBaseName = baseName.toUpperCase();

    const newFullName = enteredBaseName;

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

  const deletePresetArrangement = async (name: string, isCurrentlyActive: boolean, source?: 'online' | 'local') => {
    if (activeSetlistFolder && isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
      showToast('This setlist is locked by an admin. Deleting arrangements is disabled.', 'error');
      return;
    }
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
      if (source !== 'local' && (appUser && appSecret)) {
        const payload = {
          action: 'deleteArrangement',
          songId: String(currentSong?.SongID),
          name: name,
        };

        const res = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const result = (await (res as any).json());
        if (result.status === 'success') {
          showToast(`Deleted from shared library: ${baseName}`, 'info');
        } else {
          throw new Error();
        }
      }
    } catch {
      if (source !== 'local' && (appUser && appSecret)) {
        showToast(`Could not delete from cloud, but cleaning up locally.`, 'info');
      }
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

      // If viewer/local, also delete from local_setlist_arrangements for setlist context
      try {
        const localArrs = JSON.parse(localStorage.getItem('local_setlist_arrangements') || '[]');
        const updatedArrs = localArrs.filter(
          (arr: any) => !(
            String(arr.SongID) === String(currentSong?.SongID) && 
            (
              arr.PresetName.toLowerCase().trim() === name.toLowerCase().trim() ||
              (isCurrentlyActive && activeSetlistFolder && arr.PresetName.toLowerCase().trim() === `Set: ${activeSetlistFolder}`.toLowerCase().trim())
            )
          )
        );
        localStorage.setItem('local_setlist_arrangements', JSON.stringify(updatedArrs));
      } catch (e) {
        console.warn("Failed to delete local setlist mapping:", e);
      }

      // 4. If active and inside a setlist context, delete the setlist-specific arrangement from db
      if (isCurrentlyActive && activeSetlistFolder && currentSong && source !== 'local' && (appUser && appSecret)) {
        try {
          const payloadDel = {
            action: 'deleteArrangement',
            songId: String(currentSong.SongID),
            name: `Set: ${activeSetlistFolder}`,
          };
          fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadDel),
          }).catch(err => console.warn('Background deleteArrangement failed:', err));
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
        executeSongLoad(currentSong, true, undefined, latestArrs.length > 0 ? latestArrs : undefined);

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
      const result = (await (res as any).json());

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
      
      // Clear all ongoing admin-privileged sessions & close open views/dialogs
      setActiveSetlistFolder('');
      setCurrentSong(null);
      setIsFormModalOpen(false);
      setFormEditingSong(null);
      setIsSetlistManagerOpen(false);
      setFocusedLineId(null);
      
      // Trigger security cut-off modal
      setIsSecurityCutoffModalOpen(true);
      
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

    const packedLinesRaw = (song as any).SongLinesJSON || (song as any).SongLines || (song as any).LinesJSON;
    if (packedLinesRaw) {
      try {
        const parsed = typeof packedLinesRaw === 'string' ? JSON.parse(packedLinesRaw) : packedLinesRaw;
        if (Array.isArray(parsed)) {
          filteredLines = parsed.map((l: any) => ({
            ...l,
            SongID: String(song.SongID),
          }));
        }
      } catch (e) {
        console.warn('Error parsing packed lines on song object:', e);
      }
    }

    if (filteredLines.length === 0) {
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
      } catch (e) {}
    }
    
    if (savedSettings) {
      if (savedSettings.key) activeKey = savedSettings.key;
      if (savedSettings.roadmap && savedSettings.roadmap.length > 0) {
        activeRoadmapToUse = savedSettings.roadmap;
      }
    }
    
    // Check if the current setlist has an override for this song
    if (activeSetlistFolder) {
      const setPreset = getSetlistArrangement(activeSetlistFolder, String(song.SongID));
      if (setPreset) {
        try {
          const settings = JSON.parse(setPreset.RoadmapJSON);
          if (settings) {
            if (settings.key) activeKey = settings.key;
            if (settings.roadmap && settings.roadmap.length > 0) {
              activeRoadmapToUse = settings.roadmap.map((b: any) => ({
                id: b.id,
                name: b.name,
                enabledLines: [...(b.enabledLines || [])],
                keyOffset: b.keyOffset || 0,
              }));
            }
          }
        } catch (e) {}
      }
    }

    return { song, activeKey, activeRoadmapToUse, templates };
  };

  const renderPerformanceMode = () => {
    if (!currentSong) return null;

    // Get current index in the setlist
    const currentSongIndex = setlists.indexOf(String(currentSong.SongID));
    const totalSongs = setlists.length;
    const isSetlist = totalSongs > 1 && currentSongIndex >= 0;

    const handlePrevSong = () => {
      if (isSetlist && currentSongIndex > 0) {
        const prevSongId = setlists[currentSongIndex - 1];
        const prevSong = songs.find((s) => String(s.SongID) === String(prevSongId));
        if (prevSong) {
          executeSongLoad(prevSong);
        }
      }
    };

    const handleNextSong = () => {
      if (isSetlist && currentSongIndex < totalSongs - 1) {
        const nextSongId = setlists[currentSongIndex + 1];
        const nextSong = songs.find((s) => String(s.SongID) === String(nextSongId));
        if (nextSong) {
          executeSongLoad(nextSong);
        }
      }
    };

    // Swipe handlers
    let touchStartX = 0;
    let touchEndX = 0;

    const onTouchStart = (e: React.TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const onTouchEnd = (e: React.TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeThreshold = 80;
      if (touchStartX - touchEndX > swipeThreshold) {
        handleNextSong();
      } else if (touchEndX - touchStartX > swipeThreshold) {
        handlePrevSong();
      }
    };

    // Next song preview title
    let nextSongTitle = '';
    if (isSetlist && currentSongIndex < totalSongs - 1) {
      const nextSongId = setlists[currentSongIndex + 1];
      const nextSongObj = songs.find((s) => String(s.SongID) === String(nextSongId));
      if (nextSongObj) {
        nextSongTitle = nextSongObj.Title;
      }
    }

    const isDark = performanceTheme === 'dark';

    return (
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none transition-colors duration-300 ${
          isDark ? 'bg-[#030408] text-slate-100' : 'bg-[#f4f6f9] text-slate-900'
        }`}
      >
        {/* Top Control Bar */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 px-6 py-4.5 border-b select-none shrink-0 ${
          isDark ? 'bg-[#0a0c16]/90 border-slate-800' : 'bg-white border-slate-300'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPerformanceMode(false)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                isDark ? 'bg-slate-800/80 hover:bg-slate-700 text-indigo-300 border border-slate-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300'
              }`}
            >
              <span>✕</span> Exit
            </button>
            <span className="text-xs uppercase font-mono font-black tracking-widest px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              STAGE HUD
            </span>
          </div>

          <div className="flex flex-col items-center md:items-center text-center max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl w-full mx-auto px-4 overflow-hidden shrink min-w-0">
            <div className="w-full h-[36px] flex items-center justify-center">
              <MarqueeTitle
                title={currentSong.Title}
                alignment="center"
                textSizeClass="text-lg sm:text-xl md:text-2xl"
              />
            </div>
            <p className={`text-xs uppercase tracking-wider font-bold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis ${isDark ? 'text-indigo-400/80' : 'text-slate-500'}`}>
              by {currentSong.Artist || 'Unknown'} • Key: <span className="text-amber-500 font-extrabold">{currentKey}</span> • BPM: <span className="text-emerald-500 font-extrabold">{bpm}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
            {/* Dark/Light Toggle */}
            <button
              onClick={() => setPerformanceTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                isDark ? 'bg-[#151936] hover:bg-[#1e234c] border-indigo-500/20 text-indigo-300' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              }`}
            >
              {isDark ? '☀️ Light View' : '🌙 Stage View'}
            </button>

            {/* Layout Zoom */}
            <div className="flex items-center bg-black/20 border border-slate-700/30 rounded-xl overflow-hidden">
              <button
                onClick={() => setLyricZoom(prev => Math.max(0.4, prev - 0.05))}
                className={`px-2.5 py-2 font-black text-xs cursor-pointer ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'}`}
              >
                A-
              </button>
              <span className={`text-[10px] font-mono font-black px-2 select-none ${isDark ? 'text-amber-400' : 'text-indigo-600'}`}>
                {Math.round(lyricZoom * 100)}%
              </span>
              <button
                onClick={() => setLyricZoom(prev => Math.min(1.5, prev + 0.05))}
                className={`px-2.5 py-2 font-black text-xs cursor-pointer ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-700'}`}
              >
                A+
              </button>
            </div>

            {/* Display Mode Selector */}
            <div className="flex items-center gap-1 bg-black/20 border border-slate-700/30 rounded-xl p-1">
              <button
                onClick={() => { setDisplayMode('both'); setShowLyrics(true); }}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  displayMode === 'both' && showLyrics
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Both
              </button>
              <button
                onClick={() => { setDisplayMode('both'); setShowLyrics(false); }}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  displayMode === 'both' && !showLyrics
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chords
              </button>
              <button
                onClick={() => { setDisplayMode('numbers'); setShowLyrics(true); }}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  displayMode === 'numbers'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Numbers
              </button>
            </div>
          </div>
        </div>

        {/* Central Scrolling Sheet View */}
        <div className={`flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10 ${
          isDark ? 'bg-[#030408]' : 'bg-[#f0f2f5]'
        }`}>
          <div className="max-w-4xl mx-auto">
            {/* Swipe gesture help toast inside */}
            <div className={`text-center mb-6 text-[10px] uppercase font-bold tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              ← SWIPE FOR PREVIOUS / NEXT SONGS →
            </div>

            {/* Chords rendering sheet block */}
            <div className="space-y-6 select-text" style={{ fontSize: `${lyricZoom}rem` }}>
              {(() => {
                const repInfo = getRoadmapRepetitionInfo(activeRoadmap);
                
                return activeRoadmap.map((block, idx) => {
                  const blockRep = repInfo[idx];
                  let blockDisplayName = block.name;

                  if (sheetLayoutMode === 'sequence') {
                    if (blockRep && blockRep.isRepeat) {
                      return null;
                    }
                    if (blockRep && blockRep.totalInRun > 1) {
                      blockDisplayName = `${block.name} (${blockRep.totalInRun}x)`;
                    }
                  }

                  if (sheetLayoutMode === 'compact') {
                    if (!showLyrics) {
                      const firstIdx = activeRoadmap.findIndex((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                      if (firstIdx !== idx) return null;
                      const identicalBlocks = activeRoadmap.filter((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                      const uniqueNames = Array.from(new Set(identicalBlocks.map((b) => b.name)));
                      blockDisplayName = `${uniqueNames.join(' / ')}`;
                    } else {
                      const firstIdx = activeRoadmap.findIndex((b) => b.name === block.name);
                      if (firstIdx !== idx) return null;
                      blockDisplayName = `${block.name}`;
                    }
                  }

                  const templateLines = effectiveSectionTemplates[block.name] || [];
                  const blockOffset = block.keyOffset || 0;
                  const blockKeyName = getModulatedKeyName(currentKey, blockOffset);

                  const originalIdx = NOTE_TO_INDEX[currentSong.OriginalKey || 'C'] || 0;
                  const currentIdx = NOTE_TO_INDEX[currentKey] || 0;
                  const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

                  const totalOccurrencesInSong = activeRoadmap.filter((b) => {
                    if (sheetLayoutMode === 'compact') {
                      if (!showLyrics) {
                        return areBlocksChordsIdentical(b, block, effectiveSectionTemplates);
                      } else {
                        return b.name === block.name;
                      }
                    }
                    return false;
                  }).length;

                  const blockLower = blockDisplayName.toLowerCase();
                  const isBridge = blockLower.includes('bridge');
                  const isChorus = blockLower.includes('chorus') && !blockLower.includes('verse');
                  const isPreChorus = blockLower.includes('pre-chorus') || blockLower.includes('pre chorus') || blockLower.includes('prechorus');
                  const isVerse = blockLower.includes('verse');
                  const isIntro = blockLower.includes('intro');
                  const isOutro = blockLower.includes('outro');
                  const isSolo = blockLower.includes('solo') || blockLower.includes('interlude');

                  let sectionAccentColor = isDark 
                    ? 'border-[#2d325a] text-indigo-400 bg-[#0e101d]' 
                    : 'border-indigo-200 text-indigo-700 bg-indigo-50';
                  let sectionBorderColor = isDark ? 'border-[#1b1e36]' : 'border-slate-300';
                  let sectionLabel = 'IND';

                  if (isVerse) {
                    sectionAccentColor = isDark 
                      ? 'border-emerald-950/80 text-emerald-400 bg-emerald-950/20' 
                      : 'border-emerald-200 text-emerald-700 bg-emerald-50';
                    sectionLabel = 'VRS';
                  } else if (isChorus) {
                    sectionAccentColor = isDark 
                      ? 'border-orange-950/80 text-orange-400 bg-orange-950/20' 
                      : 'border-orange-200 text-orange-700 bg-orange-50';
                    sectionLabel = 'CHS';
                  } else if (isPreChorus) {
                    sectionAccentColor = isDark 
                      ? 'border-amber-950/80 text-amber-400 bg-amber-950/20' 
                      : 'border-amber-200 text-amber-700 bg-amber-50';
                    sectionLabel = 'PRE';
                  } else if (isBridge) {
                    sectionAccentColor = isDark 
                      ? 'border-fuchsia-950/80 text-fuchsia-400 bg-fuchsia-950/20' 
                      : 'border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50';
                    sectionLabel = 'BDG';
                  } else if (isSolo) {
                    sectionAccentColor = isDark 
                      ? 'border-cyan-950/80 text-cyan-400 bg-cyan-950/20' 
                      : 'border-cyan-200 text-cyan-700 bg-cyan-50';
                    sectionLabel = 'SOL';
                  } else if (isIntro || isOutro) {
                    sectionAccentColor = isDark 
                      ? 'border-teal-950/80 text-teal-400 bg-teal-950/20' 
                      : 'border-teal-200 text-teal-700 bg-teal-50';
                    sectionLabel = isIntro ? 'INT' : 'OUT';
                  }

                  return (
                    <div 
                      key={block.id} 
                      className={`mb-5 last:mb-0 p-5 rounded-2xl border ${sectionBorderColor} ${
                        isDark ? 'bg-[#0a0c16]' : 'bg-white'
                      } select-text relative shadow-sm`}
                    >
                      {/* Section Header */}
                      <div className="flex items-center justify-between gap-4 w-full select-none mb-3 border-b border-dashed border-slate-700/10 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-mono text-[9px] font-black tracking-widest rounded px-1.5 py-0.5 border ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                          }`}>
                            {sectionLabel}
                          </span>
                          <span className={`text-xs sm:text-sm font-sans font-black uppercase tracking-wider ${
                            isVerse ? 'text-emerald-500' : isChorus ? 'text-orange-500' : isPreChorus ? 'text-amber-500' : isBridge ? 'text-fuchsia-500' : 'text-indigo-400'
                          }`}>
                            {blockDisplayName} {blockOffset !== 0 ? `[Modulate to ${blockKeyName}]` : ''}
                          </span>
                          {((sheetLayoutMode === 'compact' && totalOccurrencesInSong > 1) ||
                            (sheetLayoutMode === 'sequence' && blockRep && blockRep.totalInRun > 1)) && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none uppercase tracking-wide flex items-center gap-1 shadow-sm">
                              🔁 {sheetLayoutMode === 'compact' ? totalOccurrencesInSong : blockRep.totalInRun}x
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Embedded Lyrics Hints if hidden */}
                      {!showLyrics && (
                        <div className={`mb-3 p-3 border-l-4 border-l-indigo-500 rounded-r-xl text-[11px] sm:text-xs font-semibold italic select-none ${
                          isDark ? 'bg-slate-900/60 border border-slate-800 text-slate-300' : 'bg-slate-50 border border-slate-200 text-slate-600'
                        }`}>
                          {(() => {
                            if (sheetLayoutMode === 'compact') {
                              const identicalBlocks = activeRoadmap.filter((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                              const renderedHints: any[] = [];
                              const seenNames = new Set();
                              
                              identicalBlocks.forEach((b) => {
                                if (seenNames.has(b.name)) return;
                                seenNames.add(b.name);
                                const lines = effectiveSectionTemplates[b.name] || [];
                                const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                if (firstLyric) {
                                  renderedHints.push({ name: b.name, lyric: firstLyric });
                                }
                              });

                              if (renderedHints.length > 0) {
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
                                  <div key={gIdx} className="flex items-center justify-between gap-2 flex-wrap w-full">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border not-italic ${
                                        isDark ? 'bg-indigo-950/60 border-indigo-900/50 text-indigo-400' : 'bg-indigo-100 border-indigo-200 text-indigo-700'
                                      }`}>
                                        {g.names.map(n => n.toUpperCase()).join(' & ')}
                                      </span>
                                      <span className="truncate">“{g.lyric}”</span>
                                    </div>
                                  </div>
                                ));
                              }
                            } else {
                              const lines = effectiveSectionTemplates[block.name] || [];
                              const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                              if (firstLyric) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-indigo-400 not-italic">Hint:</span>
                                    <span className="truncate">“{firstLyric}”</span>
                                  </div>
                                );
                              }
                            }
                            return <span className="text-gray-400">No lyrics available</span>;
                          })()}
                        </div>
                      )}

                      {/* Section Chords & Lyrics Lines */}
                      <div className="space-y-4">
                        {(() => {
                          const activeLines = templateLines.filter((_, lIdx) => {
                            if (!block.enabledLines || block.enabledLines.length === 0) return true;
                            return block.enabledLines.includes(lIdx);
                          });

                          if (activeLines.length === 0) {
                            return <div className="text-xs text-gray-500 italic select-none">All lines hidden in this block</div>;
                          }

                          const processedLines = activeLines.map((line, lIdx) => {
                            let transposed = '';
                            if (line.Chords) {
                              transposed = line.Chords.split(' ')
                                .map((token) => {
                                  if (!token.trim()) return '';
                                  try {
                                    return transposeChord(token, totalSemitonesOffset);
                                  } catch (e) {
                                    return token;
                                  }
                                })
                                .join(' ');
                            }
                            
                            let numbers = '';
                            if (line.Chords) {
                              numbers = getNumberForChord(transposed, blockKeyName, currentKey);
                            }

                            return {
                              lIdx,
                              transposed,
                              numbers,
                              lyrics: line.Lyrics,
                            };
                          });

                          // Compact chords loop detection
                          let bestL = -1;
                          let bestK = -1;
                          if (processedLines.length >= 4) {
                            for (let L = 2; L <= Math.floor(processedLines.length / 2); L++) {
                              for (let K = 2; K <= Math.floor(processedLines.length / L); K++) {
                                let match = true;
                                for (let r = 1; r < K; r++) {
                                  for (let offset = 0; offset < L; offset++) {
                                    const lineA = processedLines[offset];
                                    const lineB = processedLines[r * L + offset];
                                    if (lineA.transposed !== lineB.transposed) {
                                      match = false;
                                      break;
                                    }
                                  }
                                  if (!match) break;
                                }

                                if (match) {
                                  let hasChords = false;
                                  for (let offset = 0; offset < L; offset++) {
                                    if (processedLines[offset].transposed.trim()) {
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
                          }

                          // Render Loop-Grouping in Stage Mode
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
                                  className={`border border-l-4 rounded-r-xl px-4 py-3.5 my-4 space-y-3 shadow-md ${
                                    isDark 
                                      ? 'bg-[#0f1228] border-indigo-950/40 border-l-amber-500' 
                                      : 'border-amber-100 border-l-amber-600 bg-amber-50/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1.5 select-none">
                                    <span className={`text-[10px] font-mono font-black uppercase tracking-wider rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm ${
                                      isDark ? 'bg-amber-950 border-amber-900 text-amber-400' : 'text-amber-700 bg-amber-100 border border-amber-200'
                                    }`}>
                                      <span>🔁</span> PLAY {repeatCount}X
                                    </span>
                                  </div>

                                  <div className="space-y-3">
                                    {runLines.map((lineData) => {
                                      const { lIdx, transposed, numbers, lyrics } = lineData;
                                      return (
                                        <div key={lIdx} className="break-inside-avoid">
                                          {displayMode !== 'numbers' && transposed && (
                                            <div className={`font-mono font-black text-sm sm:text-base tracking-[0.25em] leading-normal mb-1 ${
                                              isDark ? 'text-yellow-400' : 'text-indigo-700'
                                            }`}>
                                              {transposed}
                                            </div>
                                          )}
                                          {displayMode !== 'chords' && numbers && (
                                            <div className="font-mono font-bold text-xs sm:text-sm text-indigo-500/60 tracking-[0.2em] leading-normal mb-1">
                                              {numbers}
                                            </div>
                                          )}
                                          {showLyrics && lyrics && (
                                            <div className={`text-sm sm:text-base font-sans font-semibold leading-relaxed mt-0.5 ${
                                              isDark ? 'text-slate-200' : 'text-slate-800'
                                            }`}>
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
                              for (let r = 0; r < repeatCount; r++) {
                                const runLines = processedLines.slice(r * loopLength, (r + 1) * loopLength);
                                loopContainers.push(
                                  <div
                                    key={`loop-run-${r}`}
                                    className={`border border-l-4 rounded-r-xl px-4 py-3.5 my-4 space-y-3 shadow-md ${
                                      isDark
                                        ? 'bg-[#151936]/40 border-indigo-900/50 border-l-indigo-500'
                                        : 'border-indigo-100 border-l-indigo-600 bg-indigo-50/50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1.5 select-none">
                                      {r === 0 ? (
                                        <>
                                          <span className={`text-[10px] font-mono font-black uppercase tracking-wider rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm ${
                                            isDark ? 'bg-amber-950 border-amber-900 text-amber-400' : 'text-amber-700 bg-amber-100 border border-amber-200'
                                          }`}>
                                            <span>🔁</span> LOOP ({repeatCount}X) — ROUND 1
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <span className={`text-[10px] font-mono font-black uppercase tracking-wider rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm ${
                                            isDark ? 'bg-slate-900 border-slate-800 text-indigo-400' : 'text-indigo-700 bg-indigo-100 border border-indigo-200'
                                          }`}>
                                            <span>🔁</span> ROUND {r + 1}
                                          </span>
                                        </>
                                      )}
                                    </div>

                                    <div className="space-y-3">
                                      {runLines.map((lineData) => {
                                        const { lIdx, transposed, numbers, lyrics } = lineData;
                                        return (
                                          <div key={lIdx} className="break-inside-avoid">
                                            {displayMode !== 'numbers' && transposed && (
                                              <div className={`font-mono font-black text-sm sm:text-base tracking-[0.25em] leading-normal mb-1 ${
                                                isDark ? 'text-yellow-400' : 'text-indigo-700'
                                              }`}>
                                                {transposed}
                                              </div>
                                            )}
                                            {displayMode !== 'chords' && numbers && (
                                              <div className="font-mono font-bold text-xs sm:text-sm text-indigo-500/60 tracking-[0.2em] leading-normal mb-1">
                                                {numbers}
                                              </div>
                                            )}
                                            {showLyrics && lyrics && (
                                              <div className={`text-sm sm:text-base font-sans font-semibold leading-relaxed mt-0.5 ${
                                                isDark ? 'text-slate-200' : 'text-slate-800'
                                              }`}>
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
                              <div className="space-y-3">
                                {loopContainers}
                                {remainingLines.length > 0 && (
                                  <div className={`pt-4 space-y-3 border-t border-dashed ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                    {remainingLines.map((lineData) => {
                                      const { lIdx, transposed, numbers, lyrics } = lineData;
                                      return (
                                        <div key={lIdx} className="break-inside-avoid">
                                          {displayMode !== 'numbers' && transposed && (
                                            <div className={`font-mono font-black text-sm sm:text-base tracking-[0.25em] leading-normal mb-1 ${
                                              isDark ? 'text-yellow-400' : 'text-indigo-700'
                                            }`}>
                                              {transposed}
                                            </div>
                                          )}
                                          {displayMode !== 'chords' && numbers && (
                                            <div className="font-mono font-bold text-xs sm:text-sm text-indigo-500/60 tracking-[0.2em] leading-normal mb-1">
                                              {numbers}
                                            </div>
                                          )}
                                          {showLyrics && lyrics && (
                                            <div className={`text-sm sm:text-base font-sans font-semibold leading-relaxed mt-0.5 ${
                                              isDark ? 'text-slate-200' : 'text-slate-800'
                                            }`}>
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

                          // Fallback line runs
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

                          return lineRuns.map((run) => {
                            const firstLine = processedLines[run.startIndex];
                            const { lIdx, transposed, numbers, lyrics } = firstLine;

                            return (
                              <div key={lIdx} className="break-inside-avoid leading-normal py-1">
                                {displayMode !== 'numbers' && transposed && (
                                  <div className={`font-mono font-black text-sm sm:text-base tracking-[0.25em] leading-normal mb-1.5 flex items-center gap-2 flex-wrap ${
                                    isDark ? 'text-yellow-400' : 'text-indigo-700'
                                  }`}>
                                    <span>{transposed}</span>
                                    {run.count > 1 && (
                                      <span className={`text-[10px] border rounded px-2 py-0.5 font-mono font-black select-none tracking-normal uppercase ${
                                        isDark ? 'bg-amber-950/60 border-amber-900/50 text-amber-400' : 'bg-amber-100 text-amber-700 border border-amber-200'
                                      }`}>
                                        {run.count}x
                                      </span>
                                    )}
                                  </div>
                                )}
                                {displayMode !== 'chords' && numbers && (
                                  <div className="font-mono font-bold text-xs sm:text-sm text-indigo-500/60 tracking-[0.2em] leading-normal mb-1 flex items-center gap-2 flex-wrap">
                                    <span>{numbers}</span>
                                    {run.count > 1 && displayMode === 'numbers' && (
                                      <span className={`text-[10px] border rounded px-2 py-0.5 font-mono font-black select-none tracking-normal uppercase ${
                                        isDark ? 'bg-amber-950/60 border-amber-900/50 text-amber-400' : 'bg-amber-100 text-amber-700 border border-amber-200'
                                      }`}>
                                        {run.count}x
                                      </span>
                                    )}
                                  </div>
                                )}
                                {showLyrics && lyrics && (
                                  <div className={`text-sm sm:text-base font-sans font-semibold leading-relaxed mt-0.5 ${
                                    isDark ? 'text-slate-200' : 'text-slate-800'
                                  }`}>
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
                });
              })()}
            </div>
          </div>
        </div>

        {/* High-Contrast Bottom Navigation Bar */}
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t select-none shrink-0 ${
          isDark ? 'bg-[#0a0c16]/95 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handlePrevSong}
              disabled={!isSetlist || currentSongIndex === 0}
              className={`flex-1 sm:flex-initial h-12 px-6 rounded-xl font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                !isSetlist || currentSongIndex === 0
                  ? 'opacity-30 cursor-not-allowed bg-slate-800/10 text-slate-500 border border-transparent'
                  : isDark 
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-md shadow-indigo-600/10' 
                    : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200'
              }`}
            >
              <span>◀</span> PREV SONG
            </button>
          </div>

          <div className="flex flex-col items-center justify-center text-center">
            {isSetlist ? (
              <>
                <span className={`text-[10px] uppercase font-mono font-black tracking-widest ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  SONG {currentSongIndex + 1} OF {totalSongs}
                </span>
                {nextSongTitle && (
                  <p className={`text-[10px] font-semibold mt-1 max-w-[250px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    NEXT: <span className="font-extrabold uppercase">{nextSongTitle}</span>
                  </p>
                )}
              </>
            ) : (
              <span className="text-[10px] uppercase font-mono font-black tracking-widest text-slate-500">
                STANDALONE PLAY
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleNextSong}
              disabled={!isSetlist || currentSongIndex === totalSongs - 1}
              className={`flex-1 sm:flex-initial h-12 px-6 rounded-xl font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                !isSetlist || currentSongIndex === totalSongs - 1
                  ? 'opacity-30 cursor-not-allowed bg-slate-800/10 text-slate-500 border border-transparent'
                  : isDark 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 shadow-md shadow-rose-600/10' 
                    : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-200'
              }`}
            >
              NEXT SONG <span>▶</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-[#0a0b16] to-[#05060a] text-white relative overflow-x-hidden font-sans selection:bg-indigo-500/30">
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
              <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
                
                {/* Left/Top Column: Real-time Controls */}
                <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 p-5 shrink-0 bg-indigo-950/15 overflow-visible md:overflow-y-auto">
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

                    {/* Show Song Sheet Title & Artist */}
                    <div className="flex items-center justify-between select-none py-1 border-t border-white/5 pt-3 mt-1">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                        Show Title & Artist
                      </span>
                      <input
                        type="checkbox"
                        checked={pdfShowHeaders}
                        onChange={(e) => setPdfShowHeaders(e.target.checked)}
                        className="accent-indigo-500 rounded border-white/10 cursor-pointer h-4 w-4"
                      />
                    </div>

                    {/* Show Sheet Metadata (Key, Tempo, Scroll, Concert Time) */}
                    <div className="flex items-center justify-between select-none py-1 border-b border-white/5 pb-3">
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                        Show Key, Tempo, Scroll
                      </span>
                      <input
                        type="checkbox"
                        checked={pdfShowMetadata}
                        onChange={(e) => setPdfShowMetadata(e.target.checked)}
                        className="accent-indigo-500 rounded border-white/10 cursor-pointer h-4 w-4"
                      />
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
                            const resolvedKey = pdfSongKeys[songIdStr] || songData.activeKey;
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
                <div className="flex-1 bg-black/45 p-4 sm:p-6 overflow-visible md:overflow-y-auto flex items-start justify-center custom-scrollbar select-text">
                  
                  {/* Physical A4 Sheet Container */}
                  <div className="print-document-container w-full max-w-[210mm] bg-white text-slate-900 shadow-2xl rounded-lg p-6 sm:p-10 font-sans border border-slate-200 space-y-12">
                    
                    {/* Optional Setlist Cover Page */}
                    {previewSongsData.length > 1 && pdfScope === 'all' && (
                      <div className="print-cover-page break-after-page flex flex-col justify-between h-[270mm] border-4 border-double border-slate-900 p-12 text-center select-none mb-16 relative">
                        <div className="my-auto space-y-6">
                          <span className="text-5xl">📁</span>
                          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest leading-none mt-2">
                            {activeSetlistFolder || 'Setlist'}
                          </h1>
                          <div className="w-24 h-1 bg-slate-900 mx-auto" />
                          <p className="text-sm text-slate-600 font-bold tracking-wider uppercase">
                            Complete Gig Song Sheet Collection
                          </p>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-sm mx-auto text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Setlist Index</span>
                            <div className="mt-2 space-y-1">
                              {previewSongsData.map((songData, idxVal) => {
                                const songIdStr = String(songData.song.SongID);
                                const resolvedKey = pdfSongKeys[songIdStr] || songData.activeKey;
                                return (
                                  <div key={songData.song.SongID} className="flex justify-between items-center text-xs font-semibold text-slate-700">
                                    <span className="truncate max-w-[200px]">{idxVal + 1}. {songData.song.Title}</span>
                                    <span className="font-mono text-slate-400 text-[10px]">{resolvedKey}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Generated on {new Date().toLocaleDateString()} • {previewSongsData.length} Songs Total
                          </p>
                        </div>
                      </div>
                    )}

                    {previewSongsData.map((songData, sIdx) => {
                      const { activeKey: songKey, activeRoadmapToUse: songRoadmap, templates: songTemplates, song } = songData;
                      const title = song.Title;
                      const artist = song.Artist;
                      const repInfo = getRoadmapRepetitionInfo(songRoadmap);
                      const isMerged = previewSongsData.length > 1 && pdfScope === 'all';
                      return (
                        <div 
                          key={song.SongID} 
                          className={`print-song-page-preview ${
                            isMerged 
                              ? 'break-before-page pt-0 mt-0 flex flex-col justify-between' 
                              : sIdx > 0 
                                ? 'border-t-2 border-slate-200 pt-10 mt-10' 
                                : ''
                          }`}
                        >
                          {/* Header Container - Shown conditionally based on customization toggles */}
                          {(pdfShowHeaders || pdfShowMetadata) && (
                            <div className="border-b-2 border-slate-900 pb-2 mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                              {pdfShowHeaders ? (
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
                              ) : (
                                <div />
                              )}
                              {pdfShowMetadata && (
                                <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-600 font-mono select-none">
                                  <span className="text-xs font-black text-indigo-600 border border-indigo-600 px-2 py-0.5 rounded-md uppercase">
                                    KEY: {songKey.toUpperCase()}
                                  </span>
                                  {song.BPM && (
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                      TEMPO: {song.BPM} BPM
                                    </span>
                                  )}
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    SCROLL: {scrollSpeed}x
                                  </span>
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-rose-600">
                                    CLOCK: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Live Sheet Render */}
                          <div className="space-y-4">
                              {songRoadmap.map((block: any, idx: number) => {
                                const blockRep = repInfo[idx];
                                let blockDisplayName = block.name;
  
                                if (sheetLayoutMode === 'sequence') {
                                  if (blockRep && blockRep.isRepeat) {
                                    return null;
                                  }
                                  if (blockRep && blockRep.totalInRun > 1) {
                                    blockDisplayName = `${block.name} (${blockRep.totalInRun}x)`;
                                  }
                                }
 
                                if (sheetLayoutMode === 'compact') {
                                 if (!showLyrics) {
                                   const firstIdx = songRoadmap.findIndex((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
                                   if (firstIdx !== idx) return null;
                                   const identicalBlocks = songRoadmap.filter((b: any) => areBlocksChordsIdentical(b, block, songTemplates));
                                   const uniqueNames = Array.from(new Set(identicalBlocks.map((b: any) => b.name)));
                                   blockDisplayName = `${uniqueNames.join(' / ')}`;
                                 } else {
                                   const firstIdx = songRoadmap.findIndex((b: any) => b.name === block.name);
                                   if (firstIdx !== idx) return null;
                                   blockDisplayName = `${block.name}`;
                                 }
                               }

                               const templateLines = songTemplates[block.name] || [];
                              const blockOffset = block.keyOffset || 0;
                              const blockKeyName = getModulatedKeyName(songKey, blockOffset);

                              const originalIdx = NOTE_TO_INDEX[song.OriginalKey || 'C'] || 0;
                              const currentIdx = NOTE_TO_INDEX[songKey] || 0;
                              const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

                              const totalOccurrencesInSong = songRoadmap.filter((b: any) => {
                                if (sheetLayoutMode === 'compact') {
                                  if (!showLyrics) {
                                    return areBlocksChordsIdentical(b, block, songTemplates);
                                  } else {
                                    return b.name === block.name;
                                  }
                                }
                                return false;
                              }).length;

                              return (
                                <div key={block.id} className="break-inside-avoid">
                                  {/* Section Header */}
                                  <h3 className="text-[11px] font-black text-indigo-950 uppercase tracking-wide border-b border-slate-200 pb-0.5 mb-1.5 select-none flex items-center gap-2">
                                    <span>
                                      {blockDisplayName} {blockOffset !== 0 ? `(KEY: ${blockKeyName})` : ''}
                                    </span>
                                    {((sheetLayoutMode === 'compact' && totalOccurrencesInSong > 1) ||
                                      (sheetLayoutMode === 'sequence' && blockRep && blockRep.totalInRun > 1)) && (
                                      <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 font-mono font-black select-none uppercase tracking-wide">
                                        🔁 {sheetLayoutMode === 'compact' ? totalOccurrencesInSong : blockRep.totalInRun}x
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

                                            const totalTimes = identicalBlocks.length;
                                            return groups.map((g, gIdx) => (
                                              <div key={gIdx} className="flex items-center justify-between gap-1.5 flex-wrap w-full">
                                                <div className="flex items-center gap-1.5">
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
                                        const lineOffset = block.lineOffsets?.[lIdx] || 0;
                                        const lineTotalSemitonesOffset = totalSemitonesOffset + lineOffset;
                                        const transposed = transposeChord(l.Chords || '', lineTotalSemitonesOffset);
                                        const lineBlockKeyName = getModulatedKeyName(songKey, blockOffset + lineOffset);
                                        const numbers = getNumberForChord(transposed, lineBlockKeyName, songKey);
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

                          {/* Printable page numbering footer */}
                          {previewSongsData.length > 1 && pdfScope === 'all' && (
                            <div className="print-footer mt-auto pt-4 border-t border-slate-200/60 flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono select-none">
                              <div>SETLIST: {activeSetlistFolder || 'Setlist'}</div>
                              <div>SONG {sIdx + 1} OF {previewSongsData.length}</div>
                              <div>PAGE {sIdx + 2}</div>
                            </div>
                          )}
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
                    (window as any).exportToPDF();
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

      {/* Main Layout Screen when PDF Preview is closed */}
      {!isPDFPreviewOpen && (
        <div className={`flex flex-col min-h-screen ${isAdmin ? 'pt-[72px]' : 'pt-14'}`}>
          {/* Global Admin Mode Breathing Gold Line */}
          {isAdmin && (
            <div className="fixed top-0 left-0 right-0 z-[1000] h-[18px] gold-breathing-line flex items-center justify-center select-none shadow-lg">
              <span className="font-sans font-black text-[8px] uppercase tracking-[0.4em] text-amber-950/95 flex items-center gap-1">
                <span>⚡</span>
                <span>ADMIN COMMAND DECK ACTIVE</span>
                <span>⚡</span>
              </span>
            </div>
          )}

          {/* Header */}
          <header
            id="stageHeader"
            className={`fixed ${isAdmin ? 'top-[18px]' : 'top-0'} left-0 right-0 z-[100] bg-indigo-950/90 backdrop-blur-md border-b border-indigo-500/20 px-4 py-3 flex items-center justify-between transition-all select-none h-14`}
          >
            {/* Header Left: Menu, Home, and Brand */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                id="menuButton"
                onClick={() => setIsNavOpen(true)}
                className="px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/55 border border-indigo-500/20 hover:border-indigo-400/40 rounded-xl transition-all cursor-pointer text-white flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wider shrink-0"
              >
                <span className="text-sm">☰</span>
                <span>MENU</span>
              </button>

              <button
                onClick={() => setCurrentSong(null)}
                className={`p-2 border rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                  !currentSong
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                    : 'bg-indigo-950/60 border-indigo-500/20 text-slate-400 hover:text-white hover:bg-indigo-900/55 hover:border-indigo-400/40'
                }`}
                title="Go to Home"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </button>

              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/60 border border-indigo-500/20 rounded-xl shrink-0">
                <span className="text-xs">🎵</span>
                <span className="font-sans font-black text-[11px] text-white tracking-tight">worshipchordbook</span>
              </div>
            </div>

            {/* Header Middle: Empty spacer (Title removed as requested) */}
            <div className="flex-1 max-w-md mx-4" />

            {/* Header Right: Controls & Global Indicators */}
            <div className="flex items-center gap-2">

              {/* LIVE / OFFLINE Status Button */}
              <button
                onClick={() => {
                  showToast(isOfflineMode ? 'Using offline cached database.' : 'Connected to Live Google Sheet Database.', isOfflineMode ? 'warning' : 'success');
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                  isOfflineMode
                    ? 'bg-[#94a3b8]/10 border-[#94a3b8]/20 text-[#94a3b8]'
                    : 'bg-[#ef4444]/10 border-[#ef4444]/25 text-[#ef4444] shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-[#94a3b8] animate-pulse' : 'bg-[#ef4444] animate-pulse'}`} />
                <span className="font-mono uppercase tracking-wider text-[10px] font-black">{isOfflineMode ? 'OFFLINE' : 'LIVE'}</span>
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullScreen}
                className="p-2 bg-indigo-950/60 hover:bg-indigo-900/55 border border-indigo-500/20 hover:border-indigo-400/40 rounded-xl transition-all cursor-pointer text-indigo-200 hover:text-white flex items-center justify-center shrink-0"
                title="Toggle Fullscreen"
              >
                <span className="text-sm">⛶</span>
              </button>

              {/* Shortcuts Help Button */}
              <button
                onClick={() => setIsShortcutsOpen(true)}
                className="p-2 bg-indigo-950/60 hover:bg-indigo-900/55 border border-indigo-500/20 hover:border-indigo-400/40 rounded-xl transition-all cursor-pointer text-indigo-200 hover:text-white flex items-center justify-center shrink-0"
                title="Keyboard Shortcuts"
              >
                <span className="text-sm">⌨</span>
              </button>

              {/* View / Admin Mode Button */}
              <button
                onClick={handleAdminLockToggle}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1 shrink-0 ${
                  isAdmin
                    ? 'bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-[#0f172a] border border-[#fbbf24]/40 shadow-lg shadow-[#fbbf24]/15 font-black'
                    : 'bg-[#6366f1] hover:bg-[#6366f1]/90 text-white border border-[#6366f1]/30 font-black shadow-md shadow-[#6366f1]/5'
                }`}
              >
                <span>{isAdmin ? '🔓 ADMIN' : '🔒 VIEW ONLY'}</span>
              </button>
            </div>
          </header>

          {/* Main Layout Area */}
          <div className="flex-1 flex overflow-hidden relative">
            
            {/* Main Content Pane */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center song-scroll-container pb-28 lg:pb-8">
              
              {!currentSong ? (
                <div className="w-full max-w-5xl flex flex-col gap-6 select-none animate-fadeIn my-auto">
                  {/* Bento Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-950/40 to-slate-900/40 border border-indigo-500/20 p-6 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"></div>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 border border-indigo-400/30 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
                        <Music className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] font-mono font-black text-cyan-400 uppercase tracking-[0.25em]">Worship Director Command Deck</span>
                        <h1 className="text-3xl font-black text-white tracking-tight leading-none uppercase bg-gradient-to-r from-white via-indigo-100 to-cyan-200 bg-clip-text text-transparent">
                          worshipchordbook
                        </h1>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-400 text-[9px] font-mono font-black tracking-widest uppercase flex items-center gap-1.5 shadow-sm shadow-emerald-500/5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Ready for Stage
                      </span>
                    </div>
                  </div>

                  {/* Bento Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                    
                    {/* BENTO CARD 1: Session Controller (Spans 2 columns on desktop) */}
                    <div className="md:col-span-2 bg-gradient-to-br from-[#0c0d1b]/95 to-[#080918]/95 border border-indigo-500/15 hover:border-indigo-400/30 p-6.5 rounded-3xl flex flex-col justify-between text-left relative overflow-hidden group shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/5">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-3xl -mr-12 -mt-12 group-hover:from-indigo-500/15 transition-all duration-300"></div>
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Compass className="w-4 h-4 text-indigo-400" />
                          <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest">Active Session</span>
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2.5">
                          {activeSetlistFolder ? `Conducting: ${activeSetlistFolder}` : 'No Active Setlist Folder'}
                        </h2>
                        <p className="text-xs text-gray-400 max-w-lg leading-relaxed">
                          {activeSetlistFolder 
                            ? "Your active setlist is loaded and synchronized across local backup storages. Click below to launch the first song or select another setlist from the library."
                            : "Launch a live worship worship setlist folder or browse individual songs to activate the digital stage chart and configuration flow."
                          }
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-6">
                        {activeSetlistFolder ? (
                          <button
                            onClick={() => {
                              const setMeta = allSharedSetlists.find(sl => sl.PresetName === activeSetlistFolder);
                              if (setMeta) {
                                try {
                                  const parsed = JSON.parse(setMeta.RoadmapJSON);
                                  const songIds = parsed.songIds || [];
                                  if (songIds.length > 0) {
                                    const firstSong = songs.find(s => String(s.SongID) === String(songIds[0]));
                                    if (firstSong) {
                                      executeSongLoad(firstSong, false, activeSetlistFolder);
                                    }
                                  }
                                } catch {}
                              }
                            }}
                            className={`px-5 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center gap-2 ${
                              isAdmin
                                ? 'bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-[#0f172a] shadow-lg shadow-[#fbbf24]/10 border border-[#fbbf24]/40'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Launch Set</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setCurrentTab('songs');
                              setIsNavOpen(true);
                            }}
                            className={`px-5 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center gap-2 ${
                              isAdmin
                                ? 'bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-[#0f172a] shadow-lg shadow-[#fbbf24]/10 border border-[#fbbf24]/40'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                            }`}
                          >
                            <Folder className="w-3.5 h-3.5" />
                            <span>Open Song Catalog</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setCurrentTab('setlists');
                            setIsNavOpen(true);
                          }}
                          className="px-5 py-2.5 bg-[#161a3c]/30 hover:bg-[#1f2554] border border-indigo-500/15 text-indigo-300 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2"
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>Browse Setlists</span>
                        </button>
                      </div>
                    </div>

                    {/* BENTO CARD 2: Quick Stats Deck */}
                    <div className="bg-gradient-to-br from-[#0c0d1b]/95 to-[#080918]/95 border border-indigo-500/15 hover:border-indigo-400/30 p-6.5 rounded-3xl flex flex-col justify-between text-left shadow-xl group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/5">
                      <div className="flex items-center gap-2 mb-4">
                        <BarChart2 className="w-4 h-4 text-cyan-400" />
                        <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest">Library metrics</span>
                      </div>
                      
                      <div className="flex flex-col gap-3 my-auto">
                        <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-300 font-bold">Total Catalog Songs</span>
                            <span className="text-[8px] text-cyan-400/75 font-mono font-bold uppercase tracking-wider">☁️ Sheets Online</span>
                          </div>
                          <span className="font-mono font-black text-lg text-cyan-400">{songs.length}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-300 font-bold">Cloud Setlist Folders</span>
                            <span className="text-[8px] text-purple-400/75 font-mono font-bold uppercase tracking-wider">🌐 Shared Online</span>
                          </div>
                          <span className="font-mono font-black text-lg text-purple-400">{allSharedSetlists.length}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-300 font-bold">Sandbox Setlist Folders</span>
                            <span className="text-[8px] text-amber-500/75 font-mono font-bold uppercase tracking-wider">💾 Local Only</span>
                          </div>
                          <span className="font-mono font-black text-lg text-amber-500">{localSetlists.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-300 font-bold">Starred Favorites</span>
                            <span className="text-[8px] text-rose-400/75 font-mono font-bold uppercase tracking-wider">⭐ Browser Cache</span>
                          </div>
                          <span className="font-mono font-black text-lg text-rose-400">{favorites.length}</span>
                        </div>
                      </div>

                      <div className="text-[9px] text-indigo-400/40 font-mono italic mt-4 group-hover:text-indigo-400/70 transition-colors flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5" />
                        <span>Differentiated offline/online storage</span>
                      </div>
                    </div>

                    {/* BENTO CARD 3: Interactive Setlists (Spans 2 columns on desktop) */}
                    <div className="md:col-span-2 bg-gradient-to-br from-[#0c0d1b]/95 to-[#080918]/95 border border-indigo-500/15 hover:border-indigo-400/30 p-6.5 rounded-3xl flex flex-col text-left shadow-xl h-[300px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0 border-b border-indigo-500/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-400" />
                          <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest">Stage-Ready Setlist Folders</span>
                        </div>
                        <div className="flex bg-black/40 p-0.5 rounded-lg border border-indigo-500/15">
                          <button
                            onClick={() => setDashboardSetlistType('online')}
                            className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                              dashboardSetlistType === 'online'
                                ? 'bg-indigo-600/30 border border-indigo-500/20 text-white'
                                : 'text-indigo-400/50 hover:text-indigo-300'
                            }`}
                          >
                            🌐 Online ({allSharedSetlists.length})
                          </button>
                          <button
                            onClick={() => setDashboardSetlistType('local')}
                            className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                              dashboardSetlistType === 'local'
                                ? 'bg-purple-600/30 border border-purple-500/20 text-white'
                                : 'text-purple-400/50 hover:text-purple-300'
                            }`}
                          >
                            💾 Local ({localSetlists.length})
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                        {(() => {
                          const currentDashboardSetlists = dashboardSetlistType === 'online' ? allSharedSetlists : localSetlists;
                          if (currentDashboardSetlists.length === 0) {
                            return (
                              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-8">
                                <Folder className="w-8 h-8 text-indigo-500/20 mb-2" />
                                <p className="text-xs font-bold text-indigo-400/60 uppercase">No {dashboardSetlistType} folders found</p>
                                <p className="text-[10px] text-gray-600 mt-1">Use the Library Menu in the sidebar to create one!</p>
                              </div>
                            );
                          }
                          return currentDashboardSetlists.map((sl) => {
                            let count = 0;
                            try {
                              const parsed = JSON.parse(sl.RoadmapJSON);
                              count = (parsed.songIds || []).length;
                            } catch {}
                            return (
                              <div
                                key={sl.PresetName}
                                onClick={() => {
                                  setActiveSetlistFolder(sl.PresetName);
                                  setCurrentTab('setlists');
                                  setSetlistsTabMode(dashboardSetlistType);
                                  localStorage.setItem('setlists_tab_mode', dashboardSetlistType);
                                  setActiveSetlistType(dashboardSetlistType);
                                  localStorage.setItem('active_setlist_type', dashboardSetlistType);
                                  showToast(`Setlist "${sl.PresetName}" loaded! (${dashboardSetlistType === 'online' ? 'Cloud' : 'Local Sandbox'})`, 'success');
                                  
                                  // Attempt to load the first song in that setlist
                                  try {
                                    const parsed = JSON.parse(sl.RoadmapJSON);
                                    const songIds = parsed.songIds || [];
                                    if (songIds.length > 0) {
                                      const firstSong = songs.find(s => String(s.SongID) === String(songIds[0]));
                                      if (firstSong) {
                                        executeSongLoad(firstSong, false, sl.PresetName);
                                      }
                                    }
                                  } catch {}
                                }}
                                className={`p-3 bg-indigo-950/15 hover:bg-indigo-900/25 border ${
                                  dashboardSetlistType === 'local' ? 'border-purple-500/10 hover:border-purple-400/30' : 'border-indigo-500/10 hover:border-indigo-400/30'
                                } rounded-xl flex items-center justify-between cursor-pointer transition-all active:scale-99 group/item`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg ${
                                    dashboardSetlistType === 'local' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                  } flex items-center justify-center border group-hover/item:bg-indigo-500/20 transition-colors`}>
                                    <Folder className="w-4 h-4" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-white uppercase tracking-wide group-hover/item:text-indigo-300 transition-colors">{sl.PresetName}</span>
                                    <span className="text-[9px] text-gray-400 uppercase tracking-wider font-mono font-bold mt-0.5">{count} songs queued</span>
                                  </div>
                                </div>
                                <span className={`text-[9px] ${
                                  dashboardSetlistType === 'local' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                                } font-mono font-black uppercase tracking-widest border px-2.5 py-1 rounded-lg hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1`}>
                                  <span>Select Set ➔</span>
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* BENTO CARD 4: Quick Favorites */}
                    <div className="bg-gradient-to-br from-[#0c0d1b]/95 to-[#080918]/95 border border-indigo-500/15 hover:border-indigo-400/30 p-6.5 rounded-3xl flex flex-col text-left shadow-xl h-[300px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/5">
                      <div className="flex items-center gap-2 mb-4 shrink-0">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400/10" />
                        <span className="text-[9px] font-mono font-black text-indigo-400 uppercase tracking-widest">Starred Charts</span>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                        {favorites.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-8">
                            <Star className="w-8 h-8 text-amber-500/20 mb-2" />
                            <p className="text-xs font-bold text-amber-400/60 uppercase">No starred charts yet</p>
                            <p className="text-[10px] text-gray-600 mt-1">Star songs during performance to bookmark them!</p>
                          </div>
                        ) : (
                          favorites.map((songId) => {
                            const fSong = songs.find((s) => String(s.SongID) === String(songId));
                            if (!fSong) return null;
                            return (
                              <div
                                key={songId}
                                onClick={() => executeSongLoad(fSong)}
                                className="p-3 bg-amber-500/[0.03] hover:bg-amber-500/[0.08] border border-amber-500/10 hover:border-amber-400/30 rounded-xl flex items-center justify-between cursor-pointer transition-all active:scale-99 group/item"
                              >
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-white uppercase tracking-wide truncate max-w-[150px] group-hover/item:text-amber-300 transition-colors">{fSong.Title}</span>
                                  <span className="text-[9px] text-amber-400/80 uppercase font-mono font-bold mt-0.5">{fSong.Artist || 'Artist'}</span>
                                </div>
                                <span className="text-[10px] font-mono font-black text-amber-400 bg-amber-500/15 border border-amber-500/25 w-7 h-7 rounded-lg flex items-center justify-center group-hover/item:bg-amber-500 group-hover/item:text-black transition-colors">
                                  {fSong.OriginalKey || 'C'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-fadeIn pb-24">
                  
                  {/* Song Header & Actions row */}
                  <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none bg-indigo-950/45 border border-indigo-500/20 rounded-2xl p-4.5 backdrop-blur-sm shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 max-w-full md:max-w-[65%] shrink min-w-0 flex-1">
                      <div className="min-w-0 flex-1">
                        <div className="h-[36px] flex items-center justify-start w-full overflow-hidden">
                          <MarqueeTitle
                            title={currentSong.Title}
                            alignment="left"
                            textSizeClass="text-xl sm:text-2xl text-white"
                          />
                        </div>
                        <p className="text-xs text-indigo-400/80 font-bold uppercase tracking-wider mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                          by {currentSong.Artist || 'Unknown'}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1 sm:mt-0 shrink-0">
                        <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 rounded-lg font-sans font-black text-[9px] uppercase tracking-widest shrink-0 self-start sm:self-auto flex items-center gap-1">
                          👤 {currentArrangementName ? `Sequence: ${currentArrangementName}` : 'Standalone Song'}
                        </span>
                        {activeSetlistFolder && (
                          <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg font-sans font-black text-[9px] uppercase tracking-widest shrink-0 self-start sm:self-auto flex items-center gap-1">
                            📁 Set: {activeSetlistFolder}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Top Actions Pills */}
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                      {/* Favorite */}
                      <button
                        onClick={() => toggleFav(currentSong.SongID)}
                        className={`px-3.5 py-1.5 h-9 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                          favorites.includes(String(currentSong.SongID))
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-lg shadow-amber-500/5'
                            : 'bg-[#161a3c]/30 hover:bg-[#1f2554] border-indigo-500/15 text-indigo-300 hover:text-white'
                        }`}
                      >
                        <span>{favorites.includes(String(currentSong.SongID)) ? '★' : '☆'}</span>
                        <span>Fav</span>
                      </button>

                      {/* Setlist */}
                      <button
                        onClick={() => setIsSetlistManagerOpen(true)}
                        className="px-3.5 py-1.5 h-9 bg-[#161a3c]/30 hover:bg-[#1f2554] border border-indigo-500/15 text-indigo-300 hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>⚡</span>
                        <span>Set</span>
                      </button>



                      {/* PDF/Print */}
                      <button
                        onClick={() => setIsPDFPreviewOpen(true)}
                        className="px-3.5 py-1.5 h-9 bg-[#161a3c]/30 hover:bg-[#1f2554] border border-indigo-500/15 text-indigo-300 hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>📄</span>
                        <span>PDF</span>
                      </button>

                      {/* Edit Catalog */}
                      <button
                        onClick={() => {
                          if (appUser && appSecret) {
                            setFormEditingSong(currentSong);
                            setIsFormModalOpen(true);
                          } else {
                            showToast('Authentication required to edit catalog. Opening login...', 'info');
                            setIsAdminModalOpen(true);
                          }
                        }}
                        className="px-3.5 py-1.5 h-9 bg-[#161a3c]/30 hover:bg-[#1f2554] border border-indigo-500/15 text-indigo-300 hover:text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>✏️</span>
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>

                  {/* Collaborative Banners & Synced Alerts */}
                  {cloudArrangementUpdateNotice && (
                    <div className="w-full bg-indigo-950/80 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 animate-fadeIn backdrop-blur-sm select-none">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🔄</span>
                        <div>
                          <p className="text-xs font-bold text-indigo-200">
                            Arrangement Update Detected on Cloud!
                          </p>
                          <p className="text-[10px] text-gray-400">
                            A bandmate has updated the arrangement preset "{parsePresetDate(cloudArrangementUpdateNotice.name).baseName}".
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveRoadmap(cloudArrangementUpdateNotice.newRoadmap);
                          if (cloudArrangementUpdateNotice.newKey) {
                            setCurrentKey(cloudArrangementUpdateNotice.newKey);
                          }
                          setCloudArrangementUpdateNotice(null);
                          showToast('Cloud arrangement applied successfully!', 'success');
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm shadow-indigo-600/20"
                      >
                        Apply Sync
                      </button>
                    </div>
                  )}

                  {cloudArrangementDeletionNotice && (
                    <div className="w-full bg-rose-950/80 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 animate-fadeIn backdrop-blur-sm select-none">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="text-xs font-bold text-rose-200">
                            Active Arrangement Presets Cleaned on Cloud!
                          </p>
                          <p className="text-[10px] text-gray-400">
                            The remote preset "{parsePresetDate(cloudArrangementDeletionNotice.name).baseName}" was deleted. Click to safely revert.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          handleApplyArrangementDeletion(
                            cloudArrangementDeletionNotice.name,
                            cloudArrangementDeletionNotice.newSongArrangements,
                            cloudArrangementDeletionNotice.allArrs
                          );
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm shadow-rose-600/20"
                      >
                        Safe Revert
                      </button>
                    </div>
                  )}

                  {/* Active Arrangement Live Designer (Moved to top-level viewport modals) */}
                  {false && arrangerOpen && (
                    <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-md z-[850] flex items-center justify-center p-4 animate-fadeIn overflow-y-auto">
                      <div className="w-full max-w-4xl bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] p-5 sm:p-6 flex flex-col gap-5 animate-scaleIn max-h-[90vh] overflow-y-auto custom-scrollbar relative">
                        
                        {/* Close Button */}
                        <button
                          onClick={() => setArrangerOpen(false)}
                          className="absolute right-5 top-5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all text-sm font-bold z-10"
                          title="Close panel"
                        >
                          ✕
                        </button>

                        {/* Modal Header */}
                        <div className="flex items-center gap-3 border-b border-indigo-500/15 pb-4 select-none pr-8">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600/20 to-indigo-500/30 border border-indigo-500/30 flex items-center justify-center text-lg shrink-0">
                            🧭
                          </div>
                          <div className="text-left">
                            <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-indigo-300">
                              Song Roadmap & Sequence Designer
                            </h2>
                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">
                              Reorder, modulate, or insert blocks to customize the song roadmap sequence.
                            </p>
                          </div>
                        </div>
                        
                        {/* Top Presets Area */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2 text-left">
                          {/* Left Side: Shared Band Presets */}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                                Shared Band Presets
                              </span>
                              <button
                                onClick={async () => {
                                  setIsLoading(true);
                                  try {
                                    await fetchCatalog();
                                    showToast('Catalog synced with shared Google Sheet!', 'success');
                                  } catch (e) {
                                    showToast('Catalog sync failed.', 'error');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                className="px-2.5 py-1 border border-emerald-500/30 hover:bg-emerald-950/40 text-emerald-300 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                              >
                                <span>☁</span>
                                <span>Cloud Sync</span>
                              </button>
                            </div>
                            
                            {(() => {
                              const presets = getPresets();
                              const presetNames = Object.keys(presets).filter(name => !name.startsWith('Set:'));
                              if (presetNames.length === 0) {
                                return (
                                  <div className="text-gray-400 italic text-xs py-5 text-center bg-indigo-950/5 rounded-xl border border-dashed border-indigo-500/10 mt-1">
                                    No arrangements saved yet...
                                  </div>
                                );
                              }
                              return (
                                <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1 mt-1">
                                  {presetNames.map((name) => {
                                    const isCurrentlyActive = currentArrangementName === name;
                                    return (
                                      <div
                                        key={name}
                                        className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                          isCurrentlyActive
                                            ? 'bg-indigo-900/40 border-indigo-500/40 text-white'
                                            : 'bg-indigo-950/20 border-indigo-500/5 text-indigo-200 hover:bg-[#12142d]'
                                        }`}
                                      >
                                        <button
                                          onClick={() => loadPresetArrangement(name)}
                                          className="flex-1 text-left font-sans font-bold text-xs truncate py-1 cursor-pointer"
                                          title="Click to load arrangement"
                                        >
                                          {name}
                                        </button>
                                        {!!(appUser && appSecret) && (
                                          <button
                                            onClick={() => deletePresetArrangement(name, isCurrentlyActive)}
                                            className="p-1 hover:text-rose-400 text-gray-500 transition-colors ml-2 cursor-pointer"
                                            title="Delete arrangement"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Right Side: Save New Arrangement */}
                          <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 border-b border-indigo-500/10 pb-2">
                              Save New Arrangement
                            </span>
                            <div className="flex flex-col gap-3 mt-1">
                              <input
                                type="text"
                                placeholder="Preset name (e.g. Acoustic)"
                                value={currentArrangementName}
                                onChange={(e) => setCurrentArrangementName(e.target.value)}
                                className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl px-3 py-2.5 text-xs text-indigo-100 placeholder-indigo-400/50 focus:outline-none focus:border-indigo-400"
                              />
                              <button
                                onClick={async () => {
                                  if (!currentArrangementName.trim()) {
                                    showToast('Please enter an arrangement name first!', 'warning');
                                    return;
                                  }
                                  setIsLoading(true);
                                  try {
                                    await executeSaveArrangement(currentArrangementName.trim(), false, activeRoadmap);
                                    fetchCatalog();
                                  } catch (e) {
                                    showToast('Error saving arrangement', 'error');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-indigo-600/20 cursor-pointer"
                              >
                                Save Active Flow
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Active Editing Mode Green Status Banner */}
                        <div className="w-full bg-[#0e2723] border border-emerald-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-sm animate-pulse">🟢</span>
                            <div className="text-left">
                              <p className="text-xs font-black uppercase tracking-wider text-emerald-400">
                                Active Editing Mode
                              </p>
                              <p className="text-[10px] text-emerald-300/70 font-medium">
                                Esc or Cancel button to revert/cancel edit attempt.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={cancelArrangementEdit}
                              className="px-4 py-1.5 border border-rose-500/30 hover:bg-rose-950/50 text-rose-300 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => setIsArrangementLocked(!isArrangementLocked)}
                              className={`px-4 py-1.5 border font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                                isArrangementLocked
                                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                              }`}
                            >
                              {isArrangementLocked ? 'Locked' : 'Unlocked'}
                            </button>
                          </div>
                        </div>

                        {/* Append Blocks bottom controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-950/20 border border-indigo-500/5 rounded-xl p-3.5 gap-3 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 select-none">
                              Inject Block:
                            </span>
                            {Object.keys(effectiveSectionTemplates).map((secName) => (
                              <button
                                key={secName}
                                onClick={() => addRoadmapBlock(secName)}
                                className="px-2.5 py-1.5 bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600 hover:border-indigo-500 hover:text-white text-indigo-200 rounded-lg text-[10px] font-black transition-all cursor-pointer uppercase tracking-wider active:scale-95"
                              >
                                + {secName}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={resetRoadmapBlocks}
                            className="px-4 py-2 border border-rose-500/25 hover:bg-rose-950/50 text-rose-400 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer self-end sm:self-auto shrink-0 active:scale-95"
                          >
                            Reset Default
                          </button>
                        </div>

                        {/* Active Roadmap Cards Row */}
                        <div className="flex flex-col gap-2.5 text-left">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 select-none">
                            Configure Sequence Flow (Click Block to Edit Lines • Drag or Tap Arrows to Reorder)
                          </span>
                          <div className="flex flex-wrap gap-3 pb-3 pt-1 justify-start">
                            {activeRoadmap.map((block, bIdx) => {
                              const blockOffset = block.keyOffset || 0;
                              const blockKeyName = getModulatedKeyName(currentKey, blockOffset);
                              const enabledCount = (block.enabledLines || []).length;
                              const totalCount = (effectiveSectionTemplates[block.name] || []).length;
                              const isSelected = editingBlockId === block.id || (!editingBlockId && bIdx === 0);

                              return (
                                <div
                                  key={block.id}
                                  draggable
                                  onDragStart={() => handleDragStart(bIdx)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => handleDrop(bIdx)}
                                  onClick={() => setEditingBlockId(block.id)}
                                  className={`flex flex-col gap-3 rounded-xl p-3.5 min-w-[155px] max-w-[155px] shrink-0 text-center select-none shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer border ${
                                    isSelected
                                      ? 'border-indigo-400 ring-2 ring-indigo-500/40 bg-[#121435]/95 shadow-indigo-500/10'
                                      : 'bg-[#080918]/95 border-indigo-500/15 hover:border-indigo-400/35'
                                  }`}
                                >
                                  {/* Card header count */}
                                  <div className="flex items-center justify-between font-mono text-[9px] text-indigo-400/70">
                                    <span className="font-bold">#{bIdx + 1}</span>
                                    <span className={isSelected ? 'text-indigo-300 font-bold' : ''}>
                                      {enabledCount}/{totalCount} lines
                                    </span>
                                  </div>

                                  {/* Section title */}
                                  <h4 className="font-sans font-black text-sm uppercase tracking-wider text-white truncate flex items-center justify-center gap-1">
                                    {block.name}
                                    {isSelected && <span className="text-[10px]" title="Currently selected for dissection">📝</span>}
                                  </h4>

                                  {/* Transpose Controls */}
                                  <div className="flex items-center justify-between bg-indigo-950/40 px-2 py-1.5 rounded-lg border border-indigo-500/5">
                                    <span className="font-mono font-black text-xs text-amber-400 w-5 text-left truncate">
                                      {blockKeyName}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          adjustBlockModulation(block.id, -1);
                                        }}
                                        className="w-7 h-7 flex items-center justify-center bg-indigo-900/40 rounded hover:bg-indigo-900/80 text-xs font-black text-indigo-200 cursor-pointer active:scale-95 transition-all"
                                        title="Trans Down"
                                      >
                                        -
                                      </button>
                                      <span className="text-[10px] font-mono font-bold text-indigo-300 w-5 text-center">
                                        {blockOffset >= 0 ? `+${blockOffset}` : blockOffset}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          adjustBlockModulation(block.id, 1);
                                        }}
                                        className="w-7 h-7 flex items-center justify-center bg-indigo-900/40 rounded hover:bg-indigo-900/80 text-xs font-black text-indigo-200 cursor-pointer active:scale-95 transition-all"
                                        title="Trans Up"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>

                                  {/* Bottom Actions Row */}
                                  <div className="flex items-center justify-between border-t border-indigo-500/10 pt-2.5 gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => {
                                        if (bIdx > 0) {
                                          const next = [...activeRoadmap];
                                          const [item] = next.splice(bIdx, 1);
                                          next.splice(bIdx - 1, 0, item);
                                          setActiveRoadmap(next);
                                        }
                                      }}
                                      disabled={bIdx === 0}
                                      className="w-8 h-8 flex items-center justify-center bg-indigo-900/20 border border-indigo-500/10 hover:bg-indigo-900/50 rounded-lg text-xs text-indigo-300 disabled:opacity-20 cursor-pointer active:scale-95 transition-all"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      onClick={() => deleteRoadmapBlock(bIdx)}
                                      className="flex-1 h-8 flex items-center justify-center bg-rose-950/30 border border-rose-500/25 hover:bg-rose-600 rounded-lg text-rose-400 hover:text-white text-[11px] font-black cursor-pointer active:scale-95 transition-all"
                                      title="Delete section block"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (bIdx < activeRoadmap.length - 1) {
                                          const next = [...activeRoadmap];
                                          const [item] = next.splice(bIdx, 1);
                                          next.splice(bIdx + 1, 0, item);
                                          setActiveRoadmap(next);
                                        }
                                      }}
                                      disabled={bIdx === activeRoadmap.length - 1}
                                      className="w-8 h-8 flex items-center justify-center bg-indigo-900/20 border border-indigo-500/10 hover:bg-indigo-900/50 rounded-lg text-xs text-indigo-300 disabled:opacity-20 cursor-pointer active:scale-95 transition-all"
                                    >
                                      ▶
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Section Dissection & Line Editor Panel */}
                        {(() => {
                          const selectedBlock = activeRoadmap.find((b) => b.id === editingBlockId) || activeRoadmap[0];
                          if (!selectedBlock) return null;

                          const templateLines = effectiveSectionTemplates[selectedBlock.name] || [];

                          return (
                            <div className="bg-[#080918]/90 border border-indigo-500/25 rounded-2xl p-4.5 flex flex-col gap-4 text-left shadow-2xl animate-fadeIn">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-indigo-500/15 pb-3 gap-2">
                                <div>
                                  <span className="text-[9px] font-mono font-black uppercase tracking-widest text-indigo-400">
                                    Section Dissection & Line Editor
                                  </span>
                                  <h3 className="font-sans font-black text-sm uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                                    <span>{selectedBlock.name}</span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 rounded">
                                      {(selectedBlock.enabledLines || []).length} of {templateLines.length} Lines Included
                                    </span>
                                  </h3>
                                </div>
                                <span className="text-[10px] text-gray-400 font-medium bg-[#131526] px-2.5 py-1 rounded-md border border-[#222440]">
                                  Select/deselect lines for this sequence block. Edits to chords and lyrics sync live.
                                </span>
                              </div>

                              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {templateLines.length === 0 ? (
                                  <div className="text-gray-500 italic text-xs py-8 text-center bg-black/10 rounded-xl border border-dashed border-indigo-500/10">
                                    No lines defined in this section. Add one to start.
                                  </div>
                                ) : (
                                  templateLines.map((line, lIdx) => {
                                    const isLineEnabled = (selectedBlock.enabledLines || []).includes(lIdx);
                                    return (
                                      <div
                                        key={lIdx}
                                        className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all ${
                                          isLineEnabled
                                            ? 'bg-indigo-950/20 border-indigo-500/35 shadow-inner'
                                            : 'bg-black/20 border-indigo-500/5 opacity-55 hover:opacity-85'
                                        }`}
                                      >
                                        {/* Toggle Active Line Checkbox */}
                                        <button
                                          onClick={() => {
                                            const newRoadmap = activeRoadmap.map((b) => {
                                              if (b.id === selectedBlock.id) {
                                                const currentEnabled = b.enabledLines || [];
                                                const isEnabled = currentEnabled.includes(lIdx);
                                                const nextEnabled = isEnabled
                                                  ? currentEnabled.filter((idx) => idx !== lIdx)
                                                  : [...currentEnabled, lIdx].sort((a, b) => a - b);
                                                return { ...b, enabledLines: nextEnabled };
                                              }
                                              return b;
                                            });
                                            setActiveRoadmap(newRoadmap);
                                          }}
                                          className={`w-5.5 h-5.5 shrink-0 rounded-md flex items-center justify-center border cursor-pointer select-none text-xs font-black transition-all ${
                                            isLineEnabled
                                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20'
                                              : 'bg-[#131526]/80 border-gray-600 text-transparent'
                                          }`}
                                          title={isLineEnabled ? "De-select line from this section run" : "Select line for this section run"}
                                        >
                                          ✓
                                        </button>

                                        {/* Inputs Row */}
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                                          {/* Chords input */}
                                          <div className="flex flex-col gap-1 md:col-span-4">
                                            <span className="text-[8px] font-mono font-black tracking-wider text-amber-500/90 uppercase">Chords</span>
                                            {(() => {
                                              const originalIdx = NOTE_TO_INDEX[currentSong?.OriginalKey || 'C'] || 0;
                                              const currentIdx = NOTE_TO_INDEX[currentKey] || 0;
                                              const blockOffset = selectedBlock.keyOffset || 0;
                                              const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;
                                              const lineOffset = selectedBlock.lineOffsets?.[lIdx] || 0;
                                              const totalOffset = totalSemitonesOffset + lineOffset;
                                              const displayChords = transposeChord(line.Chords || '', totalOffset);

                                              return (
                                                <div className="flex flex-col gap-1 w-full">
                                                  <input
                                                    type="text"
                                                    value={displayChords}
                                                    onChange={(e) => {
                                                      const rawInput = e.target.value;
                                                      const originalChords = transposeChord(rawInput, -totalOffset);
                                                      const updatedLines = [...(effectiveSectionTemplates[selectedBlock.name] || [])];
                                                      if (updatedLines[lIdx]) {
                                                        updatedLines[lIdx] = {
                                                          ...updatedLines[lIdx],
                                                          Chords: originalChords,
                                                        };
                                                        setSectionTemplates(prev => ({
                                                          ...prev,
                                                          [selectedBlock.name]: updatedLines
                                                        }));
                                                        if (loadedSnapshotSections) {
                                                          setLoadedSnapshotSections(prev => {
                                                            if (!prev) return null;
                                                            return {
                                                              ...prev,
                                                              [selectedBlock.name]: updatedLines
                                                            };
                                                          });
                                                        }
                                                      }
                                                    }}
                                                    placeholder="Chords (e.g., C G Am F)"
                                                    className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-400"
                                                  />
                                                  {totalOffset !== 0 && (
                                                    <div className="text-[10px] font-mono text-indigo-400/85 px-2 py-0.5 bg-indigo-500/5 rounded border border-indigo-500/10 flex items-center gap-1">
                                                      <span className="text-[7.5px] bg-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded font-black leading-none shrink-0">
                                                        ORIGINAL (Untransposed):
                                                      </span>
                                                      <span className="font-extrabold tracking-wide truncate">{line.Chords || 'None'}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                          </div>

                                          {/* Line Transposition Offset Select */}
                                          <div className="flex flex-col gap-1 md:col-span-3">
                                            <span className="text-[8px] font-mono font-black tracking-wider text-emerald-400 uppercase">Line Mod</span>
                                            <select
                                              value={(selectedBlock.lineOffsets?.[lIdx] || 0).toString()}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                const currentOffsets = selectedBlock.lineOffsets || {};
                                                const newRoadmap = activeRoadmap.map((b) => {
                                                  if (b.id === selectedBlock.id) {
                                                    return {
                                                      ...b,
                                                      lineOffsets: {
                                                        ...currentOffsets,
                                                        [lIdx]: val,
                                                      }
                                                    };
                                                  }
                                                  return b;
                                                });
                                                setActiveRoadmap(newRoadmap);
                                                showToast(`Modulated line to ${val > 0 ? '+' : ''}${val} semitones`, 'info');
                                              }}
                                              className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2 py-1.5 text-xs text-emerald-300 font-extrabold focus:outline-none focus:border-emerald-400 cursor-pointer shadow-inner"
                                            >
                                              {Array.from({ length: 25 }, (_, idx) => idx - 12).map((val) => (
                                                <option key={val} value={val} className="bg-[#0c0d1b] text-emerald-300 font-bold">
                                                  {val > 0 ? `+${val}` : val} {val === 0 ? 'None' : 'st'}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          {/* Lyrics input */}
                                          <div className="flex flex-col gap-1 md:col-span-5">
                                            <span className="text-[8px] font-mono font-black tracking-wider text-indigo-400 uppercase">Lyrics</span>
                                            <input
                                              type="text"
                                              value={line.Lyrics || ''}
                                              onChange={(e) => {
                                                const updatedLines = [...(effectiveSectionTemplates[selectedBlock.name] || [])];
                                                if (updatedLines[lIdx]) {
                                                  updatedLines[lIdx] = {
                                                    ...updatedLines[lIdx],
                                                    Lyrics: e.target.value,
                                                  };
                                                  setSectionTemplates(prev => ({
                                                    ...prev,
                                                    [selectedBlock.name]: updatedLines
                                                  }));
                                                  if (loadedSnapshotSections) {
                                                    setLoadedSnapshotSections(prev => {
                                                      if (!prev) return null;
                                                      return {
                                                        ...prev,
                                                        [selectedBlock.name]: updatedLines
                                                      };
                                                    });
                                                  }
                                                }
                                              }}
                                              placeholder="Lyrics"
                                              className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                                            />
                                          </div>
                                        </div>

                                        {/* Delete Line Button */}
                                        <button
                                          onClick={() => {
                                            const updatedLines = (effectiveSectionTemplates[selectedBlock.name] || []).filter((_, idx) => idx !== lIdx);
                                            setSectionTemplates(prev => ({
                                              ...prev,
                                              [selectedBlock.name]: updatedLines
                                            }));
                                            if (loadedSnapshotSections) {
                                              setLoadedSnapshotSections(prev => {
                                                if (!prev) return null;
                                                return {
                                                  ...prev,
                                                  [selectedBlock.name]: updatedLines
                                                };
                                              });
                                            }

                                            // Re-map active roadmap blocks to prevent out-of-bound indexes
                                            const newRoadmap = activeRoadmap.map((b) => {
                                              if (b.name === selectedBlock.name) {
                                                const currentEnabled = b.enabledLines || [];
                                                const nextEnabled = currentEnabled
                                                  .filter((idx) => idx !== lIdx)
                                                  .map((idx) => (idx > lIdx ? idx - 1 : idx));
                                                return { ...b, enabledLines: nextEnabled };
                                              }
                                              return b;
                                            });
                                            setActiveRoadmap(newRoadmap);
                                          }}
                                          className="p-1.5 hover:text-rose-400 text-gray-500 transition-colors mt-4 self-center cursor-pointer select-none active:scale-90"
                                          title="Delete line"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              <div className="flex items-center justify-between border-t border-indigo-500/10 pt-3">
                                <span className="text-[10px] text-indigo-400/70 italic">
                                  Lines edited here can be saved securely to custom JSON presets.
                                </span>
                                <button
                                  onClick={() => {
                                    const currentLines = effectiveSectionTemplates[selectedBlock.name] || [];
                                    const newLine = {
                                      SongID: currentSong?.SongID || '',
                                      SectionName: selectedBlock.name,
                                      Section: selectedBlock.name,
                                      section: selectedBlock.name,
                                      Order: currentLines.length + 1,
                                      Chords: '',
                                      Lyrics: '',
                                    };
                                    const updatedLines = [...currentLines, newLine];

                                    setSectionTemplates(prev => ({
                                      ...prev,
                                      [selectedBlock.name]: updatedLines
                                    }));
                                    if (loadedSnapshotSections) {
                                      setLoadedSnapshotSections(prev => {
                                        if (!prev) return null;
                                        return {
                                          ...prev,
                                          [selectedBlock.name]: updatedLines
                                        };
                                      });
                                    }

                                    // Enable the new line for this block
                                    const newRoadmap = activeRoadmap.map((b) => {
                                      if (b.id === selectedBlock.id) {
                                        const currentEnabled = b.enabledLines || [];
                                        return {
                                          ...b,
                                          enabledLines: [...currentEnabled, updatedLines.length - 1],
                                        };
                                      }
                                      return b;
                                    });
                                    setActiveRoadmap(newRoadmap);
                                  }}
                                  className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/35 text-emerald-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                                >
                                  + Add Line to Section
                                </button>
                              </div>

                              {/* Pull Portion of Other Song UI block */}
                              <div className="mt-3">
                                {!isPullingFromOtherSong ? (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => setIsPullingFromOtherSong(true)}
                                      className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/35 text-indigo-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm"
                                    >
                                      <span>📥</span> Pull Portion of Other Song
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-2 bg-[#050614] border border-indigo-500/20 p-4 rounded-xl space-y-2 text-left">
                                    <div className="flex justify-between items-center pb-1 border-b border-indigo-500/10">
                                      <h4 className="text-[10px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1">
                                        <span>📥</span> Pull Portion of Other Songs
                                      </h4>
                                      <button
                                        onClick={() => {
                                          setIsPullingFromOtherSong(false);
                                          setPullSourceSongId('');
                                          setPullSourceSectionName('');
                                        }}
                                        className="text-gray-400 hover:text-white text-[9px] uppercase font-bold cursor-pointer transition-colors animate-pulse"
                                      >
                                        Cancel
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[7px] font-mono font-black tracking-wider text-indigo-400 uppercase">1. Select Source Song</span>
                                        <select
                                          value={pullSourceSongId}
                                          onChange={(e) => {
                                            setPullSourceSongId(e.target.value);
                                            setPullSourceSectionName('');
                                          }}
                                          className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
                                        >
                                          <option value="">-- Choose a song --</option>
                                          {songs
                                            .filter(s => String(s.SongID) !== String(currentSong?.SongID))
                                            .map(s => (
                                              <option key={s.SongID} value={s.SongID}>
                                                {s.Title} {s.Artist ? `(by ${s.Artist})` : ''}
                                              </option>
                                            ))
                                          }
                                        </select>
                                      </div>

                                      {pullSourceSongId && (
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[7px] font-mono font-black tracking-wider text-indigo-400 uppercase">2. Select Section</span>
                                          <select
                                            value={pullSourceSectionName}
                                            onChange={(e) => setPullSourceSectionName(e.target.value)}
                                            className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
                                          >
                                            <option value="">-- Choose a section --</option>
                                            {(() => {
                                              const sourceLines = songLines.filter(line => String(line.SongID) === String(pullSourceSongId));
                                              const uniqueSections = Array.from(new Set(sourceLines.map(line => line.SectionName || line.Section || line.section || 'Uncategorized').filter(Boolean)));
                                              return uniqueSections.map(sec => (
                                                <option key={sec} value={sec}>{sec}</option>
                                              ));
                                            })()}
                                          </select>
                                        </div>
                                      )}
                                    </div>

                                    {pullSourceSongId && pullSourceSectionName && (
                                      <div className="space-y-1.5 pt-1 border-t border-indigo-500/10">
                                        <span className="text-[7px] font-mono font-black tracking-wider text-indigo-400 uppercase block">
                                          3. Select Lines to Pull Into "{selectedBlock.name}"
                                        </span>
                                        {(() => {
                                          const sourceLines = songLines.filter(line => 
                                            String(line.SongID) === String(pullSourceSongId) && 
                                            (line.SectionName || line.Section || line.section || 'Uncategorized') === pullSourceSectionName
                                          );

                                          if (sourceLines.length === 0) {
                                            return <p className="text-[10px] text-gray-500 italic">No lines found in this section.</p>;
                                          }

                                          return (
                                            <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar pr-1 bg-black/30 p-1.5 rounded-lg border border-indigo-500/5">
                                              {sourceLines.map((line, idx) => {
                                                return (
                                                  <div 
                                                    key={idx} 
                                                    onClick={() => {
                                                      const currentLines = effectiveSectionTemplates[selectedBlock.name] || [];
                                                      const newLine = {
                                                        SongID: currentSong?.SongID || '',
                                                        SectionName: selectedBlock.name,
                                                        Section: selectedBlock.name,
                                                        section: selectedBlock.name,
                                                        Order: currentLines.length + 1,
                                                        Chords: line.Chords || '',
                                                        Lyrics: line.Lyrics || '',
                                                      };
                                                      const updatedLines = [...currentLines, newLine];

                                                      setSectionTemplates(prev => ({
                                                        ...prev,
                                                        [selectedBlock.name]: updatedLines
                                                      }));
                                                      if (loadedSnapshotSections) {
                                                        setLoadedSnapshotSections(prev => {
                                                          if (!prev) return null;
                                                          return {
                                                            ...prev,
                                                            [selectedBlock.name]: updatedLines
                                                          };
                                                        });
                                                      }

                                                      const newRoadmap = activeRoadmap.map((b) => {
                                                        if (b.id === selectedBlock.id) {
                                                          return {
                                                            ...b,
                                                            enabledLines: [...(b.enabledLines || []), updatedLines.length - 1],
                                                          };
                                                        }
                                                        return b;
                                                      });
                                                      setActiveRoadmap(newRoadmap);
                                                      showToast(`Pulled line to ${selectedBlock.name}`, 'success');
                                                    }}
                                                    className="flex items-center justify-between p-1.5 rounded bg-[#0c0d1b] border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-950/10 cursor-pointer transition-all select-none text-left group"
                                                  >
                                                    <div className="min-w-0 flex-1">
                                                      <div className="text-[9px] font-mono text-amber-400 truncate font-bold">
                                                        {line.Chords || '(No chords)'}
                                                      </div>
                                                      <div className="text-[10px] text-slate-300 truncate">
                                                        {line.Lyrics || '(No lyrics)'}
                                                      </div>
                                                    </div>
                                                    <span className="text-[8px] bg-emerald-600/20 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wider transition-all select-none shrink-0">
                                                      + Pull Line
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          );
                                        })()}

                                        <div className="flex justify-end pt-1">
                                          <button
                                            onClick={() => {
                                              const sourceLines = songLines.filter(line => 
                                                String(line.SongID) === String(pullSourceSongId) && 
                                                (line.SectionName || line.Section || line.section || 'Uncategorized') === pullSourceSectionName
                                              );

                                              if (sourceLines.length > 0) {
                                                const currentLines = effectiveSectionTemplates[selectedBlock.name] || [];
                                                const pulledLines = sourceLines.map((line, sIdx) => ({
                                                  SongID: currentSong?.SongID || '',
                                                  SectionName: selectedBlock.name,
                                                  Section: selectedBlock.name,
                                                  section: selectedBlock.name,
                                                  Order: currentLines.length + sIdx + 1,
                                                  Chords: line.Chords || '',
                                                  Lyrics: line.Lyrics || '',
                                                }));
                                                const updatedLines = [...currentLines, ...pulledLines];

                                                setSectionTemplates(prev => ({
                                                  ...prev,
                                                  [selectedBlock.name]: updatedLines
                                                }));
                                                if (loadedSnapshotSections) {
                                                  setLoadedSnapshotSections(prev => {
                                                    if (!prev) return null;
                                                    return {
                                                      ...prev,
                                                      [selectedBlock.name]: updatedLines
                                                    };
                                                  });
                                                }

                                                const startIdx = currentLines.length;
                                                const newIndices = Array.from({ length: pulledLines.length }, (_, i) => startIdx + i);
                                                const newRoadmap = activeRoadmap.map((b) => {
                                                  if (b.id === selectedBlock.id) {
                                                    return {
                                                      ...b,
                                                      enabledLines: [...(b.enabledLines || []), ...newIndices],
                                                    };
                                                  }
                                                  return b;
                                                });
                                                setActiveRoadmap(newRoadmap);

                                                showToast(`Pulled all ${sourceLines.length} lines of ${pullSourceSectionName} to ${selectedBlock.name}`, 'success');
                                                setIsPullingFromOtherSong(false);
                                                setPullSourceSongId('');
                                                setPullSourceSectionName('');
                                              }
                                            }}
                                            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/35 text-emerald-300 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                                          >
                                            <span>📥</span> Pull Entire Section
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}



                        {/* Modal Footer */}
                        <div className="border-t border-indigo-500/15 pt-4 flex items-center justify-end">
                          <button
                            onClick={() => setArrangerOpen(false)}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 cursor-pointer shadow-md shadow-indigo-600/20"
                          >
                            Close & Apply Flow
                          </button>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* UNIFIED PERFORMANCE PANEL & SHEET VIEW */}
                  <div className="w-full max-w-5xl mx-auto bg-[#04050d]/85 border border-[#1b1c35] rounded-3xl p-3.5 sm:p-5 md:p-6 flex flex-col gap-5 shadow-[0_32px_80px_rgba(0,0,0,0.4)] select-none">
                    
                    {/* Console Header */}
                    <div className="flex items-center justify-between border-b border-indigo-500/10 pb-3 pl-1">
                      <div className="text-left">
                        <span className="font-sans font-black text-[10px] uppercase tracking-widest text-indigo-400">
                          🎛️ Performance Console
                        </span>
                        <h3 className="text-[11px] text-indigo-200/60 font-medium leading-tight mt-0.5">
                          Roadmap, settings, chords & sheet in a single unified station
                        </h3>
                      </div>
                      <div className="text-[9px] font-bold text-indigo-400/90 bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1 rounded-md uppercase tracking-wider select-none shrink-0">
                        Console Mode
                      </div>
                    </div>

                    {/* Collapsible Panel controls inside */}
                    <div className="flex flex-col gap-3">
                      
                      {/* PANEL 1: ROADMAP FLOW */}
                      <div className="w-full bg-[#080918]/90 border border-[#1e1f38] rounded-2xl p-4.5 flex flex-col gap-3 shadow-lg hover:border-indigo-500/25 transition-all">
                      <div 
                        onClick={() => setIsRoadmapFlowCollapsed(!isRoadmapFlowCollapsed)}
                        className="flex items-center justify-between cursor-pointer select-none py-0.5 group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🧭</span>
                          <h3 className="font-sans font-black text-[11px] uppercase tracking-wider text-indigo-300 group-hover:text-white transition-colors">
                            Roadmap Flow
                          </h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setArrangerOpen((prev) => !prev);
                            }}
                            className={`px-2.5 py-1 rounded-lg border font-sans font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${
                              arrangerOpen
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                                : 'bg-[#161a3c]/30 hover:bg-[#1f2554] border-indigo-500/15 text-indigo-300 hover:text-white'
                            }`}
                          >
                            <span>🎛️</span>
                            <span>Arrangement</span>
                          </button>
                          <span className="text-xs text-indigo-400 font-bold group-hover:text-indigo-300 transition-colors">
                            {isRoadmapFlowCollapsed ? '▼' : '▲'}
                          </span>
                        </div>
                      </div>

                      {!isRoadmapFlowCollapsed && (
                        <div
                          onClick={() => setArrangerOpen(true)}
                          className="w-full bg-[#0a0c24]/50 hover:bg-[#0f1138]/50 border border-indigo-500/10 hover:border-indigo-400/30 rounded-xl p-3 cursor-pointer transition-all flex flex-col gap-2 group text-left animate-fadeIn"
                          title="Click to open interactive roadmap designer modal"
                        >
                          <div className="flex items-center justify-between font-mono text-[9px] text-indigo-400/70 select-none">
                            <span className="font-bold uppercase tracking-wider group-hover:text-indigo-300 transition-colors">Active Sequence Flow</span>
                            <span className="text-indigo-400/90 font-mono font-black group-hover:text-white">Tap to Edit ➔</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                            {activeRoadmap.map((b, idx) => {
                              const norm = b.name.trim().toLowerCase();
                              let colorStyles = 'bg-slate-950/40 border border-slate-500/20 text-slate-300';
                              if (norm.includes('verse')) {
                                colorStyles = 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400';
                              } else if (norm.includes('pre') || norm.includes('pre-chorus') || norm.includes('pre chorus')) {
                                colorStyles = 'bg-amber-950/40 border border-amber-500/20 text-amber-300';
                              } else if (norm.includes('chorus')) {
                                colorStyles = 'bg-orange-950/40 border border-orange-500/20 text-orange-300';
                              } else if (norm.includes('bridge')) {
                                colorStyles = 'bg-purple-950/40 border border-purple-500/20 text-purple-300';
                              } else if (norm.includes('interlude') || norm.includes('solo')) {
                                colorStyles = 'bg-indigo-950/40 border border-indigo-500/20 text-indigo-300';
                              }
                              return (
                                <React.Fragment key={b.id}>
                                  {idx > 0 && <span className="text-indigo-500/30 text-[10px] font-black shrink-0">➔</span>}
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${colorStyles}`}>
                                    {b.name}
                                  </span>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* PANEL 2: PERFORMANCE SETTINGS */}
                    <div className="w-full bg-[#080918]/90 border border-[#1e1f38] rounded-2xl p-4.5 flex flex-col gap-3 shadow-lg hover:border-indigo-500/25 transition-all">
                      <div 
                        onClick={() => setIsPerformancePanelCollapsed(!isPerformancePanelCollapsed)}
                        className="flex items-center justify-between cursor-pointer select-none py-0.5 group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">⚙️</span>
                          <h3 className="font-sans font-black text-[11px] uppercase tracking-wider text-indigo-300 group-hover:text-white transition-colors">
                            Performance Settings
                          </h3>
                        </div>
                        <span className="text-xs text-indigo-400 font-bold group-hover:text-indigo-300 transition-colors">
                          {isPerformancePanelCollapsed ? '▼' : '▲'}
                        </span>
                      </div>

                      {!isPerformancePanelCollapsed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 animate-fadeIn">
                          
                          {/* Transpose Widget */}
                          <div className="bg-[#0c0d28]/60 border border-[#222440] rounded-xl p-3 flex flex-col gap-2 justify-between items-center text-center">
                            <span className="text-[9px] font-mono font-bold tracking-wider text-gray-400 uppercase text-center w-full">Transpose</span>
                            <div className="flex items-center justify-center gap-2.5 w-full">
                              <button
                                onClick={() => shiftKey(-1)}
                                className="w-8 h-8 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-white font-black text-xs cursor-pointer transition-all active:scale-95"
                              >
                                -
                              </button>
                              <span className="font-mono font-black text-xs text-amber-400 min-w-[24px]">
                                {currentKey}
                              </span>
                              <button
                                onClick={() => shiftKey(1)}
                                className="w-8 h-8 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-white font-black text-xs cursor-pointer transition-all active:scale-95"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Zoom Widget */}
                          <div className="bg-[#0c0d28]/60 border border-[#222440] rounded-xl p-3 flex flex-col gap-2 justify-between items-center text-center">
                            <span className="text-[9px] font-mono font-bold tracking-wider text-gray-400 uppercase text-center w-full">Zoom</span>
                            <div className="flex items-center justify-center gap-2.5 h-8 w-full">
                              <button
                                onClick={() => setLyricZoom((prev) => Math.max(0.3, parseFloat((prev - 0.05).toFixed(2))))}
                                className="w-10 h-full flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-white text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                              >
                                A-
                              </button>
                              <span className="font-mono font-black text-[10px] text-indigo-300 min-w-[34px]">
                                {Math.round(lyricZoom * 100)}%
                              </span>
                              <button
                                onClick={() => setLyricZoom((prev) => Math.min(1.5, parseFloat((prev + 0.05).toFixed(2))))}
                                className="w-10 h-full flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-white text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                              >
                                A+
                              </button>
                            </div>
                          </div>

                          {/* View & Layout Widget */}
                          <div className="bg-[#0c0d28]/60 border border-[#222440] rounded-xl p-3 flex flex-col gap-1.5 justify-between items-center text-center">
                            <span className="text-[9px] font-mono font-bold tracking-wider text-gray-400 uppercase text-center w-full">View & Layout</span>
                            <div className="flex flex-col gap-1.5 w-full items-center justify-center">
                              {/* Toggle Mode Button: Chords, Numbers, Both */}
                              <button
                                onClick={() => {
                                  const nextModeMap: Record<'chords' | 'numbers' | 'both', 'chords' | 'numbers' | 'both'> = {
                                    chords: 'numbers',
                                    numbers: 'both',
                                    both: 'chords'
                                  };
                                  setDisplayMode(nextModeMap[displayMode]);
                                }}
                                className="w-full py-1 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-200 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-all text-center flex items-center justify-center"
                              >
                                {displayMode === 'both' ? 'Both' : displayMode === 'chords' ? 'Chords Only' : 'Numbers Only'}
                              </button>

                              {/* Toggle Lyrics and Layout Mode with elegant individual controls */}
                              <div className="flex gap-1 w-full items-center justify-center">
                                {/* Toggle Lyrics Button */}
                                <button
                                  onClick={() => setShowLyrics(prev => !prev)}
                                  className={`flex-1 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all border text-center flex items-center justify-center ${
                                    showLyrics
                                      ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200 hover:text-white'
                                      : 'bg-transparent border-indigo-500/10 text-gray-500 hover:text-gray-400'
                                  }`}
                                >
                                  {showLyrics ? 'Lyrics On' : 'Lyrics Off'}
                                </button>
                              </div>

                              {/* Layout Mode Segmented Control: Flow vs Compact */}
                              <div className="flex items-center bg-[#131526]/80 border border-[#222440] p-0.5 rounded-lg w-full">
                                <button
                                  onClick={() => setSheetLayoutMode('sequence')}
                                  className={`flex-1 py-1 text-[9px] uppercase tracking-wider rounded transition-all cursor-pointer select-none font-bold ${
                                    sheetLayoutMode === 'sequence'
                                      ? 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/20'
                                      : 'text-[#7177a6] hover:text-gray-200'
                                  }`}
                                >
                                  Flow
                                </button>
                                <button
                                  onClick={() => setSheetLayoutMode('compact')}
                                  className={`flex-1 py-1 text-[9px] uppercase tracking-wider rounded transition-all cursor-pointer select-none font-bold ${
                                    sheetLayoutMode === 'compact'
                                      ? 'bg-amber-600/20 text-[#f59e0b] border border-amber-600/40 font-black'
                                      : 'text-[#7177a6] hover:text-gray-200'
                                  }`}
                                >
                                  Compact
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Autoscroll Widget */}
                          <div className="bg-[#0c0d28]/60 border border-[#222440] rounded-xl p-3 flex flex-col gap-2 justify-between items-center text-center">
                            <span className="text-[9px] font-mono font-bold tracking-wider text-gray-400 uppercase text-center w-full">Autoscroll</span>
                            <div className="flex items-center gap-1.5 justify-center w-full">
                              <button
                                onClick={toggleAutoscroll}
                                className={`w-20 h-8 rounded-lg text-[10px] font-black cursor-pointer transition-all active:scale-95 uppercase tracking-wider flex items-center justify-center gap-1 shrink-0 ${
                                  isScrollingActive
                                    ? 'bg-indigo-600 text-white shadow-md font-black border border-indigo-500'
                                    : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 hover:text-white'
                                }`}
                              >
                                {isScrollingActive ? '⏸ Stop' : '▶ Play'}
                              </button>
                              <div className="flex items-center gap-1 bg-black/40 border border-indigo-500/15 rounded-lg px-1 h-8 shrink-0">
                                <button
                                  onClick={() => setScrollSpeed((prev) => Math.max(0.5, parseFloat((prev - 0.5).toFixed(1))))}
                                  className="w-4 h-5 flex items-center justify-center text-indigo-300 hover:text-white text-xs font-black cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center font-mono font-bold text-[10px] text-white">
                                  {scrollSpeed}
                                </span>
                                <button
                                  onClick={() => setScrollSpeed((prev) => Math.min(10, parseFloat((prev + 0.5).toFixed(1))))}
                                  className="w-4 h-5 flex items-center justify-center text-indigo-300 hover:text-white text-xs font-black cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Metronome Widget */}
                          <div className="bg-[#0c0d28]/60 border border-[#222440] rounded-xl p-3 flex flex-col gap-2 justify-between items-center text-center">
                            <span className="text-[9px] font-mono font-bold tracking-wider text-gray-400 uppercase text-center w-full">Metronome & Tempo</span>
                            <div className="flex items-center gap-1.5 justify-center w-full">
                              <button
                                onClick={() => setIsMetronomeActive((prev) => !prev)}
                                className={`w-16 h-8 px-1.5 rounded-lg text-[9px] font-black cursor-pointer transition-all active:scale-95 uppercase tracking-wider flex items-center justify-center gap-1 shrink-0 ${
                                  isMetronomeActive
                                    ? 'bg-rose-600 text-white shadow-md border border-rose-500'
                                    : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 hover:text-white'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isMetronomeActive ? 'bg-white animate-pulse' : 'bg-rose-500/40'}`}></span>
                                Metro
                              </button>
                              <button
                                onClick={handleTapTempo}
                                className="h-8 px-2 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-200 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Tap
                              </button>
                              <span className="h-8 px-1.5 min-w-[32px] flex items-center justify-center font-mono font-black text-[10px] text-white bg-black/40 rounded-lg border border-indigo-500/15">
                                {bpm}
                              </span>
                            </div>
                          </div>

                        </div>
                      )}
                    </div>

                    {/* PANEL 3: FAMILY CHORDS */}
                    <div className="w-full bg-[#080918]/90 border border-[#1e1f38] rounded-2xl p-4.5 flex flex-col gap-3 shadow-lg hover:border-indigo-500/25 transition-all">
                      <div 
                        onClick={() => setIsFamilyChordsCollapsed(!isFamilyChordsCollapsed)}
                        className="flex items-center justify-between cursor-pointer select-none py-0.5 group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">🎸</span>
                          <h3 className="font-sans font-black text-[11px] uppercase tracking-wider text-indigo-300 group-hover:text-white transition-colors">
                            Family Chords
                          </h3>
                        </div>
                        <span className="text-xs text-indigo-400 font-bold group-hover:text-indigo-300 transition-colors">
                          {isFamilyChordsCollapsed ? '▼' : '▲'}
                        </span>
                      </div>

                      {!isFamilyChordsCollapsed && (
                        <div className="flex flex-wrap gap-2 animate-fadeIn py-1">
                          {(() => {
                            const intervals = [0, 2, 4, 5, 7, 9, 11];
                            const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
                            const degrees = ['1', '2', '3', '4', '5', '6', '7'];
                            const keyIdx = NOTE_TO_INDEX[currentKey];
                            if (keyIdx === undefined) return null;
                            const useSharps = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'].includes(currentKey);
                            const scaleNotes = useSharps 
                              ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] 
                              : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

                            return degrees.map((deg, i) => {
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
                                  className="bg-[#0c0d28]/60 hover:bg-[#12133a]/60 border border-indigo-500/15 hover:border-indigo-500/30 px-3.5 py-2 rounded-xl text-white font-sans font-black text-[11px] transition-all hover:text-cyan-300 hover:scale-[1.03] active:scale-95 cursor-help flex items-center gap-1.5 shadow-sm"
                                >
                                  <span className="text-indigo-400 font-mono font-black text-[9px]">{deg}</span>
                                  <span className="font-extrabold text-xs">{rawChord}</span>
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Collapsible Panel controls inside */}
                    </div>

                    {/* Separator / Divider */}
                    <div className="flex items-center gap-3 w-full select-none pl-1 mt-2 mb-1">
                      <span className="font-sans font-black text-[10px] uppercase tracking-widest text-indigo-300 shrink-0">
                        📄 Interactive Sheet View
                      </span>
                      <div className="flex-1 border-b border-indigo-500/10" />
                    </div>

                    {/* Pro Musician Stage HUD Interactive Sheet View */}
                    <div className="w-full bg-white text-slate-800 shadow-[0_12px_40px_rgba(0,0,0,0.06)] rounded-2xl p-4 sm:p-6 md:p-8 font-sans border border-slate-200 select-text relative overflow-hidden transition-all duration-300">
                    
                    {/* Subtle Light Digital Grid Scanlines and Glow Accents */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(99,102,241,0.015)_1px,transparent_1px),linear-gradient(to_right,rgba(99,102,241,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none rounded-2xl" />
                    <div className="absolute -left-1/4 -top-1/4 w-96 h-96 bg-indigo-500/3 blur-[120px] rounded-full pointer-events-none" />
                    <div className="absolute -right-1/4 -bottom-1/4 w-96 h-96 bg-cyan-500/3 blur-[120px] rounded-full pointer-events-none" />

                    {/* Watermark / Digital Stage Stand Logo background */}
                    <div className="absolute right-8 top-8 text-indigo-500/5 select-none font-mono font-black text-6xl tracking-widest uppercase shrink-0 pointer-events-none animate-pulse">
                      STAGE
                    </div>

                    {/* Chords rendering sheet block */}
                    <div className="space-y-6 relative z-10" style={{ fontSize: `${lyricZoom}rem` }}>
                      {(() => {
                        const repInfo = getRoadmapRepetitionInfo(activeRoadmap);
                        
                        return activeRoadmap.map((block, idx) => {
                          const blockRep = repInfo[idx];
                          let blockDisplayName = block.name;

                          if (sheetLayoutMode === 'sequence') {
                            if (blockRep && blockRep.isRepeat) {
                              return null;
                            }
                            if (blockRep && blockRep.totalInRun > 1) {
                              blockDisplayName = `${block.name} (${blockRep.totalInRun}x)`;
                            }
                          }

                          if (sheetLayoutMode === 'compact') {
                            if (!showLyrics) {
                              const firstIdx = activeRoadmap.findIndex((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                              if (firstIdx !== idx) return null;
                              const identicalBlocks = activeRoadmap.filter((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                              const uniqueNames = Array.from(new Set(identicalBlocks.map((b) => b.name)));
                              blockDisplayName = `${uniqueNames.join(' / ')}`;
                            } else {
                              const firstIdx = activeRoadmap.findIndex((b) => b.name === block.name);
                              if (firstIdx !== idx) return null;
                              blockDisplayName = `${block.name}`;
                            }
                          }

                          const templateLines = effectiveSectionTemplates[block.name] || [];
                          const blockOffset = block.keyOffset || 0;
                          const blockKeyName = getModulatedKeyName(currentKey, blockOffset);

                          const originalIdx = NOTE_TO_INDEX[currentSong.OriginalKey || 'C'] || 0;
                          const currentIdx = NOTE_TO_INDEX[currentKey] || 0;
                          const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;

                          const totalOccurrencesInSong = activeRoadmap.filter((b) => {
                            if (sheetLayoutMode === 'compact') {
                              if (!showLyrics) {
                                return areBlocksChordsIdentical(b, block, effectiveSectionTemplates);
                              } else {
                                return b.name === block.name;
                              }
                            }
                            return false;
                          }).length;

                          const blockLower = blockDisplayName.toLowerCase();
                          const isBridge = blockLower.includes('bridge');
                          const isChorus = blockLower.includes('chorus') && !blockLower.includes('verse');
                          const isPreChorus = blockLower.includes('pre-chorus') || blockLower.includes('pre chorus') || blockLower.includes('prechorus');
                          const isVerse = blockLower.includes('verse');
                          const isIntro = blockLower.includes('intro');
                          const isOutro = blockLower.includes('outro');
                          const isSolo = blockLower.includes('solo') || blockLower.includes('interlude');

                          let sectionAccentColor = 'border-indigo-200 text-indigo-700 bg-indigo-50';
                          let sectionBorderColor = 'border-slate-200';
                          let sectionLabel = 'IND';

                          if (isVerse) {
                            sectionAccentColor = 'border-emerald-200 text-emerald-700 bg-emerald-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = 'VRS';
                          } else if (isChorus) {
                            sectionAccentColor = 'border-orange-200 text-orange-700 bg-orange-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = 'CHS';
                          } else if (isPreChorus) {
                            sectionAccentColor = 'border-amber-200 text-amber-700 bg-amber-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = 'PRE';
                          } else if (isBridge) {
                            sectionAccentColor = 'border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = 'BDG';
                          } else if (isSolo) {
                            sectionAccentColor = 'border-cyan-200 text-cyan-700 bg-cyan-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = 'SOL';
                          } else if (isIntro || isOutro) {
                            sectionAccentColor = 'border-teal-200 text-teal-700 bg-teal-50';
                            sectionBorderColor = 'border-slate-200';
                            sectionLabel = isIntro ? 'INT' : 'OUT';
                          }

                          return (
                            <div 
                              key={block.id} 
                              className={`mb-4 last:mb-0 p-4 sm:p-5 rounded-xl border ${sectionBorderColor} bg-slate-50/50 select-text break-inside-avoid relative hover:bg-slate-100/50 transition-all duration-200 group/section shadow-sm`}
                            >
                              {/* High-tech Corner Accents */}
                              <div className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 ${isVerse ? 'border-emerald-600' : isChorus ? 'border-orange-600' : isPreChorus ? 'border-amber-600' : isBridge ? 'border-fuchsia-600' : 'border-indigo-600'} opacity-0 group-hover/section:opacity-100 transition-opacity rounded-tl`} />
                              <div className={`absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 ${isVerse ? 'border-emerald-600' : isChorus ? 'border-orange-600' : isPreChorus ? 'border-amber-600' : isBridge ? 'border-fuchsia-600' : 'border-indigo-600'} opacity-0 group-hover/section:opacity-100 transition-opacity rounded-tr`} />
                              <div className={`absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 ${isVerse ? 'border-emerald-600' : isChorus ? 'border-orange-600' : isPreChorus ? 'border-amber-600' : isBridge ? 'border-fuchsia-600' : 'border-indigo-600'} opacity-0 group-hover/section:opacity-100 transition-opacity rounded-bl`} />
                              <div className={`absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 ${isVerse ? 'border-emerald-600' : isChorus ? 'border-orange-600' : isPreChorus ? 'border-amber-600' : isBridge ? 'border-fuchsia-600' : 'border-indigo-600'} opacity-0 group-hover/section:opacity-100 transition-opacity rounded-br`} />

                              {/* Section Header */}
                              <div className="flex items-center justify-between gap-4 w-full select-none mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-[9px] font-black tracking-widest bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">
                                    {sectionLabel}
                                  </span>
                                  <span className={`text-xs sm:text-sm font-sans font-black uppercase tracking-wider ${isVerse ? 'text-emerald-700' : isChorus ? 'text-orange-700' : isPreChorus ? 'text-amber-700' : isBridge ? 'text-fuchsia-700' : 'text-indigo-700'}`}>
                                    {blockDisplayName} {blockOffset !== 0 ? `[Modulate to ${blockKeyName}]` : ''}
                                  </span>
                                  {((sheetLayoutMode === 'compact' && totalOccurrencesInSong > 1) ||
                                    (sheetLayoutMode === 'sequence' && blockRep && blockRep.totalInRun > 1)) && (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none uppercase tracking-wide flex items-center gap-1 shadow-sm">
                                      🔁 {sheetLayoutMode === 'compact' ? totalOccurrencesInSong : blockRep.totalInRun}x
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 border-b border-slate-200 border-dashed" />
                                <div className="flex items-center gap-2">
                                  {blockOffset !== 0 && (
                                    <span className="text-[9px] font-mono font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg shadow-sm">
                                      Mod: {blockOffset > 0 ? `+${blockOffset}` : blockOffset}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Embedded Lyrics Hints if hidden */}
                              {!showLyrics && (
                                <div className="mb-2 p-2.5 bg-slate-50 border border-slate-200 border-l-4 border-l-indigo-500 rounded-r-xl text-[11px] sm:text-xs font-semibold text-slate-600 italic select-none">
                                  {(() => {
                                    if (sheetLayoutMode === 'compact') {
                                      const identicalBlocks = activeRoadmap.filter((b) => areBlocksChordsIdentical(b, block, effectiveSectionTemplates));
                                      const renderedHints: any[] = [];
                                      const seenNames = new Set();
                                      
                                      identicalBlocks.forEach((b) => {
                                        if (seenNames.has(b.name)) return;
                                        seenNames.add(b.name);
                                        const lines = effectiveSectionTemplates[b.name] || [];
                                        const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                        if (firstLyric) {
                                          renderedHints.push({ name: b.name, lyric: firstLyric });
                                        }
                                      });

                                      if (renderedHints.length > 0) {
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

                                        const totalTimes = identicalBlocks.length;
                                        return groups.map((g, gIdx) => (
                                          <div key={gIdx} className="flex items-center justify-between gap-2 flex-wrap w-full">
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 not-italic">
                                                {g.names.map(n => n.toUpperCase()).join(' & ')}
                                              </span>
                                              <span className="truncate text-slate-600">“{g.lyric}”</span>
                                            </div>

                                          </div>
                                        ));
                                      }
                                    } else {
                                      const lines = effectiveSectionTemplates[block.name] || [];
                                      const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== '')?.Lyrics;
                                      if (firstLyric) {
                                        return (
                                          <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-indigo-400 not-italic">Hint:</span>
                                            <span className="truncate text-slate-300">“{firstLyric}”</span>
                                          </div>
                                        );
                                      }
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}

                              {/* Section Lines */}
                              <div className="pl-1 sm:pl-3 space-y-3">
                                {(() => {
                                  const enabledLinesList = templateLines
                                    .map((l, lIdx) => ({ l, lIdx }))
                                    .filter(({ lIdx }) => (block.enabledLines || []).includes(lIdx));

                                  const processedLines = enabledLinesList.map(({ l, lIdx }) => {
                                    const lineOffset = block.lineOffsets?.[lIdx] || 0;
                                    const lineTotalSemitonesOffset = totalSemitonesOffset + lineOffset;
                                    const transposed = transposeChord(l.Chords || '', lineTotalSemitonesOffset);
                                    const lineBlockKeyName = getModulatedKeyName(currentKey, blockOffset + lineOffset);
                                    const numbers = getNumberForChord(transposed, lineBlockKeyName, currentKey);
                                    const lyrics = l.Lyrics || '';
                                    return {
                                      l,
                                      lIdx,
                                      transposed,
                                      numbers,
                                      lyrics,
                                    };
                                  });

                                  // Loop pattern detection
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

                                  // Render with Loop-Grouping
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
                                          className="border border-amber-100 border-l-4 border-l-amber-600 bg-amber-50/50 rounded-r-xl px-4 py-3.5 my-4 space-y-3 shadow-md"
                                        >
                                          <div className="flex items-center gap-2 mb-1.5 select-none">
                                            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm">
                                              <span>🔁</span> PLAY {repeatCount}X
                                            </span>
                                            <span className="text-[10px] text-amber-600 font-sans font-semibold tracking-wide uppercase">
                                              (Chords progression repeats)
                                            </span>
                                          </div>

                                          <div className="space-y-3">
                                            {runLines.map((lineData) => {
                                              const { lIdx, transposed, numbers, lyrics } = lineData;
                                              return (
                                                <div key={lIdx} className="break-inside-avoid">
                                                  {displayMode !== 'numbers' && transposed && (
                                                    <div className="font-mono font-black text-xs sm:text-sm text-indigo-700 tracking-[0.25em] leading-normal mb-1">
                                                      {parseClickableChords(transposed, blockKeyName)}
                                                    </div>
                                                  )}
                                                  {displayMode !== 'chords' && numbers && (
                                                    <div className="font-mono font-bold text-[11px] sm:text-[12px] text-indigo-600/60 tracking-[0.2em] leading-normal mb-1">
                                                      {numbers}
                                                    </div>
                                                  )}
                                                  {showLyrics && lyrics && (
                                                    <div className="text-[13px] sm:text-[14px] text-slate-800 font-sans font-medium leading-relaxed mt-0.5">
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
                                      for (let r = 0; r < repeatCount; r++) {
                                        const runLines = processedLines.slice(r * loopLength, (r + 1) * loopLength);
                                        loopContainers.push(
                                          <div
                                            key={`loop-run-${r}`}
                                            className="border border-indigo-100 border-l-4 border-l-indigo-600 bg-indigo-50/50 rounded-r-xl px-4 py-3.5 my-4 space-y-3 shadow-md"
                                          >
                                            <div className="flex items-center gap-2 mb-1.5 select-none">
                                              {r === 0 ? (
                                                <>
                                                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm">
                                                    <span>🔁</span> LOOP ({repeatCount}X) — ROUND 1
                                                  </span>
                                                  <span className="text-[10px] text-indigo-600/60 font-sans font-semibold tracking-wide uppercase">
                                                    (Chords progression repeats)
                                                  </span>
                                                </>
                                              ) : (
                                                <>
                                                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-indigo-700 bg-indigo-100 border border-indigo-200 rounded-lg px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm">
                                                    <span>🔁</span> ROUND {r + 1}
                                                  </span>
                                                  <span className="text-[10px] text-slate-600 font-sans font-semibold tracking-wide uppercase">
                                                    (Identical chords as Round 1)
                                                  </span>
                                                </>
                                              )}
                                            </div>

                                            <div className="space-y-3">
                                              {runLines.map((lineData) => {
                                                const { lIdx, transposed, numbers, lyrics } = lineData;
                                                return (
                                                  <div key={lIdx} className="break-inside-avoid">
                                                    {displayMode !== 'numbers' && transposed && (
                                                      <div className="font-mono font-black text-xs sm:text-sm text-indigo-700 tracking-[0.25em] leading-normal mb-1">
                                                        {parseClickableChords(transposed, blockKeyName)}
                                                      </div>
                                                    )}
                                                    {displayMode !== 'chords' && numbers && (
                                                      <div className="font-mono font-bold text-[11px] sm:text-[12px] text-indigo-600/60 tracking-[0.2em] leading-normal mb-1">
                                                        {numbers}
                                                      </div>
                                                    )}
                                                    {showLyrics && lyrics && (
                                                      <div className="text-[13px] sm:text-[14px] text-slate-800 font-sans font-medium leading-relaxed mt-0.5">
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
                                      <div className="space-y-3">
                                        {loopContainers}
                                        {remainingLines.length > 0 && (
                                          <div className="pt-4 space-y-3 border-t border-dashed border-slate-200">
                                            {remainingLines.map((lineData) => {
                                              const { lIdx, transposed, numbers, lyrics } = lineData;
                                              return (
                                                <div key={lIdx} className="break-inside-avoid">
                                                  {displayMode !== 'numbers' && transposed && (
                                                    <div className="font-mono font-black text-xs sm:text-sm text-indigo-700 tracking-[0.25em] leading-normal mb-1">
                                                      {parseClickableChords(transposed, blockKeyName)}
                                                    </div>
                                                  )}
                                                  {displayMode !== 'chords' && numbers && (
                                                    <div className="font-mono font-bold text-[11px] sm:text-[12px] text-indigo-600/60 tracking-[0.2em] leading-normal mb-1">
                                                      {numbers}
                                                    </div>
                                                  )}
                                                  {showLyrics && lyrics && (
                                                    <div className="text-[13px] sm:text-[14px] text-slate-800 font-sans font-medium leading-relaxed mt-0.5">
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

                                  // Fallback: consecutive runs
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

                                  return lineRuns.map((run) => {
                                    const firstLine = processedLines[run.startIndex];
                                    const { lIdx, transposed, numbers, lyrics } = firstLine;

                                    return (
                                      <div key={lIdx} className="break-inside-avoid leading-normal py-1">
                                        {displayMode !== 'numbers' && transposed && (
                                          <div className="font-mono font-black text-xs sm:text-sm text-indigo-700 tracking-[0.25em] leading-normal mb-1.5 flex items-center gap-2 flex-wrap">
                                            <span>{parseClickableChords(transposed, blockKeyName)}</span>
                                            {run.count > 1 && (
                                              <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-2 py-0.5 font-mono font-black select-none tracking-normal uppercase">
                                                {run.count}x
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {displayMode !== 'chords' && numbers && (
                                          <div className="font-mono font-bold text-[11px] sm:text-[12px] text-indigo-600/60 tracking-[0.2em] leading-normal mb-1 flex items-center gap-2 flex-wrap">
                                            <span>{numbers}</span>
                                            {run.count > 1 && displayMode === 'numbers' && (
                                              <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-2 py-0.5 font-mono font-black select-none tracking-normal uppercase">
                                                {run.count}x
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {showLyrics && lyrics && (
                                          <div className="text-[13px] sm:text-[14px] text-slate-800 font-sans font-medium leading-relaxed mt-0.5">
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
                        });
                      })()}
                    </div>

                  </div>

                  {/* Close of UNIFIED PERFORMANCE PANEL */}
                  </div>

                </div>
              )}

            </main>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 bg-[#020205]/80 backdrop-blur-md z-[850] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-6 flex flex-col gap-5 animate-scaleIn">
            <div className="text-center select-none">
              <span className="text-3xl">🔓</span>
              <h2 className="text-base font-black uppercase tracking-wider text-indigo-300 mt-2">
                Admin Authentication
              </h2>
              <p className="text-[10px] text-gray-400 font-medium">
                Enter your Google Sheet Apps Script credentials to unlock master edit rights.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Username</label>
                <input
                  type="text"
                  value={adminUsernameInput}
                  onChange={(e) => setAdminUsernameInput(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl px-3 py-2 text-xs text-indigo-100 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Passkey</label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-indigo-950/60 border border-indigo-500/20 rounded-xl px-3 py-2 text-xs text-indigo-100 focus:outline-none focus:border-indigo-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyAdmin();
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-indigo-500/10 pt-4">
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyAdmin}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Session Cutoff Modal */}
      {isSecurityCutoffModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-lg z-[900] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-gradient-to-br from-[#1c0d02] via-[#0f0701] to-[#040200] border border-amber-500/30 rounded-3xl shadow-[0_25px_60px_rgba(245,158,11,0.15)] p-6 sm:p-8 flex flex-col gap-6 animate-scaleIn">
            <div className="text-center select-none">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                <span className="text-3xl animate-pulse">🔒</span>
              </div>
              <h2 className="text-xl font-black uppercase tracking-wider text-amber-400 font-sans">
                Security Session Cutoff
              </h2>
              <p className="text-xs text-amber-200/70 font-medium mt-2 leading-relaxed">
                You have shifted to **Viewer Mode**. All ongoing administrative sessions and active cloud integrations have been immediately terminated to prevent unauthorized access.
              </p>
            </div>

            <div className="bg-amber-950/20 border border-amber-500/10 rounded-2xl p-4 flex flex-col gap-3">
              <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider font-mono border-b border-amber-500/10 pb-1.5">
                Revoked Privileges & Status Wipes:
              </div>
              
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2 text-xs text-amber-100/85">
                  <span className="text-rose-500 font-bold shrink-0">✓</span>
                  <div>
                    <span className="font-bold text-white text-left block">Write Credentials Cleared</span>
                    <p className="text-[10px] text-gray-400 text-left">Master write/edit permissions to the spreadsheet have been removed.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2 text-xs text-amber-100/85">
                  <span className="text-rose-500 font-bold shrink-0">✓</span>
                  <div>
                    <span className="font-bold text-white text-left block">Active Setlist Flows Terminated</span>
                    <p className="text-[10px] text-gray-400 text-left">Current online setlists are deselected and active performance states are cleared.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2 text-xs text-amber-100/85">
                  <span className="text-rose-500 font-bold shrink-0">✓</span>
                  <div>
                    <span className="font-bold text-white text-left block">Active Song Selection Cleared</span>
                    <p className="text-[10px] text-gray-400 text-left">The current sheet loaded in the main viewer is reset.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2 text-xs text-amber-100/85">
                  <span className="text-rose-500 font-bold shrink-0">✓</span>
                  <div>
                    <span className="font-bold text-white text-left block">Edit Modals Closed & Wiped</span>
                    <p className="text-[10px] text-gray-400 text-left">All open chord sheet builders or song-edit templates have been closed.</p>
                  </div>
                </li>
              </ul>
            </div>

            <p className="text-[10px] text-gray-400 text-center leading-relaxed font-medium">
              You are now working in a secure, local-only client-side sandbox. All updates to arrangements or setlists will save to your browser's local storage only.
            </p>

            <button
              onClick={() => setIsSecurityCutoffModalOpen(false)}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-amber-600/20 cursor-pointer"
            >
              Understand & Enter Sandbox Viewer
            </button>
          </div>
        </div>
      )}

      {/* Song Edit/Add Modal */}
      <SongEditModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        editingSong={formEditingSong}
        songLines={formEditingSong ? songLines : []}
        appUser={appUser}
        appSecret={appSecret}
        scriptUrl={SCRIPT_URL}
        onSubmitSuccess={() => {
          setIsFormModalOpen(false);
          fetchCatalog();
        }}
        showToast={showToast}
        setLoading={setIsLoading}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Migrated Active Arrangement Live Designer (Global Top-Level Overlay) */}
      <ArrangementDAWModal
        arrangerOpen={arrangerOpen}
        setArrangerOpen={setArrangerOpen}
        activeRoadmap={activeRoadmap}
        setActiveRoadmap={setActiveRoadmap}
        editingBlockId={editingBlockId}
        setEditingBlockId={setEditingBlockId}
        isArrangementLocked={isArrangementLocked}
        setIsArrangementLocked={setIsArrangementLocked}
        currentArrangementName={currentArrangementName}
        setCurrentArrangementName={setCurrentArrangementName}
        sectionTemplates={sectionTemplates}
        setSectionTemplates={setSectionTemplates}
        loadedSnapshotSections={loadedSnapshotSections}
        setLoadedSnapshotSections={setLoadedSnapshotSections}
        effectiveSectionTemplates={effectiveSectionTemplates}
        currentSong={currentSong}
        songs={songs}
        songLines={songLines}
        showToast={showToast}
        adjustBlockModulation={adjustBlockModulation}
        deleteRoadmapBlock={deleteRoadmapBlock}
        addRoadmapBlock={addRoadmapBlock}
        resetRoadmapBlocks={resetRoadmapBlocks}
        cancelArrangementEdit={cancelArrangementEdit}
        executeSaveArrangement={executeSaveArrangement}
        loadPresetArrangement={loadPresetArrangement}
        deletePresetArrangement={deletePresetArrangement}
        getPresets={getPresets}
        fetchCatalog={fetchCatalog}
        getModulatedKeyName={getModulatedKeyName}
        currentKey={currentKey}
        isAdmin={!!(appUser && appSecret)}
        syncedSheetArrangements={syncedSheetArrangements}
        activeSetlistFolder={activeSetlistFolder}
      />

      {/* MOBILE BOTTOM NAVIGATION TAB BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#04050f]/95 border-t border-indigo-500/15 backdrop-blur-xl z-[910] px-4 flex items-center justify-around text-center shadow-[0_-10px_35px_rgba(0,0,0,0.5)]">
        {/* Dashboard Tab */}
        <button
          onClick={() => {
            setCurrentSong(null);
            setIsNavOpen(false);
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
            !currentSong 
              ? 'text-cyan-400 font-extrabold' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[9px] font-mono font-black uppercase tracking-wider">Dashboard</span>
        </button>

        {/* Songs List Tab */}
        <button
          onClick={() => {
            setCurrentTab('songs');
            setIsNavOpen(true);
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
            isNavOpen && currentTab === 'songs'
              ? 'text-indigo-400 font-extrabold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">🎵</span>
          <span className="text-[9px] font-mono font-black uppercase tracking-wider">Songs</span>
        </button>

        {/* Setlists Tab */}
        <button
          onClick={() => {
            setCurrentTab('setlists');
            setIsNavOpen(true);
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
            isNavOpen && currentTab === 'setlists'
              ? 'text-amber-400 font-extrabold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">📂</span>
          <span className="text-[9px] font-mono font-black uppercase tracking-wider">Setlists</span>
        </button>

        {/* Favorites Tab */}
        <button
          onClick={() => {
            setCurrentTab('favorites');
            setIsNavOpen(true);
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
            isNavOpen && currentTab === 'favorites'
              ? 'text-rose-400 font-extrabold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="text-lg">❤️</span>
          <span className="text-[9px] font-mono font-black uppercase tracking-wider">Favs</span>
        </button>

        {/* Active Song Tab (if loaded) */}
        {currentSong && (
          <button
            onClick={() => {
              setIsNavOpen(false);
            }}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
              !isNavOpen 
                ? 'text-emerald-400 font-extrabold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">📄</span>
            <span className="text-[9px] font-mono font-black uppercase tracking-wider">Active Sheet</span>
          </button>
        )}
      </div>

      {/* MOBILE PERFORMANCE CONTROLS FLOATING DOCK */}
      {currentSong && !isNavOpen && (
        <div className="lg:hidden fixed bottom-18 left-2 right-2 bg-indigo-950/75 backdrop-blur-xl border border-indigo-500/25 rounded-2xl p-3 px-4 z-[900] shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 animate-fadeIn">
          {/* Transpose */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-black tracking-widest text-indigo-400 uppercase">Key</span>
            <div className="flex items-center gap-1.5 bg-black/40 border border-indigo-500/15 rounded-lg px-1 py-0.5">
              <button
                onClick={() => shiftKey(-1)}
                className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/25 rounded font-black text-xs text-white"
              >
                -
              </button>
              <span className="font-mono font-black text-[11px] text-amber-400 min-w-[18px] text-center">
                {currentKey}
              </span>
              <button
                onClick={() => shiftKey(1)}
                className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/25 rounded font-black text-xs text-white"
              >
                +
              </button>
            </div>
          </div>

          {/* Capo */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-black tracking-widest text-indigo-400 uppercase">Capo</span>
            <div className="flex items-center gap-1.5 bg-black/40 border border-indigo-500/15 rounded-lg px-1 py-0.5">
              <button
                onClick={() => setCapo(prev => Math.max(0, prev - 1))}
                className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/25 rounded font-black text-xs text-white"
              >
                -
              </button>
              <span className="font-mono font-black text-[11px] text-emerald-400 min-w-[18px] text-center">
                {capo}
              </span>
              <button
                onClick={() => setCapo(prev => Math.min(12, prev + 1))}
                className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/25 rounded font-black text-xs text-white"
              >
                +
              </button>
            </div>
          </div>

          {/* Autoscroll */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-black tracking-widest text-indigo-400 uppercase">Autoscroll</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleAutoscroll}
                className={`px-2.5 h-6 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                  isScrollingActive
                    ? 'bg-indigo-600 text-white border border-indigo-500'
                    : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-200'
                }`}
              >
                {isScrollingActive ? '⏸ Stop' : '▶ Play'}
              </button>
              <div className="flex items-center bg-black/40 border border-indigo-500/15 rounded-lg px-1 h-6">
                <button
                  onClick={() => setScrollSpeed((prev) => Math.max(0.5, parseFloat((prev - 0.5).toFixed(1))))}
                  className="w-3 text-center text-indigo-300 hover:text-white text-[10px] font-bold"
                >
                  -
                </button>
                <span className="w-5 text-center font-mono font-black text-[9px] text-white">
                  {scrollSpeed}
                </span>
                <button
                  onClick={() => setScrollSpeed((prev) => Math.min(10, parseFloat((prev + 0.5).toFixed(1))))}
                  className="w-3 text-center text-indigo-300 hover:text-white text-[10px] font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Zoom */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-black tracking-widest text-indigo-400 uppercase">Zoom</span>
            <div className="flex items-center gap-1 bg-black/40 border border-indigo-500/15 rounded-lg px-1 h-6">
              <button
                onClick={() => setLyricZoom((prev) => Math.max(0.3, parseFloat((prev - 0.05).toFixed(2))))}
                className="w-4 text-center text-indigo-300 hover:text-white text-[10px] font-bold"
              >
                A-
              </button>
              <span className="w-8 text-center font-mono font-black text-[9px] text-indigo-200">
                {Math.round(lyricZoom * 100)}%
              </span>
              <button
                onClick={() => setLyricZoom((prev) => Math.min(1.5, parseFloat((prev + 0.05).toFixed(2))))}
                className="w-4 text-center text-indigo-300 hover:text-white text-[10px] font-bold"
              >
                A+
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Musician Chords/Theory Visualizer Modal */}
      <MusicianModal
        isOpen={isMusicianModalOpen}
        onClose={() => setIsMusicianModalOpen(false)}
        chordName={selectedChord}
      />

      {/* Database Connection Diagnostic Modal */}
      <DatabaseDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        scriptUrls={currentScriptUrls}
      />

      {/* Local Device Hardware Workspace Modal */}
      <DeviceWorkspaceModal
        isOpen={isDeviceOnboardingOpen}
        onClose={() => setIsDeviceOnboardingOpen(false)}
        deviceDirName={deviceDirName}
        deviceDirPermission={deviceDirPermission}
        onConnect={handleConnectDeviceFolder}
        onRequestPermission={handleRequestWorkspacePermission}
        onDisconnect={handleDisconnectDeviceFolder}
        onExport={handleSyncExportToDevice}
        onImport={handleSyncImportFromDevice}
      />

      {/* PWA Installation & Backend Configuration Modal */}
      <InstallAndConfigureModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        scriptUrls={currentScriptUrls}
        onSaveScriptUrls={handleSaveScriptUrls}
        onResetScriptUrl={handleResetScriptUrl}
        deferredInstallPrompt={deferredInstallPrompt}
        lastSynced={lastSynced}
        isOffline={isOfflineMode}
        onForceSync={fetchCatalog}
        isAdmin={!!(appUser && appSecret)}
        onOpenAdmin={() => {
          setIsInstallModalOpen(false);
          if (appUser && appSecret) {
            setIsAdminDatabaseModalOpen(true);
          } else {
            setIsAdminModalOpen(true);
          }
        }}
      />

      {/* Admin Database Control Center Modal */}
      <AdminDatabaseModal
        isOpen={isAdminDatabaseModalOpen}
        onClose={() => setIsAdminDatabaseModalOpen(false)}
        scriptUrls={currentScriptUrls}
        onSaveScriptUrls={handleSaveScriptUrls}
        onResetScriptUrl={handleResetScriptUrl}
        lastSynced={lastSynced}
        isOffline={isOfflineMode}
        onForceSync={fetchCatalog}
        isAdmin={!!(appUser && appSecret)}
        onTriggerLogin={() => setIsAdminModalOpen(true)}
        onLogout={handleAdminLockToggle}
        alertEmails={alertEmails}
        onSaveAlertEmails={handleSaveAlertEmails}
      />

      {/* Setlist Selector Manager Dialog */}
      {isSetlistManagerOpen && currentSong && (
        <SetlistSelectorDialog
          isOpen={isSetlistManagerOpen}
          onClose={() => setIsSetlistManagerOpen(false)}
          currentSong={currentSong}
          allSharedSetlists={allSharedSetlists}
          localSetlists={localSetlists}
          onAddSongToSet={async (setName, arrName, customLayout) => {
            await saveSongToSetlist(setName, arrName, customLayout);
          }}
          onRemoveSongFromSet={async (setName, sId) => {
            await removeSongFromSetlist(setName, sId);
          }}
          onCreateNewSetlist={async (setName) => {
            await createNewSetlistFolder(setName);
          }}
          isAdmin={!!(appUser && appSecret)}
          currentKey={currentKey}
          currentArrangementName={currentArrangementName}
          activeRoadmap={activeRoadmap}
          originalRoadmap={originalRoadmap}
          syncedSheetArrangements={syncedSheetArrangements}
          effectiveSectionTemplates={effectiveSectionTemplates}
          sectionTemplates={sectionTemplates}
        />
      )}

      {/* LOAD & CONFIGURE MODAL */}
      {pendingSongLoad && (
        <div className="fixed inset-0 bg-[#020205]/85 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#0a0b16] border border-indigo-500/20 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-4 sm:p-5 flex flex-col gap-4 animate-scaleIn relative">
            
            {/* Close Button */}
            <button
              onClick={() => setPendingSongLoad(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all text-xs font-bold z-10"
              title="Close panel"
            >
              ✕
            </button>

            {/* Header */}
            <div className="text-left select-none pr-8">
              <h2 className="text-sm font-black uppercase tracking-wider text-indigo-100">
                Load & Configure
              </h2>
              <p className="font-mono text-[11px] text-indigo-400/80 mt-0.5">
                {pendingSongLoad.song.Title}
              </p>
            </div>

            {/* Config Options Body */}
            <div className="flex flex-col gap-3.5 text-left">
              
              {/* Option 1: Display Mode */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 select-none">
                  Display Mode
                </span>
                <div className="grid grid-cols-3 gap-1.5 pb-3 border-b border-indigo-500/10">
                  {(['chords', 'numbers', 'both'] as const).map((mode) => {
                    const isSelected = loadConfigDisplayMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setLoadConfigDisplayMode(mode)}
                        className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-center cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-200 font-black shadow-inner shadow-indigo-500/5'
                            : 'bg-indigo-950/10 border-indigo-500/5 text-gray-500 hover:border-indigo-500/20 hover:text-gray-300'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Option 2: Show Lyrics */}
              <div className="flex items-center justify-between py-0.5 pb-3 border-b border-indigo-500/10 select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-gray-200">
                    Show Lyrics
                  </span>
                  <span className="text-[9px] text-gray-400/80 font-medium">
                    Display text sheet with chords
                  </span>
                </div>
                <button
                  onClick={() => setLoadConfigShowLyrics(!loadConfigShowLyrics)}
                  className={`px-3 py-1 font-black text-[9px] uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                    loadConfigShowLyrics
                      ? 'bg-[#18192a] border border-[#2e3150] text-[#7177a6] hover:text-indigo-300'
                      : 'bg-slate-900/40 border border-slate-800 text-gray-500 hover:text-gray-400'
                  }`}
                >
                  {loadConfigShowLyrics ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Option 3: Sheet Layout */}
              <div className="flex items-center justify-between py-0.5 select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-gray-200">
                    Sheet Layout
                  </span>
                  <span className="text-[9px] text-gray-400/80 font-medium">
                    Flow/Sequence vs Compact View
                  </span>
                </div>
                
                <div className="flex items-center bg-[#131526]/80 border border-[#222440] p-0.5 rounded-lg">
                  <button
                    onClick={() => setLoadConfigSheetLayoutMode('sequence')}
                    className={`px-2.5 py-1 text-[9px] uppercase tracking-wider rounded-md transition-all cursor-pointer select-none font-bold ${
                      loadConfigSheetLayoutMode === 'sequence'
                        ? 'bg-indigo-600 text-white border border-indigo-500 shadow-sm shadow-indigo-600/20 font-black'
                        : 'text-[#7177a6] hover:text-gray-200'
                    }`}
                  >
                    Flow
                  </button>
                  <button
                    onClick={() => setLoadConfigSheetLayoutMode('compact')}
                    className={`px-2.5 py-1 text-[9px] uppercase tracking-wider rounded-md transition-all cursor-pointer select-none font-bold ${
                      loadConfigSheetLayoutMode === 'compact'
                        ? 'bg-amber-600/20 text-[#f59e0b] border border-amber-600/40 font-black'
                        : 'text-[#7177a6] hover:text-gray-200'
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>

            </div>

            {/* Bottom Actions Footer */}
            <div className="flex items-center gap-2 border-t border-indigo-500/10 pt-3.5 mt-1">
              <button
                onClick={() => setPendingSongLoad(null)}
                className="flex-1 py-1.5 bg-[#181a2f] hover:bg-[#1f213b] text-gray-400 hover:text-gray-300 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer text-center border border-[#2e3150]/40"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setDisplayMode(loadConfigDisplayMode);
                  setShowLyrics(loadConfigShowLyrics);
                  setSheetLayoutMode(loadConfigSheetLayoutMode);
                  
                  const { song, forceDefaultArrangement, activeFolderOverride, arrsOverride } = pendingSongLoad;
                  await executeSongLoad(song, forceDefaultArrangement, activeFolderOverride, arrsOverride);
                  if (activeFolderOverride) {
                    setActiveSetlistFolder(activeFolderOverride);
                  }
                  setPendingSongLoad(null);
                }}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-lg text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer text-center shadow-md shadow-indigo-600/20"
              >
                Generate
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Sidebar Catalog overlay drawer */}
      <SidebarCatalog
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        songs={songs}
        favorites={favorites}
        setlists={setlists}
        currentTab={currentTab}
        onSetTab={setCurrentTab}
        currentSong={currentSong}
        onChangeSong={(song) => {
          setLoadConfigDisplayMode(displayMode);
          setLoadConfigShowLyrics(showLyrics);
          setLoadConfigSheetLayoutMode(sheetLayoutMode);
          setPendingSongLoad({
            song,
            forceDefaultArrangement: false
          });
          setIsNavOpen(false);
        }}
        onOpenAddSongForm={() => {
          setFormEditingSong(null);
          setIsFormModalOpen(true);
        }}
        isAdmin={!!(appUser && appSecret)}
        onToggleAdmin={() => setIsAdminModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onToggleFullScreen={toggleFullScreen}
        triggerCapability={(cap) => {
          handleTriggerCapability(cap as any);
        }}
        onRunDiagnostics={() => setIsDiagnosticModalOpen(true)}
        allSharedSetlists={setlistsTabMode === 'local' ? localSetlists : allSharedSetlists}
        onlineSetlistsCount={allSharedSetlists.length}
        localSetlistsCount={localSetlists.length}
        setlistsTabMode={setlistsTabMode}
        onChangeSetlistsTabMode={(mode) => {
          setSetlistsTabMode(mode);
          localStorage.setItem('setlists_tab_mode', mode);
          // Auto update active setlist type when switching tab modes
          setActiveSetlistType(mode);
          localStorage.setItem('active_setlist_type', mode);
        }}
        onImportSetlistJSON={handleImportSetlistJSON}
        onExportSetlistJSON={handleExportSetlistJSON}
        onSaveSetlistOrder={async (setName, updatedSongIds) => {
          await saveSetlistOrder(setName, updatedSongIds);
        }}
        onDeleteSetlist={async (setName) => {
          await deleteSetlistFolder(setName);
        }}
        onRemoveSongFromSetlist={async (setName, songId) => {
          await removeSongFromSetlist(setName, songId);
        }}
        onSelectSongFromSetlist={(song, setName) => {
          setActiveSetlistType(setlistsTabMode);
          localStorage.setItem('active_setlist_type', setlistsTabMode);

          setLoadConfigDisplayMode(displayMode);
          setLoadConfigShowLyrics(showLyrics);
          setLoadConfigSheetLayoutMode(sheetLayoutMode);
          setPendingSongLoad({
            song,
            forceDefaultArrangement: false,
            activeFolderOverride: setName
          });
          setIsNavOpen(false);
        }}
        onCreateSetlist={async (setName) => {
          await createNewSetlistFolder(setName);
        }}
        onToggleSetlistLock={(setName) => {
          toggleSetlistLock(setName);
        }}
        activeSetlistFolder={activeSetlistFolder}
        onOpenInstallGuide={() => setIsInstallModalOpen(true)}
        onDownloadManual={() => {
          showToast('Downloading Worship Chord Book PDF Manual...', 'success');
          showToast('Tip: Use the "📄 Print" icon in active header to save sheets directly to A4 PDF!', 'info');
        }}
        onDownloadSetlistPDF={(setName) => {
          setActiveSetlistFolder(setName);
          setPdfScope('all');
          setIsPDFPreviewOpen(true);
          setIsNavOpen(false);
          showToast(`Prepared merged PDF collection for ${setName}!`, 'success');
        }}
        onOpenDeviceWorkspace={() => setIsDeviceOnboardingOpen(true)}
        onOpenAdminDatabaseControl={() => setIsAdminDatabaseModalOpen(true)}
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
