import React, { useState, useEffect } from 'react';

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrl: string;
}

export const DatabaseDiagnosticModal: React.FC<DiagnosticModalProps> = ({ isOpen, onClose, scriptUrl }) => {
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'error' | 'success' }[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLogs([]);
      runDiagnostics();
    }
  }, [isOpen]);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    addLog('Starting Database Connection Diagnostics...', 'info');
    
    addLog(`Target URL: ${scriptUrl.substring(0, 40)}...`, 'info');
    
    try {
      const startTime = performance.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for ping

      addLog('Pinging Google Apps Script endpoint...', 'info');
      
      const res = await fetch(`${scriptUrl}?tab=Songs`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      if (!res.ok) {
        addLog(`HTTP Error Status: ${res.status} ${res.statusText}`, 'error');
        throw new Error(`HTTP Error: ${res.status}`);
      }
      
      addLog(`Connected successfully! Latency: ${latency}ms`, 'success');
      
      const text = await res.text();
      addLog(`Received response payload (${text.length} bytes)`, 'info');
      
      try {
        const data = JSON.parse(text);
        if (data && data.error) {
          addLog(`Database returned an error message: ${data.error}`, 'error');
        } else if (Array.isArray(data)) {
          addLog(`Successfully parsed ${data.length} records.`, 'success');
        } else {
          addLog('Payload was parsed but is not a recognized array format.', 'error');
        }
      } catch (err: any) {
        addLog(`Failed to parse response as JSON. Format might be corrupted.`, 'error');
        addLog(`Parser error: ${err.message}`, 'error');
      }
      
      addLog('Diagnostics completed.', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog('Connection timed out after 8 seconds.', 'error');
        addLog('The Apps Script backend is unresponsive or rate-limited.', 'error');
      } else {
        addLog(`Connection failed: ${err.message}`, 'error');
      }
      addLog('Diagnostics finished with errors.', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal */}
      <div className="relative bg-[#0d0f1a] border border-indigo-500/30 rounded-2xl w-full max-w-lg shadow-[0_0_50px_rgba(49,46,129,0.5)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-indigo-950/20">
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

        {/* Console Body */}
        <div className="p-5 flex-1 overflow-hidden flex flex-col bg-[#05060a]">
          <div className="bg-black/50 border border-gray-800 rounded-lg p-3 font-mono text-[10px] sm:text-xs h-64 overflow-y-auto custom-scrollbar">
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
                _ running...
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-3 bg-indigo-950/20">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
              isRunning
                ? 'bg-indigo-900/50 text-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
            }`}
          >
            {isRunning ? 'Checking...' : 'Run Again'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 text-gray-300 hover:bg-white/20 rounded-lg text-xs font-bold transition-all uppercase tracking-wider active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
