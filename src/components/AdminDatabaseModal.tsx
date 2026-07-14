import React, { useState, useEffect } from 'react';
import { APPS_SCRIPT_CODE } from '../utils/appsScriptCode';

interface AdminDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrls: string[];
  onSaveScriptUrls: (urls: string[]) => Promise<void>;
  onResetScriptUrl: () => void;
  lastSynced: number | null;
  isOffline: boolean;
  onForceSync: () => Promise<void>;
  isAdmin: boolean;
  onTriggerLogin: () => void;
  onLogout: () => void;
  alertEmails: string[];
  onSaveAlertEmails: (emails: string[]) => Promise<void>;
}

export const AdminDatabaseModal: React.FC<AdminDatabaseModalProps> = ({
  isOpen,
  onClose,
  scriptUrls,
  onSaveScriptUrls,
  onResetScriptUrl,
  lastSynced,
  isOffline,
  onForceSync,
  isAdmin,
  onTriggerLogin,
  onLogout,
  alertEmails,
  onSaveAlertEmails,
}) => {
  const [newNodeUrl, setNewNodeUrl] = useState('');
  const [addPosition, setAddPosition] = useState<'primary' | 'secondary'>('primary');
  const [syncLoading, setSyncLoading] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'cluster' | 'alerts'>('cluster');
  const [testingEmail, setTestingEmail] = useState(false);

  const handleSendTestEmail = async () => {
    if (alertEmails.length === 0) {
      alert('Please add at least one email recipient before sending a test email.');
      return;
    }
    if (scriptUrls.length === 0) {
      alert('No active primary spreadsheet node found to route the test email through.');
      return;
    }

    setTestingEmail(true);
    setSyncLoading(true);
    try {
      const subject = "🧪 Worship Chord Book: Test Capacity Alert Email";
      const body = `Hello!

This is a test notification from your Worship Chord Book PWA. 

If you are receiving this, your Google Apps Script email notification channel is successfully configured and working!

• Connected Primary Node: ${scriptUrls[0]}
• Current Local Time: ${new Date().toLocaleString()}

Happy worship leading,
Worship Setup Assistant`;

      const payload = {
        action: 'sendAlertEmail',
        subject: subject,
        body: body,
        recipients: alertEmails.join(','),
      };

      const res = await fetch(scriptUrls[0], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resJson = await res.json();
      if (resJson.status === 'success') {
        alert('📬 Test email sent successfully! Please check your inbox (and spam folder) for the confirmation.');
      } else {
        alert('❌ Failed to send test email: ' + (resJson.message || 'Unknown error.'));
      }
    } catch (err: any) {
      console.error(err);
      alert('❌ Error sending test email: ' + err.message);
    } finally {
      setTestingEmail(false);
      setSyncLoading(false);
    }
  };

  // Global cursor loading state integration
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

    if (syncLoading) {
      incrementProcessing();
    } else {
      decrementProcessing();
    }

    return () => {
      if (syncLoading) {
        decrementProcessing();
      }
    };
  }, [syncLoading]);

  if (!isOpen) return null;

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeUrl.trim()) return;

    let updated = [...scriptUrls];
    if (addPosition === 'primary') {
      // Prepend to make it the active write node
      updated = [newNodeUrl.trim(), ...updated];
    } else {
      // Append as secondary read node
      updated = [...updated, newNodeUrl.trim()];
    }

    await onSaveScriptUrls(updated);
    setNewNodeUrl('');
  };

  const handleRemoveNode = async (idx: number) => {
    if (scriptUrls.length <= 1) {
      alert('You must keep at least one Spreadsheet node connected to use cloud synchronization.');
      return;
    }
    const confirmed = window.confirm('Are you sure you want to disconnect this spreadsheet node from your database cluster?');
    if (!confirmed) return;

    const updated = scriptUrls.filter((_, i) => i !== idx);
    await onSaveScriptUrls(updated);
  };

  const handleResetCluster = () => {
    const confirmed = window.confirm('Reset database cluster configuration to the default demo spreadsheet?');
    if (confirmed) {
      onResetScriptUrl();
    }
  };

  const handleManualSync = async () => {
    setSyncLoading(true);
    try {
      await onForceSync();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncLoading(false);
    }
  };

  const copyAppsScriptInstructions = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[800] flex items-center justify-center p-4 animate-fadeIn" id="admin-db-modal-overlay">
      <div className="bg-gradient-to-br from-slate-900 via-[#0c0d21] to-[#04050a] p-5 rounded-3xl w-full max-w-lg shadow-[0_20px_50px_rgba(139,92,246,0.25)] border border-purple-500/20 max-h-[92vh] flex flex-col animate-scaleIn" id="admin-db-modal-container">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-3 pb-3 border-b border-purple-500/15 flex-shrink-0">
          <div>
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest font-mono">Administration Suite</span>
            <h3 className="text-sm font-black text-white leading-tight mt-0.5 flex items-center gap-1.5">
              <span>🛡️</span> Federated Database Control Center
            </h3>
            <p className="text-[9.5px] text-gray-400 mt-0.5 leading-normal">
              Manage database cluster nodes, propagate system configurations, and view database cleansing procedures.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        {/* Security Access Gate */}
        {!isAdmin ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/5 animate-pulse">
              <span className="text-3xl">🔒</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white uppercase tracking-wider font-mono">Access Restricted</h4>
              <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                This workspace contains administrative cluster directories and write node structures. Authorized personnel only.
              </p>
            </div>
            <button
              onClick={() => {
                onClose();
                onTriggerLogin();
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-6 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-purple-600/20 cursor-pointer"
            >
              🔓 Authenticate Admin
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-4 pb-2">
            
            {/* Tab Switcher */}
            <div className="flex gap-1 bg-slate-950/60 p-1 rounded-2xl border border-purple-500/10" id="admin-tabs">
              <button
                type="button"
                onClick={() => setActiveTab('cluster')}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'cluster'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/15'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                💾 Database Cluster
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('alerts')}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'alerts'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/15'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                🚨 Alert Checklist ({alertEmails.length})
              </button>
            </div>

            {activeTab === 'cluster' ? (
              <div className="space-y-4 animate-fadeIn">
                {/* Cluster Nodes List */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9px] text-purple-300 font-bold uppercase tracking-wider font-mono">
                      Federated Cluster Directory ({scriptUrls.length} total)
                    </label>
                    <span className="text-[8px] text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full animate-pulse">
                      ● Sync Live
                    </span>
                  </div>

                  {/* Active Primary Node */}
                  <div className="space-y-1.5">
                    <div className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                      ⚡ Primary Active Database Node
                    </div>
                    {scriptUrls.length > 0 ? (
                      (() => {
                        const url = scriptUrls[0];
                        return (
                          <div 
                            className="p-2.5 rounded-2xl border bg-purple-500/10 border-purple-500/30 shadow-[0_4px_15px_rgba(139,92,246,0.15)] flex justify-between items-center gap-2.5 transition-all"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8.5px] font-black px-2 py-0.5 rounded-lg font-mono bg-purple-500 text-white">
                                  PRIMARY NODE #1
                                </span>
                                <span className="text-[7.5px] font-bold text-purple-300 uppercase font-mono">
                                  ACTIVE WRITE
                                </span>
                              </div>
                              <p className="text-[9.5px] text-purple-200 truncate mt-1 select-all" title={url}>
                                {url}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveNode(0)}
                              className="text-red-400 hover:text-red-300 p-1.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                              title="Disconnect primary node"
                            >
                              🗑️
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-2xl text-center text-[10px] text-red-400 italic font-medium">
                        No active primary database node. Please configure below.
                      </div>
                    )}
                  </div>

                  {/* Archived Nodes */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                        📦 Archived Database Nodes ({scriptUrls.length > 1 ? scriptUrls.length - 1 : 0})
                      </div>
                      {scriptUrls.length > 1 && (
                        <span className="text-[7.5px] font-bold text-emerald-400 uppercase font-mono bg-emerald-500/10 px-1.5 py-0.2 rounded">
                          Auto-Consolidation Ready
                        </span>
                      )}
                    </div>

                    {scriptUrls.length > 1 ? (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-0.5">
                        {scriptUrls.slice(1).map((url, sliceIdx) => {
                          const idx = sliceIdx + 1;
                          return (
                            <div 
                              key={idx} 
                              className="p-2 rounded-2xl border bg-slate-950/60 border-purple-500/10 hover:border-purple-500/20 flex justify-between items-center gap-2.5 transition-all"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[8px] font-bold px-1.5 py-0.3 rounded bg-slate-800 text-slate-400 font-mono">
                                    ARCHIVE #{idx}
                                  </span>
                                  <span className="text-[7px] font-bold text-gray-400 uppercase font-mono">
                                    READ-ONLY ARCHIVE
                                  </span>
                                </div>
                                <p className="text-[9px] text-gray-500 truncate mt-0.5 select-all" title={url}>
                                  {url}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveNode(idx)}
                                className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-[10px]"
                                title="Disconnect archived node"
                              >
                                🗑️
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950/20 border border-dashed border-purple-500/10 rounded-2xl text-center text-[9px] text-gray-500 italic leading-relaxed">
                        No archived database nodes connected. When your active database grows, add a new blank database link as Primary to automatically transition this database to the archives list.
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Node Form */}
                <form onSubmit={handleAddNode} className="space-y-2.5 bg-white/2 p-3 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <label className="block text-[8.5px] text-purple-300 font-bold uppercase tracking-wider font-mono">
                      Connect New Spreadsheet Node
                    </label>
                    <input
                      type="url"
                      required
                      value={newNodeUrl}
                      onChange={(e) => setNewNodeUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-slate-950/50 border border-purple-500/20 rounded-xl px-3 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-purple-400 font-mono"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-[9.5px] text-gray-400 cursor-pointer">
                        <input 
                          type="radio" 
                          name="adminPosition" 
                          checked={addPosition === 'primary'} 
                          onChange={() => setAddPosition('primary')}
                          className="accent-purple-500" 
                        />
                        <span>Make Primary (Write)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[9.5px] text-gray-400 cursor-pointer">
                        <input 
                          type="radio" 
                          name="adminPosition" 
                          checked={addPosition === 'secondary'} 
                          onChange={() => setAddPosition('secondary')}
                          className="accent-purple-500" 
                        />
                        <span>Secondary (Read Only)</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full sm:w-auto px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-purple-600/15 active:scale-95 text-center"
                    >
                      Add Node
                    </button>
                  </div>
                </form>

                {/* Clean database checklist */}
                <div className="bg-slate-950/40 border border-purple-500/10 p-3.5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-purple-300 font-black text-[10px] uppercase font-mono border-b border-purple-500/10 pb-1.5">
                    <span>🧼</span> Fresh Database Cleansing Checklist
                  </div>
                  <p className="text-[9px] text-gray-400 leading-normal">
                    When duplicating <code className="text-purple-200 bg-purple-500/10 px-1 py-0.2 rounded">Worship_Chordbook_DB</code> to form a fresh new node, clear these tabs of row content (keep Row 1 headers intact):
                  </p>
                  <ul className="space-y-2 pl-1">
                    <li className="flex items-start gap-1.5 text-[9.5px] text-gray-300 leading-normal">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <div>
                        <strong className="text-white">Songs</strong>: Delete all data rows below Row 1 to wipe existing song catalog.
                      </div>
                    </li>
                    <li className="flex items-start gap-1.5 text-[9.5px] text-gray-300 leading-normal">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <div>
                        <strong className="text-white">SongLines</strong>: Delete all data rows below Row 1 to wipe lyrical/chord data.
                      </div>
                    </li>
                    <li className="flex items-start gap-1.5 text-[9.5px] text-gray-300 leading-normal">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <div>
                        <strong className="text-white">Setlists</strong>: Clear all rows below Row 1. The web app automatically generates system configuration rows when connected.
                      </div>
                    </li>
                    <li className="flex items-start gap-1.5 text-[9.5px] text-gray-300 leading-normal">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <div>
                        <strong className="text-white">SyncVersion</strong>: Clear all rows, and insert a seed row (<code className="text-purple-200">ID: 1, Version: 1, Timestamp: Current epoch time</code>) so client updates initialize correctly.
                      </div>
                    </li>
                    <li className="flex items-start gap-1.5 text-[9.5px] text-gray-300 leading-normal">
                      <span className="text-purple-400 font-bold mt-0.5">•</span>
                      <div>
                        <strong className="text-white">Locks & Users</strong>: Delete all rows inside <code className="text-purple-200">Locks</code>. Keep your authorized user names/emails inside <code className="text-purple-200">Users</code> for authentication.
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                {/* Alert Explanation card */}
                <div className="bg-purple-950/15 border border-purple-500/15 p-3.5 rounded-2xl space-y-1.5">
                  <div className="text-[10px] text-purple-300 font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <span>💡</span> Failover & Capacity Alert Engine
                  </div>
                  <p className="text-[10px] text-gray-300 leading-normal">
                    When the primary active write node reaches <strong>8,000,000 cells</strong> (80% capacity):
                  </p>
                  <ul className="list-disc list-inside text-[9.5px] text-gray-400 space-y-1 pl-1 leading-normal">
                    <li>The system automatically attempts to <strong>auto-jump</strong> to a healthy backup replica node with space.</li>
                    <li>If <strong>no backup database is found</strong>, a critical email alert will immediately be sent to all configured recipients below.</li>
                    <li>As capacity grows, the system will send follow-up notifications <strong>every 250,000 cells</strong> above the baseline (e.g., 8.25M, 8.5M).</li>
                  </ul>
                </div>

                {/* Emails list */}
                <div className="space-y-2">
                  <label className="block text-[9px] text-purple-300 font-bold uppercase tracking-wider font-mono">
                    Notification Recipients List ({alertEmails.length})
                  </label>
                  {alertEmails.length === 0 ? (
                    <div className="p-4 bg-slate-950/20 border border-dashed border-purple-500/15 rounded-2xl text-center text-[10px] text-gray-500 italic">
                      No email addresses added yet. Add recipients below to receive capacity warning reports.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {alertEmails.map((email, idx) => (
                        <div 
                          key={idx}
                          className="flex justify-between items-center bg-white/2 border border-white/5 p-2 rounded-xl text-[10.5px] text-gray-300"
                        >
                          <span className="font-mono truncate">{email}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = alertEmails.filter((_, i) => i !== idx);
                              onSaveAlertEmails(updated);
                            }}
                            className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-[10px]"
                            title="Remove recipient"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Email Form */}
                <div className="space-y-2 bg-white/2 p-3 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <label className="block text-[8.5px] text-purple-300 font-bold uppercase tracking-wider font-mono">
                      Add Email Recipient
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        id="new-alert-email"
                        placeholder="admin@example.com"
                        className="flex-1 bg-slate-950/50 border border-purple-500/20 rounded-xl px-3 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-purple-400 font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val && val.includes('@')) {
                              if (alertEmails.includes(val)) {
                                alert('This email is already in the recipient list.');
                                return;
                              }
                              onSaveAlertEmails([...alertEmails, val]);
                              e.currentTarget.value = '';
                            } else if (val) {
                              alert('Please enter a valid email address.');
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('new-alert-email') as HTMLInputElement;
                          if (input) {
                            const val = input.value.trim();
                            if (val && val.includes('@')) {
                              if (alertEmails.includes(val)) {
                                alert('This email is already in the recipient list.');
                                return;
                              }
                              onSaveAlertEmails([...alertEmails, val]);
                              input.value = '';
                            } else if (val) {
                              alert('Please enter a valid email address.');
                            }
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shadow-purple-600/15 active:scale-95"
                      >
                        Add
                      </button>
                    </div>
                    <span className="text-[8px] text-gray-500 block italic leading-tight mt-1">
                      Press Enter or click Add to save. Settings will be automatically synchronized with your central cluster sheet.
                    </span>
                  </div>
                </div>

                {/* Send Test Email Button */}
                {alertEmails.length > 0 && (
                  <div className="bg-purple-950/20 border border-purple-500/15 p-3.5 rounded-2xl flex flex-col gap-2">
                    <div>
                      <div className="text-[9px] text-purple-300 font-bold uppercase tracking-wider font-mono">
                        🧪 Test Email Dispatcher
                      </div>
                      <p className="text-[8.5px] text-gray-400 leading-normal mt-0.5">
                        Verify that your connected Google Sheet's Apps Script can successfully send emails to your recipients.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={testingEmail}
                      onClick={handleSendTestEmail}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-500/30 hover:border-purple-500/60 disabled:opacity-50 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 text-center flex items-center justify-center gap-1.5"
                    >
                      {testingEmail ? (
                        <>
                          <span className="animate-spin inline-block w-3 h-3 border-2 border-purple-300 border-t-transparent rounded-full mr-1"></span>
                          Sending Test Email...
                        </>
                      ) : (
                        '✉️ Send Test Capacity Alert Email'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions / Diagnostic Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-slate-950/20 border border-purple-500/10 rounded-2xl flex flex-col justify-center">
                <span className="text-[7.5px] text-gray-500 font-bold uppercase font-mono">Sync Status</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                  <span className="text-[10px] font-black text-gray-200 font-mono">
                    {isOffline ? 'OFFLINE' : `${scriptUrls.length} ACTIVE NODES`}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/20 border border-purple-500/10 rounded-2xl flex flex-col justify-center">
                <span className="text-[7.5px] text-gray-500 font-bold uppercase font-mono">Last Synchronized</span>
                <span className="text-[10px] font-black text-gray-200 font-mono mt-0.5">
                  {lastSynced ? new Date(lastSynced).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>

            {/* Admin Action Row */}
            <div className="flex gap-2 bg-slate-950/35 p-2 rounded-2xl border border-purple-500/10">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncLoading}
                className="flex-1 bg-purple-600/15 hover:bg-purple-600/35 border border-purple-500/20 text-purple-200 hover:text-white py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
              >
                🔄 {syncLoading ? 'Syncing Cluster...' : 'Sync Cluster'}
              </button>
              
              <button
                type="button"
                onClick={handleResetCluster}
                className="bg-slate-900 hover:bg-slate-850 border border-purple-500/15 text-purple-300 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Reset Default
              </button>

              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                🔒 Lock Suite
              </button>
            </div>

            {/* Apps Script Code Grabber */}
            <div className="p-2.5 bg-slate-950/25 border border-purple-500/10 rounded-2xl space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[8.5px] text-purple-300 font-bold uppercase tracking-wider font-mono">Apps Script Setup</span>
                <button
                  onClick={copyAppsScriptInstructions}
                  className="text-[8px] bg-purple-500/10 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-lg font-bold hover:bg-purple-500/20 transition-all cursor-pointer"
                >
                  {copiedScript ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              <p className="text-[9.5px] text-gray-400 leading-tight">
                Connect additional sheets using the master sheet's Extensions → Apps Script code. Paste the script and deploy as a Web App with access set to "Anyone".
              </p>
            </div>

          </div>
        )}

        {/* Footer info and close button */}
        <div className="mt-3 pt-2.5 border-t border-purple-500/15 flex justify-between items-center flex-shrink-0">
          <p className="text-[8px] text-gray-500 font-mono font-medium">
            ADMIN GATEWAY • SECURE CLUSTER MANAGER
          </p>
          <button
            onClick={onClose}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-md shadow-purple-600/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
