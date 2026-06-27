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

    setLoading(true);
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
        showToast(
          editingSong ? 'Song updated successfully!' : 'Song created successfully!',
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
                <path strokeLinecap="round" strokeLinejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Song Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                validateForm(sections);
              }}
              className="col-span-2 bg-indigo-900/30 text-indigo-100 py-1.5 px-2.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/30"
            />
            <input
              type="text"
              placeholder="Artist"
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value);
                validateForm(sections);
              }}
              className="col-span-2 bg-indigo-900/30 text-indigo-100 py-1.5 px-2.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/30"
            />
            <select
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                validateForm(sections);
              }}
              className="col-span-2 bg-indigo-900/30 text-indigo-100 py-1.5 px-2.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/30 appearance-none cursor-pointer"
            >
              {NOTES.map((k) => (
                <option key={k} value={k} className="bg-[#0a0b16]">
                  Key of {k}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Version (e.g. 1.0)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="col-span-2 bg-indigo-900/30 text-indigo-100 py-1.5 px-2.5 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400/60 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/30"
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest font-extrabold text-indigo-400 select-none">
              Diatonic Key Reference:
            </span>
            {renderFamilyChords()}
          </div>

          {keyWarning && (
            <div className="mt-2 p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] rounded-lg leading-relaxed flex items-start gap-1.5 animate-fadeIn">
              <span className="text-xs select-none mt-0.5">⚠️</span>
              <div>
                <strong className="block uppercase tracking-wide text-[9px]">Key Alignment Warning</strong>
                {keyWarning}
              </div>
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 pr-1 pb-2 custom-scrollbar">
          <div className="space-y-3 mb-2">
            {sections.map((sec, sIdx) => (
              <div
                key={sIdx}
                className="bg-indigo-900/10 p-2 sm:p-3 rounded-xl shadow-[inset_0_0_20px_rgba(99,102,241,0.05)] border border-indigo-500/25 mb-2 transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <input
                    type="text"
                    placeholder="Section Name (e.g. Chorus)"
                    value={sec.name}
                    onChange={(e) => handleSectionNameChange(e.target.value, sIdx)}
                    className="flex-1 bg-indigo-900/40 py-1.5 px-2.5 rounded-md outline-none focus:ring-1 focus:ring-indigo-400/60 text-[11px] font-bold uppercase tracking-wide text-indigo-100 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/20 placeholder-indigo-300/40"
                  />
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(sIdx)}
                      className="text-rose-400/50 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors"
                      title="Remove entire section"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {warnings[sIdx] && (
                  <div className="text-[9px] text-rose-400 mb-1.5 font-semibold">
                    {warnings[sIdx]}
                  </div>
                )}

                <p className="text-[8px] text-indigo-300/60 mb-2 italic select-none">
                  Note: Enter chords separated by spaces (e.g. <kbd className="font-mono font-bold text-indigo-300">C G</kbd> translates to <kbd className="font-mono font-bold text-indigo-300">C - G</kbd>). Use numbers 1-7 for instant diatonic mapping.
                </p>

                <div className="space-y-1">
                  {sec.lines.map((l, lIdx) => (
                    <div
                      key={lIdx}
                      className="flex flex-col sm:flex-row gap-1.5 sm:gap-2 bg-indigo-950/40 p-1.5 rounded-lg border border-indigo-500/10 relative group items-start"
                    >
                      <div className="w-full sm:w-[40%] flex-shrink-0">
                        <textarea
                          rows={1}
                          placeholder="Chords (e.g. A B)"
                          value={l.chords}
                          onChange={(e) => handleLineChange('chords', e.target.value, sIdx, lIdx, false)}
                          onBlur={(e) => handleLineChange('chords', e.target.value, sIdx, lIdx, true)}
                          className="w-full bg-indigo-900/30 py-1.5 px-2 rounded outline-none focus:ring-1 focus:ring-amber-500/50 text-xs text-amber-400 font-mono shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/25 placeholder-amber-600/30 resize-none"
                        />
                      </div>
                      <div className="w-full sm:w-[60%] flex gap-1.5 items-start">
                        <textarea
                          rows={1}
                          placeholder="Lyrics"
                          value={l.lyrics}
                          onChange={(e) => handleLineChange('lyrics', e.target.value, sIdx, lIdx)}
                          className="flex-1 bg-indigo-900/30 py-1.5 px-2 rounded outline-none focus:ring-1 focus:ring-indigo-400/60 text-xs text-gray-100 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border border-indigo-500/25 placeholder-indigo-300/35 resize-none"
                        />
                        <button
                          onClick={() => removeLine(sIdx, lIdx)}
                          className="text-indigo-400/30 hover:text-rose-400 p-1 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-0.5"
                          title="Remove line"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-1.5">
                  <button
                    onClick={() => addLine(sIdx)}
                    className="text-[9px] text-indigo-300 hover:text-indigo-100 font-extrabold uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 py-1"
                  >
                    + Add Line
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addSection}
            className="w-full mt-1 mb-2 py-2.5 btn-5d text-indigo-300 hover:text-white text-[11px] font-bold tracking-widest rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm border border-indigo-500/25"
          >
            + ADD NEW SECTION BLOCK
          </button>
        </div>

        <div className="flex-shrink-0 pt-2 border-t border-indigo-500/20">
          <button
            onClick={submitForm}
            disabled={saveDisabled}
            className={`w-full py-2.5 rounded-lg text-white text-[13px] font-bold tracking-wider shadow-lg active:scale-95 transition-all ${
              saveDisabled
                ? 'bg-indigo-950/40 text-gray-500 border border-indigo-500/10 cursor-not-allowed opacity-50'
                : 'btn-5d-primary'
            }`}
          >
            SAVE SONG SHEET
          </button>
        </div>
      </div>
    </div>
  );
};
