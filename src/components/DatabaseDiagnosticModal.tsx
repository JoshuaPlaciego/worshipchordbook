import React, { useState, useEffect } from 'react';

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrls: string[];
}

export const DatabaseDiagnosticModal: React.FC<DiagnosticModalProps> = ({ isOpen, onClose, scriptUrls }) => {
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'error' | 'success' }[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Load primary sheet stats for capacity indicators (from local storage cached data)
  const [primaryCellsEst, setPrimaryCellsEst] = useState(0);
  const [primarySongsCount, setPrimarySongsCount] = useState(0);
  const [primaryLinesCount, setPrimaryLinesCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setLogs([]);
      // Reload stats from storage
      setPrimaryCellsEst(parseInt(localStorage.getItem('primary_sheet_cells_est') || '0', 10));
      setPrimarySongsCount(parseInt(localStorage.getItem('primary_sheet_songs_count') || '0', 10));
      setPrimaryLinesCount(parseInt(localStorage.getItem('primary_sheet_lines_count') || '0', 10));
      runDiagnostics();
    }
  }, [isOpen]);

  const capacityPct = Math.min(100, (primaryCellsEst / 10000000) * 100);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    addLog('Starting Federated Database Connection Diagnostics...', 'info');
    addLog(`Cluster size: ${scriptUrls.length} configured Spreadsheet nodes`, 'info');
    
    for (let i = 0; i < scriptUrls.length; i++) {
      const url = scriptUrls[i];
      const isPrimary = i === 0;
      addLog(`----------------------------------------`, 'info');
      addLog(`Diagnosing Node #${i + 1} ${isPrimary ? '(PRIMARY WRITE)' : '(SECONDARY READ)'}:`, 'info');
      addLog(`URL: ${url.substring(0, 45)}...`, 'info');
      
      try {
        const startTime = performance.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per node
        
        const res = await fetch(`${url}?tab=Songs`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        if (!res.ok) {
          addLog(`  Node #${i + 1} HTTP Error Status: ${res.status} ${res.statusText}`, 'error');
          continue;
        }
        
        addLog(`  Node #${i + 1} Connected successfully! Latency: ${latency}ms`, 'success');
        
        const text = await res.text();
        const songsList = JSON.parse(text);
        
        if (Array.isArray(songsList)) {
          addLog(`  Node #${i + 1} Songs capacity check: ${songsList.length} song records.`, 'success');
          
          try {
            const linesRes = await fetch(`${url}?tab=SongLines`);
            const linesText = await linesRes.text();
            const linesList = JSON.parse(linesText);
            if (Array.isArray(linesList)) {
              addLog(`  Node #${i + 1} SongLines capacity check: ${linesList.length} line records.`, 'success');
              
              // Estimate cells
              const cellsEstimate = songsList.length * 12 + linesList.length * 5;
              const formattedCells = new Intl.NumberFormat().format(cellsEstimate);
              addLog(`  Node #${i + 1} Estimated Spreadsheet Cells in use: ${formattedCells} cells.`, 'info');
              
              const pct = (cellsEstimate / 10000000) * 100; // Google's limit is 10M cells
              addLog(`  Node #${i + 1} Capacity Usage: ${pct.toFixed(2)}% of Google Sheets 10M cells limit.`, pct > 80 ? 'error' : 'success');

              // If it's the primary node, update stored/local numbers
              if (isPrimary) {
                setPrimaryCellsEst(cellsEstimate);
                setPrimarySongsCount(songsList.length);
                setPrimaryLinesCount(linesList.length);
                localStorage.setItem('primary_sheet_cells_est', cellsEstimate.toString());
                localStorage.setItem('primary_sheet_songs_count', songsList.length.toString());
                localStorage.setItem('primary_sheet_lines_count', linesList.length.toString());
              }
            }
          } catch {
            addLog(`  Node #${i + 1} could not verify SongLines capacity.`, 'error');
          }
        } else {
          addLog(`  Node #${i + 1} returned unrecognized format or error message.`, 'error');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          addLog(`  Node #${i + 1} Connection timed out after 8 seconds.`, 'error');
        } else {
          addLog(`  Node #${i + 1} Connection failed: ${err.message}`, 'error');
        }
      }
    }
    
    addLog(`----------------------------------------`, 'info');
    addLog('Diagnostics completed.', 'success');
    setIsRunning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal */}
      <div className="relative bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-3xl border border-indigo-500/20 rounded-3xl w-full max-w-lg shadow-[0_20px_50px_rgba(99,102,241,0.25)] overflow-hidden flex flex-col animate-scaleIn">
        {/* Header */}
        <div className="px-5 py-4 border-b border-indigo-500/15 flex items-center justify-between bg-indigo-950/25">
          <h2 className="text-sm font-black text-indigo-300 uppercase tracking-widest flex items-center gap-2">
            <span className="text-xl">🩺</span> Database Diagnostics
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1 rounded-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diagnostic Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 max-h-[70vh] custom-scrollbar bg-transparent">
          
          {/* Primary Node Storage Capacity indicator moved here for Viewer Access */}
          {primaryCellsEst > 0 && (
            <div className="bg-indigo-950/40 border border-indigo-500/10 p-3.5 rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>📊</span> Primary Node Storage Capacity
                </span>
                <span className={`${capacityPct > 80 ? 'text-rose-400 font-black animate-pulse' : 'text-indigo-300 font-bold'}`}>
                  {capacityPct.toFixed(2)}% Full
                </span>
              </div>
              
              <div className="w-full bg-indigo-950/60 h-2.5 rounded-full overflow-hidden border border-indigo-500/10 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    capacityPct > 80 ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_8px_#ef4444]' : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                  }`} 
                  style={{ width: `${capacityPct}%` }}
                />
              </div>
              
              <div className="flex justify-between text-[8.5px] text-gray-400 font-mono">
                <span>{primarySongsCount} songs / {primaryLinesCount} lyric lines</span>
                <span>~{primaryCellsEst.toLocaleString()} / 10,000,000 cells</span>
              </div>

              {capacityPct > 80 ? (
                <p className="text-[9px] text-amber-300 bg-amber-500/5 p-2 rounded-xl border border-amber-500/20 leading-relaxed mt-1.5">
                  ⚠️ <strong>Near-Full Warning</strong>: The active write node is nearing Google's 10M cell limit. Administrators should register a fresh spreadsheet node as the Primary Write Node to expand capacity.
                </p>
              ) : (
                <p className="text-[9px] text-gray-500 leading-normal mt-1 italic">
                  Excellent. The primary node is operating well within safe boundaries. No action required.
                </p>
              )}
            </div>
          )}

          {/* Connection Logs */}
          <div className="space-y-1">
            <span className="text-[8.5px] text-indigo-400 font-black uppercase tracking-wider font-mono px-1">Connection Integrity Output</span>
            <div className="bg-indigo-950/30 border border-indigo-500/15 rounded-2xl p-4 font-mono text-[10px] sm:text-xs h-64 overflow-y-auto custom-scrollbar shadow-inner">
              {logs.map((log, idx) => (
                <div key={idx} className="mb-1.5 flex gap-2">
                  <span className="text-gray-600 shrink-0">[{log.time}]</span>
                  <span
                    className={
                      log.type === 'error'
                        ? 'text-red-400'
                        : log.type === 'success'
                        ? 'text-emerald-400'
                        : 'text-indigo-300'
                    }
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="animate-pulse text-indigo-500 mt-2">
                  _ running diagnostics...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-indigo-500/15 flex justify-end gap-3 bg-indigo-950/20">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${
              isRunning
                ? 'bg-indigo-900/50 text-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
            }`}
          >
            {isRunning ? 'Checking...' : 'Run Again'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 text-gray-300 hover:bg-white/20 rounded-xl text-xs font-bold transition-all uppercase tracking-wider active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
