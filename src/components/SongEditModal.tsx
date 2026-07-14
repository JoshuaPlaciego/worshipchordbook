import React, { useState, useEffect } from 'react';
import { Song, SongLine, SectionEdit } from '../types';
import { NOTE_TO_INDEX, NOTES, SCALE_NUMBERS } from '../utils';

interface SongEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSong: Song | null;
  songLines: SongLine[];
  appUser: string;
  appSecret: string;
  scriptUrl: string;
  onSubmitSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  setLoading: (loading: boolean) => void;
  usedSectionNames?: string[];
  songs: Song[];
}

export const SongEditModal: React.FC<SongEditModalProps> = ({
  isOpen,
  onClose,
  editingSong,
  songLines,
  appUser,
  appSecret,
  scriptUrl,
  onSubmitSuccess,
  showToast,
  setLoading,
  usedSectionNames = [],
  songs = [],
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('C');
  const [version, setVersion] = useState('1.0');
  const [sections, setSections] = useState<SectionEdit[]>([
    { name: '', lines: [{ chords: '', lyrics: '' }] }
  ]);
  const [warnings, setWarnings] = useState<{ [key: number]: string }>({});
  const [keyWarning, setKeyWarning] = useState('');
  const [saveDisabled, setSaveDisabled] = useState(false);

  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockedByUser, setLockedByUser] = useState('');
  const [lastTypingHeartbeat, setLastTypingHeartbeat] = useState(0);

  // Mock google.script.run interface that performs fetch calls to Apps Script backend
  const googleScriptRun = {
    withSuccessHandler: function(onSuccess: (data: any) => void) {
      const runMethod = (action: string, payload: any) => {
        fetch(scriptUrl, {
          method: 'POST',
          body: JSON.stringify({ action, ...payload }),
        })
          .then((res) => res.json())
          .then((data) => onSuccess(data))
          .catch((err) => console.error(`Error in Apps Script action ${action}:`, err));
      };
      return {
        withFailureHandler: function(onFailure: (err: any) => void) {
          return {
            checkLock: (lockId: string) => {
              fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({ action: 'checkLock', lockId }),
              })
                .then((res) => res.json())
                .then((data) => onSuccess(data))
                .catch((err) => onFailure(err));
            },
            acquireLock: (lockId: string, username: string) => {
              fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({ action: 'acquireLock', lockId, username }),
              })
                .then((res) => res.json())
                .then((data) => onSuccess(data))
                .catch((err) => onFailure(err));
            },
            releaseLock: (lockId: string, username: string) => {
              fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({ action: 'releaseLock', lockId, username }),
              })
                .then((res) => res.json())
                .then((data) => onSuccess(data))
                .catch((err) => onFailure(err));
            },
            updateLockHeartbeat: (lockId: string, username: string) => {
              fetch(scriptUrl, {
                method: 'POST',
                body: JSON.stringify({ action: 'updateLockHeartbeat', lockId, username }),
              })
                .then((res) => res.json())
                .then((data) => onSuccess(data))
                .catch((err) => onFailure(err));
            }
          };
        },
        checkLock: (lockId: string) => runMethod('checkLock', { lockId }),
        acquireLock: (lockId: string, username: string) => runMethod('acquireLock', { lockId, username }),
        releaseLock: (lockId: string, username: string) => runMethod('releaseLock', { lockId, username }),
        updateLockHeartbeat: (lockId: string, username: string) => runMethod('updateLockHeartbeat', { lockId, username })
      };
    }
  };

  // Lock management: On-Load Check, release lock on unmount, active checks
  useEffect(() => {
    if (!isOpen || !editingSong) {
      setIsLockedByOther(false);
      setLockedByUser('');
      return;
    }

    const lockId = `song_${editingSong.SongID}`;
    const username = appUser || 'Viewer';

    // On-Load Check: Fetch the lock status immediately
    googleScriptRun.withSuccessHandler((result: any) => {
      if (result.isLocked && result.lockedBy !== username) {
        setIsLockedByOther(true);
        setLockedByUser(result.lockedBy);
        showToast(`${result.lockedBy} is currently editing this song. Please wait.`, 'info');
      } else {
        setIsLockedByOther(false);
        setLockedByUser('');
        // Acquire lock on load
        googleScriptRun.withSuccessHandler((acquireRes: any) => {
          if (!acquireRes.success) {
            setIsLockedByOther(true);
            setLockedByUser(acquireRes.lockedBy);
            showToast(`${acquireRes.lockedBy} has locked this song for editing.`, 'error');
          }
        }).acquireLock(lockId, username);
      }
    }).checkLock(lockId);

    // Release lock when modal is closed
    return () => {
      googleScriptRun.withSuccessHandler(() => {}).releaseLock(lockId, username);
    };
  }, [isOpen, editingSong, appUser]);

  // Heartbeat check: lightweight 45-second heartbeat setInterval
  useEffect(() => {
    if (!isOpen || !editingSong) return;

    const lockId = `song_${editingSong.SongID}`;
    const username = appUser || 'Viewer';

    const interval = setInterval(() => {
      googleScriptRun.withSuccessHandler((result: any) => {
        if (result.isLocked && result.lockedBy !== username) {
          setIsLockedByOther(true);
          setLockedByUser(result.lockedBy);
          showToast(`Admin or ${result.lockedBy} is now editing this song. Please wait.`, 'error');
        }
      }).checkLock(lockId);
    }, 45000);

    return () => clearInterval(interval);
  }, [isOpen, editingSong, appUser]);

  // Visibility Change API: Check lock status when user returns to tab
  useEffect(() => {
    if (!isOpen || !editingSong) return;

    const lockId = `song_${editingSong.SongID}`;
    const username = appUser || 'Viewer';

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        googleScriptRun.withSuccessHandler((result: any) => {
          if (result.isLocked && result.lockedBy !== username) {
            setIsLockedByOther(true);
            setLockedByUser(result.lockedBy);
            showToast(`${result.lockedBy} is currently editing this song. Please wait.`, 'error');
          } else if (!result.isLocked) {
            googleScriptRun.withSuccessHandler(() => {}).acquireLock(lockId, username);
          }
        }).checkLock(lockId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, editingSong, appUser]);

  // Silent On-Focus Check (The Secret Weapon)
  const handleInputFocus = () => {
    if (!editingSong) return;
    const lockId = `song_${editingSong.SongID}`;
    const username = appUser || 'Viewer';

    googleScriptRun.withSuccessHandler((result: any) => {
      if (result.isLocked && result.lockedBy !== username) {
        setIsLockedByOther(true);
        setLockedByUser(result.lockedBy);
        showToast(`${result.lockedBy} is currently editing this song. Please wait.`, 'error');
      }
    }).checkLock(lockId);
  };

  // Throttled active timestamp update (every 15 seconds of typing)
  const handleUserTyping = () => {
    if (!editingSong) return;
    const now = Date.now();
    if (now - lastTypingHeartbeat > 15000) {
      setLastTypingHeartbeat(now);
      const lockId = `song_${editingSong.SongID}`;
      const username = appUser || 'Viewer';

      googleScriptRun.withSuccessHandler((result: any) => {
        if (!result.success) {
          setIsLockedByOther(true);
          setLockedByUser(result.lockedBy);
          showToast(`This song is now locked by ${result.lockedBy}.`, 'error');
        }
      }).updateLockHeartbeat(lockId, username);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (editingSong) {
        setTitle(editingSong.Title || '');
        setArtist(editingSong.Artist || '');
        setKey(editingSong.OriginalKey || 'C');
        setVersion(editingSong.Version || '1.0');

        // Dissect current songLines into sections
        const parsedSections: SectionEdit[] = [];
        let currentSecObj: SectionEdit | null = null;

        songLines.forEach((l) => {
          const secName = l.SectionName || l.Section || l.section || 'Section';
          if (!currentSecObj || currentSecObj.name !== secName) {
            currentSecObj = { name: secName, lines: [] };
            parsedSections.push(currentSecObj);
          }
          currentSecObj.lines.push({
            chords: l.Chords || '',
            lyrics: l.Lyrics || '',
          });
        });

        if (parsedSections.length === 0) {
          setSections([{ name: '', lines: [{ chords: '', lyrics: '' }] }]);
        } else {
          setSections(parsedSections);
        }
      } else {
        setTitle('');
        setArtist('');
        setKey('C');
        setVersion('1.0');
        setSections([{ name: '', lines: [{ chords: '', lyrics: '' }] }]);
      }
      setWarnings({});
      setKeyWarning('');
      setSaveDisabled(false);
    }
  }, [isOpen, editingSong, songLines]);

  const addSection = () => {
    setSections([...sections, { name: '', lines: [{ chords: '', lyrics: '' }] }]);
  };

  const removeSection = (sIdx: number) => {
    const sec = sections[sIdx];
    if (sec && usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong) {
      showToast(`Cannot delete section "${sec.name}" because it is currently used in active arrangements or setlists.`, 'error');
      return;
    }
    if (sections.length <= 1) return;
    const next = [...sections];
    next.splice(sIdx, 1);
    setSections(next);
  };

  const addLine = (sIdx: number) => {
    const next = [...sections];
    next[sIdx].lines.push({ chords: '', lyrics: '' });
    setSections(next);
  };

  const removeLine = (sIdx: number, lIdx: number) => {
    if (sections[sIdx].lines.length <= 1) return;
    const next = [...sections];
    next[sIdx].lines.splice(lIdx, 1);
    setSections(next);
  };

  const handleSectionNameChange = (val: string, sIdx: number) => {
    const next = [...sections];
    next[sIdx].name = val;
    setSections(next);
    validateForm(next);
  };

  const handleLineChange = (
    field: 'chords' | 'lyrics',
    val: string,
    sIdx: number,
    lIdx: number,
    isFinal = false
  ) => {
    const next = [...sections];
    let processedVal = val;

    if (field === 'chords') {
      processedVal = processedVal.replace(/[^A-Ga-gmMbB#\/0-9diDI -]/g, '');
      processedVal = processedVal.toUpperCase();
      processedVal = processedVal.replace(/M/g, 'm'); 
      processedVal = processedVal.replace(/([A-G])B/g, '$1b'); 
      processedVal = processedVal.replace(/DIM/g, 'dim'); 

      if (key) {
        const keyIdx = NOTE_TO_INDEX[key];
        if (keyIdx !== undefined) {
          const intervals = [0, 2, 4, 5, 7, 9, 11];
          const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
          const useSharps = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'].includes(key);
          const scaleNotes = useSharps 
            ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] 
            : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

          // Translate numbers (1-7) to Diatonic chords
          processedVal = processedVal.replace(/(^|[\s/|-])([1-7])(?=[\s/|-]|$)/g, (match, prefix, num) => {
            const degreeIdx = parseInt(num) - 1;
            const noteIdx = (keyIdx + intervals[degreeIdx]) % 12;
            const quality = prefix === '/' ? '' : qualities[degreeIdx];
            return prefix + scaleNotes[noteIdx] + quality;
          });

          // Diatonic Quality Auto-complete logic
          const replacerLogic = (match: string, prefix: string, root: string) => {
            if (prefix === '/') return match;
            const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
            const rootIdx = NOTE_TO_INDEX[formattedRoot];
            if (rootIdx !== undefined) {
              const distance = (rootIdx - keyIdx + 12) % 12;
              if (distance === 0 || distance === 5 || distance === 7) {
                return prefix + root; 
              } else if (distance === 2 || distance === 4 || distance === 9) {
                return prefix + root + 'm'; 
              } else if (distance === 11) {
                return prefix + root + 'dim'; 
              }
            }
            return match;
          };

          if (isFinal) {
            processedVal = processedVal.replace(/(^|[\s/|-])([A-G][#b]?)(m|dim)?(?=[\s/|-]|$)/g, replacerLogic);
          } else {
            processedVal = processedVal.replace(/(^|[\s/|-])([A-G][#b]?)(m|dim)?(?=[\s/|-])/g, replacerLogic);
          }
        }
      }

      processedVal = processedVal.replace(/[\s-]+(?=[^\s-])/g, ' - ');
      processedVal = processedVal.replace(/[\s-]+$/, ' ');
      if (isFinal) processedVal = processedVal.trim();
    }

    next[sIdx].lines[lIdx] = {
      ...next[sIdx].lines[lIdx],
      [field]: processedVal,
    };

    setSections(next);
    validateForm(next);
  };

  const validateForm = (currentSections: SectionEdit[]) => {
    let hasDuplicate = false;
    let hasEmpty = false;
    const nextWarnings: { [key: number]: string } = {};

    currentSections.forEach((sec, idx) => {
      const name = (sec.name || '').trim().toLowerCase();

      if (!name) {
        hasEmpty = true;
        nextWarnings[idx] = '⚠️ Section name is required.';
        return;
      }

      const duplicateIndex = currentSections.findIndex(
        (otherSec, otherIdx) =>
          otherIdx !== idx && (otherSec.name || '').trim().toLowerCase() === name
      );

      if (duplicateIndex !== -1) {
        hasDuplicate = true;
        nextWarnings[idx] = `⚠️ Duplicate section name "${sec.name}" found!`;
      }
    });

    setWarnings(nextWarnings);
    setSaveDisabled(hasDuplicate || hasEmpty);
    validateKeyConsistency(currentSections);
  };

  const validateKeyConsistency = (currentSections: SectionEdit[]) => {
    if (!key) return;

    const enteredChords: string[] = [];
    currentSections.forEach((sec) => {
      sec.lines.forEach((line) => {
        if (line.chords) {
          const parts = line.chords.split(/[\s\-|/]+/);
          parts.forEach((part) => {
            const clean = part.trim();
            if (clean && !enteredChords.includes(clean)) {
              enteredChords.push(clean);
            }
          });
        }
      });
    });

    if (enteredChords.length < 3) {
      setKeyWarning('');
      return;
    }

    const parseChord = (chordStr: string) => {
      const match = chordStr.match(/^([A-G][#b]?)(m|dim|min)?/i);
      if (!match) return null;
      const root = match[1];
      let quality = 'maj';
      if (match[2]) {
        const q = match[2].toLowerCase();
        if (q.startsWith('m')) quality = 'min';
        else if (q.includes('dim')) quality = 'dim';
      }
      const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
      const rootIdx = NOTE_TO_INDEX[formattedRoot];
      if (rootIdx === undefined) return null;
      return { rootIdx, quality };
    };

    const parsedChords = enteredChords.map(parseChord).filter((c) => c !== null) as {
      rootIdx: number;
      quality: string;
    }[];

    let bestKey = key;
    let maxScore = -1;
    let selectedKeyScore = 0;

    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const qualities = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];

    NOTES.forEach((keyName) => {
      const keyIdx = NOTE_TO_INDEX[keyName];
      let score = 0;

      parsedChords.forEach((chord) => {
        for (let i = 0; i < 7; i++) {
          const diatonicRootIdx = (keyIdx + intervals[i]) % 12;
          const diatonicQuality = qualities[i];
          if (chord.rootIdx === diatonicRootIdx && chord.quality === diatonicQuality) {
            score += 1;
            if (i === 0) score += 0.5; // root bonus
            break;
          }
        }
      });

      if (keyName === key) {
        selectedKeyScore = score;
      }
      if (score > maxScore) {
        maxScore = score;
        bestKey = keyName;
      }
    });

    if (bestKey !== key && maxScore - selectedKeyScore >= 1.5) {
      setKeyWarning(`The chords you entered heavily suggest this song is in the key of ${bestKey} instead of ${key}.`);
    } else {
      setKeyWarning('');
    }
  };

  const submitForm = async () => {
    if (!title.trim() || !artist.trim()) {
      showToast('Title and Artist are required!', 'error');
      return;
    }

    // Check for duplicates (Title, Artist, Version only)
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();
    const normalizedVersion = (version || '1.0').trim().toLowerCase();

    const duplicateExists = songs.some(s => {
      // If we are editing, ignore the song itself
      if (editingSong && String(s.SongID) === String(editingSong.SongID)) {
        return false;
      }
      const sTitle = s.Title.trim().toLowerCase();
      const sArtist = (s.Artist || '').trim().toLowerCase();
      const sVersion = (s.Version || '1.0').trim().toLowerCase();
      return sTitle === normalizedTitle && sArtist === normalizedArtist && sVersion === normalizedVersion;
    });

    if (duplicateExists) {
      showToast(`A song with the title "${title.trim()}", artist "${artist.trim()}", and version "${version || '1.0'}" already exists in the catalog!`, 'error');
      return;
    }

    setLoading(true);

    // On-Save Check (The Safety Net)
    if (editingSong) {
      const lockId = `song_${editingSong.SongID}`;
      const username = appUser || 'Viewer';
      try {
        const checkRes = await fetch(scriptUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'checkLock', lockId }),
        });
        const lockStatus = await checkRes.json();
        if (lockStatus.isLocked && lockStatus.lockedBy !== username) {
          setIsLockedByOther(true);
          setLockedByUser(lockStatus.lockedBy);
          showToast(`Save Aborted! This song was locked for editing by ${lockStatus.lockedBy}.`, 'error');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Final save lock check failed, proceeding with caution', err);
      }
    }

    const isFallbackSong = editingSong && String(editingSong.SongID).startsWith('fallback-');

    if (!appUser || !appSecret || isFallbackSong) {
      try {
        const songId = editingSong?.SongID || `local-song-${Date.now()}`;
        
        // 1. Prepare song lines format
        const linesPayload = sections.flatMap((sec, sIdx) =>
          sec.lines.map((l, lIdx) => ({
            SongID: songId,
            SectionName: sec.name,
            Section: sec.name,
            section: sec.name,
            Order: lIdx + 1,
            order: lIdx + 1,
            Chords: l.chords,
            chords: l.chords,
            Lyrics: l.lyrics,
            lyrics: l.lyrics,
          }))
        );

        // 2. Save song lines to localStorage
        localStorage.setItem(`local_song_lines_${songId}`, JSON.stringify(linesPayload));

        // 3. Save song metadata/override to localStorage
        const songPayload = {
          SongID: songId,
          Title: title.trim(),
          Artist: artist.trim(),
          OriginalKey: key,
          Version: version || '1.0',
        };
        localStorage.setItem(`local_song_override_${songId}`, JSON.stringify(songPayload));

        // 4. If creating a new song, add it to local custom songs list
        if (!editingSong) {
          let localCustomSongs: Song[] = [];
          try {
            const raw = localStorage.getItem('local_custom_songs');
            if (raw) localCustomSongs = JSON.parse(raw);
          } catch {}
          
          localCustomSongs.push(songPayload);
          localStorage.setItem('local_custom_songs', JSON.stringify(localCustomSongs));
        }

        showToast(
          isFallbackSong
            ? 'Fallback song changes saved locally to your device!'
            : editingSong 
              ? 'Standalone changes saved locally to your browser!' 
              : 'New song created locally in your browser!',
          'success'
        );
        onSubmitSuccess();
        onClose();
      } catch (e) {
        showToast('Error saving changes locally.', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    const payload = {
      user: appUser,
      secret: appSecret,
      action: editingSong ? 'updateSong' : 'bulkAdd',
      song: {
        id: editingSong?.SongID || null,
        title: title.trim(),
        artist: artist.trim(),
        key: key,
        version: version || '1.0',
      },
      lines: sections.flatMap((sec, sIdx) =>
        sec.lines.map((l, lIdx) => ({
          section: sec.name,
          order: lIdx + 1,
          chords: l.chords,
          lyrics: l.lyrics,
        }))
      ),
    };

    try {
      const res = await fetch(scriptUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.status === 'success') {
        // If the song was from an archived database, delete it from there!
        if (editingSong && editingSong._sourceNodeUrl && editingSong._sourceNodeUrl !== scriptUrl) {
          try {
            await fetch(editingSong._sourceNodeUrl, {
              method: 'POST',
              body: JSON.stringify({
                action: 'deleteSongRecord',
                songId: String(editingSong.SongID),
                user: appUser,
                secret: appSecret,
              }),
            });
            console.log(`Replicated song ${editingSong.SongID} to active database and deleted from archived node: ${editingSong._sourceNodeUrl}`);
          } catch (delErr) {
            console.warn('Failed to delete migrated song from archived database:', delErr);
          }
        }
        showToast(
          editingSong ? 'Song updated successfully and replicated to active database!' : 'Song created successfully!',
          'success'
        );
        onSubmitSuccess();
        onClose();
      } else {
        showToast(result.message || 'Error saving song sheets.', 'error');
      }
    } catch (e) {
      showToast('Error saving song sheets.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper to render Diatonic chords for the current form key selection
  const renderFamilyChords = () => {
    const keyIdx = NOTE_TO_INDEX[key];
    if (keyIdx === undefined) return null;

    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const qualities = ['', 'm', 'm', '', '', 'm', 'dim'];
    const degrees = ['1', '2', '3', '4', '5', '6', '7'];
    const useSharps = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'].includes(key);
    const scaleNotes = useSharps 
      ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] 
      : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    return (
      <div className="flex items-center gap-2 font-mono flex-wrap text-[10px]">
        {degrees.map((deg, i) => {
          const noteIdx = (keyIdx + intervals[i]) % 12;
          return (
            <span
              key={deg}
              className="bg-indigo-950/40 border border-indigo-500/25 px-2 py-1 rounded text-indigo-200"
            >
              <span className="text-indigo-400 mr-1">{deg}</span>
              {scaleNotes[noteIdx]}
              {qualities[i]}
            </span>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[500] flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
      <div className="bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-3xl p-4 sm:p-6 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-[0_20px_50px_rgba(49,46,129,0.5)] border border-indigo-500/20 flex flex-col h-[95vh] md:h-[90vh]">
        <div className="flex-shrink-0 mb-3 border-b border-indigo-500/20 pb-3">
          <div className="flex items-center justify-between mb-3 select-none">
            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              {editingSong ? 'Edit Song Sheet' : 'Add New Song Sheet'}
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-lg text-indigo-400/60 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLockedByOther && (
          <div className="mx-4 sm:mx-6 mb-3 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2 animate-pulse shrink-0">
            <span className="text-sm">🔒</span>
            <p className="font-semibold">
              {lockedByUser === 'Admin' ? 'Nai-lock na ng Admin ang setlist na ito.' : `${lockedByUser} is currently editing this song. Please wait.`}
            </p>
          </div>
        )}

        <div className="overflow-y-auto flex-1 pr-1 pb-4 custom-scrollbar space-y-5 px-1">
          {/* Metadata Card */}
          <div className="bg-[#0b0c1e]/40 border border-indigo-500/15 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              
              {/* Song Title */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest select-none">
                  Song Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Still"
                  value={title}
                  disabled={isLockedByOther}
                  onFocus={handleInputFocus}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    validateForm(sections);
                    handleUserTyping();
                  }}
                  className="bg-[#030308]/60 hover:bg-[#030308]/90 focus:bg-indigo-950/40 text-white py-2 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 border border-indigo-500/15 focus:border-indigo-500/40 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed placeholder-indigo-300/25"
                />
              </div>

              {/* Artist */}
              <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest select-none">
                  Artist
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hillsong"
                  value={artist}
                  disabled={isLockedByOther}
                  onFocus={handleInputFocus}
                  onChange={(e) => {
                    setArtist(e.target.value);
                    validateForm(sections);
                    handleUserTyping();
                  }}
                  className="bg-[#030308]/60 hover:bg-[#030308]/90 focus:bg-indigo-950/40 text-white py-2 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 border border-indigo-500/15 focus:border-indigo-500/40 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed placeholder-indigo-300/25"
                />
              </div>

              {/* Version */}
              <div className="col-span-2 md:col-span-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest select-none">
                  Version
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1.0"
                  value={version}
                  disabled={isLockedByOther}
                  onFocus={handleInputFocus}
                  onChange={(e) => {
                    setVersion(e.target.value);
                    handleUserTyping();
                  }}
                  className="bg-[#030308]/60 hover:bg-[#030308]/90 focus:bg-indigo-950/40 text-white py-2 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 border border-indigo-500/15 focus:border-indigo-500/40 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed placeholder-indigo-300/25"
                />
              </div>

              {/* Original Key */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest select-none">
                  Original Key
                </label>
                <div className="relative">
                  <select
                    value={key}
                    disabled={isLockedByOther}
                    onFocus={handleInputFocus}
                    onChange={(e) => {
                      setKey(e.target.value);
                      validateForm(sections);
                      handleUserTyping();
                    }}
                    className="w-full bg-[#030308]/60 hover:bg-[#030308]/90 focus:bg-indigo-950/40 text-white py-2 px-3 pr-8 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 border border-indigo-500/15 focus:border-indigo-500/40 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {NOTES.map((k) => (
                      <option key={k} value={k} className="bg-[#0a0b16] text-white">
                        Key of {k}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-indigo-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Diatonic HUD inside Card */}
              <div className="col-span-2 flex flex-col gap-1.5 bg-indigo-950/30 border border-indigo-500/10 p-2 rounded-xl">
                <span className="text-[9px] uppercase tracking-widest font-extrabold text-indigo-400 select-none px-1">
                  Diatonic Key HUD:
                </span>
                {renderFamilyChords()}
              </div>

            </div>

            {keyWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] rounded-xl leading-relaxed flex items-start gap-2 animate-fadeIn">
                <span className="text-sm select-none shrink-0">⚠️</span>
                <div>
                  <strong className="block uppercase tracking-wider text-[8.5px] font-bold">Key Alignment Warning</strong>
                  {keyWarning}
                </div>
              </div>
            )}
          </div>

          {/* Arrangement safeguard box */}
          {!!editingSong && sections.some(sec => usedSectionNames.includes(sec.name.trim().toLowerCase())) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] rounded-xl leading-relaxed flex items-start gap-2 animate-fadeIn">
              <span className="text-sm select-none shrink-0">🔒</span>
              <div>
                <strong className="block uppercase tracking-wider text-[8.5px] font-black">Arrangement Safeguards Active</strong>
                Some sections are locked because they are used in active setlists or arrangements. You can freely edit their chords and lyrics, but you cannot rename or delete them to prevent breaking roadmap sequences.
              </div>
            </div>
          )}

          {/* Sections List */}
          <div className="space-y-4">
            {sections.map((sec, sIdx) => (
              <div
                key={sIdx}
                className="bg-[#0b0c1e]/20 hover:bg-[#0b0c1e]/30 border-l-4 border-indigo-500/40 p-4 sm:p-5 rounded-r-2xl rounded-l-md shadow-sm border border-y-indigo-500/10 border-r-indigo-500/10 mb-2 transition-all flex flex-col gap-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1 flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider select-none">Section Header Name</span>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="e.g. Chorus / Intro / Outro"
                        value={sec.name}
                        disabled={isLockedByOther}
                        onFocus={handleInputFocus}
                        onChange={(e) => {
                          handleSectionNameChange(e.target.value, sIdx);
                          handleUserTyping();
                        }}
                        readOnly={usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong}
                        className={`w-full bg-[#030308]/60 py-2 px-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/40 text-xs font-bold uppercase tracking-wider text-indigo-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border ${
                          usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong
                            ? 'border-amber-500/30 bg-amber-500/5 cursor-not-allowed pr-9 text-amber-200'
                            : 'border-indigo-500/15 focus:border-indigo-500/40'
                        } placeholder-indigo-300/20 disabled:opacity-40 disabled:cursor-not-allowed`}
                      />
                      {usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong && (
                        <span className="absolute right-3 text-xs" title="This section is locked because it is used in active arrangements or setlists.">🔒</span>
                      )}
                    </div>
                  </div>
                  
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(sIdx)}
                      disabled={isLockedByOther || (usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong)}
                      className={`mt-5 ${
                        (isLockedByOther || (usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong))
                          ? 'text-gray-600 cursor-not-allowed opacity-30 p-2 rounded-xl'
                          : 'text-rose-400/60 hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/10'
                      } transition-all`}
                      title={
                        usedSectionNames.includes(sec.name.trim().toLowerCase()) && !!editingSong
                          ? "This section is locked because it is used in active arrangements or setlists."
                          : "Remove entire section"
                      }
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {warnings[sIdx] && (
                  <div className="text-[10px] text-rose-400 font-semibold bg-rose-500/5 py-1 px-2.5 rounded-lg border border-rose-500/10">
                    ⚠️ {warnings[sIdx]}
                  </div>
                )}

                <div className="flex items-start gap-1.5 p-2 bg-[#030308]/30 rounded-xl text-[10px] text-indigo-300/60 select-none">
                  <span className="text-indigo-400 font-bold">Pro Tip:</span>
                  <p>
                    Enter chords separated by spaces (e.g. <span className="font-mono font-black text-amber-400">C G</span> translates to <span className="font-mono font-black text-amber-400">C - G</span>). Use numbers <span className="font-mono font-black text-indigo-400">1-7</span> for instant diatonic chord family mapping.
                  </p>
                </div>

                {/* Lines inside section block */}
                <div className="space-y-2">
                  {sec.lines.map((l, lIdx) => (
                    <div
                      key={lIdx}
                      className="flex flex-col sm:flex-row gap-2 bg-[#030308]/40 p-2 rounded-xl border border-indigo-500/5 hover:border-indigo-500/15 relative group items-start sm:items-center transition-all"
                    >
                      <div className="w-full sm:w-[35%] flex-shrink-0 flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider select-none sm:hidden">Chords</span>
                        <textarea
                          rows={1}
                          placeholder="Chords (e.g. 1 5 6 4)"
                          value={l.chords}
                          disabled={isLockedByOther}
                          onFocus={handleInputFocus}
                          onChange={(e) => {
                            handleLineChange('chords', e.target.value, sIdx, lIdx, false);
                            handleUserTyping();
                          }}
                          onBlur={(e) => handleLineChange('chords', e.target.value, sIdx, lIdx, true)}
                          className="w-full bg-white py-2 px-2.5 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs text-indigo-900 font-mono font-bold shadow-sm border border-indigo-300/30 focus:border-indigo-500/50 placeholder-slate-400 resize-none disabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="w-full sm:w-[65%] flex gap-2 items-center">
                        <div className="flex-1 flex flex-col gap-1">
                          <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-wider select-none sm:hidden">Lyrics</span>
                          <textarea
                            rows={1}
                            placeholder="Lyrics (e.g. Hide me now...)"
                            value={l.lyrics}
                            disabled={isLockedByOther}
                            onFocus={handleInputFocus}
                            onChange={(e) => {
                              handleLineChange('lyrics', e.target.value, sIdx, lIdx);
                              handleUserTyping();
                            }}
                            className="w-full bg-white py-2 px-2.5 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs text-slate-800 shadow-sm border border-indigo-300/30 focus:border-indigo-500/50 placeholder-slate-400 resize-none disabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                        <button
                          onClick={() => removeLine(sIdx, lIdx)}
                          disabled={isLockedByOther}
                          className="text-indigo-400/40 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shrink-0 mt-4 sm:mt-0 disabled:cursor-not-allowed"
                          title="Remove line"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Line inside section block */}
                <div className="mt-1">
                  <button
                    onClick={() => addLine(sIdx)}
                    disabled={isLockedByOther}
                    className={`text-[9px] font-extrabold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-indigo-500/10 ${
                      isLockedByOther
                        ? 'text-gray-600 cursor-not-allowed opacity-50 bg-transparent'
                        : 'text-indigo-300 hover:text-indigo-100 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-500/30'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Line
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add New Section Block Button */}
          <button
            onClick={addSection}
            disabled={isLockedByOther}
            className={`w-full mt-2 py-3 text-[11px] font-black tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md border uppercase ${
              isLockedByOther
                ? 'bg-[#0a0b16]/30 text-gray-600 border-indigo-500/10 cursor-not-allowed opacity-50'
                : 'bg-indigo-900/10 hover:bg-indigo-900/20 text-indigo-200 hover:text-white border-dashed border-indigo-500/30 hover:border-indigo-500/60'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Add New Section Block
          </button>
        </div>

        <div className="flex-shrink-0 pt-3 border-t border-indigo-500/20">
          <button
            onClick={submitForm}
            disabled={saveDisabled || isLockedByOther}
            className={`w-full py-3 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 ${
              (saveDisabled || isLockedByOther)
                ? 'bg-indigo-950/40 text-gray-500 border border-indigo-500/10 cursor-not-allowed opacity-50'
                : 'bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-[#0f172a] border border-[#fbbf24]/40 shadow-lg shadow-[#fbbf24]/20'
            }`}
          >
            <span>💾</span>
            <span>SAVE SONG SHEET</span>
          </button>
        </div>
      </div>
    </div>
  );
};
