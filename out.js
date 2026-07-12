import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  transposeChord,
  getNumberForChord,
  getModulatedKeyName,
  NOTES,
  NOTE_TO_INDEX
} from "./utils";
import { FALLBACK_SONGS, FALLBACK_SONG_LINES } from "./fallbackData";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyXCeXackc_suAUMKCGJ6qIjMygAADB9zHmoJ5EqWU_OTmBxkgH9uHLP4nY427farS5/exec";
const LOCAL_STORAGE_KEY = "user_added_songs";
export const areBlocksIdentical = (b1, b2) => {
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
export const areRoadmapsIdentical = (r1, r2) => {
  if (!r1 || !r2) return false;
  const blocks1 = Array.isArray(r1) ? r1 : r1.roadmap && Array.isArray(r1.roadmap) ? r1.roadmap : [];
  const blocks2 = Array.isArray(r2) ? r2 : r2.roadmap && Array.isArray(r2.roadmap) ? r2.roadmap : [];
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
export const resolveFriendlyArrangementName = (songID, roadmapBlocks, syncedSheetArrangements) => {
  if (!roadmapBlocks || roadmapBlocks.length === 0) return "";
  for (const arr of syncedSheetArrangements) {
    if (String(arr.SongID) !== String(songID)) continue;
    if (arr.PresetName && arr.PresetName.startsWith("Set:")) continue;
    try {
      const presetData = JSON.parse(arr.RoadmapJSON);
      const isObject = presetData && typeof presetData === "object" && !Array.isArray(presetData);
      const blocksArray = isObject ? presetData.roadmap || [] : presetData;
      if (areRoadmapsIdentical(blocksArray, roadmapBlocks)) {
        return arr.PresetName;
      }
    } catch {
    }
  }
  try {
    const local = localStorage.getItem(`custom_arrangements_${songID}`);
    if (local) {
      const localObj = JSON.parse(local);
      for (const k of Object.keys(localObj)) {
        if (k.startsWith("Set:")) continue;
        const presetData = localObj[k];
        const isObject = presetData && typeof presetData === "object" && !Array.isArray(presetData);
        const blocksArray = isObject ? presetData.roadmap || [] : presetData;
        if (areRoadmapsIdentical(blocksArray, roadmapBlocks)) {
          return k;
        }
      }
    }
  } catch {
  }
  return "";
};
export const parsePresetDate = (presetName) => {
  const regex = /\s*\((January|February|March|April|May|June|July|August|September|October|November|December)-\d{2}-\d{2}\)$/i;
  const match = presetName.match(regex);
  if (match) {
    const matchedPart = match[0];
    const dateStr = matchedPart.trim().slice(1, -1);
    const baseName = presetName.replace(matchedPart, "").trim();
    return { baseName, dateStr };
  }
  return { baseName: presetName, dateStr: "Other / No Date" };
};
export const getPresetInputDisplayName = (name) => {
  if (!name) return "";
  if (name.startsWith("Set: ")) {
    return name.slice(5).toUpperCase();
  }
  const { baseName } = parsePresetDate(name);
  return baseName.toUpperCase();
};
export const areBlocksChordsIdentical = (b1, b2, sectionTemplates) => {
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
    if ((activeLines1[i].Chords || "") !== (activeLines2[i].Chords || "")) {
      return false;
    }
  }
  return true;
};
export const areBlocksLyricsAndChordsIdentical = (b1, b2, sectionTemplates) => {
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
    if ((l1.Chords || "") !== (l2.Chords || "")) return false;
    if ((l1.Lyrics || "") !== (l2.Lyrics || "")) return false;
  }
  return true;
};
export const getRoadmapRepetitionInfo = (roadmap) => {
  const info = [];
  if (roadmap.length === 0) return info;
  let currentRunStartIdx = 0;
  let currentCount = 1;
  for (let i = 0; i < roadmap.length; i++) {
    info.push({
      isRepeat: false,
      repeatCount: 1,
      totalInRun: 1,
      runStartIndex: i
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
        runStartIndex: currentRunStartIdx
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
  const [songs, setSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState("songs");
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [lastSynced, setLastSynced] = useState(() => {
    try {
      const synced = localStorage.getItem("catalog_last_synced");
      return synced ? parseInt(synced, 10) : null;
    } catch {
      return null;
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("favs");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [setlists, setSetlists] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [formEditingSong, setFormEditingSong] = useState(null);
  const [currentKey, setCurrentKey] = useState("C");
  const [songLines, setSongLines] = useState([]);
  const [focusedLineId, setFocusedLineId] = useState(null);
  const [lyricZoom, setLyricZoom] = useState(0.6);
  const [displayMode, setDisplayMode] = useState("both");
  const [showLyrics, setShowLyrics] = useState(true);
  const [sheetLayoutMode, setSheetLayoutMode] = useState("sequence");
  const [isPDFPreviewOpen, setIsPDFPreviewOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState("current");
  const [pdfSelectedSongIds, setPdfSelectedSongIds] = useState([]);
  const [pdfSongKeys, setPdfSongKeys] = useState({});
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [isScrollingActive, setIsScrollingActive] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [tapTimestamps, setTapTimestamps] = useState([]);
  const [activeRoadmap, setActiveRoadmap] = useState([]);
  const [sectionTemplates, setSectionTemplates] = useState({});
  const [loadedSnapshotSections, setLoadedSnapshotSections] = useState(null);
  const effectiveSectionTemplates = useMemo(() => {
    const result = {};
    Object.keys(sectionTemplates).forEach((secName) => {
      result[secName] = sectionTemplates[secName];
    });
    if (loadedSnapshotSections) {
      Object.keys(loadedSnapshotSections).forEach((secName) => {
        result[secName] = loadedSnapshotSections[secName];
      });
    }
    return result;
  }, [sectionTemplates, loadedSnapshotSections]);
  const [originalRoadmap, setOriginalRoadmap] = useState([]);
  const [arrangerOpen, setArrangerOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [isArrangementLocked, setIsArrangementLocked] = useState(false);
  const [roadmapBackup, setRoadmapBackup] = useState(null);
  const [nameBackup, setNameBackup] = useState("");
  const [currentArrangementName, setCurrentArrangementName] = useState("");
  const [expandedArrangementSetlists, setExpandedArrangementSetlists] = useState({});
  const [syncedSheetArrangements, setSyncedSheetArrangements] = useState([]);
  const [cloudArrangementUpdateNotice, setCloudArrangementUpdateNotice] = useState(null);
  const [cloudArrangementDeletionNotice, setCloudArrangementDeletionNotice] = useState(null);
  const [pendingArrangementToLoad, setPendingArrangementToLoad] = useState(null);
  const [saveArrangementConfirmation, setSaveArrangementConfirmation] = useState(null);
  const [deleteArrangementConfirmation, setDeleteArrangementConfirmation] = useState(null);
  const [arrangementReplacementModal, setArrangementReplacementModal] = useState(null);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState(null);
  const [sectionCollapsedStates, setSectionCollapsedStates] = useState({});
  const [isFamilyChordsCollapsed, setIsFamilyChordsCollapsed] = useState(true);
  const [isPerformancePanelCollapsed, setIsPerformancePanelCollapsed] = useState(true);
  const [isRoadmapFlowCollapsed, setIsRoadmapFlowCollapsed] = useState(true);
  const [pendingSong, setPendingSong] = useState(null);
  const [pendingSetlistName, setPendingSetlistName] = useState("");
  const [modalDisplayMode, setModalDisplayMode] = useState("both");
  const [modalShowLyrics, setModalShowLyrics] = useState(true);
  const [modalSheetLayoutMode, setModalSheetLayoutMode] = useState("sequence");
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  useEffect(() => {
    const handleBeforePrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforePrompt);
    };
  }, []);
  useEffect(() => {
    if (currentSong) {
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
  const [appUser, setAppUser] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [adminUsernameInput, setAdminUsernameInput] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isMusicianModalOpen, setIsMusicianModalOpen] = useState(false);
  const [selectedChord, setSelectedChord] = useState("");
  const [isSetlistManagerOpen, setIsSetlistManagerOpen] = useState(false);
  const [activeSetlistFolder, setActiveSetlistFolder] = useState("");
  const [allSharedArrangements, setAllSharedArrangements] = useState(() => {
    try {
      const raw = localStorage.getItem("cached_arrangements");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [allSharedSetlists, setAllSharedSetlists] = useState(() => {
    try {
      const raw = localStorage.getItem("cached_setlists_meta");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((row) => ({
            PresetName: row.Set || row.PresetName || "",
            RoadmapJSON: row["Songs & Arrangements"] || row.RoadmapJSON || "{}"
          }));
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const isSetlistLocked = (setName) => {
    const meta = allSharedSetlists.find((sl) => sl.PresetName === setName);
    if (!meta) return false;
    try {
      const parsed = JSON.parse(meta.RoadmapJSON);
      return !!parsed.locked;
    } catch {
      return false;
    }
  };
  const toggleSetlistLock = async (setName) => {
    if (!appUser || !appSecret) {
      showToast("Admin authentication required to lock/unlock setlists.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      if (!existingMeta) {
        showToast("Setlist not found.", "error");
        return;
      }
      let songIds = [];
      let isLocked = false;
      try {
        const parsed = JSON.parse(existingMeta.RoadmapJSON);
        songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        isLocked = !!parsed.locked;
      } catch {
      }
      const nextLockState = !isLocked;
      const payloadMeta = {
        action: "saveSetlist",
        name: setName,
        roadmap: { songIds, lastUpdated: Date.now(), locked: nextLockState }
      };
      const resMeta = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== "success") {
        throw new Error(resMetaJson.message || "Failed to update setlist lock");
      }
      showToast(`Setlist "${setName}" is now ${nextLockState ? "LOCKED \u{1F512}" : "UNLOCKED \u{1F513}"}`, "success");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast("Error updating setlist lock status", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const toggleAutoscroll = () => {
    if (!currentSong) return;
    if (!isScrollingActive) {
      const container = document.querySelector(".song-scroll-container");
      const isContainerScrollable = container && container.scrollHeight > container.clientHeight && getComputedStyle(container).overflowY !== "visible";
      const maxScroll = isContainerScrollable ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 5) {
        showToast("Entire sheet fits in view. No scrolling needed!", "info");
        return;
      }
      setIsScrollingActive(true);
      showToast("Autoscrolling Song Sheet!", "success");
    } else {
      setIsScrollingActive(false);
      showToast("Autoscroll Paused", "info");
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
      let returnedPresets = [];
      if (Array.isArray(presetsList)) {
        returnedPresets = presetsList.map((row) => ({
          SongID: String(row.SongID),
          PresetName: String(row.PresetName),
          RoadmapJSON: String(row.RoadmapJSON)
        }));
        localStorage.setItem("cached_arrangements", JSON.stringify(returnedPresets));
        setAllSharedArrangements(returnedPresets);
        if (currentSong) {
          const matching = returnedPresets.filter((arr) => String(arr.SongID) === String(currentSong.SongID));
          setSyncedSheetArrangements(matching);
          handleBackgroundArrangementChange(matching, returnedPresets);
        }
      }
      const setlistsList = JSON.parse(setlistsText);
      let returnedSetlists = [];
      if (Array.isArray(setlistsList)) {
        returnedSetlists = setlistsList.map((row) => ({
          PresetName: row.Set || row.PresetName || "",
          RoadmapJSON: row["Songs & Arrangements"] || row.RoadmapJSON || "{}"
        }));
        localStorage.setItem("cached_setlists_meta", JSON.stringify(returnedSetlists));
        setAllSharedSetlists(returnedSetlists);
      }
      return { presets: returnedPresets, setlists: returnedSetlists };
    } catch (e) {
      console.warn("Error refetching arrangements and setlists", e);
      return { presets: [], setlists: [] };
    }
  };
  const saveSongToSetlist = async (setName, arrangementName) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, "error");
      return;
    }
    if (!currentSong) return;
    const isDuplicate = syncedSheetArrangements.some((arr) => {
      if (String(arr.SongID) !== String(currentSong.SongID)) return false;
      if (arr.PresetName === arrangementName) return true;
      try {
        const parsed = JSON.parse(arr.RoadmapJSON);
        if (parsed && parsed.arrangementName && parsed.arrangementName.trim().toLowerCase() === arrangementName.trim().toLowerCase()) {
          return true;
        }
      } catch (e) {
      }
      return false;
    });
    if (isDuplicate) {
      showToast(`Arrangement name "${arrangementName}" already exists for this song.`, "error");
      throw new Error(`Duplicate arrangement name`);
    }
    setIsLoading(true);
    try {
      const capturedSettings = {
        key: currentKey,
        roadmap: originalRoadmap,
        arrangementName,
        snapshotSections: sectionTemplates
      };
      const payloadArrangement = {
        action: "saveArrangement",
        songId: String(currentSong.SongID),
        name: `Set: ${setName}`,
        roadmap: capturedSettings
      };
      const resArr = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadArrangement)
      });
      const resArrJson = await resArr.json();
      if (resArrJson.status !== "success") {
        throw new Error(resArrJson.message || "Failed to save arrangement");
      }
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      let songIds = [];
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {
        }
      }
      const sId = String(currentSong.SongID);
      if (!songIds.includes(sId)) {
        songIds.push(sId);
      }
      const payloadMeta = {
        action: "saveSetlist",
        name: setName,
        roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) }
      };
      const resMeta = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== "success") {
        throw new Error(resMetaJson.message || "Failed to save setlist metadata");
      }
      showToast(`Added to "${setName}" as "${arrangementName}" (using Default flow)`, "success");
      setIsSetlistManagerOpen(false);
      setCurrentTab("songs");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to save to Setlist", "error");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  const removeSongFromSetlist = async (setName, songIdToRemove) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, "error");
      return;
    }
    setIsLoading(true);
    try {
      const payloadDelete = {
        action: "deleteArrangement",
        songId: songIdToRemove,
        name: `Set: ${setName}`
      };
      fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadDelete)
      });
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === setName
      );
      if (existingMeta) {
        let songIds = [];
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {
        }
        const updatedSongIds = songIds.filter((id) => String(id) !== String(songIdToRemove));
        const payloadMeta = {
          action: "saveSetlist",
          name: setName,
          roadmap: { songIds: updatedSongIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) }
        };
        fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(payloadMeta)
        });
      }
      showToast(`Removed from Setlist: ${setName}`, "info");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast("Error removing song from Setlist", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const saveSetlistOrder = async (setName, updatedSongIds) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, "error");
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: "saveSetlist",
        name: setName,
        roadmap: { songIds: updatedSongIds, lastUpdated: Date.now(), locked: isSetlistLocked(setName) }
      };
      const resMeta = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== "success") {
        throw new Error(resMetaJson.message || "Failed to save setlist order");
      }
      showToast(`Setlist order updated for "${setName}"`, "success");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast("Error updating setlist order", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const createNewSetlistFolder = async (setName) => {
    if (!setName.trim()) {
      showToast("Please enter a setlist name", "error");
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: "saveSetlist",
        name: setName.trim(),
        roadmap: { songIds: [], lastUpdated: Date.now() }
      };
      const resMeta = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== "success") {
        throw new Error(resMetaJson.message || "Failed to create setlist folder");
      }
      showToast(`Setlist folder "${setName.trim()}" created!`, "success");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast("Error creating setlist folder", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const deleteSetlistFolder = async (setName) => {
    if (isSetlistLocked(setName) && !(appUser && appSecret)) {
      showToast(`Setlist "${setName}" is locked by an admin. Modifying is restricted.`, "error");
      return;
    }
    setIsLoading(true);
    try {
      const payloadMeta = {
        action: "deleteSetlist",
        name: setName
      };
      fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      const setPresets = allSharedArrangements.filter(
        (arr) => arr.PresetName === `Set: ${setName}`
      );
      for (const preset of setPresets) {
        const payloadDelete = {
          action: "deleteArrangement",
          songId: String(preset.SongID),
          name: `Set: ${setName}`
        };
        fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(payloadDelete)
        });
      }
      showToast(`Setlist folder "${setName}" deleted!`, "success");
      await refetchArrangements();
    } catch (err) {
      console.error(err);
      showToast("Error deleting setlist folder", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const selectSongFromSetlist = async (song, setName) => {
    setPendingSong(song);
    setPendingSetlistName(setName);
    setModalDisplayMode(displayMode);
    setModalShowLyrics(showLyrics);
    setModalSheetLayoutMode(sheetLayoutMode);
  };
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [toasts, setToasts] = useState([]);
  const wakeLockRef = useRef(null);
  const repInfo = getRoadmapRepetitionInfo(activeRoadmap);
  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };
  const applyLocalSongsAndOverrides = (baseSongs) => {
    const list = [...baseSongs];
    try {
      const localSongsRaw = localStorage.getItem("local_custom_songs");
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
      console.warn("Error applying local custom songs:", e);
    }
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
            Version: override.Version || override.version || s.Version
          };
        }
      } catch (e) {
        console.warn("Error applying local song override:", e);
      }
    });
    return list;
  };
  const getUsedSectionNames = () => {
    const names = /* @__PURE__ */ new Set();
    if (activeRoadmap) {
      activeRoadmap.forEach((block) => {
        if (block.name) {
          names.add(block.name.trim().toLowerCase());
        }
      });
    }
    if (syncedSheetArrangements) {
      syncedSheetArrangements.forEach((arr) => {
        try {
          const parsed = JSON.parse(arr.RoadmapJSON);
          if (parsed) {
            const blocks = parsed.roadmap || parsed;
            if (Array.isArray(blocks)) {
              blocks.forEach((block) => {
                if (block && block.name) {
                  names.add(block.name.trim().toLowerCase());
                }
              });
            }
          }
        } catch {
        }
      });
    }
    if (currentSong) {
      try {
        const local = localStorage.getItem(`custom_arrangements_${currentSong.SongID}`);
        if (local) {
          const localObj = JSON.parse(local);
          Object.values(localObj).forEach((parsed) => {
            if (parsed) {
              const blocks = parsed.roadmap || parsed;
              if (Array.isArray(blocks)) {
                blocks.forEach((block) => {
                  if (block && block.name) {
                    names.add(block.name.trim().toLowerCase());
                  }
                });
              }
            }
          });
        }
      } catch {
      }
    }
    return Array.from(names);
  };
  const fetchCatalog = async () => {
    try {
      const arrCache = localStorage.getItem("cached_arrangements");
      if (arrCache) {
        setAllSharedArrangements(JSON.parse(arrCache));
      }
      const setlistsCache = localStorage.getItem("cached_setlists_meta");
      if (setlistsCache) {
        setAllSharedSetlists(JSON.parse(setlistsCache));
      }
    } catch (err) {
    }
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      let metaData = [];
      let songsVersion = null;
      let linesVersion = null;
      let arrVersion = null;
      try {
        const metaRes = fetch(`${SCRIPT_URL}?tab=SyncVersion`, { signal: controller.signal });
        const metaText = await metaRes.text();
        metaData = JSON.parse(metaText);
        if (Array.isArray(metaData) && metaData.length > 0) {
          localStorage.setItem("cached_metadata", JSON.stringify(metaData));
          const songsRow = metaData.find((m) => m.TabName === "Songs");
          songsVersion = songsRow ? String(songsRow.Version || songsRow.LastUpdated || songsRow.Date || songsRow.version) : null;
          const linesRow = metaData.find((m) => m.TabName === "SongLines");
          linesVersion = linesRow ? String(linesRow.Version || linesRow.LastUpdated || linesRow.Date || linesRow.version) : null;
          const arrRow = metaData.find((m) => m.TabName === "Arrangements");
          arrVersion = arrRow ? String(arrRow.Version || arrRow.LastUpdated || arrRow.Date || arrRow.version) : null;
        }
      } catch (e) {
        console.warn("Metadata fetch failed, falling back to full sync.", e);
      }
      const cachedSongsVersion = localStorage.getItem("cached_songs_version");
      const cachedLinesVersion = localStorage.getItem("cached_song_lines_version");
      const cachedArrVersion = localStorage.getItem("cached_arrangements_version");
      const needsSongsUpdate = !songsVersion || cachedSongsVersion !== songsVersion || !localStorage.getItem("cached_songs");
      const needsLinesUpdate = !linesVersion || cachedLinesVersion !== linesVersion || !localStorage.getItem("cached_song_lines");
      const needsArrUpdate = !arrVersion || cachedArrVersion !== arrVersion || !localStorage.getItem("cached_arrangements");
      let updatesPerformed = false;
      if (needsSongsUpdate || needsLinesUpdate || needsArrUpdate) {
        showToast("Downloading new updates...", "info");
      } else {
        console.log("All caches up to date.");
      }
      let remoteSongs = [];
      if (!needsSongsUpdate) {
        remoteSongs = JSON.parse(localStorage.getItem("cached_songs") || "[]");
      } else {
        const res = fetch(`${SCRIPT_URL}?tab=Songs`, { signal: controller.signal });
        const textData = await res.text();
        let list = [];
        try {
          list = JSON.parse(textData);
        } catch {
          throw new Error("Invalid Songs payload.");
        }
        if (list && list.error) throw new Error(list.error);
        remoteSongs = Array.isArray(list) ? list : [];
        localStorage.setItem("cached_songs", JSON.stringify(remoteSongs));
        if (songsVersion) localStorage.setItem("cached_songs_version", songsVersion);
        updatesPerformed = true;
      }
      if (needsLinesUpdate) {
        const linesRes = fetch(`${SCRIPT_URL}?tab=SongLines`, { signal: controller.signal });
        const linesText = await linesRes.text();
        let linesList = [];
        try {
          linesList = JSON.parse(linesText);
        } catch {
          console.warn("Invalid SongLines payload");
        }
        if (!linesList.error) {
          localStorage.setItem("cached_song_lines", JSON.stringify(linesList));
          if (linesVersion) localStorage.setItem("cached_song_lines_version", linesVersion);
          updatesPerformed = true;
        }
      }
      if (needsArrUpdate) {
        const arrRes = fetch(`${SCRIPT_URL}?tab=Arrangements`, { signal: controller.signal });
        const arrText = await arrRes.text();
        let arrList = [];
        try {
          arrList = JSON.parse(arrText);
        } catch {
          console.warn("Invalid Arrangements payload");
        }
        if (!arrList.error && Array.isArray(arrList)) {
          localStorage.setItem("cached_arrangements", JSON.stringify(arrList));
          setAllSharedArrangements(arrList);
          if (arrVersion) localStorage.setItem("cached_arrangements_version", arrVersion);
          updatesPerformed = true;
        }
      }
      try {
        const setlistsRes = fetch(`${SCRIPT_URL}?tab=Setlists`, { signal: controller.signal });
        const setlistsText = await setlistsRes.text();
        const setlistsList = JSON.parse(setlistsText);
        if (Array.isArray(setlistsList)) {
          const mappedSetlists = setlistsList.map((row) => ({
            PresetName: row.Set || row.PresetName || "",
            RoadmapJSON: row["Songs & Arrangements"] || row.RoadmapJSON || "{}"
          }));
          localStorage.setItem("cached_setlists_meta", JSON.stringify(mappedSetlists));
          setAllSharedSetlists(mappedSetlists);
        }
      } catch (e) {
        console.warn("Error syncing setlists on catalog fetch", e);
      }
      if (updatesPerformed) {
        showToast("All updates applied successfully!", "success");
      } else if (metaData.length > 0) {
        showToast("Library is up to date.", "success");
      }
      clearTimeout(timeoutId);
      const now = Date.now();
      localStorage.setItem("catalog_last_synced", now.toString());
      setLastSynced(now);
      setIsOfflineMode(false);
      const combinedSongs = [...remoteSongs];
      FALLBACK_SONGS.forEach((fs) => {
        if (!combinedSongs.some((s) => String(s.SongID) === String(fs.SongID))) {
          combinedSongs.push(fs);
        }
      });
      setSongs(applyLocalSongsAndOverrides(combinedSongs));
    } catch (e) {
      console.warn("Failed connecting to database catalog, using cached / offline fallback", e);
      setIsOfflineMode(true);
      let cachedSongs = [];
      try {
        const cacheRaw = localStorage.getItem("cached_songs");
        if (cacheRaw) {
          cachedSongs = JSON.parse(cacheRaw);
        }
      } catch (err) {
      }
      const combinedSongs = [...cachedSongs];
      FALLBACK_SONGS.forEach((fs) => {
        if (!combinedSongs.some((s) => String(s.SongID) === String(fs.SongID))) {
          combinedSongs.push(fs);
        }
      });
      setSongs(applyLocalSongsAndOverrides(combinedSongs));
      showToast("Loaded offline cached catalog", "success");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    fetchCatalog();
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const requestWakeLock = async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
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
      if (document.visibilityState === "visible" && currentSong) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [currentSong]);
  const toggleFav = (id) => {
    const sId = String(id);
    let next;
    if (favorites.includes(sId)) {
      next = favorites.filter((x) => x !== sId);
      showToast("Removed from Favorites", "info");
    } else {
      next = [...favorites, sId];
      showToast("Starred in Favorites!", "success");
    }
    setFavorites(next);
    localStorage.setItem("favs", JSON.stringify(next));
  };
  const updateCapturedSettings = (id) => {
    const sId = String(id);
    try {
      const rawSaved = localStorage.getItem("captured_song_settings") || "{}";
      const dict = JSON.parse(rawSaved);
      dict[sId] = {
        key: currentKey,
        roadmap: activeRoadmap
      };
      localStorage.setItem("captured_song_settings", JSON.stringify(dict));
      showToast("Setlist arrangement updated successfully!", "success");
    } catch (err) {
      console.error("Error updating captured settings:", err);
      showToast("Failed to update arrangement", "error");
    }
  };
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
          console.error("Error syncing setlist queue:", e);
        }
      }
    } else if (!activeSetlistFolder) {
      setSetlists([]);
    }
  }, [activeSetlistFolder, allSharedSetlists]);
  useEffect(() => {
    if (!isMetronomeActive) return;
    const intervalMs = 6e4 / bpm;
    let pulseTimeout;
    const intervalId = setInterval(() => {
      const dot = document.getElementById("metronomeDot");
      const header = document.getElementById("stageHeader");
      if (dot) {
        dot.classList.remove("opacity-20", "scale-90");
        dot.classList.add("opacity-100", "scale-110", "shadow-[0_0_12px_#f43f5e]");
      }
      if (header) {
        header.classList.add("edge-pulse");
      }
      pulseTimeout = setTimeout(() => {
        const innerDot = document.getElementById("metronomeDot");
        const innerHeader = document.getElementById("stageHeader");
        if (innerDot) {
          innerDot.classList.add("opacity-20", "scale-90");
          innerDot.classList.remove("opacity-100", "scale-110", "shadow-[0_0_12px_#f43f5e]");
        }
        if (innerHeader) {
          innerHeader.classList.remove("edge-pulse");
        }
      }, 120);
    }, intervalMs);
    return () => {
      clearInterval(intervalId);
      clearTimeout(pulseTimeout);
    };
  }, [isMetronomeActive, bpm]);
  useEffect(() => {
    if (!isScrollingActive) return;
    let lastFrameTime = performance.now();
    const container = document.querySelector(".song-scroll-container");
    const isContainerScrollable = container && container.scrollHeight > container.clientHeight && getComputedStyle(container).overflowY !== "visible";
    let exactScrollY = isContainerScrollable ? container.scrollTop : window.scrollY;
    let expectedScrollY = exactScrollY;
    let animationId;
    function step(currentTime) {
      const deltaTime = currentTime - lastFrameTime;
      const cappedDelta = Math.min(deltaTime, 50);
      lastFrameTime = currentTime;
      const currentScroll = isContainerScrollable ? container.scrollTop : window.scrollY;
      if (Math.abs(currentScroll - expectedScrollY) > 2) {
        exactScrollY = currentScroll;
      }
      const pixelsPerSecond = scrollSpeed * 12;
      const pixelsToScroll = pixelsPerSecond * cappedDelta / 1e3;
      exactScrollY += pixelsToScroll;
      if (isContainerScrollable) {
        container.scrollTo({
          top: exactScrollY,
          left: 0,
          behavior: "instant"
        });
      } else {
        window.scrollTo({
          top: exactScrollY,
          left: 0,
          behavior: "instant"
        });
      }
      expectedScrollY = isContainerScrollable ? container.scrollTop : window.scrollY;
      const maxScroll = isContainerScrollable ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      if (Math.ceil(currentScroll) >= maxScroll - 2) {
        setIsScrollingActive(false);
        return;
      }
      animationId = requestAnimationFrame(step);
    }
    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [isScrollingActive, scrollSpeed]);
  const changeSong = async (song) => {
    setModalDisplayMode(displayMode);
    setModalShowLyrics(showLyrics);
    setModalSheetLayoutMode(sheetLayoutMode);
    setPendingSong(song);
  };
  const handleApplyArrangementDeletion = async (deletedName, newSongArrangements, allArrs) => {
    if (!currentSong) return;
    const rawSaved = localStorage.getItem("captured_song_settings");
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        if (dict[String(currentSong.SongID)]) {
          delete dict[String(currentSong.SongID)];
          localStorage.setItem("captured_song_settings", JSON.stringify(dict));
        }
      } catch (e) {
      }
    }
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
    } catch (e) {
    }
    setCurrentArrangementName("");
    setCloudArrangementUpdateNotice(null);
    setCloudArrangementDeletionNotice(null);
    executeSongLoad(currentSong, true, void 0, allArrs.length > 0 ? allArrs : void 0);
    const remainingPresets = [];
    newSongArrangements.forEach((arr) => {
      if (arr.PresetName.startsWith("Set: ")) return;
      try {
        const parsed = JSON.parse(arr.RoadmapJSON);
        remainingPresets.push({
          name: arr.PresetName,
          roadmap: Array.isArray(parsed) ? parsed : parsed.roadmap || [],
          key: parsed.key || currentKey
        });
      } catch {
      }
    });
    setArrangementReplacementModal({
      songId: String(currentSong.SongID),
      deletedName: parsePresetDate(deletedName).baseName,
      availablePresets: remainingPresets
    });
    showToast(`Cleared deleted arrangement. Reverted to default structure.`, "info");
  };
  const handleBackgroundArrangementChange = (newSongArrangements, allArrs) => {
    if (!currentSong || !currentArrangementName) return;
    if (currentArrangementName.startsWith("Set: ")) return;
    const remoteArr = newSongArrangements.find(
      (a) => a.PresetName.toLowerCase().trim() === currentArrangementName.toLowerCase().trim()
    );
    if (remoteArr) {
      try {
        const parsedRemote = JSON.parse(remoteArr.RoadmapJSON);
        const remoteRoadmap = Array.isArray(parsedRemote) ? parsedRemote : parsedRemote.roadmap || [];
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
        console.warn("Failed to parse remote arrangement during background sync:", e);
      }
    } else {
      if (!cloudArrangementDeletionNotice) {
        setCloudArrangementDeletionNotice({
          name: currentArrangementName,
          newSongArrangements,
          allArrs
        });
        showToast(`\u26A0\uFE0F Active arrangement "${parsePresetDate(currentArrangementName).baseName}" was deleted on the cloud.`, "warning");
      }
    }
  };
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6e3);
        const metaRes = fetch(`${SCRIPT_URL}?tab=SyncVersion`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const metaText = await metaRes.text();
        const metaData = JSON.parse(metaText);
        if (Array.isArray(metaData) && metaData.length > 0) {
          const arrRow = metaData.find((m) => m.TabName === "Arrangements");
          const remoteArrVersion = arrRow ? String(arrRow.Version || arrRow.LastUpdated || arrRow.Date || arrRow.version) : null;
          const cachedArrVersion = localStorage.getItem("cached_arrangements_version");
          const setlistsRow = metaData.find((m) => m.TabName === "Setlists");
          const remoteSetlistsVersion = setlistsRow ? String(setlistsRow.Version || setlistsRow.LastUpdated || setlistsRow.Date || setlistsRow.version) : null;
          const cachedSetlistsVersion = localStorage.getItem("cached_setlists_version") || localStorage.getItem("cached_setlists_meta_version");
          if (remoteArrVersion && remoteArrVersion !== cachedArrVersion || remoteSetlistsVersion && remoteSetlistsVersion !== cachedSetlistsVersion) {
            console.log("Background Sync: Collaborative updates detected on the cloud. Syncing...");
            const result = await refetchArrangements();
            if (remoteArrVersion) {
              localStorage.setItem("cached_arrangements_version", remoteArrVersion);
            }
            if (remoteSetlistsVersion) {
              localStorage.setItem("cached_setlists_version", remoteSetlistsVersion);
            }
            if (result && Array.isArray(result.presets)) {
              if (currentSong) {
                const songIdStr = String(currentSong.SongID);
                const matching = result.presets.filter((arr) => String(arr.SongID) === songIdStr);
                handleBackgroundArrangementChange(matching, result.presets);
              }
            }
          }
        }
      } catch (e) {
        console.debug("Background collaborative sync silent error:", e);
      }
    }, 15e3);
    return () => clearInterval(syncInterval);
  }, [currentSong, currentArrangementName, activeRoadmap, currentKey]);
  useEffect(() => {
    if (arrangerOpen && activeSetlistFolder) {
      setExpandedArrangementSetlists((prev) => ({
        ...prev,
        [activeSetlistFolder]: true
      }));
    }
  }, [arrangerOpen, activeSetlistFolder]);
  const executeSongLoad = async (song, forceDefaultArrangement = false, activeFolderOverride, arrsOverride) => {
    setIsLoading(true);
    setCurrentSong(song);
    setCurrentArrangementName("");
    setCloudArrangementUpdateNotice(null);
    setCloudArrangementDeletionNotice(null);
    const arrangementsToUse = arrsOverride || allSharedArrangements;
    const rawSaved = localStorage.getItem("captured_song_settings");
    let savedSettings = null;
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        savedSettings = dict[String(song.SongID)];
      } catch (e) {
        console.error("Error reading saved settings", e);
      }
    }
    const activeFolder = activeFolderOverride !== void 0 ? activeFolderOverride : activeSetlistFolder;
    let setlistPresetKey = "";
    if (activeFolder && !forceDefaultArrangement) {
      const setPreset = getSetlistArrangement(activeFolder, String(song.SongID));
      if (setPreset) {
        try {
          const settings = JSON.parse(setPreset.RoadmapJSON);
          if (settings && settings.key) {
            setlistPresetKey = settings.key;
          }
        } catch {
        }
      }
    }
    if (setlistPresetKey) {
      setCurrentKey(setlistPresetKey);
      setBpm(song.BPM || 120);
    } else if (savedSettings) {
      setCurrentKey(savedSettings.key || song.OriginalKey || "C");
      setBpm(savedSettings.bpm || song.BPM || 120);
    } else {
      setCurrentKey(song.OriginalKey || "C");
      setBpm(song.BPM || 120);
    }
    setFocusedLineId(null);
    setEditingBlockId(null);
    setIsArrangementLocked(!!activeFolder && !forceDefaultArrangement);
    setIsScrollingActive(false);
    setIsMetronomeActive(false);
    setArrangerOpen(false);
    setSectionCollapsedStates({});
    setIsFamilyChordsCollapsed(true);
    setIsPerformancePanelCollapsed(true);
    setIsRoadmapFlowCollapsed(true);
    try {
      requestWakeLock();
      let filteredLines = [];
      if (String(song.SongID).startsWith("fallback-")) {
        filteredLines = FALLBACK_SONG_LINES.filter(
          (line) => line && String(line.SongID) === String(song.SongID)
        );
      } else {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          let fetchLines = true;
          let linesVersion = null;
          try {
            const metaRaw = localStorage.getItem("cached_metadata");
            if (metaRaw) {
              const metaData = JSON.parse(metaRaw);
              const row = metaData.find((m) => m.TabName === "SongLines");
              linesVersion = row ? String(row.Version || row.LastUpdated || row.Date || row.version) : null;
              const cachedLinesVersion = localStorage.getItem("cached_song_lines_version");
              if (linesVersion && cachedLinesVersion === linesVersion && localStorage.getItem("cached_song_lines")) {
                fetchLines = false;
                const cachedLines = JSON.parse(localStorage.getItem("cached_song_lines") || "[]");
                filteredLines = cachedLines.filter(
                  (line) => line && String(line.SongID) === String(song.SongID)
                );
                console.log("Using cached SongLines based on metadata version.");
              }
            }
          } catch (e) {
          }
          if (fetchLines) {
            const res = fetch(`${SCRIPT_URL}?tab=SongLines`, { signal: controller.signal });
            const textData = await res.text();
            let allLines = [];
            try {
              allLines = JSON.parse(textData);
            } catch {
              throw new Error("Invalid song sheets formatting payload.");
            }
            if (allLines && allLines.error) {
              throw new Error(allLines.error);
            }
            localStorage.setItem("cached_song_lines", JSON.stringify(allLines));
            if (linesVersion) {
              localStorage.setItem("cached_song_lines_version", linesVersion);
            }
            filteredLines = allLines.filter(
              (line) => line && String(line.SongID) === String(song.SongID)
            );
          }
          clearTimeout(timeoutId);
        } catch (remoteError) {
          console.warn("Failed loading remote song lines, checking cache and fallback data", remoteError);
          let cachedLines = [];
          try {
            const cacheRaw = localStorage.getItem("cached_song_lines");
            if (cacheRaw) {
              cachedLines = JSON.parse(cacheRaw);
            }
          } catch (e) {
          }
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
          showToast("Loaded offline cached song chords and lyrics", "success");
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
          console.warn("Error reading local song lines override:", e);
        }
      }
      const normalizedLines = filteredLines.map((l, index) => {
        const chordsVal = l.Chords !== void 0 ? l.Chords : l.chords !== void 0 ? l.chords : "";
        const lyricsVal = l.Lyrics !== void 0 ? l.Lyrics : l.lyrics !== void 0 ? l.lyrics : "";
        const sectionVal = l.SectionName || l.Section || l.section || "Section";
        const orderVal = l.Order !== void 0 && l.Order !== "" ? Number(l.Order) : l.order !== void 0 && l.order !== "" ? Number(l.order) : index + 1;
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
      normalizedLines.sort((a, b) => a.Order - b.Order);
      setSongLines(normalizedLines);
      const templates = {};
      normalizedLines.forEach((l) => {
        const secName = l.SectionName || l.Section || l.section || "Section";
        if (!templates[secName]) {
          templates[secName] = [];
        }
        templates[secName].push(l);
      });
      setSectionTemplates(templates);
      const roadmap = [];
      const original = [];
      let lastSec = "";
      let blockIdCounter = 0;
      normalizedLines.forEach((l) => {
        const secName = l.SectionName || l.Section || l.section || "Section";
        if (secName !== lastSec) {
          const lineIndices = Array.from(
            { length: templates[secName].length },
            (_, idx) => idx
          );
          const block = {
            id: `block-${blockIdCounter++}`,
            name: secName,
            enabledLines: lineIndices,
            keyOffset: 0
          };
          roadmap.push(block);
          original.push({ ...block, enabledLines: [...lineIndices] });
          lastSec = secName;
        }
      });
      let loadedCustomRoadmap = false;
      const activeFolder2 = activeFolderOverride !== void 0 ? activeFolderOverride : activeSetlistFolder;
      if (!forceDefaultArrangement && activeFolder2) {
        const setPreset = getSetlistArrangement(activeFolder2, String(song.SongID));
        if (setPreset) {
          try {
            const settings = JSON.parse(setPreset.RoadmapJSON);
            if (settings && settings.roadmap && settings.roadmap.length > 0) {
              const mappedRoadmap = settings.roadmap.map((b) => ({
                id: b.id,
                name: b.name,
                enabledLines: [...b.enabledLines || []],
                keyOffset: b.keyOffset || 0
              }));
              setActiveRoadmap(mappedRoadmap);
              loadedCustomRoadmap = true;
              if (settings.snapshotSections) {
                setLoadedSnapshotSections(settings.snapshotSections);
              } else {
                setLoadedSnapshotSections(null);
              }
              let foundName = "";
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
            console.error("Error parsing setlist arrangement inside load:", e);
          }
        }
      }
      if (!forceDefaultArrangement && !loadedCustomRoadmap) {
        const rawSavedArr = localStorage.getItem("captured_song_settings");
        if (rawSavedArr) {
          try {
            const dict = JSON.parse(rawSavedArr);
            const savedSettings2 = dict[String(song.SongID)];
            if (savedSettings2 && savedSettings2.roadmap && savedSettings2.roadmap.length > 0) {
              setActiveRoadmap(savedSettings2.roadmap);
              loadedCustomRoadmap = true;
              if (savedSettings2.snapshotSections) {
                setLoadedSnapshotSections(savedSettings2.snapshotSections);
              } else {
                setLoadedSnapshotSections(null);
              }
            }
          } catch (e) {
            console.error("Error loading captured roadmap:", e);
          }
        }
      }
      if (!loadedCustomRoadmap) {
        setActiveRoadmap(roadmap);
        setLoadedSnapshotSections(null);
      }
      setOriginalRoadmap(original);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8e3);
        let fetchArr = true;
        let arrVersion = null;
        try {
          const metaRaw = localStorage.getItem("cached_metadata");
          if (metaRaw) {
            const metaData = JSON.parse(metaRaw);
            const row = metaData.find((m) => m.TabName === "Arrangements");
            arrVersion = row ? String(row.Version || row.LastUpdated || row.Date || row.version) : null;
            const cachedArrVersion = localStorage.getItem("cached_arrangements_version");
            if (arrVersion && cachedArrVersion === arrVersion && localStorage.getItem("cached_arrangements")) {
              fetchArr = false;
              const list = JSON.parse(localStorage.getItem("cached_arrangements") || "[]");
              if (Array.isArray(list)) {
                setSyncedSheetArrangements(
                  list.filter((arr) => String(arr.SongID) === String(song.SongID))
                );
                console.log("Using cached Arrangements based on metadata version.");
              }
            }
          }
        } catch (e) {
        }
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
            localStorage.setItem("cached_arrangements", JSON.stringify(presetsList));
            setAllSharedArrangements(presetsList);
            if (arrVersion) {
              localStorage.setItem("cached_arrangements_version", arrVersion);
            }
            setSyncedSheetArrangements(
              presetsList.filter((arr) => String(arr.SongID) === String(song.SongID))
            );
          }
          const setlistsList = JSON.parse(setlistsText);
          if (Array.isArray(setlistsList)) {
            const mappedSetlists = setlistsList.map((row) => ({
              PresetName: row.Set || row.PresetName || "",
              RoadmapJSON: row["Songs & Arrangements"] || row.RoadmapJSON || "{}"
            }));
            localStorage.setItem("cached_setlists_meta", JSON.stringify(mappedSetlists));
            setAllSharedSetlists(mappedSetlists);
          }
        }
        clearTimeout(timeoutId);
      } catch (remoteError) {
        console.warn("Failed to fetch remote arrangements, checking cache", remoteError);
        try {
          const cacheRaw = localStorage.getItem("cached_arrangements");
          if (cacheRaw) {
            const list = JSON.parse(cacheRaw);
            if (Array.isArray(list)) {
              setAllSharedArrangements(list);
              const matchedArrangements = list.filter((arr) => String(arr.SongID) === String(song.SongID));
              setSyncedSheetArrangements(matchedArrangements);
              if (matchedArrangements.length > 0) {
                showToast("Loaded cached offline arrangement roadmap", "info");
              }
            }
          }
          const cacheSetlistsRaw = localStorage.getItem("cached_setlists_meta");
          if (cacheSetlistsRaw) {
            const setlistsList = JSON.parse(cacheSetlistsRaw);
            if (Array.isArray(setlistsList)) {
              const mappedSetlists = setlistsList.map((row) => ({
                PresetName: row.Set || row.PresetName || "",
                RoadmapJSON: row["Songs & Arrangements"] || row.RoadmapJSON || "{}"
              }));
              setAllSharedSetlists(mappedSetlists);
            }
          }
          return;
        } catch (e) {
        }
        setSyncedSheetArrangements([]);
      }
    } catch (e) {
      showToast(e.message || "Error syncing song sheets data", "error");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    if (!currentSong || !activeRoadmap || activeRoadmap.length === 0) return;
    const isInternalName = !currentArrangementName || currentArrangementName.startsWith("Set:");
    if (!isInternalName) return;
    const presets = getPresets();
    for (const presetName of Object.keys(presets)) {
      if (presetName.startsWith("Set:")) continue;
      const presetData = presets[presetName];
      const isObject = presetData && typeof presetData === "object" && !Array.isArray(presetData);
      const blocksArray = isObject ? presetData.roadmap || [] : presetData;
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
        setCurrentArrangementName(presetName);
        break;
      }
    }
  }, [activeRoadmap, syncedSheetArrangements, allSharedArrangements, currentSong]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (currentSong) {
          toggleAutoscroll();
        }
      } else if (e.key === "[") {
        if (currentSong) {
          shiftKey(-1);
        }
      } else if (e.key === "]") {
        if (currentSong) {
          shiftKey(1);
        }
      } else if (e.key === "=") {
        adjustZoom(0.1);
      } else if (e.key === "-") {
        adjustZoom(-0.1);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullScreen();
      } else if (e.key === "Escape") {
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSong, isScrollingActive, currentKey, arrangerOpen, isArrangementLocked, roadmapBackup, nameBackup]);
  const shiftKey = (direction) => {
    const currentIdx = NOTES.indexOf(currentKey);
    if (currentIdx === -1) return;
    const newIdx = (currentIdx + direction + 12) % 12;
    setCurrentKey(NOTES[newIdx]);
    showToast(`Transposed Key to: ${NOTES[newIdx]}`, "success");
  };
  const adjustZoom = (amount) => {
    setLyricZoom((prev) => Math.max(0.6, Math.min(1.5, prev + amount)));
  };
  const toggleFullScreen = () => {
    const doc = document;
    const docEl = document.documentElement;
    const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    if (!isFullscreen) {
      const requestFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
      if (requestFS) {
        requestFS.call(docEl).catch(() => {
          showToast("Fullscreen navigation not supported in this frame.", "error");
        });
      } else {
        showToast("Fullscreen is not supported by your browser.", "error");
      }
    } else {
      const exitFS = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitFS) {
        exitFS.call(doc);
      }
    }
  };
  const handleTapTempo = () => {
    const now = Date.now();
    let updatedTaps = [...tapTimestamps];
    if (updatedTaps.length > 0 && now - updatedTaps[updatedTaps.length - 1] > 3e3) {
      updatedTaps = [];
    }
    updatedTaps.push(now);
    setTapTimestamps(updatedTaps);
    if (updatedTaps.length > 1) {
      const intervals = [];
      for (let i = 1; i < updatedTaps.length; i++) {
        intervals.push(updatedTaps[i] - updatedTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const calculatedBpm = Math.round(6e4 / avgInterval);
      setBpm(Math.max(40, Math.min(250, calculatedBpm)));
      const suggestedSpeed = Math.max(0.1, Math.min(20, calculatedBpm / 25));
      setScrollSpeed(suggestedSpeed);
      showToast("Tempo & Scroll Rate Synced!", "success");
    } else {
      showToast("Keep tapping to sync BPM...", "info");
    }
  };
  const handleDragStart = (idx) => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
      return;
    }
    setDraggedBlockIndex(idx);
  };
  const handleDrop = (targetIdx) => {
    if (isArrangementLocked) return;
    if (draggedBlockIndex !== null && draggedBlockIndex !== targetIdx) {
      const next = [...activeRoadmap];
      const [item] = next.splice(draggedBlockIndex, 1);
      next.splice(targetIdx, 0, item);
      setActiveRoadmap(next);
      showToast("Arrangement sequence updated!", "success");
    }
    setDraggedBlockIndex(null);
  };
  const deleteRoadmapBlock = (idx) => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
      return;
    }
    if (activeRoadmap.length <= 1) {
      showToast("Arrangement must contain at least one section block!", "error");
      return;
    }
    const next = [...activeRoadmap];
    const removed = next[idx];
    next.splice(idx, 1);
    setActiveRoadmap(next);
    if (editingBlockId === removed.id) {
      setEditingBlockId(null);
    }
    showToast("Section removed from sequence", "info");
  };
  const addRoadmapBlock = (sectionName) => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
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
        keyOffset: 0
      }
    ]);
    showToast(`Appended ${sectionName} to live layout!`, "success");
  };
  const resetRoadmapBlocks = () => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
      return;
    }
    setActiveRoadmap(
      originalRoadmap.map((b) => ({
        ...b,
        enabledLines: [...b.enabledLines || []],
        keyOffset: 0
      }))
    );
    setEditingBlockId(null);
    showToast("Restored default song arrangement", "info");
  };
  const adjustBlockModulation = (blockId, direction) => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
      return;
    }
    const next = activeRoadmap.map((b) => {
      if (b.id === blockId) {
        const offset = Math.max(-11, Math.min(11, (b.keyOffset || 0) + direction));
        const targetKey = getModulatedKeyName(currentKey, offset);
        showToast(`Modulated block key to: ${targetKey}`, "success");
        return { ...b, keyOffset: offset };
      }
      return b;
    });
    setActiveRoadmap(next);
  };
  const toggleLineInBlock = (blockId, lIdx) => {
    if (isArrangementLocked) {
      showToast("Arrangement is locked. Click 'Modify' to unlock and edit.", "warning");
      return;
    }
    const next = activeRoadmap.map((b) => {
      if (b.id === blockId) {
        let lines = [...b.enabledLines || []];
        if (lines.includes(lIdx)) {
          if (lines.length <= 1) {
            showToast("A roadmap block must render at least one active line!", "error");
            return b;
          }
          lines = lines.filter((x) => x !== lIdx);
        } else {
          lines.push(lIdx);
          lines.sort((a, b2) => a - b2);
        }
        return { ...b, enabledLines: lines };
      }
      return b;
    });
    setActiveRoadmap(next);
  };
  const getPresets = () => {
    const obj = {};
    const seenNormalized = /* @__PURE__ */ new Set();
    syncedSheetArrangements.forEach((p) => {
      if (p.PresetName && p.PresetName.startsWith("Set: ")) {
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
    }
    return obj;
  };
  const loadPresetArrangement = (name) => {
    let presetData = null;
    let found = false;
    if (name.startsWith("Set: ")) {
      const match = syncedSheetArrangements.find((p) => p.PresetName === name);
      if (match) {
        try {
          presetData = JSON.parse(match.RoadmapJSON);
          found = true;
        } catch {
        }
      }
    }
    if (!found) {
      const presets = getPresets();
      if (presets[name]) {
        presetData = presets[name];
        found = true;
      }
    }
    if (found && presetData) {
      const isObject = presetData && typeof presetData === "object" && !Array.isArray(presetData);
      const blocksArray = isObject ? presetData.roadmap || [] : presetData;
      if (!Array.isArray(blocksArray)) {
        showToast("Invalid arrangement format", "error");
        return;
      }
      if (isObject && presetData.snapshotSections) {
        setLoadedSnapshotSections(presetData.snapshotSections);
      } else {
        setLoadedSnapshotSections(null);
      }
      setActiveRoadmap(
        blocksArray.map((b, idx) => ({
          id: b.id || `block-${idx}`,
          name: b.name || "Section",
          enabledLines: b.enabledLines ? [...b.enabledLines] : [],
          keyOffset: b.keyOffset || 0
        }))
      );
      if (isObject && presetData.key) {
        setCurrentKey(presetData.key);
      } else {
        setCurrentKey(currentSong?.OriginalKey || "C");
      }
      setEditingBlockId(null);
      setIsArrangementLocked(true);
      let friendlyName = name;
      if (name.startsWith("Set: ")) {
        friendlyName = isObject && presetData.arrangementName ? presetData.arrangementName : "Custom Arrangement";
      }
      setCurrentArrangementName(friendlyName);
      showToast(`Loaded arrangement: ${friendlyName}. It is locked.`, "success");
    } else {
      showToast(`Could not find arrangement preset: ${name}`, "error");
    }
  };
  const updateSetlistArrangementDirectly = async (songId, roadmap, targetKey, optArrangementName) => {
    if (activeSetlistFolder && isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
      showToast("This setlist is locked by an admin. Key/arrangement applied locally only.", "info");
      try {
        const rawSaved = localStorage.getItem("captured_song_settings") || "{}";
        const dict = JSON.parse(rawSaved);
        dict[songId] = {
          key: targetKey,
          roadmap,
          arrangementName: optArrangementName || currentArrangementName,
          snapshotSections: sectionTemplates
        };
        localStorage.setItem("captured_song_settings", JSON.stringify(dict));
      } catch (err) {
        console.error("Error saving local fallback:", err);
      }
      return;
    }
    setIsLoading(true);
    try {
      const targetArrName = optArrangementName !== void 0 ? optArrangementName : currentArrangementName;
      const capturedSettings = {
        key: targetKey,
        roadmap,
        arrangementName: targetArrName,
        snapshotSections: sectionTemplates
      };
      const payloadArrangement = {
        action: "saveArrangement",
        songId,
        name: `Set: ${activeSetlistFolder}`,
        roadmap: capturedSettings
      };
      fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadArrangement)
      });
      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === activeSetlistFolder
      );
      let songIds = [];
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
        } catch {
        }
      }
      if (!songIds.includes(songId)) {
        songIds.push(songId);
      }
      const payloadMeta = {
        action: "saveSetlist",
        name: activeSetlistFolder,
        roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder) }
      };
      fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payloadMeta)
      });
      showToast(`Setlist arrangement updated in the shared catalog!`, "success");
    } catch (err) {
      console.error("Error syncing setlist arrangement:", err);
    } finally {
      try {
        const rawSaved = localStorage.getItem("captured_song_settings") || "{}";
        const dict = JSON.parse(rawSaved);
        dict[songId] = { key: targetKey, roadmap };
        localStorage.setItem("captured_song_settings", JSON.stringify(dict));
        showToast("Saved setlist arrangement locally", "success");
      } catch (err) {
        console.error("Error saving local fallback:", err);
      }
      try {
        await refetchArrangements();
      } catch (e) {
        console.warn("Failed to refetch arrangements", e);
      }
      setIsLoading(false);
    }
  };
  const executeSaveArrangement = async (name, shouldApplyToSetlist, roadmapToSave) => {
    setIsLoading(true);
    try {
      const richRoadmap = {
        roadmap: roadmapToSave,
        key: currentKey,
        arrangementName: name,
        snapshotSections: sectionTemplates
      };
      const payload = {
        action: "saveArrangement",
        songId: String(currentSong?.SongID),
        name,
        roadmap: richRoadmap
      };
      const res = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const textResponse = await res.text();
      const result = JSON.parse(textResponse);
      if (result.status === "success") {
        showToast(`Preset "${name}" synced with the shared catalog!`, "success");
      } else {
        throw new Error(result.message || "Spreadsheet save failed");
      }
      if (shouldApplyToSetlist && activeSetlistFolder && currentSong) {
        if (isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
          const rawSaved = localStorage.getItem("captured_song_settings") || "{}";
          const dict = JSON.parse(rawSaved);
          dict[String(currentSong.SongID)] = {
            key: currentKey,
            roadmap: roadmapToSave,
            arrangementName: name,
            snapshotSections: sectionTemplates
          };
          localStorage.setItem("captured_song_settings", JSON.stringify(dict));
          showToast(`This setlist is locked by an admin. Your arrangement changes are saved locally only.`, "info");
        } else {
          const capturedSettings = {
            key: currentKey,
            roadmap: roadmapToSave,
            arrangementName: name,
            snapshotSections: sectionTemplates
          };
          const payloadArrangement = {
            action: "saveArrangement",
            songId: String(currentSong.SongID),
            name: `Set: ${activeSetlistFolder}`,
            roadmap: capturedSettings
          };
          fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payloadArrangement)
          });
          const existingMeta = allSharedSetlists.find(
            (sl) => sl.PresetName === activeSetlistFolder
          );
          let songIds = [];
          if (existingMeta) {
            try {
              const parsed = JSON.parse(existingMeta.RoadmapJSON);
              songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
            } catch {
            }
          }
          const sId = String(currentSong.SongID);
          if (!songIds.includes(sId)) {
            songIds.push(sId);
          }
          const payloadMeta = {
            action: "saveSetlist",
            name: activeSetlistFolder,
            roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder) }
          };
          fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payloadMeta)
          });
          showToast(`Successfully loaded arrangement to active setlist: ${activeSetlistFolder}`, "success");
        }
      }
    } catch {
      let localObj = {};
      try {
        const localRaw = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (localRaw) {
          localObj = JSON.parse(localRaw);
        }
      } catch {
      }
      const richRoadmap = {
        roadmap: roadmapToSave,
        key: currentKey,
        arrangementName: name,
        snapshotSections: sectionTemplates
      };
      localObj[name] = richRoadmap;
      localStorage.setItem(`custom_arrangements_${currentSong?.SongID}`, JSON.stringify(localObj));
      showToast(`Saved locally on this device as "${name}"`, "success");
      if (shouldApplyToSetlist && currentSong) {
        const rawSaved = localStorage.getItem("captured_song_settings") || "{}";
        const dict = JSON.parse(rawSaved);
        dict[String(currentSong.SongID)] = {
          key: currentKey,
          roadmap: roadmapToSave,
          arrangementName: name,
          snapshotSections: sectionTemplates
        };
        localStorage.setItem("captured_song_settings", JSON.stringify(dict));
        showToast(`Loaded arrangement to active setlist locally on this device`, "success");
      }
    } finally {
      const cachedBackupRoadmap = roadmapBackup;
      const cachedBackupName = nameBackup;
      setIsArrangementLocked(true);
      setRoadmapBackup(null);
      setNameBackup("");
      let latestArrs = [];
      try {
        const fetched = await refetchArrangements();
        latestArrs = fetched?.presets || [];
      } catch (e) {
        console.warn("Failed to refetch arrangements:", e);
      }
      if (!shouldApplyToSetlist && activeSetlistFolder && currentSong) {
        if (cachedBackupRoadmap !== null) {
          setActiveRoadmap(cachedBackupRoadmap);
          setCurrentArrangementName(cachedBackupName || "");
          showToast(`Setlist arrangement kept intact and restored on screen.`, "info");
        } else {
          executeSongLoad(currentSong, false, void 0, latestArrs.length > 0 ? latestArrs : void 0);
          showToast(`Setlist arrangement kept intact and restored on screen.`, "info");
        }
      } else {
        setCurrentArrangementName(name);
      }
      setIsLoading(false);
    }
  };
  const savePresetArrangement = async () => {
    const isLockedSetlist = activeSetlistFolder && isSetlistLocked(activeSetlistFolder);
    const isLockedSetlistViewer = isLockedSetlist && !(appUser && appSecret);
    let name = currentArrangementName.trim().toUpperCase();
    if (!name) {
      showToast("Please enter an arrangement preset name first", "error");
      return;
    }
    if (name.startsWith("SET: ")) {
      name = name.slice(5);
    }
    if (name.startsWith("Set: ")) {
      name = name.slice(5);
    }
    const { baseName } = parsePresetDate(name);
    const enteredBaseName = baseName.toUpperCase();
    const newFullName = enteredBaseName;
    const presets = getPresets();
    const existingPresetKey = Object.keys(presets).find((k) => {
      const { baseName: pBase } = parsePresetDate(k);
      return pBase.toUpperCase() === enteredBaseName;
    });
    const isModifyingExisting = !!existingPresetKey;
    if (isModifyingExisting) {
      setSaveArrangementConfirmation({
        name: newFullName,
        oldName: existingPresetKey,
        isOverwrite: true,
        shouldPromptApplyToSetlist: false,
        roadmap: activeRoadmap
      });
    } else {
      const shouldPromptApplyToSetlist = !!activeSetlistFolder && !!currentSong;
      if (shouldPromptApplyToSetlist) {
        setSaveArrangementConfirmation({
          name: newFullName,
          isOverwrite: false,
          shouldPromptApplyToSetlist: true,
          roadmap: activeRoadmap
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
    if (nameBackup !== "") {
      setCurrentArrangementName(nameBackup);
      setNameBackup("");
    }
    setIsArrangementLocked(true);
    showToast("Cancelled editing. Reverted changes.", "info");
  };
  const deletePresetArrangement = async (name, isCurrentlyActive) => {
    if (activeSetlistFolder && isSetlistLocked(activeSetlistFolder) && !(appUser && appSecret)) {
      showToast("This setlist is locked by an admin. Deleting arrangements is disabled.", "error");
      return;
    }
    setIsLoading(true);
    const { baseName } = parsePresetDate(name);
    try {
      const rawSaved = localStorage.getItem("captured_song_settings");
      if (rawSaved) {
        try {
          const dict = JSON.parse(rawSaved);
          if (dict[String(currentSong?.SongID)]) {
            delete dict[String(currentSong?.SongID)];
            localStorage.setItem("captured_song_settings", JSON.stringify(dict));
          }
        } catch (e) {
        }
      }
      if (isCurrentlyActive) {
        setCurrentArrangementName("");
      }
      const payload = {
        action: "deleteArrangement",
        songId: String(currentSong?.SongID),
        name
      };
      const res = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.status === "success") {
        showToast(`Deleted from shared library: ${baseName}`, "info");
      } else {
        throw new Error();
      }
    } catch {
      showToast(`Could not delete from cloud, but cleaning up locally.`, "info");
    } finally {
      try {
        const localRaw = localStorage.getItem(`custom_arrangements_${currentSong?.SongID}`);
        if (localRaw) {
          const localObj = JSON.parse(localRaw);
          let deletedAny = false;
          Object.keys(localObj).forEach((k) => {
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
        console.warn("Failed to clean local custom_arrangements:", e);
      }
      if (isCurrentlyActive && activeSetlistFolder && currentSong) {
        try {
          const existingMeta = allSharedSetlists.find((sl) => sl.PresetName === activeSetlistFolder);
          let songIds = [];
          let arrangements = {};
          if (existingMeta) {
            try {
              const parsed = JSON.parse(existingMeta.RoadmapJSON);
              songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
              if (parsed.arrangements) {
                arrangements = parsed.arrangements;
              }
            } catch {
            }
          }
          const sId = String(currentSong.SongID);
          if (arrangements[sId]) {
            delete arrangements[sId];
          }
          const payloadMeta = {
            action: "saveSetlist",
            name: activeSetlistFolder,
            roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder), arrangements }
          };
          fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify(payloadMeta)
          });
        } catch (e) {
          console.warn("Failed to delete setlist mapping:", e);
        }
      }
      let latestArrs = [];
      try {
        const fetched = await refetchArrangements();
        latestArrs = fetched?.presets || [];
      } catch (e) {
        console.warn("Failed to refetch arrangements:", e);
      }
      if (isCurrentlyActive && currentSong) {
        const presets = getPresets();
        const remainingKeys = Object.keys(presets).filter((k) => !k.startsWith("Set:"));
        const availableList = remainingKeys.map((k) => {
          const p = presets[k];
          return {
            name: k,
            roadmap: Array.isArray(p) ? p : p.roadmap || [],
            key: p.key || currentKey
          };
        });
        executeSongLoad(currentSong, true, void 0, latestArrs.length > 0 ? latestArrs : void 0);
        setArrangementReplacementModal({
          songId: String(currentSong.SongID),
          deletedName: baseName,
          availablePresets: availableList
        });
      }
      setIsLoading(false);
    }
  };
  const handleVerifyAdmin = async () => {
    if (!adminUsernameInput || !adminPasswordInput) {
      showToast("Enter both Username and Passkey!", "error");
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        action: "verifyAdmin",
        user: adminUsernameInput.trim(),
        passkey: adminPasswordInput.trim()
      };
      const res = fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        setAppUser(adminUsernameInput.trim());
        setAppSecret(adminPasswordInput.trim());
        setIsAdminModalOpen(false);
        showToast("Successfully Authenticated!", "success");
      } else {
        showToast("Incorrect Username or Passkey!", "error");
      }
    } catch {
      showToast("Authentication server issue. Try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };
  const handleAdminLockToggle = () => {
    if (appUser && appSecret) {
      setAppUser("");
      setAppSecret("");
      showToast("Admin mode locked. Returned to View Only.", "info");
    } else {
      setAdminUsernameInput("");
      setAdminPasswordInput("");
      setIsAdminModalOpen(true);
    }
  };
  const handleTriggerCapability = (cap) => {
    if (!currentSong) {
      showToast("Select a song from the Menu first!", "info");
      return;
    }
    if (cap === "focus") {
      showToast("Focus Mode: Tap directly on any lyric line to isolate it!", "info");
      const firstLine = document.querySelector(".line-block");
      if (firstLine) {
        setFocusedLineId("line-block-0");
        firstLine.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (cap === "transpose") {
      shiftKey(1);
    } else if (cap === "metronome") {
      setIsMetronomeActive((prev) => !prev);
      showToast(!isMetronomeActive ? "Metronome Activated!" : "Metronome Paused", !isMetronomeActive ? "success" : "info");
    } else if (cap === "autoscroll") {
      toggleAutoscroll();
    }
    setIsNavOpen(false);
  };
  const renderFamilyChordsList = (simplified = false) => {
    if (!currentSong) return null;
    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const qualities = ["", "m", "m", "", "", "m", "dim"];
    const degrees = ["1", "2", "3", "4", "5", "6", "7"];
    const keyIdx = NOTE_TO_INDEX[currentKey];
    if (keyIdx === void 0) return null;
    const useSharps = ["G", "D", "A", "E", "B", "F#", "C#"].includes(currentKey);
    const scaleNotes = useSharps ? ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    return /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3", children: [
      !simplified && /* @__PURE__ */ jsx("span", { className: "text-[10px] sm:text-xs text-indigo-400 uppercase tracking-widest font-extrabold flex-shrink-0 select-none drop-shadow-sm", children: "Family Chords:" }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 sm:gap-2.5 font-mono", children: degrees.map((deg, i) => {
        const noteIdx = (keyIdx + intervals[i]) % 12;
        const rawChord = `${scaleNotes[noteIdx]}${qualities[i]}`;
        return /* @__PURE__ */ jsxs(
          "span",
          {
            onClick: (e) => {
              e.stopPropagation();
              setSelectedChord(rawChord);
              setIsMusicianModalOpen(true);
            },
            className: "bg-indigo-500/20 border border-indigo-500/30 backdrop-blur-sm px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-indigo-50 font-bold shadow-sm transition-all hover:bg-sky-500/40 hover:text-white hover:scale-105 active:scale-95 cursor-help text-xs sm:text-sm",
            children: [
              /* @__PURE__ */ jsx("span", { className: "text-indigo-400/80 mr-1.5", children: deg }),
              rawChord
            ]
          },
          deg
        );
      }) })
    ] });
  };
  const parseClickableChords = (transposedLine, blockKeyName) => {
    if (!transposedLine) return "";
    return transposedLine.split(/(\s+|-)/).map((part, pIdx) => {
      if (part.trim() && !part.includes("-")) {
        return /* @__PURE__ */ jsx(
          "span",
          {
            className: "hover:text-sky-300 hover:underline cursor-help transition-all duration-150 inline-block px-0.5 active:scale-110",
            onClick: (e) => {
              e.stopPropagation();
              setSelectedChord(part.trim());
              setIsMusicianModalOpen(true);
            },
            children: part
          },
          pIdx
        );
      }
      return /* @__PURE__ */ jsx("span", { children: part }, pIdx);
    });
  };
  const getSongPreviewData = (song) => {
    let filteredLines = [];
    try {
      const rawLines = localStorage.getItem("cached_song_lines");
      if (rawLines) {
        const allLines = JSON.parse(rawLines);
        if (Array.isArray(allLines)) {
          filteredLines = allLines.filter(
            (line) => line && String(line.SongID) === String(song.SongID)
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
    const templates = {};
    filteredLines.forEach((l) => {
      const secName = l.SectionName || l.Section || l.section || "Section";
      if (!templates[secName]) {
        templates[secName] = [];
      }
      templates[secName].push(l);
    });
    let activeKey = song.OriginalKey || "C";
    let activeRoadmapToUse = [];
    let lastSec = "";
    let blockIdCounter = 0;
    const standardRoadmap = [];
    filteredLines.forEach((l) => {
      const secName = l.SectionName || l.Section || l.section || "Section";
      if (secName !== lastSec) {
        const lineIndices = Array.from(
          { length: templates[secName].length },
          (_, idx) => idx
        );
        standardRoadmap.push({
          id: `block-${blockIdCounter++}`,
          name: secName,
          enabledLines: lineIndices,
          keyOffset: 0
        });
        lastSec = secName;
      }
    });
    activeRoadmapToUse = standardRoadmap;
    const rawSaved = localStorage.getItem("captured_song_settings");
    let savedSettings = null;
    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        savedSettings = dict[String(song.SongID)];
      } catch (e) {
      }
    }
    if (savedSettings) {
      if (savedSettings.key) activeKey = savedSettings.key;
      if (savedSettings.roadmap && savedSettings.roadmap.length > 0) {
        activeRoadmapToUse = savedSettings.roadmap;
      }
    }
    if (activeSetlistFolder) {
      const existingMeta = allSharedSetlists.find((sl) => sl.PresetName === activeSetlistFolder);
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          if (parsed.arrangements && parsed.arrangements[String(song.SongID)]) {
            const arr = parsed.arrangements[String(song.SongID)];
            if (arr.key) activeKey = arr.key;
            if (arr.roadmap && arr.roadmap.length > 0) activeRoadmapToUse = arr.roadmap;
          }
        } catch (e) {
        }
      }
    }
    return { song, activeKey, activeRoadmapToUse, templates };
  };
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-[#020205] text-white relative overflow-x-hidden font-sans selection:bg-indigo-500/30", children: [
    isPDFPreviewOpen && currentSong && (() => {
      const isInsideSetlistContext = !!activeSetlistFolder && setlists.length > 1;
      let previewSongsData = [];
      if (!isInsideSetlistContext || pdfScope === "current") {
        previewSongsData = [getSongPreviewData(currentSong)];
      } else if (pdfScope === "all") {
        const resolvedSetSongs = setlists.map((id) => songs.find((s) => String(s.SongID) === String(id))).filter((s) => !!s);
        previewSongsData = resolvedSetSongs.map((s) => getSongPreviewData(s));
      } else if (pdfScope === "custom") {
        const resolvedSetSongs = setlists.map((id) => songs.find((s) => String(s.SongID) === String(id))).filter((s) => !!s);
        previewSongsData = resolvedSetSongs.filter((s) => pdfSelectedSongIds.includes(String(s.SongID))).map((s) => getSongPreviewData(s));
      } else {
        previewSongsData = [getSongPreviewData(currentSong)];
      }
      return /* @__PURE__ */ jsx("div", { className: "fixed inset-0 bg-[#020205]/90 backdrop-blur-md z-[800] flex items-center justify-center p-4 md:p-6 select-none animate-fadeIn", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-5xl h-[90vh] bg-[#0c0d1b] border border-indigo-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-scaleIn", children: [
        /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx("span", { className: "text-xl sm:text-2xl", children: "\u{1F4C4}" }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h2", { className: "text-sm sm:text-base font-black uppercase tracking-wider text-indigo-300", children: "PDF Print Preview" }),
              /* @__PURE__ */ jsx("p", { className: "text-[10px] text-gray-400 font-medium", children: "Inspect your layout, customize options in real-time, and download/print the A4 song sheet." })
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsPDFPreviewOpen(false),
              className: "text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all active:scale-95 cursor-pointer",
              children: "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row", children: [
          /* @__PURE__ */ jsxs("div", { className: "w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 p-5 shrink-0 bg-indigo-950/15 overflow-visible md:overflow-y-auto", children: [
            /* @__PURE__ */ jsx("h3", { className: "text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4", children: "Print Customization" }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
              isInsideSetlistContext && /* @__PURE__ */ jsxs("div", { className: "space-y-2 select-none border-b border-white/5 pb-4", children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-gray-300 uppercase tracking-wider block", children: "Include in Export" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: pdfScope,
                    onChange: (e) => setPdfScope(e.target.value),
                    className: "w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "current", className: "bg-[#0c0d1b]", children: "Viewed Song Only" }),
                      /* @__PURE__ */ jsx("option", { value: "all", className: "bg-[#0c0d1b]", children: "All Songs in Setlist" }),
                      /* @__PURE__ */ jsx("option", { value: "custom", className: "bg-[#0c0d1b]", children: "Select Songs..." })
                    ]
                  }
                ),
                pdfScope === "custom" && /* @__PURE__ */ jsxs("div", { className: "mt-3 bg-[#020205]/60 border border-white/5 rounded-xl p-2.5 max-h-[160px] overflow-y-auto custom-scrollbar space-y-2", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-[8px] font-black uppercase text-indigo-400 tracking-wider block", children: "CHECK SONGS TO INCLUDE" }),
                  setlists.map((id) => songs.find((s) => String(s.SongID) === String(id))).filter((s) => !!s).map((song, sIdx) => {
                    const sIdStr = String(song.SongID);
                    const isChecked = pdfSelectedSongIds.includes(sIdStr);
                    return /* @__PURE__ */ jsxs(
                      "label",
                      {
                        className: "flex items-center gap-2 text-[10px] font-semibold text-gray-300 hover:text-white cursor-pointer select-none leading-tight",
                        children: [
                          /* @__PURE__ */ jsx(
                            "input",
                            {
                              type: "checkbox",
                              checked: isChecked,
                              onChange: () => {
                                if (isChecked) {
                                  setPdfSelectedSongIds((prev) => prev.filter((id) => id !== sIdStr));
                                } else {
                                  setPdfSelectedSongIds((prev) => [...prev, sIdStr]);
                                }
                              },
                              className: "accent-indigo-500 rounded border-white/10"
                            }
                          ),
                          /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
                            /* @__PURE__ */ jsxs("span", { className: "text-gray-500 font-bold mr-1", children: [
                              "#",
                              sIdx + 1
                            ] }),
                            song.Title
                          ] })
                        ]
                      },
                      song.SongID
                    );
                  })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-gray-300 uppercase tracking-wider block", children: "Display Mode" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: displayMode,
                    onChange: (e) => setDisplayMode(e.target.value),
                    className: "w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "both", className: "bg-[#0c0d1b]", children: "Show Chords & Numbers" }),
                      /* @__PURE__ */ jsx("option", { value: "chords", className: "bg-[#0c0d1b]", children: "Chords Only" }),
                      /* @__PURE__ */ jsx("option", { value: "numbers", className: "bg-[#0c0d1b]", children: "Numbers Only" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-gray-300 uppercase tracking-wider block", children: "Lyrics Visibility" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: showLyrics ? "true" : "false",
                    onChange: (e) => setShowLyrics(e.target.value === "true"),
                    className: "w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "true", className: "bg-[#0c0d1b]", children: "Show Lyrics" }),
                      /* @__PURE__ */ jsx("option", { value: "false", className: "bg-[#0c0d1b]", children: "Hide Lyrics" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-gray-300 uppercase tracking-wider block", children: "Sheet Layout Mode" }),
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: sheetLayoutMode,
                    onChange: (e) => setSheetLayoutMode(e.target.value),
                    className: "w-full bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-100 py-2 px-3 rounded-xl text-[10px] uppercase font-bold outline-none focus:ring-2 focus:ring-indigo-400/60 border border-indigo-500/30 hover:border-indigo-400/50 transition-all cursor-pointer shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]",
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "sequence", className: "bg-[#0c0d1b]", children: "Flow Sequence" }),
                      /* @__PURE__ */ jsx("option", { value: "compact", className: "bg-[#0c0d1b]", children: "Compact" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] font-bold text-gray-300 uppercase tracking-wider block", children: "Transposed Key (Viewed Song)" }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-1 bg-[#020205]/40 p-1.5 rounded-xl border border-white/5", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => {
                        const keys = Object.keys(NOTE_TO_INDEX);
                        const currIdx = keys.indexOf(currentKey);
                        const prevIdx = (currIdx - 1 + keys.length) % keys.length;
                        setCurrentKey(keys[prevIdx]);
                      },
                      className: "p-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 text-[10px] font-bold text-indigo-300 cursor-pointer animate-press",
                      children: "\u25C0"
                    }
                  ),
                  /* @__PURE__ */ jsx("span", { className: "text-xs font-mono font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg shadow-inner min-w-[50px] text-center select-none", children: currentKey }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => {
                        const keys = Object.keys(NOTE_TO_INDEX);
                        const currIdx = keys.indexOf(currentKey);
                        const nextIdx = (currIdx + 1) % keys.length;
                        setCurrentKey(keys[nextIdx]);
                      },
                      className: "p-1 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 text-[10px] font-bold text-indigo-300 cursor-pointer animate-press",
                      children: "\u25B6"
                    }
                  )
                ] })
              ] }),
              previewSongsData.length > 1 && /* @__PURE__ */ jsxs("div", { className: "space-y-2 border-t border-white/5 pt-4 animate-fadeIn", children: [
                /* @__PURE__ */ jsxs("label", { className: "text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx("span", { children: "\u{1F3B9}" }),
                  " Transpose Individual Songs"
                ] }),
                /* @__PURE__ */ jsx("div", { className: "space-y-2 bg-[#020205]/40 p-2.5 rounded-xl border border-indigo-500/10 max-h-[220px] overflow-y-auto custom-scrollbar", children: previewSongsData.map((songData, sIdx) => {
                  const songIdStr = String(songData.song.SongID);
                  const resolvedKey = pdfSongKeys[songIdStr] || songData.key;
                  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0", children: [
                    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                      /* @__PURE__ */ jsxs("div", { className: "text-[9.5px] font-extrabold text-white truncate uppercase", children: [
                        sIdx + 1,
                        ". ",
                        songData.song.Title
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "text-[8.5px] text-indigo-300 font-mono", children: [
                        "Orig: ",
                        songData.song.OriginalKey || "C"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx(
                      "select",
                      {
                        value: resolvedKey,
                        onChange: (e) => {
                          const newKey = e.target.value;
                          setPdfSongKeys((prev) => ({
                            ...prev,
                            [songIdStr]: newKey
                          }));
                          showToast(`Transposed "${songData.song.Title}" to ${newKey}`, "success");
                        },
                        className: "bg-indigo-950/50 text-indigo-200 border border-indigo-500/30 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer hover:bg-indigo-900/60 transition-all shadow-sm",
                        children: NOTES.map((k) => /* @__PURE__ */ jsxs("option", { value: k, className: "bg-[#0c0d1b] text-indigo-100 font-bold", children: [
                          "Key of ",
                          k
                        ] }, k))
                      }
                    )
                  ] }, songIdStr);
                }) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1.5 select-none", children: [
                /* @__PURE__ */ jsxs("span", { className: "text-[9px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx("span", { children: "\u{1F4A1}" }),
                  " Live Adjustments"
                ] }),
                /* @__PURE__ */ jsx("p", { className: "text-[9.5px] text-gray-400 leading-normal font-medium", children: "Changing settings on the left will immediately re-render your preview on the right and update the final printed file." })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 bg-black/45 p-4 sm:p-6 overflow-visible md:overflow-y-auto flex items-start justify-center custom-scrollbar select-text", children: /* @__PURE__ */ jsx("div", { className: "w-full max-w-[210mm] bg-white text-slate-900 shadow-2xl rounded-lg p-6 sm:p-10 font-sans border border-slate-200 space-y-12", children: previewSongsData.map((songData, sIdx) => {
            const { key: songKey, roadmap: songRoadmap, sectionTemplates: songTemplates, title, artist, song } = songData;
            const repInfo2 = getRoadmapRepetitionInfo(songRoadmap);
            return /* @__PURE__ */ jsxs("div", { className: `print-song-page-preview ${sIdx > 0 ? "border-t-2 border-slate-200 pt-10 mt-10" : ""}`, children: [
              /* @__PURE__ */ jsxs("div", { className: "border-b-2 border-slate-900 pb-2 mb-4 flex justify-between items-end", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsxs("h1", { className: "text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-none uppercase flex items-center gap-2", children: [
                    setlists.length > 1 && pdfScope !== "current" && /* @__PURE__ */ jsxs("span", { className: "text-[11px] bg-slate-900 text-white font-extrabold px-1.5 py-0.5 rounded", children: [
                      "#",
                      setlists.indexOf(String(song.SongID)) + 1
                    ] }),
                    /* @__PURE__ */ jsx("span", { children: title })
                  ] }),
                  /* @__PURE__ */ jsxs("h2", { className: "text-[10px] font-bold text-slate-500 mt-1 uppercase", children: [
                    "BY ",
                    artist
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "text-xs font-black text-indigo-600 border border-indigo-600 px-2 py-0.5 rounded-md font-mono select-none", children: [
                  "KEY: ",
                  songKey.toUpperCase()
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "bg-slate-50 border border-slate-200 rounded-md p-2.5 mb-5 select-none", children: [
                /* @__PURE__ */ jsx("div", { className: "text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1", children: "FLOW ROADMAP (TRANSPOSED SEQUENCE)" }),
                /* @__PURE__ */ jsx("div", { className: "text-[9.5px] font-bold text-slate-800 leading-normal", children: (() => {
                  const renderedRoadmap = [];
                  songRoadmap.forEach((block, idx) => {
                    const isDuplicate = songRoadmap.findIndex((b, bIdx) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates)) !== -1;
                    if (isDuplicate) return;
                    renderedRoadmap.push({ block, originalIdx: idx });
                  });
                  return renderedRoadmap.map(({ block, originalIdx: idx }, rIdx) => {
                    const blockOffset = block.keyOffset || 0;
                    const blockKeyName = getModulatedKeyName(songKey, blockOffset);
                    return /* @__PURE__ */ jsxs("span", { children: [
                      rIdx > 0 && /* @__PURE__ */ jsx("span", { className: "text-slate-400 mx-1", children: "\u2794" }),
                      /* @__PURE__ */ jsxs("span", { className: "uppercase text-indigo-900 font-bold", children: [
                        block.name,
                        " ",
                        /* @__PURE__ */ jsxs("span", { className: "text-[8.5px] text-indigo-600 font-extrabold", children: [
                          "(",
                          blockKeyName,
                          ")"
                        ] })
                      ] })
                    ] }, block.id);
                  });
                })() })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "space-y-4", children: songRoadmap.map((block, idx) => {
                let blockDisplayName = block.name;
                if (sheetLayoutMode === "sequence") {
                  const firstIdenticalIdx = songRoadmap.findIndex((b, bIdx) => bIdx < idx && areBlocksLyricsAndChordsIdentical(b, block, songTemplates));
                  if (firstIdenticalIdx !== -1) {
                    return /* @__PURE__ */ jsx(
                      "div",
                      {
                        className: "p-2 mb-2 bg-slate-50 border border-dashed border-indigo-200 rounded text-[10px] font-bold text-indigo-600 flex items-center justify-between select-none",
                        children: /* @__PURE__ */ jsxs("span", { children: [
                          "\u{1F501} REPLAY: ",
                          block.name.toUpperCase(),
                          " (Same chords & lyrics as section #",
                          firstIdenticalIdx + 1,
                          " - ",
                          songRoadmap[firstIdenticalIdx].name,
                          ")"
                        ] })
                      },
                      block.id
                    );
                  }
                }
                if (sheetLayoutMode === "compact") {
                  if (!showLyrics) {
                    const firstIdx = songRoadmap.findIndex((b) => areBlocksChordsIdentical(b, block, songTemplates));
                    if (firstIdx !== idx) return null;
                    const identicalBlocks = songRoadmap.filter((b) => areBlocksChordsIdentical(b, block, songTemplates));
                    const uniqueNames = Array.from(new Set(identicalBlocks.map((b) => b.name)));
                    blockDisplayName = uniqueNames.join(" / ");
                  } else {
                    const firstIdx = songRoadmap.findIndex((b) => b.name === block.name);
                    if (firstIdx !== idx) return null;
                  }
                }
                const blockRep = repInfo2[idx];
                const templateLines = songTemplates[block.name] || [];
                const blockOffset = block.keyOffset || 0;
                const blockKeyName = getModulatedKeyName(songKey, blockOffset);
                const originalIdx = NOTE_TO_INDEX[song.OriginalKey || "C"] || 0;
                const currentIdx = NOTE_TO_INDEX[songKey] || 0;
                const totalSemitonesOffset = currentIdx - originalIdx + blockOffset;
                return /* @__PURE__ */ jsxs("div", { className: "break-inside-avoid", children: [
                  /* @__PURE__ */ jsxs("h3", { className: "text-[11px] font-black text-indigo-950 uppercase tracking-wide border-b border-slate-200 pb-0.5 mb-1.5 select-none flex items-center justify-between", children: [
                    /* @__PURE__ */ jsxs("span", { children: [
                      blockDisplayName,
                      " ",
                      blockOffset !== 0 ? `(KEY: ${blockKeyName})` : ""
                    ] }),
                    blockRep && blockRep.totalInRun > 1 && /* @__PURE__ */ jsxs("span", { className: "text-[8px] bg-amber-100 text-amber-800 border border-amber-300 rounded px-1.5 py-0.5 font-mono font-black select-none", children: [
                      blockRep.totalInRun,
                      "x"
                    ] })
                  ] }),
                  !showLyrics && /* @__PURE__ */ jsx("div", { className: "mb-2 p-1.5 bg-slate-100 border-l-2 border-indigo-500 rounded-r text-[10px] font-medium text-slate-600 italic select-none", children: (() => {
                    if (sheetLayoutMode === "compact") {
                      const identicalBlocks = songRoadmap.filter((b) => areBlocksChordsIdentical(b, block, songTemplates));
                      const renderedHints = [];
                      const seenNames = /* @__PURE__ */ new Set();
                      identicalBlocks.forEach((b) => {
                        if (seenNames.has(b.name)) return;
                        seenNames.add(b.name);
                        const lines = songTemplates[b.name] || [];
                        const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== "")?.Lyrics;
                        if (firstLyric) {
                          renderedHints.push({ name: b.name, lyric: firstLyric });
                        }
                      });
                      if (renderedHints.length > 0) {
                        const groups = [];
                        renderedHints.forEach((h) => {
                          const normLyric = h.lyric.trim();
                          const existingGroup = groups.find((g) => g.lyric.trim().toLowerCase() === normLyric.toLowerCase());
                          if (existingGroup) {
                            existingGroup.names.push(h.name);
                          } else {
                            groups.push({ lyric: h.lyric, names: [h.name] });
                          }
                        });
                        return groups.map((g, gIdx) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-1 rounded border border-indigo-100 not-italic", children: g.names.map((n) => n.toUpperCase()).join(" & ") }),
                          /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
                            "\u201C",
                            g.lyric,
                            "\u201D"
                          ] }),
                          g.names.length > 1 && /* @__PURE__ */ jsx("span", { className: "text-[7px] font-bold text-emerald-600 uppercase bg-emerald-50 px-1 rounded border border-emerald-100", children: "Shared 1st line" })
                        ] }, gIdx));
                      }
                    } else {
                      const lines = songTemplates[block.name] || [];
                      const firstLyric = lines.find((l) => l.Lyrics && l.Lyrics.trim() !== "")?.Lyrics;
                      if (firstLyric) {
                        return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
                          /* @__PURE__ */ jsx("span", { className: "font-bold text-indigo-600 not-italic", children: "Hint:" }),
                          /* @__PURE__ */ jsxs("span", { className: "truncate", children: [
                            "\u201C",
                            firstLyric,
                            "\u201D"
                          ] })
                        ] });
                      }
                    }
                    return null;
                  })() }),
                  /* @__PURE__ */ jsx("div", { className: "pl-1.5 space-y-1", children: (() => {
                    const enabledLinesList = templateLines.map((l, lIdx) => ({ l, lIdx })).filter(({ lIdx }) => (block.enabledLines || []).includes(lIdx));
                    const processedLines = enabledLinesList.map(({ l, lIdx }) => {
                      const transposed = transposeChord(l.Chords || "", totalSemitonesOffset);
                      const numbers = getNumberForChord(transposed, blockKeyName, songKey);
                      const lyrics = l.Lyrics || "";
                      return {
                        l,
                        lIdx,
                        transposed,
                        numbers,
                        lyrics
                      };
                    });
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
                            if (processedLines[offset].transposed && processedLines[offset].transposed.trim() !== "") {
                              hasChords = true;
                              break;
                            }
                          }
                          if (hasChords) {
                            if (bestL === -1 || K * L > bestK * bestL || K * L === bestK * bestL && L < bestL) {
                              bestL = L;
                              bestK = K;
                            }
                          }
                        }
                      }
                    }
                    if (bestL >= 2 && bestK >= 2) {
                      const loopLength = bestL;
                      const repeatCount = bestK;
                      const loopedLinesCount = loopLength * repeatCount;
                      const lyricsAreIdenticalOrHidden = !showLyrics || (() => {
                        for (let r = 1; r < repeatCount; r++) {
                          for (let offset = 0; offset < loopLength; offset++) {
                            const lineA = processedLines[offset];
                            const lineB = processedLines[r * loopLength + offset];
                            if ((lineA.lyrics || "") !== (lineB.lyrics || "")) {
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
                          /* @__PURE__ */ jsxs(
                            "div",
                            {
                              className: "border-l-3 border-amber-500 bg-amber-50 rounded-r-lg px-2.5 py-2 my-2 space-y-1",
                              children: [
                                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-1 select-none", children: [
                                  /* @__PURE__ */ jsxs("span", { className: "text-[8px] font-mono font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm", children: [
                                    /* @__PURE__ */ jsx("span", { children: "\u{1F501}" }),
                                    " PLAY ",
                                    repeatCount,
                                    "X"
                                  ] }),
                                  /* @__PURE__ */ jsx("span", { className: "text-[8px] text-amber-600 font-mono tracking-wide", children: "(chords progression repeats)" })
                                ] }),
                                /* @__PURE__ */ jsx("div", { className: "space-y-1", children: runLines.map((lineData) => {
                                  const { lIdx, transposed, numbers, lyrics } = lineData;
                                  return /* @__PURE__ */ jsxs("div", { className: "break-inside-avoid", children: [
                                    displayMode !== "numbers" && transposed && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5", children: transposed }),
                                    displayMode !== "chords" && numbers && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5", children: numbers }),
                                    showLyrics && lyrics && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-800 leading-tight", children: lyrics })
                                  ] }, lIdx);
                                }) })
                              ]
                            },
                            "loop-run-single"
                          )
                        );
                      } else {
                        for (let r = 0; r < repeatCount; r++) {
                          const runLines = processedLines.slice(r * loopLength, (r + 1) * loopLength);
                          loopContainers.push(
                            /* @__PURE__ */ jsxs(
                              "div",
                              {
                                className: "border-l-3 border-indigo-500 bg-indigo-50 rounded-r-lg px-2.5 py-2 my-2 space-y-1",
                                children: [
                                  /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2 mb-1 select-none", children: r === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
                                    /* @__PURE__ */ jsxs("span", { className: "text-[8px] font-mono font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm", children: [
                                      /* @__PURE__ */ jsx("span", { children: "\u{1F501}" }),
                                      " CHORD LOOP (",
                                      repeatCount,
                                      "X) \u2014 ROUND 1"
                                    ] }),
                                    /* @__PURE__ */ jsx("span", { className: "text-[8px] text-indigo-600 font-mono tracking-wide", children: "(chords progression pattern repeats)" })
                                  ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                                    /* @__PURE__ */ jsxs("span", { className: "text-[8px] font-mono font-black uppercase tracking-wider text-indigo-800 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 flex items-center gap-1 shadow-sm", children: [
                                      /* @__PURE__ */ jsx("span", { children: "\u{1F501}" }),
                                      " ROUND ",
                                      r + 1
                                    ] }),
                                    /* @__PURE__ */ jsx("span", { className: "text-[8px] text-gray-500 font-mono tracking-wide", children: "(identical chords as Round 1)" })
                                  ] }) }),
                                  /* @__PURE__ */ jsx("div", { className: "space-y-1", children: runLines.map((lineData) => {
                                    const { lIdx, transposed, numbers, lyrics } = lineData;
                                    return /* @__PURE__ */ jsxs("div", { className: "break-inside-avoid", children: [
                                      displayMode !== "numbers" && transposed && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5", children: transposed }),
                                      displayMode !== "chords" && numbers && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5", children: numbers }),
                                      showLyrics && lyrics && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-800 leading-tight", children: lyrics })
                                    ] }, lIdx);
                                  }) })
                                ]
                              },
                              `loop-run-${r}`
                            )
                          );
                        }
                      }
                      const remainingLines = processedLines.slice(loopedLinesCount);
                      return /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
                        loopContainers,
                        remainingLines.length > 0 && /* @__PURE__ */ jsx("div", { className: "pt-2 space-y-1 border-t border-dashed border-slate-200", children: remainingLines.map((lineData) => {
                          const { lIdx, transposed, numbers, lyrics } = lineData;
                          return /* @__PURE__ */ jsxs("div", { className: "break-inside-avoid", children: [
                            displayMode !== "numbers" && transposed && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5", children: transposed }),
                            displayMode !== "chords" && numbers && /* @__PURE__ */ jsx("div", { className: "font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5", children: numbers }),
                            showLyrics && lyrics && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-800 leading-tight", children: lyrics })
                          ] }, lIdx);
                        }) })
                      ] });
                    }
                    const lineRuns = [];
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
                        count: j - i
                      });
                      i = j;
                    }
                    return lineRuns.map((run) => {
                      const firstLine = processedLines[run.startIndex];
                      const { lIdx, transposed, numbers, lyrics } = firstLine;
                      return /* @__PURE__ */ jsxs("div", { className: "break-inside-avoid", children: [
                        displayMode !== "numbers" && transposed && /* @__PURE__ */ jsxs("div", { className: "font-mono font-bold text-[11px] text-indigo-700 whitespace-pre leading-none mb-0.5 flex items-center gap-2 flex-wrap", children: [
                          /* @__PURE__ */ jsx("span", { children: transposed }),
                          run.count > 1 && /* @__PURE__ */ jsxs("span", { className: "text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide", children: [
                            run.count,
                            "x"
                          ] })
                        ] }),
                        displayMode !== "chords" && numbers && /* @__PURE__ */ jsxs("div", { className: "font-mono font-bold text-[10px] text-slate-500 whitespace-pre leading-none mb-0.5 flex items-center gap-2 flex-wrap", children: [
                          /* @__PURE__ */ jsx("span", { children: numbers }),
                          run.count > 1 && displayMode === "numbers" && /* @__PURE__ */ jsxs("span", { className: "text-[8px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 font-mono font-black select-none tracking-wide", children: [
                            run.count,
                            "x"
                          ] })
                        ] }),
                        showLyrics && lyrics && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-800 leading-tight", children: lyrics })
                      ] }, lIdx);
                    });
                  })() })
                ] }, block.id);
              }) })
            ] }, song.SongID);
          }) }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 border-t border-white/5 bg-[#080812] flex items-center justify-between shrink-0 gap-3", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsPDFPreviewOpen(false),
              className: "px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => {
                exportToPDF();
                setIsPDFPreviewOpen(false);
              },
              className: "px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-500/10 cursor-pointer flex items-center gap-1.5",
              children: [
                /* @__PURE__ */ jsx("span", { children: "\u{1F5A8}\uFE0F" }),
                /* @__PURE__ */ jsx("span", { children: "Print / Save as PDF" })
              ]
            }
          )
        ] })
      ] }) });
    })(),
    /* @__PURE__ */ jsx("div", { id: "toastContainer", className: "fixed bottom-6 right-4 sm:right-6 z-[950] flex flex-col gap-2 pointer-events-none w-full max-w-[90vw] sm:max-w-xs", children: toasts.map((toast) => {
      let theme = "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
      let symbol = "\u2139";
      if (toast.type === "success") {
        theme = "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
        symbol = "\u2713";
      } else if (toast.type === "error") {
        theme = "bg-rose-500/10 text-rose-300 border-rose-500/20";
        symbol = "\u2715";
      } else if (toast.type === "warning") {
        theme = "bg-amber-500/10 text-amber-300 border-amber-500/20";
        symbol = "\u26A0\uFE0F";
      }
      return /* @__PURE__ */ jsxs(
        "div",
        {
          className: `p-4 rounded-2xl backdrop-blur-xl shadow-2xl text-xs font-semibold tracking-wide border pointer-events-auto flex items-center gap-2 w-full animate-fadeIn ${theme}`,
          children: [
            /* @__PURE__ */ jsx("span", { className: "text-base flex-shrink-0", children: symbol }),
            /* @__PURE__ */ jsx("span", { children: toast.message })
          ]
        },
        toast.id
      );
    }) })
  ] });
}
