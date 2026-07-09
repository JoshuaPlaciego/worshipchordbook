import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Song, SongLine, RoadmapBlock } from '../types';
import { transposeChord } from '../utils';
import { 
  Music, Plus, Trash2, Lock, Unlock, Save, RefreshCw, 
  Sparkles, ChevronRight, ChevronLeft, Layers, Grid, Type, 
  Activity, ArrowLeftRight, Copy, Database, HelpCircle, 
  Download, ListCollapse, Eye, EyeOff, Radio, Sliders, Play
} from 'lucide-react';

interface ArrangementDAWModalProps {
  arrangerOpen: boolean;
  setArrangerOpen: (open: boolean) => void;
  activeRoadmap: RoadmapBlock[];
  setActiveRoadmap: (rmap: RoadmapBlock[]) => void;
  editingBlockId: string | null;
  setEditingBlockId: (id: string | null) => void;
  isArrangementLocked: boolean;
  setIsArrangementLocked: (locked: boolean) => void;
  currentArrangementName: string;
  setCurrentArrangementName: (name: string) => void;
  sectionTemplates: { [sectionName: string]: SongLine[] };
  setSectionTemplates: React.Dispatch<React.SetStateAction<{ [sectionName: string]: SongLine[] }>>;
  loadedSnapshotSections: { [sectionName: string]: SongLine[] } | null;
  setLoadedSnapshotSections: React.Dispatch<React.SetStateAction<{ [sectionName: string]: SongLine[] } | null>>;
  effectiveSectionTemplates: { [sectionName: string]: SongLine[] };
  currentSong: Song | null;
  songs: Song[];
  songLines: SongLine[];
  showToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  adjustBlockModulation: (id: string, dir: number) => void;
  deleteRoadmapBlock: (idx: number) => void;
  addRoadmapBlock: (name: string) => void;
  resetRoadmapBlocks: () => void;
  cancelArrangementEdit: () => void;
  executeSaveArrangement: (name: string, isDefault: boolean, rmap: any[]) => Promise<any>;
  loadPresetArrangement: (name: string) => void;
  deletePresetArrangement: (name: string, isActive: boolean) => void;
  getPresets: () => any;
  fetchCatalog: () => Promise<void>;
  getModulatedKeyName: (key: string, offset: number) => string;
  currentKey: string;
}

export const ArrangementDAWModal: React.FC<ArrangementDAWModalProps> = ({
  arrangerOpen,
  setArrangerOpen,
  activeRoadmap,
  setActiveRoadmap,
  editingBlockId,
  setEditingBlockId,
  isArrangementLocked,
  setIsArrangementLocked,
  currentArrangementName,
  setCurrentArrangementName,
  sectionTemplates,
  setSectionTemplates,
  loadedSnapshotSections,
  setLoadedSnapshotSections,
  effectiveSectionTemplates,
  currentSong,
  songs,
  songLines,
  showToast,
  adjustBlockModulation,
  deleteRoadmapBlock,
  addRoadmapBlock,
  resetRoadmapBlocks,
  cancelArrangementEdit,
  executeSaveArrangement,
  loadPresetArrangement,
  deletePresetArrangement,
  getPresets,
  fetchCatalog,
  getModulatedKeyName,
  currentKey,
}) => {
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDirectorMode, setIsDirectorMode] = useState(true);
  const [isManualOpen, setIsManualOpen] = useState(false);
  
  // Pull from other song states
  const [isPulling, setIsPulling] = useState(false);
  const [pullSourceSongId, setPullSourceSongId] = useState('');
  const [pullSourceSectionName, setPullSourceSectionName] = useState('');
  
  // Drag and Drop State
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  // Timeline Ref for horizontal scroll tracking and Minimap viewport
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const [timelineScrollState, setTimelineScrollState] = useState({ scrollLeft: 0, scrollWidth: 1, clientWidth: 1 });

  // Update timeline viewport measurements
  const handleTimelineScroll = () => {
    if (timelineViewportRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = timelineViewportRef.current;
      setTimelineScrollState({ scrollLeft, scrollWidth: scrollWidth || 1, clientWidth: clientWidth || 1 });
    }
  };

  useEffect(() => {
    if (arrangerOpen) {
      setTimeout(handleTimelineScroll, 200);
    }
  }, [arrangerOpen, activeRoadmap]);

  // Compute stats for HUD
  const hudStats = useMemo(() => {
    const totalBlocks = activeRoadmap.length;
    let totalLinesIncluded = 0;
    let totalLinesTemplates = 0;

    activeRoadmap.forEach(block => {
      totalLinesIncluded += (block.enabledLines || []).length;
      const templates = effectiveSectionTemplates[block.name] || [];
      totalLinesTemplates += templates.length;
    });

    const signalDensity = totalLinesTemplates > 0 
      ? Math.round((totalLinesIncluded / totalLinesTemplates) * 100) 
      : 0;

    // Estimate playing time (assuming ~12 seconds per line average based on standard slow/fast BPM)
    const bpm = currentSong?.BPM || 100;
    const beatMultiplier = 120 / bpm; // Adjust tempo multiplier
    const estimatedSeconds = Math.round(totalLinesIncluded * 8 * beatMultiplier);
    const estMinutes = Math.floor(estimatedSeconds / 60);
    const estRemainingSecs = estimatedSeconds % 60;

    return {
      totalBlocks,
      totalLinesIncluded,
      signalDensity,
      estMinutes,
      estRemainingSecs,
      bpm
    };
  }, [activeRoadmap, effectiveSectionTemplates, currentSong]);

  // Section Color Map for cinematic DAW-like aesthetic
  const getSectionColor = (name: string) => {
    const norm = name.toLowerCase();
    if (norm.includes('intro')) return { bg: 'bg-emerald-950/40', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-500' };
    if (norm.includes('chorus')) return { bg: 'bg-rose-950/40', border: 'border-rose-500/30', glow: 'shadow-rose-500/10', text: 'text-rose-400', bar: 'bg-rose-500' };
    if (norm.includes('verse')) return { bg: 'bg-indigo-950/40', border: 'border-indigo-500/30', glow: 'shadow-indigo-500/10', text: 'text-indigo-400', bar: 'bg-indigo-500' };
    if (norm.includes('bridge')) return { bg: 'bg-fuchsia-950/40', border: 'border-fuchsia-500/30', glow: 'shadow-fuchsia-500/10', text: 'text-fuchsia-400', bar: 'bg-fuchsia-500' };
    if (norm.includes('outro')) return { bg: 'bg-amber-950/40', border: 'border-amber-500/30', glow: 'shadow-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500' };
    if (norm.includes('instrumental') || norm.includes('solo')) return { bg: 'bg-cyan-950/40', border: 'border-cyan-500/30', glow: 'shadow-cyan-500/10', text: 'text-cyan-400', bar: 'bg-cyan-500' };
    return { bg: 'bg-slate-900/60', border: 'border-slate-500/30', glow: 'shadow-slate-500/10', text: 'text-slate-300', bar: 'bg-slate-500' };
  };

  if (!arrangerOpen) return null;

  const activeSelectedBlock = activeRoadmap.find((b) => b.id === editingBlockId) || activeRoadmap[0];

  // Helper for rendering SVG Signal Connect Rails
  const renderConnectRail = (idx: number) => {
    return (
      <div className="absolute right-[-24px] top-[40%] transform -translate-y-1/2 z-10 pointer-events-none hidden md:block">
        <svg width="24" height="24" viewBox="0 0 24 24" className="w-6 h-6">
          <path 
            d="M 0 12 L 24 12" 
            stroke="url(#daw-gradient)" 
            strokeWidth="2.5" 
            fill="none" 
            className="animate-pulse"
            strokeDasharray="6 3"
          />
          <defs>
            <linearGradient id="daw-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#020205]/95 backdrop-blur-xl z-[850] flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-hidden">
      <div className={`w-full max-w-[1300px] h-[95vh] bg-[#070814] border rounded-2xl flex flex-col overflow-hidden relative transition-all duration-300 ${
        isDirectorMode 
          ? 'border-indigo-500/30 shadow-[0_0_80px_rgba(99,102,241,0.25)]' 
          : 'border-teal-500/40 shadow-[0_0_80px_rgba(20,184,166,0.25)]'
      }`}>
        
        {/* TOP GLOWING HUD (Heads-Up Display) BAR */}
        <div className="bg-[#0b0c20]/90 border-b border-indigo-500/15 px-4 py-3 flex flex-wrap items-center justify-between gap-3 relative shrink-0">
          <div className={`absolute top-0 left-0 w-full h-[2px] animate-pulse transition-all duration-300 bg-gradient-to-r ${
            isDirectorMode 
              ? 'from-indigo-500 via-purple-500 to-rose-500' 
              : 'from-teal-500 via-emerald-500 to-cyan-500'
          }`} />
          
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br border flex items-center justify-center text-lg shrink-0 animate-pulse transition-all duration-300 ${
              isDirectorMode
                ? 'from-indigo-600/30 to-indigo-900/40 border-indigo-500/40 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                : 'from-teal-600/30 to-teal-900/40 border-teal-500/40 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]'
            }`}>
              🎛️
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-black/80 border border-indigo-500/30 rounded-lg p-1 select-none font-mono text-[9px] font-black shadow-inner">
                  <button
                    onClick={() => {
                      setIsDirectorMode(false);
                      showToast('Switched to Stage-Safe Basic User Mode', 'info');
                    }}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      !isDirectorMode 
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-[0_0_8px_rgba(20,184,166,0.15)] font-black' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>👤</span>
                    <span>BASIC USER (STAGE SAFE)</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsDirectorMode(true);
                      showToast('Switched to Director Studio Mode', 'success');
                    }}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      isDirectorMode 
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-[0_0_8px_rgba(99,102,241,0.2)] font-black' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🎛️</span>
                    <span>DIRECTOR (FULL EDITOR)</span>
                  </button>
                </div>
                {isArrangementLocked && (
                  <span className="text-[9px] font-mono font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                    LOCKED
                  </span>
                )}
              </div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                <span>{currentSong?.Title || 'Song'} Arranger Studio</span>
                <span className="text-[10px] text-indigo-300 font-bold font-mono">({currentKey})</span>
              </h2>
            </div>
          </div>

          {/* HUD Dashboard */}
          <div className="flex items-center gap-4 bg-black/40 border border-indigo-500/10 rounded-xl px-4 py-1.5 text-left font-mono">
            <div className="hidden sm:flex flex-col border-r border-indigo-500/10 pr-4">
              <span className="text-[8px] text-indigo-400 uppercase tracking-wider">Timeline Length</span>
              <span className="text-xs font-black text-slate-100 flex items-center gap-1">
                {hudStats.totalBlocks} <span className="text-[9px] text-indigo-300">BLOCKS</span>
              </span>
            </div>
            <div className="flex flex-col border-r border-indigo-500/10 pr-4">
              <span className="text-[8px] text-indigo-400 uppercase tracking-wider">Est. Duration</span>
              <span className="text-xs font-black text-emerald-400">
                {hudStats.estMinutes}m {hudStats.estRemainingSecs}s
              </span>
            </div>
            <div className="hidden md:flex flex-col border-r border-indigo-500/10 pr-4">
              <span className="text-[8px] text-indigo-400 uppercase tracking-wider">Signal Density</span>
              <span className="text-xs font-black text-rose-400 flex items-center gap-1">
                {hudStats.signalDensity}% <Activity className="w-3 h-3 text-rose-500 animate-pulse" />
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-indigo-400 uppercase tracking-wider">TEMPO BPM</span>
              <span className="text-xs font-black text-amber-400 flex items-center gap-1">
                {hudStats.bpm} <span className="text-[8px] text-gray-500">BPM</span>
              </span>
            </div>
          </div>

          {/* Quick HUD controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManualOpen(true)}
              className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/35 text-indigo-300 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-indigo-500/10"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>How To Use</span>
            </button>

            <button
              onClick={() => setIsArrangementLocked(!isArrangementLocked)}
              className={`p-2 rounded-lg border font-mono text-[10px] uppercase font-bold tracking-widest transition-all cursor-pointer flex items-center gap-1.5 ${
                isArrangementLocked 
                  ? 'bg-amber-950/30 border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
              }`}
            >
              {isArrangementLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isArrangementLocked ? 'Locked' : 'Unlocked'}</span>
            </button>

            <button
              onClick={() => setArrangerOpen(false)}
              className="px-3 py-2 bg-indigo-950/40 hover:bg-rose-950/40 border border-indigo-500/25 hover:border-rose-500/30 text-indigo-300 hover:text-rose-200 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Close Studio
            </button>
          </div>
        </div>

        {/* MAIN STUDIO LAYOUT CONTAINER: Side Controls + Timeline Workspace */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-[#04040a]">
          
          {/* LEFT SIDEBAR: "DIRECTOR DECK" */}
          {isDirectorMode && (
            <div className="w-72 border-r border-indigo-500/15 bg-[#08091a]/95 flex flex-col overflow-y-auto custom-scrollbar shrink-0 hidden lg:flex p-4 gap-4 text-left">
            
            {/* SIGNAL INJECTOR: Click to Insert Block */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 border-b border-indigo-500/10 pb-2">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                  Signal Ingestor Panel
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium leading-normal -mt-1 mb-1">
                Inject audio sequence blocks straight into your live timeline deck.
              </p>
              
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(effectiveSectionTemplates).map((secName) => {
                  const colors = getSectionColor(secName);
                  return (
                    <button
                      key={secName}
                      disabled={isArrangementLocked}
                      onClick={() => {
                        addRoadmapBlock(secName);
                        showToast(`Injected ${secName} block!`, 'success');
                      }}
                      className={`px-3 py-2 border rounded-xl text-left font-sans font-black uppercase text-[10px] tracking-wider transition-all cursor-pointer flex flex-col justify-between h-14 relative overflow-hidden group select-none active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${colors.bg} ${colors.border} ${colors.text}`}
                    >
                      {/* Stylized waveform inside button on hover */}
                      <div className="absolute bottom-0 right-0 left-0 h-[6px] opacity-20 group-hover:opacity-40 flex items-end gap-0.5 px-2 transition-all">
                        <div className={`w-1 h-[20%] ${colors.bar} group-hover:h-[80%] transition-all duration-300`} />
                        <div className={`w-1 h-[60%] ${colors.bar} group-hover:h-[40%] transition-all duration-200`} />
                        <div className={`w-1 h-[30%] ${colors.bar} group-hover:h-[90%] transition-all duration-400`} />
                        <div className={`w-1 h-[80%] ${colors.bar} group-hover:h-[50%] transition-all duration-300`} />
                      </div>
                      <span className="text-[8px] font-mono font-bold opacity-60">INJECT +</span>
                      <span className="truncate pr-4">{secName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PRESETS ENGINE: Shared Band Presets */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-indigo-500/10 mt-2">
              <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                    Master Presets Deck
                  </span>
                </div>
                
                <button
                  onClick={async () => {
                    setIsSyncing(true);
                    try {
                      await fetchCatalog();
                      showToast('Studio catalog synced securely with Cloud!', 'success');
                    } catch (e) {
                      showToast('Cloud Catalog synchronization failed.', 'error');
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  title="Force cloud synchronization"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Saved Arrangements list */}
              {(() => {
                const presets = getPresets();
                const presetNames = Object.keys(presets).filter(name => !name.startsWith('Set:'));
                if (presetNames.length === 0) {
                  return (
                    <div className="text-gray-500 italic text-[10px] py-4 text-center bg-black/20 rounded-xl border border-dashed border-indigo-500/10">
                      No presets saved yet
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                    {presetNames.map((name) => {
                      const isActive = currentArrangementName === name;
                      return (
                        <div
                          key={name}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                            isActive
                              ? 'bg-indigo-950/40 border-indigo-500/40 text-white'
                              : 'bg-black/20 border-indigo-500/5 text-indigo-200 hover:bg-indigo-900/20'
                          }`}
                        >
                          <button
                            onClick={() => {
                              loadPresetArrangement(name);
                              showToast(`Loaded "${name}" sequence successfully`, 'success');
                            }}
                            className="flex-1 text-left font-sans font-bold text-xs truncate py-0.5 cursor-pointer"
                            title={`Load arrangement: ${name}`}
                          >
                            {name}
                          </button>
                          <button
                            onClick={() => deletePresetArrangement(name, isActive)}
                            className="text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                            title="Delete preset"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Save preset form */}
              <div className="flex flex-col gap-2 mt-1">
                <input
                  type="text"
                  placeholder="Preset name (e.g. Electric)"
                  value={currentArrangementName}
                  onChange={(e) => setCurrentArrangementName(e.target.value)}
                  className="w-full bg-black/40 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-indigo-400"
                />
                <button
                  disabled={isSavingPreset}
                  onClick={async () => {
                    if (!currentArrangementName.trim()) {
                      showToast('Please specify a valid arrangement name!', 'warning');
                      return;
                    }
                    setIsSavingPreset(true);
                    try {
                      await executeSaveArrangement(currentArrangementName.trim(), false, activeRoadmap);
                      fetchCatalog();
                      showToast(`Arrangement "${currentArrangementName}" saved successfully!`, 'success');
                    } catch (e) {
                      showToast('Could not save arrangement preset.', 'error');
                    } finally {
                      setIsSavingPreset(false);
                    }
                  }}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/15"
                >
                  <Save className="w-3 h-3" />
                  <span>Save Sequence</span>
                </button>
              </div>
            </div>

            {/* AUTOMATION DECK: Macro Utilities */}
            <div className="flex flex-col gap-2 pt-2 border-t border-indigo-500/10 mt-auto">
              <div className="flex items-center gap-1.5 border-b border-indigo-500/10 pb-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                  Global Automations
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  disabled={isArrangementLocked || activeRoadmap.length === 0}
                  onClick={() => {
                    resetRoadmapBlocks();
                    showToast('Arrangement reset to default blueprint!', 'info');
                  }}
                  className="py-2 border border-rose-500/20 hover:bg-rose-950/20 text-rose-400 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer text-center select-none active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Reset Default
                </button>
                <button
                  disabled={isArrangementLocked || activeRoadmap.length === 0}
                  onClick={() => {
                    setActiveRoadmap([]);
                    showToast('Timeline cleared!', 'info');
                  }}
                  className="py-2 border border-indigo-500/20 hover:bg-indigo-950/20 text-indigo-300 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer text-center select-none active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Clear All
                </button>
              </div>
            </div>

          </div>
          )}

          {/* MAIN TIMELINE WORKSPACE + DISSECTION EDITOR */}
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* MICRO-SCRUBBER NAVIGATOR: TIMELINE MINIMAP */}
            {activeRoadmap.length > 0 && (
              <div className="bg-[#0b0c20]/40 border-b border-indigo-500/15 px-4 py-3 shrink-0 flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-indigo-400 select-none">
                    🧭 MAP TIMELINE
                  </span>
                </div>
                
                {/* 1D Strip of mini color blocks */}
                <div className="flex-1 h-10 bg-black/40 border border-indigo-500/10 rounded-lg relative flex items-center overflow-hidden p-1">
                  {activeRoadmap.map((block, idx) => {
                    const colors = getSectionColor(block.name);
                    const isSelected = editingBlockId === block.id || (!editingBlockId && idx === 0);
                    return (
                      <div 
                        key={block.id}
                        onClick={() => setEditingBlockId(block.id)}
                        className={`h-full flex-1 mx-0.5 rounded transition-all cursor-pointer flex items-center justify-center text-[10px] font-black uppercase text-white select-none ${colors.bg} ${colors.border} border ${isSelected ? 'ring-2 ring-indigo-400' : 'opacity-85 hover:opacity-100'}`}
                        title={`${block.name} (Block #${idx + 1})`}
                      >
                        {block.name.slice(0, 4)}
                      </div>
                    );
                  })}
                  
                  {/* Dynamic moving highlight viewport lens */}
                  <div 
                    className="absolute top-0 bottom-0 border-r-2 border-l-2 border-indigo-400 bg-indigo-500/15 transition-all duration-300 pointer-events-none"
                    style={{
                      left: `${(timelineScrollState.scrollLeft / timelineScrollState.scrollWidth) * 100}%`,
                      width: `${(timelineScrollState.clientWidth / timelineScrollState.scrollWidth) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}

            {/* DAW WORKSPACE CONTENT CONTAINER */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-4 min-h-0 bg-[#04040a]">
              
              {/* STAGE-SAFE VS COMPOSITION COMPASS HEADS-UP */}
              {!isDirectorMode ? (
                <div className="bg-gradient-to-r from-teal-950/30 to-slate-950/40 border border-teal-500/35 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 text-left shadow-lg select-none relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-500/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/35 flex items-center justify-center text-teal-400 text-lg shrink-0 shadow-[0_0_12px_rgba(20,184,166,0.2)]">
                        🛡️
                      </div>
                      <div>
                        <span className="text-[9px] font-mono font-black uppercase text-teal-400 tracking-widest bg-teal-500/15 px-2 py-0.5 rounded border border-teal-500/20">
                          STAGE-SAFE REHEARSAL PLAY-ALONG ACTIVE
                        </span>
                        <h4 className="text-xs font-bold text-teal-300 mt-0.5">Basic Musician Mode</h4>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setIsDirectorMode(true);
                        showToast('Upgraded to Director Studio Mode', 'success');
                      }}
                      className="self-start sm:self-auto px-3.5 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 hover:border-teal-400 text-teal-200 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shrink-0 animate-pulse"
                    >
                      Unlock Director Deck 🔓
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-300 font-medium leading-relaxed">
                        This mode is optimized for <strong>live performance and rehearsal play-along</strong>. It locks the arrangement timeline and disables destructive editing actions to ensure zero accidental stage disruptions.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-400 bg-black/30 p-2.5 rounded-xl border border-teal-500/10 font-mono">
                      <div className="flex items-center gap-1.5 text-teal-400">
                        <span>🛡️</span> Stage Safe (Locked)
                      </div>
                      <div className="flex items-center gap-1.5 text-rose-400">
                        <span>🔒</span> Timeline Edit Locked
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span>🔓</span> Safe Interactive Sheet
                      </div>
                      <div className="flex items-center gap-1.5 text-rose-400">
                        <span>🔒</span> Preset Deletion Locked
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-indigo-950/20 to-slate-950/40 border border-indigo-500/35 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 text-left shadow-lg select-none relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/35 flex items-center justify-center text-indigo-400 text-lg shrink-0 shadow-[0_0_12px_rgba(99,102,241,0.25)]">
                        ⚡
                      </div>
                      <div>
                        <span className="text-[9px] font-mono font-black uppercase text-indigo-400 tracking-widest bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/20">
                          ORCHESTRATION & COMPOSITION ACTIVE
                        </span>
                        <h4 className="text-xs font-bold text-indigo-300 mt-0.5">Worship Director Mode</h4>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setIsDirectorMode(false);
                        showToast('Locked to Stage-Safe Play-Along Mode', 'info');
                      }}
                      className="self-start sm:self-auto px-3.5 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shrink-0"
                    >
                      Lock Stage Mode 🔒
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-300 font-medium leading-relaxed">
                        This mode gives you <strong>full administrative control over arrangements</strong>. You can completely reshape the song sequence, modulate block keys, edit lyrics/chords templates, and push updates directly to the Google Sheets cloud database.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-400 bg-black/30 p-2.5 rounded-xl border border-indigo-500/10 font-mono">
                      <div className="flex items-center gap-1.5 text-indigo-400">
                        <span>⚡</span> Full Editor (Unlocked)
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span>🔓</span> Drag-and-Drop Timeline
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span>🔓</span> Inject Block Signals
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span>🔓</span> Save Cloud Arrangements
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* SIGNAL INJECTOR: Click to Insert Block (Rendered prominently on top of sequence timeline) */}
              {isDirectorMode && (
                <div className="bg-[#080918]/90 border border-indigo-500/15 rounded-2xl p-4 shadow-xl flex flex-col gap-2.5 text-left">
                  <div className="flex items-center gap-2 border-b border-indigo-500/10 pb-2">
                    <Radio className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                      Signal Ingestor Panel (Inject Blocks Into Timeline Deck)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.keys(effectiveSectionTemplates).map((secName) => {
                      const colors = getSectionColor(secName);
                      return (
                        <button
                          key={secName}
                          disabled={isArrangementLocked}
                          onClick={() => {
                            addRoadmapBlock(secName);
                            showToast(`Injected ${secName} block!`, 'success');
                          }}
                          className={`px-3 py-1.5 border rounded-lg text-left font-sans font-black uppercase text-[10px] tracking-wider transition-all cursor-pointer flex items-center gap-1.5 select-none active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${colors.bg} ${colors.border} ${colors.text}`}
                        >
                          <span className="text-[8px] font-mono font-bold opacity-60">INJECT +</span>
                          <span>{secName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TIMELINE TRACKS HEADER PANEL */}
              <div className="bg-[#080918]/90 border border-indigo-500/15 rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
                
                {/* Multi-track Channel Workspace */}
                <div className="flex flex-col divide-y divide-indigo-500/10 text-left">
                  
                  {/* CHANNEL 1: SECTION CLIPS ROADMAP */}
                  <div className="flex items-stretch min-h-[96px] bg-[#0c0d22]/20 relative">
                    {/* Track Header Title */}
                    <div className="w-24 sm:w-32 bg-indigo-950/20 border-r border-indigo-500/10 flex flex-col justify-center p-3 shrink-0">
                      <span className="text-[8px] font-mono font-black uppercase text-indigo-400 tracking-widest">
                        CH-01
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-200 mt-0.5 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-indigo-400 shrink-0" /> Clips
                      </span>
                      <span className="text-[8px] text-gray-500 mt-1 uppercase font-semibold">
                        Drag to Reorder
                      </span>
                    </div>

                    {/* Draggable blocks scroll area */}
                    <div 
                      ref={timelineViewportRef}
                      onScroll={handleTimelineScroll}
                      className="flex-1 overflow-x-auto custom-scrollbar flex items-center gap-6 px-4 py-4 scroll-smooth"
                    >
                      {activeRoadmap.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-5 text-gray-500 italic text-xs">
                          Timeline empty. Ingest sequence blocks from left Command Deck to begin.
                        </div>
                      ) : (
                        activeRoadmap.map((block, bIdx) => {
                          const blockOffset = block.keyOffset || 0;
                          const blockKeyName = getModulatedKeyName(currentKey, blockOffset);
                          const enabledCount = (block.enabledLines || []).length;
                          const totalCount = (effectiveSectionTemplates[block.name] || []).length;
                          const isSelected = editingBlockId === block.id || (!editingBlockId && bIdx === 0);
                          const colors = getSectionColor(block.name);

                          return (
                            <div
                              key={block.id}
                              draggable={isDirectorMode && !isArrangementLocked}
                              onDragStart={() => {
                                if (isDirectorMode && !isArrangementLocked) setDraggedIdx(bIdx);
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (isDirectorMode && draggedIdx !== null && draggedIdx !== bIdx && !isArrangementLocked) {
                                  const list = [...activeRoadmap];
                                  const [moved] = list.splice(draggedIdx, 1);
                                  list.splice(bIdx, 0, moved);
                                  setActiveRoadmap(list);
                                  setDraggedIdx(null);
                                  showToast('Sequence order updated on Timeline Track!', 'success');
                                }
                              }}
                              onClick={() => setEditingBlockId(block.id)}
                              className={`group min-w-[160px] max-w-[160px] p-3 rounded-xl border relative shrink-0 select-none cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-lg ${
                                isSelected
                                  ? 'border-indigo-400 ring-2 ring-indigo-500/50 bg-[#101230]/90 shadow-[0_4px_25px_rgba(99,102,241,0.2)]'
                                  : 'bg-[#080918]/80 border-indigo-500/10 hover:border-indigo-400/40'
                              }`}
                            >
                              {/* Connector rail SVG line to next block */}
                              {bIdx < activeRoadmap.length - 1 && renderConnectRail(bIdx)}

                              <div className="flex items-center justify-between text-[8px] font-mono font-bold text-indigo-400/70 mb-1">
                                <span>TRACK RUN {bIdx + 1}</span>
                                <span>{enabledCount}/{totalCount} LINES</span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${colors.bar} animate-pulse`} />
                                <h4 className="font-sans font-black uppercase text-xs text-white truncate">
                                  {block.name}
                                </h4>
                              </div>

                              {/* Stylized visual miniature soundwave representation */}
                              <div className="flex items-end gap-1 h-5 mt-2 bg-black/40 border border-white/5 rounded-md px-1.5 py-0.5">
                                {Array.from({ length: 12 }).map((_, waveIdx) => {
                                  const isLive = waveIdx < enabledCount * 2;
                                  const hPercent = [20, 60, 40, 80, 30, 90, 50, 70, 40, 60, 30, 50][waveIdx];
                                  return (
                                    <div 
                                      key={waveIdx} 
                                      className={`w-1 transition-all rounded-sm ${
                                        isLive ? colors.bar + ' opacity-80' : 'bg-gray-800 opacity-30'
                                      }`}
                                      style={{ height: `${hPercent}%` }}
                                    />
                                  );
                                })}
                              </div>

                              {/* Timeline Control Handles */}
                              {isDirectorMode ? (
                                <div className="flex items-center justify-between border-t border-indigo-500/10 pt-2 mt-2 gap-1" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <button
                                      disabled={bIdx === 0 || isArrangementLocked}
                                      onClick={() => {
                                        const next = [...activeRoadmap];
                                        const [item] = next.splice(bIdx, 1);
                                        next.splice(bIdx - 1, 0, item);
                                        setActiveRoadmap(next);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center bg-indigo-900/40 rounded text-[9px] hover:bg-indigo-900/80 text-white cursor-pointer active:scale-95 disabled:opacity-20 disabled:pointer-events-none"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      disabled={bIdx === activeRoadmap.length - 1 || isArrangementLocked}
                                      onClick={() => {
                                        const next = [...activeRoadmap];
                                        const [item] = next.splice(bIdx, 1);
                                        next.splice(bIdx + 1, 0, item);
                                        setActiveRoadmap(next);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center bg-indigo-900/40 rounded text-[9px] hover:bg-indigo-900/80 text-white cursor-pointer active:scale-95 disabled:opacity-20 disabled:pointer-events-none"
                                    >
                                      ▶
                                    </button>
                                  </div>
                                  
                                  <button
                                    disabled={isArrangementLocked}
                                    onClick={() => {
                                      deleteRoadmapBlock(bIdx);
                                      showToast(`Removed timeline index ${bIdx + 1}`, 'info');
                                    }}
                                    className="w-5 h-5 flex items-center justify-center bg-rose-950/40 border border-rose-500/20 rounded hover:bg-rose-600 hover:text-white text-rose-400 text-[10px] cursor-pointer active:scale-90"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="border-t border-teal-500/10 pt-2 mt-2 text-center select-none" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[8px] font-mono font-black text-teal-400 uppercase tracking-widest bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/10">
                                    🔒 Stage Safe Locked
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* CHANNEL 2: HARMONICS GRID (CHORDS & MODULATION) */}
                  <div className="flex items-stretch min-h-[80px]">
                    <div className="w-24 sm:w-32 bg-indigo-950/20 border-r border-indigo-500/10 flex flex-col justify-center p-3 shrink-0">
                      <span className="text-[8px] font-mono font-black uppercase text-indigo-400 tracking-widest">
                        CH-02
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-200 mt-0.5 flex items-center gap-1">
                        <Grid className="w-3 h-3 text-amber-400 shrink-0" /> Chords
                      </span>
                    </div>

                    <div className="flex-1 overflow-x-hidden flex items-center gap-6 px-4 py-3 bg-[#0d0c1b]/30">
                      {activeRoadmap.map((block, idx) => {
                        const isSelected = editingBlockId === block.id || (!editingBlockId && idx === 0);
                        const blockOffset = block.keyOffset || 0;
                        const blockKeyName = getModulatedKeyName(currentKey, blockOffset);
                        const templates = effectiveSectionTemplates[block.name] || [];
                        const chordList = templates
                          .slice(0, 3)
                          .map((l, lIdx) => {
                            const lineOffset = block.lineOffsets?.[lIdx] || 0;
                            const totalOffset = blockOffset + lineOffset;
                            return transposeChord(l.Chords || '', totalOffset);
                          })
                          .filter(Boolean)
                          .join(' • ');

                        return (
                          <div 
                            key={block.id}
                            onClick={() => setEditingBlockId(block.id)}
                            className={`min-w-[160px] max-w-[160px] shrink-0 p-2.5 rounded-lg border flex flex-col justify-between h-full cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[#101230]/70 border-indigo-500/40'
                                : 'bg-black/20 border-indigo-500/5'
                            }`}
                          >
                            <div className="text-[9px] font-mono text-amber-400/90 truncate font-bold">
                              {chordList || '(No cords defined)'}
                            </div>

                            {/* Offset control bar inside chords lane */}
                            <div className="flex items-center justify-between mt-2.5 bg-black/40 border border-white/5 px-1.5 py-1 rounded">
                              <span className="text-[9px] font-mono font-bold text-amber-400">
                                {blockKeyName}
                              </span>
                              {isDirectorMode ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    disabled={isArrangementLocked}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      adjustBlockModulation(block.id, -1);
                                    }}
                                    className="w-4.5 h-4.5 flex items-center justify-center bg-indigo-900/40 rounded text-[10px] text-indigo-200 hover:bg-indigo-900 font-black cursor-pointer active:scale-95 disabled:opacity-20"
                                  >
                                    -
                                  </button>
                                  <span className="text-[8px] font-mono font-black text-indigo-300">
                                    {blockOffset >= 0 ? `+${blockOffset}` : blockOffset}st
                                  </span>
                                  <button
                                    disabled={isArrangementLocked}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      adjustBlockModulation(block.id, 1);
                                    }}
                                    className="w-4.5 h-4.5 flex items-center justify-center bg-indigo-900/40 rounded text-[10px] text-indigo-200 hover:bg-indigo-900 font-black cursor-pointer active:scale-95 disabled:opacity-20"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[8px] font-mono font-bold text-teal-400 uppercase tracking-wider bg-teal-500/5 px-1.5 py-0.5 rounded border border-teal-500/10">
                                  {blockOffset === 0 ? 'Master' : `${blockOffset >= 0 ? '+' : ''}${blockOffset} st`}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* CHANNEL 3: STORYLINE TRACK (LYRIC PREVIEWS) */}
                  <div className="flex items-stretch min-h-[76px]">
                    <div className="w-24 sm:w-32 bg-indigo-950/20 border-r border-indigo-500/10 flex flex-col justify-center p-3 shrink-0">
                      <span className="text-[8px] font-mono font-black uppercase text-indigo-400 tracking-widest">
                        CH-03
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-200 mt-0.5 flex items-center gap-1">
                        <Type className="w-3 h-3 text-indigo-400 shrink-0" /> Lyrics
                      </span>
                    </div>

                    <div className="flex-1 overflow-x-hidden flex items-center gap-6 px-4 py-3 bg-[#0d0c1b]/10">
                      {activeRoadmap.map((block, idx) => {
                        const isSelected = editingBlockId === block.id || (!editingBlockId && idx === 0);
                        const templates = effectiveSectionTemplates[block.name] || [];
                        const firstLyrics = templates[0]?.Lyrics || '';
                        const secondLyrics = templates[1]?.Lyrics || '';

                        return (
                          <div 
                            key={block.id}
                            onClick={() => setEditingBlockId(block.id)}
                            className={`min-w-[160px] max-w-[160px] shrink-0 p-2.5 rounded-lg border flex flex-col justify-center gap-1 text-left h-full cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[#101230]/70 border-indigo-500/40'
                                : 'bg-black/10 border-indigo-500/5'
                            }`}
                          >
                            <span className="text-[9px] text-indigo-300 font-medium truncate italic leading-tight">
                              {firstLyrics || '...'}
                            </span>
                            <span className="text-[8px] text-gray-500 truncate italic leading-tight">
                              {secondLyrics || '...'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              {/* ACTIVE SELECTED BLOCK LINE EDITOR & SECTION DISSECTION */}
              {activeSelectedBlock ? (
                <div className="bg-[#080918]/90 border border-indigo-500/20 rounded-2xl p-4.5 flex flex-col gap-4 text-left shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                  
                  {/* Editor Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-indigo-500/15 pb-3 gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-black">
                        📝
                      </div>
                      <div>
                        <span className="text-[8px] font-mono font-black uppercase tracking-widest text-indigo-400">
                          Active Block dissection / sequence compiler
                        </span>
                        <h3 className="font-sans font-black text-sm uppercase tracking-wider text-indigo-300 flex items-center gap-2 mt-0.5">
                          <span>{activeSelectedBlock.name} Layout Console</span>
                          <span className="text-[9px] font-mono px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 rounded">
                            {(activeSelectedBlock.enabledLines || []).length} of {(effectiveSectionTemplates[activeSelectedBlock.name] || []).length} Runs active
                          </span>
                        </h3>
                      </div>
                    </div>
                    
                    <span className="text-[10px] text-gray-400 font-semibold bg-[#131526] px-3 py-1 rounded-lg border border-[#222440] max-w-sm">
                      Check a line to include it. Edits made live to chord changes or lyric notations update all linked blocks in the performance.
                    </span>
                  </div>

                  {/* Lines List scroll pane */}
                  <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                    {(() => {
                      const templateLines = effectiveSectionTemplates[activeSelectedBlock.name] || [];
                      if (templateLines.length === 0) {
                        return (
                          <div className="text-gray-500 italic text-xs py-8 text-center bg-black/30 rounded-xl border border-dashed border-indigo-500/10">
                            No lyric/chord lines recorded for this section template.
                          </div>
                        );
                      }

                      return templateLines.map((line, lIdx) => {
                        const isLineEnabled = (activeSelectedBlock.enabledLines || []).includes(lIdx);
                        return (
                          <div
                            key={lIdx}
                            className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all ${
                              isLineEnabled
                                ? 'bg-indigo-950/20 border-indigo-500/35 shadow-inner'
                                : 'bg-black/30 border-indigo-500/5 opacity-55 hover:opacity-85'
                            }`}
                          >
                            {/* Checkbox toggle */}
                            <button
                              disabled={!isDirectorMode || isArrangementLocked}
                              onClick={() => {
                                if (!isDirectorMode || isArrangementLocked) return;
                                const list = activeRoadmap.map((b) => {
                                  if (b.id === activeSelectedBlock.id) {
                                    const currentEnabled = b.enabledLines || [];
                                    const nextEnabled = currentEnabled.includes(lIdx)
                                      ? currentEnabled.filter(idx => idx !== lIdx)
                                      : [...currentEnabled, lIdx].sort((a, b) => a - b);
                                    return { ...b, enabledLines: nextEnabled };
                                  }
                                  return b;
                                });
                                setActiveRoadmap(list);
                              }}
                              className={`w-5.5 h-5.5 shrink-0 rounded-md flex items-center justify-center border text-xs font-black transition-all ${
                                !isDirectorMode ? 'cursor-default' : 'cursor-pointer'
                              } ${
                                isLineEnabled
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20'
                                  : 'bg-[#131526]/80 border-gray-600 text-transparent'
                              }`}
                              title={isLineEnabled ? "Line is active in sequence" : "Line is inactive in sequence"}
                            >
                              ✓
                            </button>

                            {/* Inline inputs */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                              {/* Chord input */}
                              <div className="flex flex-col gap-1 md:col-span-4">
                                <span className="text-[8px] font-mono font-black tracking-wider text-amber-500/90 uppercase">Chords</span>
                                {isDirectorMode ? (
                                  <div className="flex flex-col gap-1.5 w-full">
                                    <input
                                      type="text"
                                      disabled={isArrangementLocked}
                                      value={line.Chords || ''}
                                      onChange={(e) => {
                                        const updatedLines = [...(effectiveSectionTemplates[activeSelectedBlock.name] || [])];
                                        if (updatedLines[lIdx]) {
                                          updatedLines[lIdx] = {
                                            ...updatedLines[lIdx],
                                            Chords: e.target.value,
                                          };
                                          setSectionTemplates(prev => ({
                                            ...prev,
                                            [activeSelectedBlock.name]: updatedLines
                                          }));
                                          if (loadedSnapshotSections) {
                                            setLoadedSnapshotSections(prev => {
                                              if (!prev) return null;
                                              return {
                                                ...prev,
                                                [activeSelectedBlock.name]: updatedLines
                                              };
                                            });
                                          }
                                        }
                                      }}
                                      placeholder="Chords (e.g. G C D Em)"
                                      className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                                    />
                                    {(() => {
                                      const blockOffset = activeSelectedBlock.keyOffset || 0;
                                      const lineOffset = activeSelectedBlock.lineOffsets?.[lIdx] || 0;
                                      const totalOffset = blockOffset + lineOffset;
                                      if (totalOffset !== 0) {
                                        return (
                                          <div className="text-[10px] font-mono text-amber-300/85 px-2 py-0.5 bg-amber-500/5 rounded border border-amber-500/10 flex items-center gap-1">
                                            <span className="text-[7.5px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded font-black leading-none shrink-0">
                                              TRANSPOSED ({totalOffset > 0 ? '+' : ''}{totalOffset} st):
                                            </span>
                                            <span className="font-extrabold tracking-wide truncate">{transposeChord(line.Chords || '', totalOffset)}</span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  <div className="w-full bg-[#0a0c24] border border-transparent rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 font-black tracking-wide min-h-[32px] flex items-center select-all">
                                    {(() => {
                                      const blockOffset = activeSelectedBlock.keyOffset || 0;
                                      const lineOffset = activeSelectedBlock.lineOffsets?.[lIdx] || 0;
                                      const totalOffset = blockOffset + lineOffset;
                                      return transposeChord(line.Chords || '', totalOffset) || <span className="text-gray-600 italic">No chords</span>;
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* Transpose Mod selection */}
                              <div className="flex flex-col gap-1 md:col-span-3">
                                <span className="text-[8px] font-mono font-black tracking-wider text-emerald-400 uppercase">Line Mod</span>
                                {isDirectorMode ? (
                                  <select
                                    disabled={isArrangementLocked}
                                    value={(activeSelectedBlock.lineOffsets?.[lIdx] || 0).toString()}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      const currentOffsets = activeSelectedBlock.lineOffsets || {};
                                      const list = activeRoadmap.map((b) => {
                                        if (b.id === activeSelectedBlock.id) {
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
                                      setActiveRoadmap(list);
                                      showToast(`Line modulated to ${val > 0 ? '+' : ''}${val} semitones`, 'info');
                                    }}
                                    className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2 py-1.5 text-xs text-emerald-300 font-extrabold focus:outline-none focus:border-emerald-400 cursor-pointer shadow-inner disabled:opacity-50"
                                  >
                                    {Array.from({ length: 25 }, (_, idx) => idx - 12).map((val) => (
                                      <option key={val} value={val} className="bg-[#0c0d1b] text-emerald-300 font-bold">
                                        {val > 0 ? `+${val}` : val} {val === 0 ? 'None' : 'st'}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="w-full bg-[#0a0c24] border border-transparent rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-black min-h-[32px] flex items-center">
                                    {(() => {
                                      const val = activeSelectedBlock.lineOffsets?.[lIdx] || 0;
                                      return val === 0 ? 'None' : `${val > 0 ? '+' : ''}${val} st`;
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* Lyric input */}
                              <div className="flex flex-col gap-1 md:col-span-5">
                                <span className="text-[8px] font-mono font-black tracking-wider text-indigo-400 uppercase">Lyrics</span>
                                {isDirectorMode ? (
                                  <input
                                    type="text"
                                    disabled={isArrangementLocked}
                                    value={line.Lyrics || ''}
                                    onChange={(e) => {
                                      const updatedLines = [...(effectiveSectionTemplates[activeSelectedBlock.name] || [])];
                                      if (updatedLines[lIdx]) {
                                        updatedLines[lIdx] = {
                                          ...updatedLines[lIdx],
                                          Lyrics: e.target.value,
                                        };
                                        setSectionTemplates(prev => ({
                                          ...prev,
                                          [activeSelectedBlock.name]: updatedLines
                                        }));
                                        if (loadedSnapshotSections) {
                                          setLoadedSnapshotSections(prev => {
                                            if (!prev) return null;
                                            return {
                                              ...prev,
                                              [activeSelectedBlock.name]: updatedLines
                                            };
                                          });
                                        }
                                      }
                                    }}
                                    placeholder="Lyrics notation line"
                                    className="w-full bg-[#0a0c24] border border-indigo-500/15 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400 disabled:opacity-50"
                                  />
                                ) : (
                                  <div className="w-full bg-[#0a0c24] border border-transparent rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-medium tracking-wide min-h-[32px] flex items-center">
                                    {line.Lyrics || <span className="text-gray-600 italic">No lyrics notation</span>}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Delete Line */}
                            {isDirectorMode && (
                              <button
                                disabled={isArrangementLocked}
                                onClick={() => {
                                  if (isArrangementLocked) return;
                                  const list = (effectiveSectionTemplates[activeSelectedBlock.name] || []).filter((_, idx) => idx !== lIdx);
                                  setSectionTemplates(prev => ({
                                    ...prev,
                                    [activeSelectedBlock.name]: list
                                  }));
                                  if (loadedSnapshotSections) {
                                    setLoadedSnapshotSections(prev => {
                                      if (!prev) return null;
                                      return {
                                        ...prev,
                                        [activeSelectedBlock.name]: list
                                      };
                                    });
                                  }

                                  const rmap = activeRoadmap.map((b) => {
                                    if (b.name === activeSelectedBlock.name) {
                                      const currentEnabled = b.enabledLines || [];
                                      const nextEnabled = currentEnabled
                                        .filter(idx => idx !== lIdx)
                                        .map(idx => (idx > lIdx ? idx - 1 : idx));
                                      return { ...b, enabledLines: nextEnabled };
                                    }
                                    return b;
                                  });
                                  setActiveRoadmap(rmap);
                                  showToast('Deleted line index!', 'info');
                                }}
                                className="p-1.5 hover:text-rose-400 text-gray-500 transition-colors mt-4 self-center cursor-pointer select-none disabled:opacity-30 disabled:pointer-events-none"
                                title="Delete line"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Actions for local compilation */}
                  {isDirectorMode && (
                    <div className="flex items-center justify-between border-t border-indigo-500/10 pt-3">
                      <span className="text-[10px] text-indigo-400/60 italic">
                        Lines altered here sync instantly with your local rehearsal display.
                      </span>
                      
                      <button
                        disabled={isArrangementLocked}
                        onClick={() => {
                          const currentLines = effectiveSectionTemplates[activeSelectedBlock.name] || [];
                          const newLine = {
                            SongID: currentSong?.SongID || '',
                            SectionName: activeSelectedBlock.name,
                            Section: activeSelectedBlock.name,
                            section: activeSelectedBlock.name,
                            Order: currentLines.length + 1,
                            Chords: '',
                            Lyrics: '',
                          };
                          const updatedLines = [...currentLines, newLine];

                          setSectionTemplates(prev => ({
                            ...prev,
                            [activeSelectedBlock.name]: updatedLines
                          }));
                          if (loadedSnapshotSections) {
                            setLoadedSnapshotSections(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                [activeSelectedBlock.name]: updatedLines
                              };
                            });
                          }

                          // Auto enable new line
                          const rmap = activeRoadmap.map((b) => {
                            if (b.id === activeSelectedBlock.id) {
                              return {
                                ...b,
                                enabledLines: [...(b.enabledLines || []), updatedLines.length - 1]
                              };
                            }
                            return b;
                          });
                          setActiveRoadmap(rmap);
                          showToast('Appended new blank line to sequence!', 'success');
                        }}
                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 text-emerald-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        + Add Line to Section
                      </button>
                    </div>
                  )}

                  {/* PULL FROM OTHER SONGS WIDGET */}
                  {isDirectorMode && (
                    <div className="mt-2 border-t border-indigo-500/10 pt-3">
                    {!isPulling ? (
                      <div className="flex justify-end">
                        <button
                          disabled={isArrangementLocked}
                          onClick={() => setIsPulling(true)}
                          className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 text-indigo-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                        >
                          📥 Pull Portion of Other Song
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 bg-[#050614] border border-indigo-500/20 p-4 rounded-xl space-y-2 text-left">
                        <div className="flex justify-between items-center pb-1 border-b border-indigo-500/10">
                          <h4 className="text-[10px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1">
                            <span>📥</span> Pull Portion of Other Songs
                          </h4>
                          <button
                            onClick={() => {
                              setIsPulling(false);
                              setPullSourceSongId('');
                              setPullSourceSectionName('');
                            }}
                            className="text-gray-400 hover:text-white text-[9px] uppercase font-bold cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          <div className="space-y-2 pt-1 border-t border-indigo-500/10">
                            <span className="text-[7px] font-mono font-black tracking-wider text-indigo-400 uppercase block">
                              3. Select Lines to Pull Into "{activeSelectedBlock.name}"
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
                                          const currentLines = effectiveSectionTemplates[activeSelectedBlock.name] || [];
                                          const newLine = {
                                            SongID: currentSong?.SongID || '',
                                            SectionName: activeSelectedBlock.name,
                                            Section: activeSelectedBlock.name,
                                            section: activeSelectedBlock.name,
                                            Order: currentLines.length + 1,
                                            Chords: line.Chords || '',
                                            Lyrics: line.Lyrics || '',
                                          };
                                          const updatedLines = [...currentLines, newLine];

                                          setSectionTemplates(prev => ({
                                            ...prev,
                                            [activeSelectedBlock.name]: updatedLines
                                          }));
                                          if (loadedSnapshotSections) {
                                            setLoadedSnapshotSections(prev => {
                                              if (!prev) return null;
                                              return {
                                                ...prev,
                                                [activeSelectedBlock.name]: updatedLines
                                              };
                                            });
                                          }

                                          const next = activeRoadmap.map((b) => {
                                            if (b.id === activeSelectedBlock.id) {
                                              return {
                                                ...b,
                                                enabledLines: [...(b.enabledLines || []), updatedLines.length - 1],
                                              };
                                            }
                                            return b;
                                          });
                                          setActiveRoadmap(next);
                                          showToast(`Pulled line to ${activeSelectedBlock.name}`, 'success');
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
                                    const currentLines = effectiveSectionTemplates[activeSelectedBlock.name] || [];
                                    const pulledLines = sourceLines.map((line, sIdx) => ({
                                      SongID: currentSong?.SongID || '',
                                      SectionName: activeSelectedBlock.name,
                                      Section: activeSelectedBlock.name,
                                      section: activeSelectedBlock.name,
                                      Order: currentLines.length + sIdx + 1,
                                      Chords: line.Chords || '',
                                      Lyrics: line.Lyrics || '',
                                    }));
                                    const updatedLines = [...currentLines, ...pulledLines];

                                    setSectionTemplates(prev => ({
                                      ...prev,
                                      [activeSelectedBlock.name]: updatedLines
                                    }));
                                    if (loadedSnapshotSections) {
                                      setLoadedSnapshotSections(prev => {
                                        if (!prev) return null;
                                        return {
                                          ...prev,
                                          [activeSelectedBlock.name]: updatedLines
                                        };
                                      });
                                    }

                                    const startIdx = currentLines.length;
                                    const newIndices = Array.from({ length: pulledLines.length }, (_, i) => startIdx + i);
                                    const rmap = activeRoadmap.map((b) => {
                                      if (b.id === activeSelectedBlock.id) {
                                        return {
                                          ...b,
                                          enabledLines: [...(b.enabledLines || []), ...newIndices],
                                        };
                                      }
                                      return b;
                                    });
                                    setActiveRoadmap(rmap);

                                    showToast(`Pulled all ${sourceLines.length} lines of ${pullSourceSectionName} to ${activeSelectedBlock.name}`, 'success');
                                    setIsPulling(false);
                                    setPullSourceSongId('');
                                    setPullSourceSectionName('');
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/35 text-emerald-300 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                              >
                                📥 Pull Entire Section
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ) : null}

            </div>

            {/* LOWER HARDWARE DECK: BACKUP REVERT & STATUS BAR */}
            <div className="bg-[#0b0c20]/90 border-t border-indigo-500/15 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 text-left">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest select-none">
                  LFO SYNC • DECK ACTIVE
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelArrangementEdit}
                  className="px-4 py-1.5 border border-rose-500/20 hover:bg-rose-950/20 text-rose-400 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer active:scale-95"
                >
                  Safe Revert Changes
                </button>
                
                <button
                  onClick={() => setArrangerOpen(false)}
                  className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  Compile Performance
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* INTERACTIVE HOW-TO-USE MANUAL MODAL OVERLAY */}
      {isManualOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[900] flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[85vh] bg-[#090a1f] border border-indigo-500/30 rounded-2xl shadow-[0_0_100px_rgba(99,102,241,0.25)] flex flex-col overflow-hidden text-left relative">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-400 via-indigo-500 to-rose-400" />
            
            {/* Manual Header */}
            <div className="px-6 py-4 bg-[#0d0e2e]/95 border-b border-indigo-500/15 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-lg">
                  📖
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Arranger Studio Interactive Guide</h3>
                  <p className="text-[10px] text-indigo-300 font-mono">Master live roadmap building & multi-track chord arrangement</p>
                </div>
              </div>
              
              <button
                onClick={() => setIsManualOpen(false)}
                className="px-3 py-1 bg-rose-950/40 hover:bg-rose-950 border border-rose-500/30 hover:border-rose-400/50 text-rose-300 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
              >
                Close Guide
              </button>
            </div>
            
            {/* Manual Content Scrollable body */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1 bg-[#040514]">
              
              {/* Grid of step cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* CARD 1: Signal Ingestor */}
                <div className="bg-[#0b0c24] border border-indigo-500/10 hover:border-indigo-500/20 rounded-xl p-4 flex flex-col gap-3 transition-all relative group">
                  <div className="absolute top-3 right-3 text-2xl font-mono font-black text-indigo-500/20 select-none">01</div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono text-xs font-black">INGEST</span>
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Signal Ingestion Panel</h4>
                  </div>
                  
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Click any element inside the <strong className="text-indigo-300">Signal Ingestor Panel</strong> to instantly append a section block (Verse, Chorus, Bridge, etc.) onto your song timeline.
                  </p>
                  
                  {/* High Fidelity Visual Mockup */}
                  <div className="bg-black/50 border border-indigo-500/5 rounded-lg p-3 mt-1 flex flex-col gap-2 relative overflow-hidden select-none">
                    <div className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Interactive Click-to-Inject Preview</div>
                    <div className="flex gap-2 justify-center py-2">
                      <div className="px-2 py-1 bg-indigo-950/80 border border-indigo-500/40 rounded text-[9px] font-mono text-indigo-300 uppercase animate-pulse flex items-center gap-1 cursor-pointer">
                        <span className="text-[8px] opacity-60">ADD</span>
                        <span>Chorus</span>
                      </div>
                      <div className="text-gray-600 self-center">➔</div>
                      <div className="flex gap-1 bg-indigo-950/40 p-1 rounded border border-indigo-500/10">
                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-mono uppercase">V</span>
                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-mono uppercase">V</span>
                        <span className="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[8px] font-mono uppercase animate-bounce">C</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 2: Drag and Drop Reordering */}
                <div className="bg-[#0b0c24] border border-indigo-500/10 hover:border-indigo-500/20 rounded-xl p-4 flex flex-col gap-3 transition-all relative group">
                  <div className="absolute top-3 right-3 text-2xl font-mono font-black text-indigo-500/20 select-none">02</div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded font-mono text-xs font-black">MOVE</span>
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Drag & Drop Sequence Flow</h4>
                  </div>
                  
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Easily rearrange your song's timeline flow. Click and drag any block inside the primary track workspace horizontally to instantly shift its position.
                  </p>
                  
                  {/* High Fidelity Visual Mockup */}
                  <div className="bg-black/50 border border-indigo-500/5 rounded-lg p-3 mt-1 flex flex-col gap-2 relative overflow-hidden select-none">
                    <div className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Simulated Drag & Drop Timeline</div>
                    <div className="flex justify-center items-center gap-2 py-2 relative">
                      <div className="px-2 py-1 bg-[#15173c] border border-indigo-500/30 rounded text-[9px] text-gray-400">Verse 1</div>
                      <div className="px-2 py-1 bg-emerald-600 border border-emerald-400 rounded text-[9px] text-white animate-pulse relative z-10 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                        Chorus 1
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] animate-bounce">✊</span>
                      </div>
                      <div className="w-10 h-[2px] bg-indigo-500/30 border-dashed border-t border-indigo-500/40 relative">
                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[7px] text-indigo-300 font-mono bg-[#090a1f] px-1">SHIFT</span>
                      </div>
                      <div className="px-2 py-1 bg-[#15173c] border border-indigo-500/30 rounded text-[9px] text-gray-400">Verse 2</div>
                    </div>
                  </div>
                </div>

                {/* CARD 3: Dissection Editor */}
                <div className="bg-[#0b0c24] border border-indigo-500/10 hover:border-indigo-500/20 rounded-xl p-4 flex flex-col gap-3 transition-all relative group">
                  <div className="absolute top-3 right-3 text-2xl font-mono font-black text-indigo-500/20 select-none">03</div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-mono text-xs font-black">EDIT</span>
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Section Dissection Editor</h4>
                  </div>
                  
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Click on any active block to load its properties into the <strong className="text-amber-300">Dissection Editor</strong>. There you can toggle lyric line visibilities, modulate transposition pitch shift (+/- semitones), and load lines from other songs.
                  </p>
                  
                  {/* High Fidelity Visual Mockup */}
                  <div className="bg-black/50 border border-indigo-500/5 rounded-lg p-3 mt-1 flex flex-col gap-2 relative overflow-hidden select-none">
                    <div className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Block Tweak Dissection Deck</div>
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="flex items-center justify-between text-[9px] bg-indigo-950/20 border border-indigo-500/10 p-1.5 rounded">
                        <span className="text-indigo-300">🎵 Pitch Transpose Key Modulation</span>
                        <div className="flex gap-1">
                          <span className="px-1.5 py-0.5 bg-black rounded text-amber-400 border border-amber-500/20 font-mono">-1</span>
                          <span className="px-1.5 py-0.5 bg-indigo-500 text-white rounded font-bold font-mono">Ab</span>
                          <span className="px-1.5 py-0.5 bg-black rounded text-emerald-400 border border-emerald-500/20 font-mono">+1</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[9px] bg-indigo-950/20 border border-indigo-500/10 p-1.5 rounded">
                        <span className="text-gray-400">📝 Enable/Disable lyric line indices</span>
                        <div className="flex gap-1">
                          <span className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-[7px] text-white font-mono">1</span>
                          <span className="w-3.5 h-3.5 bg-gray-600 rounded-full flex items-center justify-center text-[7px] text-white font-mono opacity-50">2</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 4: User Modes */}
                <div className="bg-[#0b0c24] border border-indigo-500/10 hover:border-indigo-500/20 rounded-xl p-5 flex flex-col gap-3 transition-all relative group col-span-1 md:col-span-2">
                  <div className="absolute top-3 right-3 text-2xl font-mono font-black text-indigo-500/20 select-none">04</div>
                  <div className="flex items-center gap-2 pb-2 border-b border-indigo-500/15">
                    <span className="p-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-mono text-xs font-black">WORKSPACES</span>
                    <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest">Basic User Mode vs. Director Mode</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 text-left">
                    <div className="space-y-2 bg-indigo-950/10 border border-cyan-500/10 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-cyan-400 font-black text-[11px] uppercase tracking-wide">
                        <span>👤</span> Basic User (Stage-Safe Mode)
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        Optimized strictly for <strong className="text-cyan-300">Live Rehearsal & Active Performance</strong> on stage. Focuses on safe visual tracking while blocking accidental edits:
                      </p>
                      <ul className="text-[9px] text-gray-400 list-disc pl-4 space-y-1">
                        <li><strong className="text-slate-300">Anti-Accident Lock:</strong> Drag-and-drop timeline reordering and section deletes are completely frozen.</li>
                        <li><strong className="text-slate-300">Pure Readable Layout:</strong> The section dissection view swaps raw interactive input elements for elegant, border-free high-visibility text.</li>
                        <li><strong className="text-slate-300">Immutable Key Settings:</strong> Chord transposition buttons and inline line modulations are safely locked.</li>
                      </ul>
                    </div>

                    <div className="space-y-2 bg-emerald-950/10 border border-emerald-500/10 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-emerald-400 font-black text-[11px] uppercase tracking-wide">
                        <span>🎛️</span> Director (Full Composer Console)
                      </div>
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        Designed for <strong className="text-emerald-300">Song Arrangers, Band Directors, & Composers</strong>. Grants full control to customize, design, and structure the performance:
                      </p>
                      <ul className="text-[9px] text-gray-400 list-disc pl-4 space-y-1">
                        <li><strong className="text-slate-300">Dynamic Timeline Structure:</strong> Access drag-and-drop sequencing, section block duplications, and direct injection banks.</li>
                        <li><strong className="text-slate-300">Sequence Chord Editing:</strong> Customize lyrics & chords inline on any section template.</li>
                        <li><strong className="text-slate-300">Advanced Modulation:</strong> Transpose the whole roadmap or fine-tune individual lines (+/- semitones) for individual vocal runs.</li>
                      </ul>
                    </div>
                  </div>
                  
                  {/* High Fidelity Visual Mockup */}
                  <div className="bg-black/50 border border-indigo-500/5 rounded-lg p-3 mt-1 flex flex-col gap-2 relative overflow-hidden select-none">
                    <div className="text-[8px] font-mono text-gray-500 uppercase tracking-widest text-center">Active Workspace Switch Panel</div>
                    <div className="flex justify-center py-2">
                      <div className="flex items-center bg-black/80 border border-indigo-500/20 rounded-xl p-0.5 text-[9px] font-black font-mono">
                        <span className="px-2.5 py-1 text-cyan-400 bg-cyan-500/10 rounded">👤 BASIC USER</span>
                        <span className="px-2.5 py-1 text-emerald-400 bg-emerald-500/10 rounded ml-1">🎛️ DIRECTOR</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              
              {/* SVG Signal Flow Chart */}
              <div className="bg-[#0b0c24]/50 border border-indigo-500/10 rounded-xl p-5 mt-6">
                <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span>⚡ Arranger Studio Signal Flow Chart</span>
                </h4>
                <div className="w-full h-24 bg-black/40 border border-indigo-500/5 rounded-lg flex items-center justify-around px-4 relative overflow-hidden">
                  
                  {/* Glowing background grid */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:10px_10px]" />
                  
                  <div className="flex flex-col items-center z-10">
                    <span className="text-[8px] font-mono text-indigo-400">INPUT BANK</span>
                    <span className="px-2.5 py-1.5 bg-[#121434] border border-indigo-500/30 rounded text-[10px] font-black text-slate-200 mt-1 uppercase">Inject Block</span>
                  </div>
                  
                  <div className="text-indigo-500 animate-pulse font-mono text-lg z-10">➔</div>
                  
                  <div className="flex flex-col items-center z-10">
                    <span className="text-[8px] font-mono text-emerald-400">SEQUENCER TIMELINE</span>
                    <span className="px-2.5 py-1.5 bg-emerald-950/40 border border-emerald-500/30 rounded text-[10px] font-black text-emerald-300 mt-1 uppercase">Drag & Reorder</span>
                  </div>
                  
                  <div className="text-emerald-500 animate-pulse font-mono text-lg z-10">➔</div>
                  
                  <div className="flex flex-col items-center z-10">
                    <span className="text-[8px] font-mono text-amber-400">MODULATOR</span>
                    <span className="px-2.5 py-1.5 bg-amber-950/40 border border-amber-500/30 rounded text-[10px] font-black text-amber-300 mt-1 uppercase">Dissect Lines / Transpose</span>
                  </div>
                  
                  <div className="text-amber-500 animate-pulse font-mono text-lg z-10">➔</div>
                  
                  <div className="flex flex-col items-center z-10">
                    <span className="text-[8px] font-mono text-rose-400">OUTPUT MASTER</span>
                    <span className="px-2.5 py-1.5 bg-indigo-600 border border-indigo-400 rounded text-[10px] font-black text-white mt-1 uppercase">Compile Live App Sheet</span>
                  </div>
                </div>
              </div>

            </div>
            
            {/* Manual Footer */}
            <div className="px-6 py-4 bg-[#0d0e2e]/95 border-t border-indigo-500/15 flex items-center justify-between shrink-0 font-mono text-[9px] text-gray-500">
              <span>DESIGNED AND BUILT FOR PROFESSIONAL MULTI-TRACK PERFORMANCE DECKING</span>
              <button
                onClick={() => setIsManualOpen(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-lg text-[10px] uppercase tracking-widest transition-all cursor-pointer"
              >
                Get Started
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
};
