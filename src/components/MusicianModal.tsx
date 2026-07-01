import React, { useState, useEffect } from 'react';
import { getChordTheoryData, NOTE_TO_INDEX, GUITAR_DIAGRAMS } from '../utils';
import { FretboardVisualizer } from './FretboardVisualizer';
import { PianoVisualizer } from './PianoVisualizer';

class WebAudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.7;

  constructor() {
    try {
      const stored = localStorage.getItem('musician_modal_volume');
      if (stored !== null) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load volume from localStorage:", e);
    }
  }

  public initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public getVolume() {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('musician_modal_volume', String(this.volume));
    } catch (e) {
      console.warn("Failed to save volume to localStorage:", e);
    }
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  private getDestination(ctx: AudioContext): AudioNode {
    this.initCtx();
    return this.masterGain || ctx.destination;
  }

  public playMidiNotes(midiNotes: number[], type: 'chord' | 'scale', instrument: 'piano' | 'guitar' | 'bass' | 'lead' = 'piano') {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;

      if (type === 'chord') {
        const sortedNotes = [...midiNotes].sort((a, b) => a - b);
        sortedNotes.forEach((midi, idx) => {
          const time = now + idx * 0.04;
          this.playSingleTone(ctx, midi, time, 1.6, instrument);
        });
      } else {
        midiNotes.forEach((midi, idx) => {
          const time = now + idx * 0.22;
          this.playSingleTone(ctx, midi, time, 0.45, instrument);
        });
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  private playSingleTone(ctx: AudioContext, midi: number, startTime: number, duration: number, instrument: string) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const dest = this.getDestination(ctx);

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    osc.frequency.setValueAtTime(freq, startTime);

    if (instrument === 'bass') {
      osc.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, startTime);
      filter.Q.setValueAtTime(1, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.45, startTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    } else if (instrument === 'guitar' || instrument === 'lead') {
      osc.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, startTime);
      filter.frequency.exponentialRampToValueAtTime(320, startTime + duration);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.35, startTime + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      if (instrument === 'lead') {
        const overtone = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, startTime);
        
        overtoneGain.gain.setValueAtTime(0.06, startTime);
        overtoneGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7);

        overtone.connect(overtoneGain);
        overtoneGain.connect(dest);
        overtone.start(startTime);
        overtone.stop(startTime + duration * 0.7);
      }
    } else {
      osc.type = 'sine';
      
      const harm = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harm.type = 'triangle';
      harm.frequency.setValueAtTime(freq * 2, startTime);
      harmGain.gain.setValueAtTime(0.04, startTime);
      harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.5);

      harm.connect(harmGain);
      harmGain.connect(dest);
      harm.start(startTime);
      harm.stop(startTime + duration * 0.5);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    }

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

const audioSynth = new WebAudioSynth();

interface MusicianModalProps {
  isOpen: boolean;
  onClose: () => void;
  chordName: string;
  songKey: string;
  onOpenFretboardHelp: () => void;
  onOpenKeysHelp: () => void;
}

type TabType = 'guitar' | 'keys' | 'bass' | 'lead' | 'ideas';

export const MusicianModal: React.FC<MusicianModalProps> = ({
  isOpen,
  onClose,
  chordName,
  songKey,
  onOpenFretboardHelp,
  onOpenKeysHelp,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('keys');
  const [selectedSubChord, setSelectedSubChord] = useState<string | null>(null);
  const [selectedLeadScale, setSelectedLeadScale] = useState<string | null>(null);
  const [volume, setVolumeState] = useState<number>(() => audioSynth.getVolume());

  const handleVolumeChange = (newVol: number) => {
    setVolumeState(newVol);
    audioSynth.setVolume(newVol);
  };

  const [activeHelpDetail, setActiveHelpDetail] = useState<{
    title: string;
    type: 'chord' | 'scale' | 'riff' | 'voicing';
    instrument: 'guitar' | 'keys' | 'bass' | 'lead';
    notes: string[];
    theoryInfo: string;
    dotsOrAbsoluteNotes: any[];
    technique: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('keys');
      setSelectedSubChord(null);
      setSelectedLeadScale(null);
      setActiveHelpDetail(null);
      
      // Global click/touchstart audio resumption trigger for mobile web browser compliance (iOS/Android Safari/Chrome)
      const resumeAudio = () => {
        audioSynth.initCtx();
      };
      window.addEventListener('click', resumeAudio, { once: true });
      window.addEventListener('touchstart', resumeAudio, { once: true });
      return () => {
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
      };
    }
  }, [isOpen]);

  const handleOpenHelpDetail = (
    title: string,
    instrument: 'guitar' | 'keys' | 'bass' | 'lead',
    type: 'chord' | 'scale' | 'riff' | 'voicing',
    dotsOrAbsoluteNotes: any[],
    customTechnique?: string
  ) => {
    let noteNames: string[] = [];
    if (instrument === 'keys') {
      noteNames = (dotsOrAbsoluteNotes as number[]).map(n => {
        const index = (48 + n) % 12;
        return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][index];
      });
    } else {
      const bases = instrument === 'bass' ? [43, 38, 33, 28] : [64, 59, 55, 50, 45, 40];
      noteNames = (dotsOrAbsoluteNotes as any[]).map(d => {
        const midi = bases[d.s] + d.f;
        return ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][midi % 12];
      });
    }

    const uniqueNotes = Array.from(new Set(noteNames));

    let theoryInfo = "";
    let defaultTechnique = "";

    if (type === 'chord') {
      theoryInfo = `This chord consists of the notes: ${uniqueNotes.join(', ')}. In modern music theory, chords are built from stacked thirds (Root, Third, Fifth, and optional Seventh). This specific voicing is chosen for optimal performance weight, pitch separation, and smooth transitions on your instrument.`;
      
      if (instrument === 'guitar') {
        defaultTechnique = "• Press down firmly near the frets.\n• Mute unused strings marked 'X' with the fleshy part of your fretting fingers or thumb.\n• Strum with a relaxed wrist to produce a light, floating acoustic ring.";
      } else if (instrument === 'keys') {
        defaultTechnique = "• Keep your hands relaxed and curved.\n• Place the chord root/fifth in the lower-middle register to define structural harmony.\n• Play the inversions in your right hand to stay clear of other lead instruments.";
      } else if (instrument === 'bass') {
        defaultTechnique = "• Rest your thumb on the pickup or E-string.\n• Keep your notes clean, locking strictly with the drummer's bass-drum kicks.\n• Dampen unused strings with your fretting hand to avoid low-end mud.";
      }
    } else if (type === 'scale') {
      theoryInfo = `This scale zone maps out the melodic pathway for improvisation over the active chord. Scales provide the building blocks for hooks, solos, and fills. Utilizing these shapes ensures your melodic phrases are in-key and emotionally coherent.`;
      
      if (instrument === 'guitar' || instrument === 'lead') {
        defaultTechnique = "• Memorize the root note (Indigo) as your landing home-base.\n• Practice sliding and bending into target chord tones (Thirds and Fifths).\n• Practice with alternate picking (Down-Up-Down-Up) to build speed and accuracy.";
      } else if (instrument === 'bass') {
        defaultTechnique = "• Use this scale zone to walk smoothly from one chord to the next.\n• Emphasize the Root on beat 1, then use other scale degrees for fills on beats 3 and 4.\n• Keep your rhythm perfectly steady.";
      } else if (instrument === 'keys') {
        defaultTechnique = "• Play smooth, legato runs on the keyboard.\n• Use standard thumb-under tucks to navigate the full octave range seamlessly.\n• Use a touch of sustain pedal to blend the notes without washing out.";
      }
    } else {
      theoryInfo = `This melodic figure/rhythm pattern represents a classic stylistic motif used in contemporary worship and modern pop arrangements. It creates movement and adds texture without distracting from the main vocals.`;
      
      if (instrument === 'guitar' || instrument === 'lead') {
        defaultTechnique = "• Let the high notes ring out over each other to create an ambient shimmer.\n• Use a warm delay pedal (dotted-eighth timing) to double your rhythmic layers.\n• Play with soft, expressive dynamics.";
      } else if (instrument === 'keys') {
        defaultTechnique = "• Use soft pedal pressure to keep the texture clean.\n• Focus on steady rhythmic spacing, locking with the acoustic guitar or hi-hat.\n• Keep the volume delicate.";
      }
    }

    setActiveHelpDetail({
      title,
      instrument,
      type,
      notes: uniqueNotes,
      theoryInfo,
      dotsOrAbsoluteNotes,
      technique: customTechnique || defaultTechnique
    });
  };

  if (!isOpen || !chordName) return null;

  // Process chord name to get root and quality
  const cleanChord = chordName.split('/')[0].trim();
  const match = cleanChord.match(/^([A-G][#b]?)(.*)/i);
  const root = match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : 'C';
  const quality = match ? match[2] : '';

  const rootIdx = NOTE_TO_INDEX[root] ?? 0;
  const theory = getChordTheoryData(root, quality, songKey);

  // Match simple fallback diagram chord
  const diagramChordKey = cleanChord.replace(/(maj7|min7|maj|dim|m7|7|sus4|sus2|add9)/i, (m) => {
    return m.toLowerCase().startsWith('m') ? 'm' : '';
  });
  const fingering = GUITAR_DIAGRAMS[diagramChordKey] || GUITAR_DIAGRAMS[root] || null;

  // Render static SVG guitar fingering representation
  const renderGuitarFretboardStatic = () => {
    if (!fingering) {
      return (
        <div className="text-xs text-indigo-200/50 py-6 text-center select-none italic border border-dashed border-indigo-500/20 w-full rounded-xl mt-2">
          Fingering shape not found for catalog
        </div>
      );
    }

    const stringX = [25, 60, 95, 130, 165, 200];
    return (
      <svg
        viewBox="0 0 225 190"
        style={{ width: '100%', height: 'auto', aspectRatio: '225 / 190', display: 'block' }}
        className="select-none font-mono mt-2"
      >
        <line x1="25" y1="20" x2="200" y2="20" stroke="#ffffff" strokeWidth={4}></line>
        {[48, 76, 104, 132, 160].map((y, idx) => (
          <line
            key={idx}
            x1="25"
            y1={y}
            x2="200"
            y2={y}
            stroke="#6366f1"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
        ))}
        {stringX.map((x, idx) => (
          <line
            key={idx}
            x1={x}
            y1="20"
            x2={x}
            y2="160"
            stroke="#818cf8"
            strokeOpacity="0.8"
            strokeWidth="2"
          />
        ))}

        {fingering.map((fret, stringIdx) => {
          const x = stringX[stringIdx];
          const delay = stringIdx * 60;

          if (fret === -1) {
            return (
              <g
                key={stringIdx}
                className="strum-note"
                style={{ animationDelay: `${delay}ms`, transformOrigin: `${x}px 16px` }}
              >
                <text
                  x={x - 6}
                  y="16"
                  fill="#ef4444"
                  fontSize="14"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  X
                </text>
              </g>
            );
          } else if (fret === 0) {
            return (
              <g
                key={stringIdx}
                className="strum-note"
                style={{ animationDelay: `${delay}ms`, transformOrigin: `${x}px 12px` }}
              >
                <circle cx={x} cy="12" r="5" fill="none" stroke="#10b981" strokeWidth="2"></circle>
              </g>
            );
          } else {
            const y = 20 + fret * 28 - 14;
            return (
              <g
                key={stringIdx}
                className="strum-note"
                style={{ animationDelay: `${delay}ms`, transformOrigin: `${x}px ${y}px` }}
              >
                <circle cx={x} cy={y} r="11" fill="#4f46e5" stroke="#818cf8" strokeWidth="1.5"></circle>
                <text
                  x={x}
                  y={y + 4}
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {fret}
                </text>
              </g>
            );
          }
        })}
      </svg>
    );
  };

  // Render chord triads and CAGED positions
  const renderGuitarTriadsAndInversions = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const stringBases = [4, 11, 7, 2, 9, 4];
    const intervals = isMinorVal ? [0, 3, 7] : [0, 4, 7];
    const labels = isMinorVal ? ['R', 'b3', '5'] : ['R', '3', '5'];
    const colors = ['#4f46e5', '#818cf8', '#818cf8'];

    let fretG_R = (rootIdx - 7 + 12) % 12;
    if (fretG_R === 0) fretG_R = 12;

    const thirdIdx = (rootIdx + intervals[1]) % 12;
    let fretG_3 = (thirdIdx - 7 + 12) % 12;
    if (fretG_3 === 0) fretG_3 = 12;

    const fifthIdx = (rootIdx + intervals[2]) % 12;
    let fretG_5 = (fifthIdx - 7 + 12) % 12;
    if (fretG_5 === 0) fretG_5 = 12;

    const getClosestFret = (stringIdx: number, targetNoteIdx: number, refFret: number) => {
      const base = stringBases[stringIdx];
      let f = (targetNoteIdx - base + 24) % 12;
      if (Math.abs(f + 12 - refFret) < Math.abs(f - refFret)) f += 12;
      if (f === 0 && refFret > 6) f = 12;
      return f;
    };

    const triads = [
      { name: 'Root Pos', gFret: fretG_R, gNote: 0 },
      { name: '1st Inv', gFret: fretG_3, gNote: 1 },
      { name: '2nd Inv', gFret: fretG_5, gNote: 2 },
    ].sort((a, b) => a.gFret - b.gFret);

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {triads.map((t, idx) => {
          const dots = [];
          const n1 = t.gNote;
          dots.push({ s: 2, f: t.gFret, label: labels[n1], color: n1 === 0 ? colors[0] : colors[1] });

          const n2 = (t.gNote + 1) % 3;
          const targetIdx2 = (rootIdx + intervals[n2]) % 12;
          const fB = getClosestFret(1, targetIdx2, t.gFret);
          dots.push({ s: 1, f: fB, label: labels[n2], color: n2 === 0 ? colors[0] : colors[1] });

          const n3 = (t.gNote + 2) % 3;
          const targetIdx3 = (rootIdx + intervals[n3]) % 12;
          const fe = getClosestFret(0, targetIdx3, t.gFret);
          dots.push({ s: 0, f: fe, label: labels[n3], color: n3 === 0 ? colors[0] : colors[1] });

          const minF = Math.min(t.gFret, fB, fe);
          const maxF = Math.max(t.gFret, fB, fe);
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={dots}
              minFret={displayMinFret}
              sequenceLine={true}
              boxName={t.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'guitar');
              }}
              onHelpClick={() => handleOpenHelpDetail(t.name, 'guitar', 'chord', dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderGuitarMovableShapes = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const shapes = [];
    const colors: { [key: string]: string } = { R: '#4f46e5', '3': '#818cf8', b3: '#818cf8', '5': '#818cf8' };

    // E Form
    let r6 = (rootIdx - 4 + 12) % 12;
    if (r6 === 0) r6 = 12;
    const eDots = isMinorVal
      ? [
          { s: 5, f: r6, label: 'R' },
          { s: 4, f: r6 + 2, label: '5' },
          { s: 3, f: r6 + 2, label: 'R' },
          { s: 2, f: r6, label: 'b3' },
          { s: 1, f: r6, label: '5' },
          { s: 0, f: r6, label: 'R' },
        ]
      : [
          { s: 5, f: r6, label: 'R' },
          { s: 4, f: r6 + 2, label: '5' },
          { s: 3, f: r6 + 2, label: 'R' },
          { s: 2, f: r6 + 1, label: '3' },
          { s: 1, f: r6, label: '5' },
          { s: 0, f: r6, label: 'R' },
        ];
    shapes.push({ name: 'E-Shape (Root 6)', dots: eDots.map((d) => ({ ...d, color: colors[d.label] })) });

    // A Form
    let r5 = (rootIdx - 9 + 12) % 12;
    if (r5 === 0) r5 = 12;
    const aDots = isMinorVal
      ? [
          { s: 4, f: r5, label: 'R' },
          { s: 3, f: r5 + 2, label: '5' },
          { s: 2, f: r5 + 2, label: 'R' },
          { s: 1, f: r5 + 1, label: 'b3' },
          { s: 0, f: r5, label: '5' },
        ]
      : [
          { s: 4, f: r5, label: 'R' },
          { s: 3, f: r5 + 2, label: '5' },
          { s: 2, f: r5 + 2, label: 'R' },
          { s: 1, f: r5 + 2, label: '3' },
          { s: 0, f: r5, label: '5' },
        ];
    shapes.push({ name: 'A-Shape (Root 5)', dots: aDots.map((d) => ({ ...d, color: colors[d.label] })) });

    // D Form
    let r4 = (rootIdx - 2 + 12) % 12;
    if (r4 === 0) r4 = 12;
    const dDots = isMinorVal
      ? [
          { s: 3, f: r4, label: 'R' },
          { s: 2, f: r4 + 2, label: '5' },
          { s: 1, f: r4 + 3, label: 'R' },
          { s: 0, f: r4 + 1, label: 'b3' },
        ]
      : [
          { s: 3, f: r4, label: 'R' },
          { s: 2, f: r4 + 2, label: '5' },
          { s: 1, f: r4 + 3, label: 'R' },
          { s: 0, f: r4 + 2, label: '3' },
        ];
    shapes.push({ name: 'D-Shape (Root 4)', dots: dDots.map((d) => ({ ...d, color: colors[d.label] })) });

    // C Form (Major only)
    if (!isMinorVal) {
      let rc = r5;
      if (rc < 3) rc += 12;
      const cDots = [
        { s: 4, f: rc, label: 'R' },
        { s: 3, f: rc - 1, label: '3' },
        { s: 2, f: rc - 3, label: '5' },
        { s: 1, f: rc - 2, label: 'R' },
        { s: 0, f: rc - 3, label: '3' },
      ];
      shapes.push({ name: 'C-Shape (Root 5)', dots: cDots.map((d) => ({ ...d, color: colors[d.label] })) });
    }

    shapes.sort((a, b) => Math.min(...a.dots.map((d) => d.f)) - Math.min(...b.dots.map((d) => d.f)));

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={false}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'guitar');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'guitar', 'chord', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderGuitarPowerChords = () => {
    let r6 = (rootIdx - 4 + 12) % 12;
    if (r6 === 0) r6 = 12;
    const dots6 = [
      { s: 5, f: r6, label: 'R', color: '#4f46e5' },
      { s: 4, f: r6 + 2, label: '5', color: '#818cf8' },
      { s: 3, f: r6 + 2, label: 'R', color: '#4f46e5' },
    ];

    let r5 = (rootIdx - 9 + 12) % 12;
    if (r5 === 0) r5 = 12;
    const dots5 = [
      { s: 4, f: r5, label: 'R', color: '#4f46e5' },
      { s: 3, f: r5 + 2, label: '5', color: '#818cf8' },
      { s: 2, f: r5 + 2, label: 'R', color: '#4f46e5' },
    ];

    const shapes = [
      { name: 'Root 6 (E String)', dots: dots6 },
      { name: 'Root 5 (A String)', dots: dots5 },
    ];

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const span = Math.max(4, maxF - minF + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={s.dots}
              minFret={Math.max(1, minF - 1)}
              sequenceLine={false}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'guitar');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'guitar', 'chord', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderGuitarAmbientVoicings = () => {
    if (!theory) return null;
    let r5 = (rootIdx - 9 + 12) % 12;
    if (r5 === 0) r5 = 12;

    const sus2Dots = [
      { s: 4, f: r5, label: 'R', color: '#4f46e5' },
      { s: 3, f: r5 + 2, label: '5', color: '#818cf8' },
      { s: 2, f: r5 + 2, label: '2', color: '#fbbf24' },
      { s: 1, f: r5 + 3, label: '5', color: '#818cf8' },
    ];

    const add9Dots = theory.isMinor
      ? [
          { s: 4, f: r5, label: 'R', color: '#4f46e5' },
          { s: 3, f: r5 + 2, label: '5', color: '#818cf8' },
          { s: 2, f: r5 + 4, label: '9', color: '#fbbf24' },
          { s: 1, f: r5 + 1, label: 'b3', color: '#818cf8' },
        ]
      : [
          { s: 4, f: r5, label: 'R', color: '#4f46e5' },
          { s: 3, f: r5 + 2, label: '5', color: '#818cf8' },
          { s: 2, f: r5 + 4, label: '9', color: '#fbbf24' },
          { s: 1, f: r5 + 2, label: '3', color: '#818cf8' },
        ];

    const shapes = [
      { name: 'Lush Sus2', dots: sus2Dots },
      { name: theory.isMinor ? 'Minor Add9' : 'Major Add9', dots: add9Dots },
    ];

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const span = Math.max(5, maxF - minF + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={s.dots}
              minFret={Math.max(1, minF - 1)}
              sequenceLine={false}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'guitar');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'guitar', 'chord', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderScaleBoxes = (numStrings: number, intervals: number[], boxesConfig: { name: string; minFret: number; span: number }[]) => {
    const stringBases = numStrings === 4 ? [7, 2, 9, 4] : [4, 11, 7, 2, 9, 4];
    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-4 pt-1 items-center">
        {boxesConfig.map((box, bIdx) => {
          const dots = [];
          for (let s = 0; s < numStrings; s++) {
            for (let f = box.minFret; f < box.minFret + box.span; f++) {
              const noteIdx = (stringBases[s] + f) % 12;
              const intervalFromRoot = (noteIdx - rootIdx + 12) % 12;

              if (intervals.includes(intervalFromRoot)) {
                const isRoot = intervalFromRoot === 0;
                const isBlue = intervalFromRoot === 6 || intervalFromRoot === 3;
                const color = isRoot ? '#4f46e5' : isBlue ? '#6366f1' : '#818cf8';
                let label = isRoot ? 'R' : String(intervalFromRoot);

                if (intervalFromRoot === 10) label = 'b7';
                if (intervalFromRoot === 3) label = 'b3';
                if (intervalFromRoot === 4) label = '3';
                if (intervalFromRoot === 7) label = '5';
                if (intervalFromRoot === 2) label = '2';
                if (intervalFromRoot === 9) label = '6';

                dots.push({ s, f, label, color });
              }
            }
          }

          return (
            <FretboardVisualizer
              key={bIdx}
              numStrings={numStrings}
              numFrets={box.span}
              dots={dots}
              minFret={box.minFret}
              sequenceLine={true}
              boxName={box.name}
              onPlayClick={() => {
                const bases = numStrings === 4 ? [43, 38, 33, 28] : [64, 59, 55, 50, 45, 40];
                const midi = dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'scale', numStrings === 4 ? 'bass' : 'lead');
              }}
              onHelpClick={() => handleOpenHelpDetail(box.name, numStrings === 4 ? 'bass' : 'lead', 'scale', dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderBassVisuals = () => {
    if (!theory) return null;
    const rootOffsetE = (rootIdx - 4 + 12) % 12;
    const bassBoxes = [
      { name: 'Low Pos', minFret: rootOffsetE === 0 ? 1 : rootOffsetE - 1, span: 5 },
      { name: 'Mid Pos', minFret: rootOffsetE + 4, span: 5 },
    ];
    return renderScaleBoxes(4, theory.bassIntervals, bassBoxes);
  };

  const renderBassPowerShapes = () => {
    if (!theory) return null;
    const shapes = [];

    // E-string root (String 3)
    let r3 = (rootIdx - 4 + 12) % 12;
    if (r3 === 0) r3 = 12;
    if (r3 >= 1 && r3 <= 15) {
      const ePower = [
        { s: 3, f: r3, label: 'R', color: '#4f46e5' },
        { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
        { s: 1, f: r3 + 2, label: '8ve', color: '#10b981' },
      ];
      shapes.push({ name: 'Power Chord (E-String)', dots: ePower });
    }

    // A-string root (String 2)
    let r2 = (rootIdx - 9 + 12) % 12;
    if (r2 === 0) r2 = 12;
    if (r2 >= 1 && r2 <= 15) {
      const aPower = [
        { s: 2, f: r2, label: 'R', color: '#4f46e5' },
        { s: 1, f: r2 + 2, label: '5', color: '#06b6d4' },
        { s: 0, f: r2 + 2, label: '8ve', color: '#10b981' },
      ];
      shapes.push({ name: 'Power Chord (A-String)', dots: aPower });
    }

    // Heavy Octave Driving Shape
    const drivingOctave = [];
    if (r3 >= 1 && r3 <= 15) {
      drivingOctave.push({ s: 3, f: r3, label: 'R', color: '#4f46e5' });
      drivingOctave.push({ s: 1, f: r3 + 2, label: '8ve', color: '#10b981' });
    } else if (r2 >= 1 && r2 <= 15) {
      drivingOctave.push({ s: 2, f: r2, label: 'R', color: '#4f46e5' });
      drivingOctave.push({ s: 0, f: r2 + 2, label: '8ve', color: '#10b981' });
    }
    if (drivingOctave.length > 0) {
      shapes.push({ name: 'Driving Octave Shape', dots: drivingOctave });
    }

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={4}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={false}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [43, 38, 33, 28];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'bass');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'bass', 'chord', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderBassTriadsAndArpeggios = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const shapes = [];

    // E-string root (String 3) Triad
    let r3 = (rootIdx - 4 + 12) % 12;
    if (r3 === 0) r3 = 12;
    if (r3 >= 1 && r3 <= 15) {
      const eTriad = [
        { s: 3, f: r3, label: 'R', color: '#4f46e5' },
        { s: 2, f: Math.max(1, r3 - (isMinorVal ? 2 : 1)), label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
        { s: 1, f: r3 + 2, label: 'R', color: '#4f46e5' },
      ].filter(d => d.f >= 1);
      shapes.push({ name: `${isMinorVal ? 'Minor' : 'Major'} Triad (E-String)`, dots: eTriad });

      // 7th Arpeggio on E-string
      const e7Arp = [
        { s: 3, f: r3, label: 'R', color: '#4f46e5' },
        { s: 2, f: Math.max(1, r3 - (isMinorVal ? 2 : 1)), label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
        { s: 1, f: isMinorVal ? r3 : r3 + 1, label: isMinorVal ? 'b7' : '7', color: '#f43f5e' },
      ].filter(d => d.f >= 1);
      shapes.push({ name: `${isMinorVal ? 'm7' : 'maj7'} Arp (E-String)`, dots: e7Arp });
    }

    // A-string root (String 2) Triad
    let r2 = (rootIdx - 9 + 12) % 12;
    if (r2 === 0) r2 = 12;
    if (r2 >= 1 && r2 <= 15) {
      const aTriad = [
        { s: 2, f: r2, label: 'R', color: '#4f46e5' },
        { s: 1, f: Math.max(1, r2 - (isMinorVal ? 2 : 1)), label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 1, f: r2 + 2, label: '5', color: '#06b6d4' },
        { s: 0, f: r2 + 2, label: 'R', color: '#4f46e5' },
      ].filter(d => d.f >= 1);
      shapes.push({ name: `${isMinorVal ? 'Minor' : 'Major'} Triad (A-String)`, dots: aTriad });

      // 7th Arpeggio on A-string
      const a7Arp = [
        { s: 2, f: r2, label: 'R', color: '#4f46e5' },
        { s: 1, f: Math.max(1, r2 - (isMinorVal ? 2 : 1)), label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 1, f: r2 + 2, label: '5', color: '#06b6d4' },
        { s: 0, f: isMinorVal ? r2 : r2 + 1, label: isMinorVal ? 'b7' : '7', color: '#f43f5e' },
      ].filter(d => d.f >= 1);
      shapes.push({ name: `${isMinorVal ? 'm7' : 'maj7'} Arp (A-String)`, dots: a7Arp });
    }

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={4}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={false}
              boxName={s.name}
            />
          );
        })}
      </div>
    );
  };

  const renderBassScalePatternsForFills = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const shapes = [];

    // 1. Pentatonic Box Shape on E-string
    let r3 = (rootIdx - 4 + 12) % 12;
    if (r3 === 0) r3 = 12;
    if (r3 >= 1 && r3 <= 15) {
      if (isMinorVal) {
        const eMinPent = [
          { s: 3, f: r3, label: 'R', color: '#4f46e5' },
          { s: 3, f: r3 + 3, label: 'b3', color: '#a855f7' },
          { s: 2, f: r3, label: '4', color: '#38bdf8' },
          { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
          { s: 1, f: r3, label: 'b7', color: '#f43f5e' },
          { s: 1, f: r3 + 2, label: 'R', color: '#4f46e5' },
        ];
        shapes.push({ name: 'm-Pentatonic Fill (E)', dots: eMinPent });
      } else {
        const eMajPent = [
          { s: 3, f: r3, label: 'R', color: '#4f46e5' },
          { s: 3, f: r3 + 2, label: '2', color: '#eab308' },
          { s: 2, f: Math.max(1, r3 - 1), label: '3', color: '#a855f7' },
          { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
          { s: 1, f: Math.max(1, r3 - 1), label: '6', color: '#10b981' },
          { s: 1, f: r3 + 2, label: 'R', color: '#4f46e5' },
        ].filter(d => d.f >= 1);
        shapes.push({ name: 'M-Pentatonic Fill (E)', dots: eMajPent });
      }
    }

    // 2. Pentatonic Box Shape on A-string
    let r2 = (rootIdx - 9 + 12) % 12;
    if (r2 === 0) r2 = 12;
    if (r2 >= 1 && r2 <= 15) {
      if (isMinorVal) {
        const aMinPent = [
          { s: 2, f: r2, label: 'R', color: '#4f46e5' },
          { s: 2, f: r2 + 3, label: 'b3', color: '#a855f7' },
          { s: 1, f: r2, label: '4', color: '#38bdf8' },
          { s: 1, f: r2 + 2, label: '5', color: '#06b6d4' },
          { s: 0, f: r2, label: 'b7', color: '#f43f5e' },
          { s: 0, f: r2 + 2, label: 'R', color: '#4f46e5' },
        ];
        shapes.push({ name: 'm-Pentatonic Fill (A)', dots: aMinPent });
      } else {
        const aMajPent = [
          { s: 2, f: r2, label: 'R', color: '#4f46e5' },
          { s: 2, f: r2 + 2, label: '2', color: '#eab308' },
          { s: 1, f: Math.max(1, r2 - 1), label: '3', color: '#a855f7' },
          { s: 1, f: r2 + 2, label: '5', color: '#06b6d4' },
          { s: 0, f: Math.max(1, r2 - 1), label: '6', color: '#10b981' },
          { s: 0, f: r2 + 2, label: 'R', color: '#4f46e5' },
        ].filter(d => d.f >= 1);
        shapes.push({ name: 'M-Pentatonic Fill (A)', dots: aMajPent });
      }
    }

    // 3. Ascending Step Fill
    if (r3 >= 1 && r3 <= 15) {
      const runDots = isMinorVal ? [
        { s: 3, f: r3, label: 'R', color: '#4f46e5' },
        { s: 3, f: r3 + 2, label: '2', color: '#eab308' },
        { s: 2, f: r3, label: 'b3', color: '#a855f7' },
        { s: 2, f: r3 + 1, label: '4', color: '#38bdf8' },
        { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
      ] : [
        { s: 3, f: r3, label: 'R', color: '#4f46e5' },
        { s: 3, f: r3 + 2, label: '2', color: '#eab308' },
        { s: 2, f: Math.max(1, r3 - 1), label: '3', color: '#a855f7' },
        { s: 2, f: r3, label: '4', color: '#38bdf8' },
        { s: 2, f: r3 + 2, label: '5', color: '#06b6d4' },
      ];
      shapes.push({ name: 'Walking Scale Run', dots: runDots });
    }

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={4}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={true}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [43, 38, 33, 28];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'scale', 'bass');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'bass', 'scale', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderLeadTriadInversions = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const shapes = [];

    // Triad Inversion 1: Root Position (Root on High E / String 0)
    let f0 = (rootIdx - 4 + 12) % 12;
    if (f0 === 0) f0 = 12;
    if (f0 < 1) f0 += 12;
    if (f0 >= 1 && f0 <= 15) {
      const dots1 = [
        { s: 0, f: f0, label: 'R', color: '#4f46e5' },
        { s: 1, f: f0, label: '5', color: '#06b6d4' },
        { s: 2, f: isMinorVal ? f0 : f0 + 1, label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
      ];
      shapes.push({ name: 'Root Position Triad', dots: dots1 });
    }

    // Triad Inversion 2: 1st Inversion (3rd on High E / String 0)
    let f3rd = (rootIdx + (isMinorVal ? 3 : 4) - 4 + 12) % 12;
    if (f3rd === 0) f3rd = 12;
    if (f3rd < 1) f3rd += 12;
    if (f3rd >= 1 && f3rd <= 15) {
      const dots2 = [
        { s: 0, f: f3rd, label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 1, f: isMinorVal ? f3rd + 2 : f3rd + 1, label: 'R', color: '#4f46e5' },
        { s: 2, f: isMinorVal ? f3rd + 1 : f3rd, label: '5', color: '#06b6d4' },
      ];
      shapes.push({ name: '1st Inversion Triad', dots: dots2 });
    }

    // Triad Inversion 3: 2nd Inversion (5th on High E / String 0)
    let f5th = (rootIdx + 7 - 4 + 12) % 12;
    if (f5th === 0) f5th = 12;
    if (f5th < 1) f5th += 12;
    if (f5th >= 1 && f5th <= 15) {
      const dots3 = [
        { s: 0, f: f5th, label: '5', color: '#06b6d4' },
        { s: 1, f: isMinorVal ? f5th + 1 : f5th + 2, label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 2, f: f5th + 2, label: 'R', color: '#4f46e5' },
      ];
      shapes.push({ name: '2nd Inversion Triad', dots: dots3 });
    }

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={false}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'chord', 'lead');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'lead', 'chord', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const renderLeadRiffsAndLicks = () => {
    if (!theory) return null;
    const isMinorVal = theory.isMinor;
    const shapes = [];

    // 1. "The Worship Ambient Slide"
    let fRoot = (rootIdx - 11 + 12) % 12;
    if (fRoot === 0) fRoot = 12;
    if (fRoot < 1) fRoot += 12;
    if (fRoot >= 2 && fRoot <= 14) {
      const slideLick = [
        { s: 2, f: fRoot - 1, label: '5', color: '#06b6d4' },
        { s: 1, f: fRoot, label: 'R', color: '#4f46e5' },
        { s: 1, f: isMinorVal ? fRoot + 3 : fRoot + 4, label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 0, f: fRoot + 2, label: '5', color: '#10b981' },
      ];
      shapes.push({ name: 'Ambient String-Slide Lick', dots: slideLick });
    }

    // 2. "The Sparkle Pentatonic Run"
    let f0 = (rootIdx - 4 + 12) % 12;
    if (f0 === 0) f0 = 12;
    if (f0 < 1) f0 += 12;
    if (f0 >= 2 && f0 <= 13) {
      if (isMinorVal) {
        const minSparkle = [
          { s: 2, f: f0, label: '4', color: '#38bdf8' },
          { s: 1, f: f0 + 1, label: 'b7', color: '#f43f5e' },
          { s: 1, f: f0 + 3, label: 'R', color: '#4f46e5' },
          { s: 0, f: f0, label: 'b3', color: '#a855f7' },
          { s: 0, f: f0 + 3, label: '4', color: '#38bdf8' },
        ];
        shapes.push({ name: 'm-Pentatonic Sparkle Run', dots: minSparkle });
      } else {
        const majSparkle = [
          { s: 2, f: f0, label: '3', color: '#a855f7' },
          { s: 1, f: f0, label: '6', color: '#10b981' },
          { s: 1, f: f0 + 2, label: 'R', color: '#4f46e5' },
          { s: 0, f: f0, label: '2', color: '#eab308' },
          { s: 0, f: f0 + 2, label: '3', color: '#a855f7' },
        ];
        shapes.push({ name: 'M-Pentatonic Sparkle Run', dots: majSparkle });
      }
    }

    // 3. "Dotted-Eighth Delay Loop"
    let fHighE = (rootIdx - 4 + 12) % 12;
    if (fHighE === 0) fHighE = 12;
    if (fHighE < 1) fHighE += 12;
    if (fHighE >= 1 && fHighE <= 14) {
      const delayLoop = [
        { s: 0, f: fHighE, label: 'R', color: '#4f46e5' },
        { s: 1, f: fHighE, label: '5', color: '#06b6d4' },
        { s: 2, f: isMinorVal ? fHighE : fHighE + 1, label: isMinorVal ? 'b3' : '3', color: '#a855f7' },
        { s: 1, f: fHighE, label: '5', color: '#06b6d4' },
      ];
      shapes.push({ name: 'Dotted-8th Delay Motif', dots: delayLoop });
    }

    return (
      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
        {shapes.map((s, idx) => {
          const minF = Math.min(...s.dots.map((d) => d.f));
          const maxF = Math.max(...s.dots.map((d) => d.f));
          const displayMinFret = Math.max(1, minF - 1);
          const span = Math.max(4, maxF - displayMinFret + 2);

          return (
            <FretboardVisualizer
              key={idx}
              numStrings={6}
              numFrets={span}
              dots={s.dots}
              minFret={displayMinFret}
              sequenceLine={true}
              boxName={s.name}
              onPlayClick={() => {
                const bases = [64, 59, 55, 50, 45, 40];
                const midi = s.dots.map(d => bases[d.s] + d.f);
                audioSynth.playMidiNotes(midi, 'scale', 'lead');
              }}
              onHelpClick={() => handleOpenHelpDetail(s.name, 'lead', 'riff', s.dots)}
            />
          );
        })}
      </div>
    );
  };

  const getAvailableLeadScales = () => {
    if (!theory) return [];
    const isMinorVal = theory.isMinor;
    const isDim = quality.includes('dim');
    if (isDim) {
      return [
        { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
        { name: 'Half-Whole Diminished', intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
      ];
    }
    if (isMinorVal) {
      return [
        { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
        { name: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
        { name: 'Dorian (Jazz/R&B)', intervals: [0, 2, 3, 5, 7, 9, 10] },
        { name: 'Minor Blues', intervals: [0, 3, 5, 6, 7, 10] },
        { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
        { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
        { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
      ];
    }
    // Major / Dominant
    return [
      { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
      { name: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11] },
      { name: 'Mixolydian (Jazz/Blues)', intervals: [0, 2, 4, 5, 7, 9, 10] },
      { name: 'Major Blues', intervals: [0, 2, 3, 4, 7, 9] },
      { name: 'Lydian (Dreamy)', intervals: [0, 2, 4, 6, 7, 9, 11] },
      { name: 'Bebop Major', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
      { name: 'Altered (Jazz)', intervals: [0, 1, 3, 4, 6, 8, 10] },
    ];
  };

  const renderLeadVisuals = () => {
    if (!theory) return null;
    const leadBoxes = [
      { name: 'Zone 1 (Low)', minFret: 1, span: 5 },
      { name: 'Zone 2 (Mid)', minFret: 5, span: 5 },
      { name: 'Zone 3 (High)', minFret: 9, span: 5 },
      { name: 'Zone 4 (Lead)', minFret: 12, span: 5 },
    ];
    const available = getAvailableLeadScales();
    const activeScale = available.find(s => s.name === selectedLeadScale) || available[0];
    const intervalsToUse = activeScale ? activeScale.intervals : theory.scaleIntervals;
    return renderScaleBoxes(6, intervalsToUse, leadBoxes);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-[500] flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
      onClick={() => {
        if (selectedSubChord) {
          setSelectedSubChord(null);
        } else {
          onClose();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-indigo-950/95 via-[#0a0b16]/95 to-[#05060a]/95 backdrop-blur-xl border border-indigo-500/30 p-0 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] w-full max-w-[850px] flex flex-col h-[650px] max-h-[85vh] overflow-hidden"
      >
        {/* Header Dashboard */}
        <div className="flex justify-between items-start p-4 sm:p-5 border-b border-indigo-500/20 bg-indigo-900/20 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl sm:text-2xl font-bold text-amber-400 font-mono shadow-sm">
                {chordName}
              </span>
              {theory && (
                <>
                  <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 tracking-wider uppercase font-bold">
                    {theory.role}
                  </span>
                  <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded border tracking-wider font-bold bg-sky-500/20 border-sky-500/30 text-sky-200 flex items-center gap-1 shadow-sm">
                    <span className="text-sky-400">🔑</span> Key: {songKey}
                  </span>
                </>
              )}
            </div>
            {theory && (
              <p className="text-[10px] sm:text-xs text-indigo-300/80 mt-1.5 italic leading-snug">
                {theory.roleDefinition}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Master Volume Controller */}
            <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-500/30 px-2.5 py-1.5 rounded-full shadow-inner text-indigo-300">
              <button
                onClick={() => handleVolumeChange(volume === 0 ? 0.7 : 0)}
                className="hover:text-amber-400 transition-colors active:scale-90 flex items-center justify-center"
                title={volume === 0 ? "Unmute" : "Mute"}
              >
                {volume === 0 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : volume < 0.4 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.54 8.46a5 5 0 010 7.07" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.54 8.46a5 5 0 010 7.07m2.83-9.9a9 9 0 010 12.73" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-14 sm:w-20 accent-amber-400 h-1 bg-indigo-950 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, rgb(251, 191, 36) ${volume * 100}%, rgb(30, 27, 75) ${volume * 100}%)`
                }}
              />
              <span className="text-[9px] font-mono text-indigo-300 font-semibold w-6 text-right">
                {Math.round(volume * 100)}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-indigo-300 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-all active:scale-95 flex-shrink-0 text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-indigo-500/20 bg-indigo-950/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider select-none shrink-0">
          {(['guitar', 'keys', 'bass', 'lead', 'ideas'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3.5 transition-all text-center font-bold ${
                activeTab === tab
                  ? 'text-white bg-indigo-600/60 shadow-[0_0_20px_rgba(79,70,229,0.3)] border-b-2 border-indigo-400 z-10 relative font-extrabold'
                  : 'text-indigo-300/60 hover:bg-indigo-900/40 hover:text-indigo-200 border-b-2 border-transparent'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 relative flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-black/20 to-transparent">
          {theory && (
            <>
              {/* GUITAR TAB */}
              {activeTab === 'guitar' && (
                <div className="flex flex-col animate-fadeIn w-full pb-4">
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    {/* Standard fretboard */}
                    <div className="sm:w-[40%] flex flex-col items-center bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 relative">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-2 uppercase tracking-widest text-center w-full">
                        Standard Open
                      </h4>
                      {fingering && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const staticBases = [40, 45, 50, 55, 59, 64];
                              const midiNotes = fingering
                                .map((fret, stringIdx) => fret >= 0 ? staticBases[stringIdx] + fret : -1)
                                .filter(m => m !== -1);
                              audioSynth.playMidiNotes(midiNotes, 'chord', 'guitar');
                            }}
                            className="absolute top-2 right-2 text-indigo-400 hover:text-emerald-400 transition-all p-2.5 z-10 hover:scale-110 active:scale-90 bg-black/40 hover:bg-black/60 rounded-full"
                            title="🔊 Listen to this Shape"
                          >
                            <svg className="w-4.5 h-4.5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const mappedDots = fingering
                                .map((fret, stringIdx) => fret >= 0 ? { s: 5 - stringIdx, f: fret, label: 'Note' } : null)
                                .filter((d): d is any => d !== null);
                              handleOpenHelpDetail("Standard Open Shape", 'guitar', 'chord', mappedDots);
                            }}
                            className="absolute top-2 left-2 animate-bulb text-amber-400 hover:text-amber-300 transition-all p-2.5 z-10 scale-105 active:scale-95 bg-black/40 hover:bg-black/60 rounded-full"
                            title="💡 Learn Chord/Scale Secrets"
                          >
                            <svg className="w-4.5 h-4.5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </button>
                        </>
                      )}
                      {renderGuitarFretboardStatic()}
                      <div className="mt-4 w-full flex flex-wrap gap-1.5 justify-center">
                        {theory.capoOptions.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            dangerouslySetInnerHTML={{ __html: opt }}
                            className="inline-block"
                          />
                        ))}
                      </div>
                    </div>

                    {/* Instruction & Pick panel */}
                    <div className="sm:w-[60%] flex flex-col bg-indigo-900/20 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 shadow-inner shrink-0 min-w-0 justify-between">
                      <div>
                        <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">💡</span> Strategy & Right Hand
                        </h4>
                        <div className="text-xs sm:text-[13px] text-gray-200 italic leading-relaxed whitespace-pre-line">
                          {theory.guitarIdea}
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-indigo-500/20 text-amber-300 font-mono text-[10px] sm:text-xs p-3 bg-black/30 rounded-xl shadow-inner space-y-1">
                        <div>
                          <span className="text-indigo-400 font-bold">Pick:</span>{' '}
                          {theory.pickingPattern}
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">Strum:</span>{' '}
                          {theory.strummingPattern}
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">Tone:</span>{' '}
                          {theory.toneSuggestion}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Power Chords & Ambient Voicings */}
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">⚡</span> Power Chords (Drive)
                      </h4>
                      {renderGuitarPowerChords()}
                    </div>
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🌫️</span> Ambient Voicings
                      </h4>
                      {renderGuitarAmbientVoicings()}
                    </div>
                  </div>

                  {/* Triad inversions */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-5">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">🎸</span> Triad Inversions (Strings 1-3)
                    </h4>
                    {renderGuitarTriadsAndInversions()}
                  </div>

                  {/* Movable neck shape (CAGED) */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-2">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">📍</span> Movable Neck Shapes (CAGED)
                    </h4>
                    {renderGuitarMovableShapes()}
                  </div>
                </div>
              )}

              {/* KEYS TAB */}
              {activeTab === 'keys' && (
                <div className="flex flex-col animate-fadeIn w-full pb-4">
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    {/* Standard open and 10th positions */}
                    <div className="sm:w-[45%] flex flex-col items-center bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 relative min-w-0 justify-around">
                      <div className="w-full flex flex-col gap-4 items-center">
                        <PianoVisualizer
                          absoluteNotes={theory.pianoInversions[0].notes}
                          title="Root Position"
                          isStandalone={true}
                          onPlayClick={() => {
                            const midi = theory.pianoInversions[0].notes.map(n => 48 + n);
                            audioSynth.playMidiNotes(midi, 'chord', 'piano');
                          }}
                          onHelpClick={() => handleOpenHelpDetail("Root Position", 'keys', 'chord', theory.pianoInversions[0].notes)}
                        />
                        <div className="w-full border-t border-indigo-500/20 my-1"></div>
                        <PianoVisualizer
                          absoluteNotes={theory.openTenthNotes}
                          title="Open 10th (Big Sound)"
                          isStandalone={true}
                          onPlayClick={() => {
                            const midi = theory.openTenthNotes.map(n => 48 + n);
                            audioSynth.playMidiNotes(midi, 'chord', 'piano');
                          }}
                          onHelpClick={() => handleOpenHelpDetail("Open 10th (Big Sound)", 'keys', 'chord', theory.openTenthNotes)}
                        />
                      </div>
                    </div>

                    {/* Left/Right hand strategies */}
                    <div className="sm:w-[55%] flex flex-col bg-indigo-900/20 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 shadow-inner shrink-0 min-w-0 justify-between">
                      <div>
                        <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">💡</span> Mechanics & Flow
                        </h4>
                        <div className="text-xs sm:text-[13px] text-gray-200 italic leading-relaxed whitespace-pre-line">
                          {theory.keysIdea}
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-indigo-500/20 text-sky-300 font-mono text-[10px] sm:text-xs p-3 bg-black/30 rounded-xl shadow-inner space-y-1">
                        <div>
                          <span className="text-indigo-400 font-bold">With Bassist:</span>{' '}
                          {theory.keysLeftHandWithBass}
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">No Bassist:</span>{' '}
                          {theory.keysLeftHandNoBass}
                        </div>
                        <div>
                          <span className="text-emerald-400 font-bold">Pedal:</span>{' '}
                          {theory.pedalPoint}
                        </div>
                        <div>
                          <span className="text-rose-400 font-bold">Passing:</span>{' '}
                          {theory.passingChord}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Keyboard Inversions and Extensions */}
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🎹</span> Triad Inversions
                      </h4>
                      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
                        {theory.pianoInversions.map((inv, idx) => (
                          <PianoVisualizer
                            key={idx}
                            absoluteNotes={inv.notes}
                            title={inv.name}
                            scale={0.9}
                            onPlayClick={() => {
                              const midi = inv.notes.map(n => 48 + n);
                              audioSynth.playMidiNotes(midi, 'chord', 'piano');
                            }}
                            onHelpClick={() => handleOpenHelpDetail(inv.name, 'keys', 'chord', inv.notes)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">✨</span> Worship Extensions (Pads)
                      </h4>
                      <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-3 pt-2 items-center">
                        {theory.keysExtensions.map((ext, idx) => (
                          <PianoVisualizer
                            key={idx}
                            absoluteNotes={ext.notes}
                            title={ext.name}
                            scale={0.9}
                            onPlayClick={() => {
                              const midi = ext.notes.map(n => 48 + n);
                              audioSynth.playMidiNotes(midi, 'chord', 'piano');
                            }}
                            onHelpClick={() => handleOpenHelpDetail(ext.name, 'keys', 'chord', ext.notes)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sound Recipes */}
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🎛️</span> Patch Recipe
                      </h4>
                      <div className="text-xs text-indigo-100 font-mono leading-relaxed whitespace-pre-line bg-black/40 p-3 rounded-xl border border-indigo-500/30 shadow-inner h-full flex items-center">
                        {theory.patchRecipe}
                      </div>
                    </div>
                    <div className="sm:w-1/2 flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🎹</span> Hammond B3 Drawbars
                      </h4>
                      <div className="text-xs text-white font-mono flex items-center justify-center h-full bg-black/60 rounded-xl border border-indigo-500/50 tracking-[0.3em] text-lg sm:text-2xl drop-shadow-md py-4 shadow-inner">
                        {theory.organDrawbars}
                      </div>
                    </div>
                  </div>

                  {/* Scale runs visualizers */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-2">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">🎼</span> Animated Scale Runs
                    </h4>
                    <div className="w-full flex gap-5 overflow-x-auto snap-x custom-scrollbar pb-4 pt-2 items-center">
                      {theory.animatedScales.map((scale, sIdx) => {
                        const notes = [];
                        for (let i = 0; i <= 24; i++) {
                          if (scale.intervals.includes((i - rootIdx + 24) % 12)) notes.push(i);
                        }
                        notes.sort((a, b) => a - b);
                        return (
                          <PianoVisualizer
                            key={sIdx}
                            absoluteNotes={notes}
                            title={scale.name}
                            scale={0.85}
                            delayMs={80}
                            onPlayClick={() => {
                              const midi = notes.map(n => 48 + n);
                              audioSynth.playMidiNotes(midi, 'scale', 'piano');
                            }}
                            onHelpClick={() => handleOpenHelpDetail(scale.name, 'keys', 'scale', notes)}
                          />
                        );
                      })}
                    </div>
                    <div className="text-xs text-white font-mono leading-relaxed whitespace-pre-line overflow-y-auto custom-scrollbar pr-2 mt-4 bg-black/40 p-4 rounded-xl border border-indigo-500/20 shadow-inner max-h-[160px]">
                      {theory.scaleFiguresText}
                    </div>
                  </div>
                </div>
              )}

              {/* BASS TAB */}
              {activeTab === 'bass' && (
                <div className="flex flex-col animate-fadeIn w-full pb-4">
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    {/* Groove Matrix Scale Shapes */}
                    <div className="sm:w-[50%] flex flex-col bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 min-w-0">
                      <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-base">🎸</span> Scale Groove Shapes (4-String)
                      </h4>
                      {renderBassVisuals()}
                      <p className="text-[10px] text-indigo-300/60 font-mono mt-3 text-center italic">
                        Visualizing standard scale zones on a 4-string bass.
                      </p>
                    </div>

                    {/* Rhythm Strategy, Tone & Rig Setup */}
                    <div className="sm:w-[50%] flex flex-col bg-indigo-900/20 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 shadow-inner shrink-0 min-w-0 justify-between">
                      <div>
                        <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">⏱</span> Rhythm Strategy & Feel
                        </h4>
                        <div className="text-xs sm:text-[13px] text-gray-200 italic leading-relaxed whitespace-pre-line mb-4">
                          {theory.genre}
                        </div>
                        <div className="text-xs text-indigo-200/90 leading-relaxed whitespace-pre-line bg-black/30 p-3 rounded-xl shadow-inner border border-indigo-500/10">
                          {theory.bassIdea}
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-indigo-500/20 text-emerald-300 font-mono text-[10px] sm:text-xs p-3 bg-black/40 rounded-xl shadow-inner space-y-1">
                        <div>
                          <span className="text-indigo-400 font-bold">EQ Settings:</span> Bass 60% | Mids 65% | Highs 40%
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">Pickup Choice:</span> Neck/Split-Coil (Precision warmth)
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">FX Chain:</span> Comp (3:1) ➔ Light Tube Drive ➔ Swell Reverb
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1. Power Shapes (Root + 5th) */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-4">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">⚡</span> Power Shapes (Root + 5th)
                    </h4>
                    {renderBassPowerShapes()}
                  </div>

                  {/* 2. Triads & Arpeggios */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-4">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">🎸</span> Triads & 7th Arpeggios
                    </h4>
                    {renderBassTriadsAndArpeggios()}
                  </div>

                  {/* 3. Scale Patterns for Fills */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-2">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">📍</span> Scale Patterns for Fills
                    </h4>
                    {renderBassScalePatternsForFills()}
                  </div>
                </div>
              )}

              {/* LEAD TAB */}
              {activeTab === 'lead' && (
                <div className="flex flex-col animate-fadeIn w-full pb-4">
                  <div className="flex flex-col sm:flex-row gap-5 shrink-0 w-full mb-5">
                    {/* Full Fretboard Scales */}
                    <div className="sm:w-[50%] flex flex-col bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 min-w-0">
                      <div className="flex flex-col mb-3">
                        <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-2 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">🎶</span> Full Fretboard Scales
                        </h4>
                        
                        {/* Interactive Scale Selector Pills */}
                        <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto custom-scrollbar bg-black/40 p-2 rounded-xl border border-indigo-500/10">
                          {getAvailableLeadScales().map((scale) => {
                            const isSelected = selectedLeadScale === scale.name || (!selectedLeadScale && getAvailableLeadScales()[0]?.name === scale.name);
                            return (
                              <button
                                key={scale.name}
                                onClick={() => setSelectedLeadScale(scale.name)}
                                className={`px-2.5 py-1 text-[9px] sm:text-[10px] rounded-lg font-mono font-semibold transition-all duration-200 border cursor-pointer ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black border-amber-400 font-bold shadow-lg shadow-amber-500/25 scale-[1.03]'
                                    : 'bg-indigo-950/40 text-indigo-200 border-indigo-500/20 hover:bg-indigo-900/30 hover:border-indigo-500/30'
                                }`}
                              >
                                {scale.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {renderLeadVisuals()}
                      <p className="text-[10px] text-indigo-300/60 font-mono mt-3 text-center italic">
                        Standard scale zones across all 6 strings for the selected scale.
                      </p>
                    </div>

                    {/* Target Tones & Scale Info */}
                    <div className="sm:w-[50%] flex flex-col bg-indigo-900/20 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 shadow-inner shrink-0 min-w-0 justify-between">
                      <div>
                        <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-base">🎯</span> Target Tones & Strategic Insights
                        </h4>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {theory.scales.map((s, idx) => (
                            <span
                              key={idx}
                              className="inline-block bg-indigo-500/35 text-indigo-100 border border-indigo-400/40 px-2.5 py-1 rounded-[8px] text-[10px] sm:text-[11px] shadow-sm font-mono font-bold"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs sm:text-[13px] text-gray-200 leading-relaxed whitespace-pre-line bg-black/30 p-4 rounded-xl border border-indigo-500/10 shadow-inner">
                          {theory.targetTones}
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-indigo-500/20 text-sky-300 font-mono text-[10px] sm:text-xs p-3 bg-black/40 rounded-xl shadow-inner space-y-1">
                        <div>
                          <span className="text-indigo-400 font-bold">Guitar Tone Tip:</span> Neck pickup + warm overdrive + dotted-eighth delay.
                        </div>
                        <div>
                          <span className="text-indigo-400 font-bold">Ambient Sparkle:</span> High triads with a swelling reverb pedal (wet 60%).
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1. Triad Inversions (High Strings) */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-4">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">🔮</span> Triad Inversions (High E, B, G Strings)
                    </h4>
                    {renderLeadTriadInversions()}
                    <p className="text-[10px] text-indigo-300/60 font-mono mt-1 italic">
                      High triad voicings for beautiful, floating rhythmic stabs and lead fills.
                    </p>
                  </div>

                  {/* 2. Worship Riffs, Licks & Fills */}
                  <div className="flex flex-col min-w-0 bg-black/20 rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-inner shrink-0 mb-2">
                    <h4 className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-3 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">✨</span> Melodic Fills & Licks (Worship-Style)
                    </h4>
                    {renderLeadRiffsAndLicks()}
                    <p className="text-[10px] text-indigo-300/60 font-mono mt-1 italic">
                      Popular riffs showing standard melodic shapes with sequential flow (yellow trace).
                    </p>
                  </div>
                </div>
              )}

              {/* IDEAS TAB */}
              {activeTab === 'ideas' && (
                <div className="flex flex-col sm:flex-row gap-6 animate-fadeIn w-full">
                  <div className="sm:w-1/2 flex flex-col border-b sm:border-b-0 sm:border-r border-indigo-500/20 pb-5 sm:pb-0 sm:pr-6 min-w-0">
                    <h4 className="text-[11px] sm:text-xs text-amber-300 font-extrabold mb-1 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">✨</span> Beautiful Substitutions
                    </h4>
                    <p className="text-[10px] text-indigo-300/80 mb-4 italic">
                      💡 Click any chord to view its guitar and piano shapes
                    </p>
                    <div className="flex flex-wrap gap-3 mb-2">
                      {theory.beautiful.map((c, idx) => (
                        <span
                          key={idx}
                          onClick={() => setSelectedSubChord(c)}
                          className="bg-indigo-600 text-white border border-indigo-400 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold font-mono shadow-sm cursor-pointer hover:bg-indigo-500 hover:text-white hover:border-indigo-300 hover:scale-105 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all active:scale-95"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm:w-1/2 flex flex-col pt-2 sm:pt-0 shrink-0">
                    <h4 className="text-[11px] sm:text-xs text-indigo-300 font-extrabold mb-4 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-base">📖</span> Contextual Function
                    </h4>
                    <div className="text-xs text-gray-200 leading-relaxed bg-indigo-900/20 p-5 rounded-2xl border border-indigo-500/20">
                      {theory.genre}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Shared Circle of Fifths Visualizer & Harmonic Context Panel */}
              {(() => {
                const CIRCLE = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
                
                const normalizeForCircle = (noteName: string) => {
                  const norm: { [key: string]: string } = {
                    'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb', 'Gb': 'F#', 'E#': 'F', 'B#': 'C', 'Cb': 'B'
                  };
                  return norm[noteName] || noteName;
                };

                const normRoot = normalizeForCircle(root);
                const activeIdx = CIRCLE.indexOf(normRoot);
                const clockwiseIdx = activeIdx !== -1 ? (activeIdx + 1) % 12 : -1;
                const counterclockwiseIdx = activeIdx !== -1 ? (activeIdx - 1 + 12) % 12 : -1;
                
                const clockwiseNeighbor = clockwiseIdx !== -1 ? CIRCLE[clockwiseIdx] : 'G';
                const counterClockwiseNeighbor = counterclockwiseIdx !== -1 ? CIRCLE[counterclockwiseIdx] : 'F';
                
                const RELATIVES: { [key: string]: string } = {
                  'C': 'Am', 'G': 'Em', 'D': 'Bm', 'A': 'F#m', 'E': 'C#m', 'B': 'G#m',
                  'F#': 'D#m', 'Db': 'Bbm', 'Ab': 'Fm', 'Eb': 'Cm', 'Bb': 'Gm', 'F': 'Dm',
                  'Am': 'C', 'Em': 'G', 'Bm': 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B',
                  'D#m': 'F#', 'Bbm': 'Db', 'Fm': 'Ab', 'Cm': 'Eb', 'Gm': 'Bb', 'Dm': 'F'
                };
                const relMinor = RELATIVES[normRoot] || '';

                return (
                  <div className="mt-8 pt-6 border-t border-indigo-500/20 select-none animate-fadeIn">
                    <div className="flex items-center gap-2 mb-3.5">
                      <span className="text-sm">🧭</span>
                      <h4 className="text-xs sm:text-sm font-extrabold text-amber-300 uppercase tracking-widest font-sans">
                        Circle of Fifths Harmonic Compass
                      </h4>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-6 items-center bg-indigo-950/20 border border-indigo-500/10 p-5 rounded-2xl">
                      {/* Visual SVG Circle */}
                      <div className="shrink-0 flex items-center justify-center p-2 bg-black/30 border border-white/5 rounded-2xl">
                        <svg viewBox="0 0 200 200" className="w-40 h-40 sm:w-44 sm:h-44 select-none drop-shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                          <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="1.5" strokeDasharray="3 3" />
                          
                          {activeIdx !== -1 && (
                            <>
                              {/* Line to Clockwise */}
                              {(() => {
                                const thetaA = (activeIdx * 30 - 90) * Math.PI / 180;
                                const thetaB = (clockwiseIdx * 30 - 90) * Math.PI / 180;
                                return (
                                  <line
                                    x1={100 + 75 * Math.cos(thetaA)}
                                    y1={100 + 75 * Math.sin(thetaA)}
                                    x2={100 + 75 * Math.cos(thetaB)}
                                    y2={100 + 75 * Math.sin(thetaB)}
                                    stroke="#38bdf8"
                                    strokeWidth="1.5"
                                    strokeDasharray="2 2"
                                  />
                                );
                              })()}
                              {/* Line to Counterclockwise */}
                              {(() => {
                                const thetaA = (activeIdx * 30 - 90) * Math.PI / 180;
                                const thetaB = (counterclockwiseIdx * 30 - 90) * Math.PI / 180;
                                return (
                                  <line
                                    x1={100 + 75 * Math.cos(thetaA)}
                                    y1={100 + 75 * Math.sin(thetaA)}
                                    x2={100 + 75 * Math.cos(thetaB)}
                                    y2={100 + 75 * Math.sin(thetaB)}
                                    stroke="#34d399"
                                    strokeWidth="1.5"
                                    strokeDasharray="2 2"
                                  />
                                );
                              })()}
                            </>
                          )}

                          {CIRCLE.map((note, i) => {
                            const theta = (i * 30 - 90) * Math.PI / 180;
                            const x = 100 + 75 * Math.cos(theta);
                            const y = 100 + 75 * Math.sin(theta);
                            
                            const isActive = i === activeIdx;
                            const isClockwise = i === clockwiseIdx;
                            const isCounter = i === counterclockwiseIdx;
                            
                            let nodeFill = "#0c0d1b";
                            let nodeStroke = "rgba(255, 255, 255, 0.1)";
                            let textFill = "#94a3b8";
                            let strokeWidth = "1";
                            
                            if (isActive) {
                              nodeFill = "#fbbf24";
                              nodeStroke = "#fbbf24";
                              textFill = "#0c0d1b";
                              strokeWidth = "2";
                            } else if (isClockwise) {
                              nodeFill = "#0f172a";
                              nodeStroke = "#38bdf8";
                              textFill = "#38bdf8";
                              strokeWidth = "1.5";
                            } else if (isCounter) {
                              nodeFill = "#0f172a";
                              nodeStroke = "#34d399";
                              textFill = "#34d399";
                              strokeWidth = "1.5";
                            }
                            
                            return (
                              <g key={note} className="transition-all">
                                <circle cx={x} cy={y} r="13" fill={nodeFill} stroke={nodeStroke} strokeWidth={strokeWidth} />
                                <text
                                  x={x}
                                  y={y + 3.5}
                                  fill={textFill}
                                  fontSize="8.5"
                                  fontFamily="monospace"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {note}
                                </text>
                              </g>
                            );
                          })}
                          
                          {/* Center Label */}
                          <circle cx="100" cy="100" r="22" fill="#090a15" stroke="rgba(99,102,241,0.2)" />
                          <text x="100" y="96" fill="#818cf8" fontSize="6.5" fontWeight="black" textAnchor="middle" className="uppercase tracking-widest font-mono animate-pulse">ROOT</text>
                          <text x="100" y="109" fill="#ffffff" fontSize="10" fontWeight="black" fontFamily="monospace" textAnchor="middle">{root}</text>
                        </svg>
                      </div>

                      {/* Educational Explanation Box */}
                      <div className="flex-1 space-y-3.5 text-[11px] leading-relaxed text-gray-300">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded uppercase font-mono">How It Applies</span>
                            {relMinor && (
                              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase font-mono">
                                Relative: {relMinor}
                              </span>
                            )}
                          </div>
                          <p className="text-indigo-200/90 italic font-medium leading-snug">
                            The Circle of Fifths maps how keys and chords resolve. For the active root chord <span className="font-mono font-bold text-white bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.2 rounded">{root}</span>, its neighboring pillars represent the ultimate harmonic resolution pathways.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider block">🎹 Chords & Resolution</span>
                            <p className="text-gray-400 text-[10px] leading-normal">
                              Chords resolve perfectly clockwise. Moving from <span className="font-mono text-white">{root}</span> to its clockwise neighbor <span className="font-bold text-sky-400 font-mono">{clockwiseNeighbor}</span> (Perfect 5th/V) creates natural forward pull, while moving to <span className="font-bold text-emerald-400 font-mono">{counterClockwiseNeighbor}</span> (Perfect 4th/IV) builds an ambient, floaty "subdominant lift".
                            </p>
                          </div>
                          
                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider block">🎵 Scales & Soloing</span>
                            <p className="text-gray-400 text-[10px] leading-normal">
                              Keys next to each other on the circle differ by exactly one accidental. Since <span className="font-mono text-white">{root}</span> shares 6 of its 7 scale notes with <span className="font-mono text-sky-400">{clockwiseNeighbor}</span> and <span className="font-mono text-emerald-400">{counterClockwiseNeighbor}</span>, melody lines and lead licks flow seamlessly over these scale changes.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider block">🎸 Melodic Figures</span>
                            <p className="text-gray-400 text-[10px] leading-normal">
                              Most memorable hooks are built on fifth/fourth intervals. Leveraging these neighbor notes creates powerful melodic anchors that align perfectly with natural string resonance on your instrument, preventing chaotic or muddy sound.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Substitution Chord Mini Modal Overlay */}
        {selectedSubChord && (() => {
          const subClean = selectedSubChord.split('/')[0].trim();
          const subMatch = subClean.match(/^([A-G][#b]?)(.*)/i);
          const subRoot = subMatch ? subMatch[1].charAt(0).toUpperCase() + subMatch[1].slice(1).toLowerCase() : 'C';
          const subQuality = subMatch ? subMatch[2] : '';
          const subDiagramChordKey = subClean.replace(/(maj7|min7|maj|dim|m7|7|sus4|sus2|add9)/i, (m) => {
            return m.toLowerCase().startsWith('m') ? 'm' : '';
          });
          const subFingering = GUITAR_DIAGRAMS[subDiagramChordKey] || GUITAR_DIAGRAMS[subRoot] || null;
          const subTheory = getChordTheoryData(subRoot, subQuality, songKey);

          return (
            <div className="absolute inset-0 bg-[#070814]/98 z-[600] flex flex-col p-5 sm:p-6 animate-fadeIn rounded-2xl">
              {/* Overlay Header */}
              <div className="flex justify-between items-center pb-4 border-b border-indigo-500/20 mb-5 shrink-0">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-400 font-mono flex items-center gap-2">
                    <span className="text-base text-indigo-400">⚡</span> {selectedSubChord}
                  </h3>
                  <p className="text-xs text-indigo-300 italic mt-0.5">
                    Substitution shape for {chordName}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSubChord(null)}
                  className="bg-indigo-900/50 border border-indigo-500/30 hover:bg-indigo-600/60 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all text-indigo-200 active:scale-95"
                >
                  ✕ Back to Ideas
                </button>
              </div>

              {/* Overlay content side-by-side */}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col sm:flex-row gap-5 pb-4">
                {/* Guitar Panel */}
                <div className="flex-1 flex flex-col items-center bg-black/40 rounded-2xl p-4 border border-indigo-500/20 shadow-inner min-w-0 relative">
                  <h4 className="text-xs text-indigo-300 font-black mb-3 uppercase tracking-wider text-center flex items-center gap-1.5">
                    🎸 Guitar Shape
                  </h4>
                  {subFingering && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const staticBases = [40, 45, 50, 55, 59, 64];
                          const midiNotes = subFingering
                            .map((fret, stringIdx) => fret >= 0 ? staticBases[stringIdx] + fret : -1)
                            .filter(m => m !== -1);
                          audioSynth.playMidiNotes(midiNotes, 'chord', 'guitar');
                        }}
                        className="absolute top-2 right-2 text-indigo-400 hover:text-emerald-400 transition-all p-2.5 z-10 hover:scale-110 active:scale-90 bg-black/40 hover:bg-black/60 rounded-full"
                        title="🔊 Listen to this Shape"
                      >
                        <svg className="w-4.5 h-4.5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const mappedDots = subFingering
                            .map((fret, stringIdx) => fret >= 0 ? { s: 5 - stringIdx, f: fret, label: 'Note' } : null)
                            .filter((d): d is any => d !== null);
                          handleOpenHelpDetail(`${selectedSubChord} Guitar Shape`, 'guitar', 'chord', mappedDots);
                        }}
                        className="absolute top-2 left-2 animate-bulb text-amber-400 hover:text-amber-300 transition-all p-2.5 z-10 scale-105 active:scale-95 bg-black/40 hover:bg-black/60 rounded-full"
                        title="💡 Learn Chord/Scale Secrets"
                      >
                        <svg className="w-4.5 h-4.5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <div className="w-[180px] sm:w-[200px] flex-1 flex items-center justify-center">
                    {subFingering ? (
                      (() => {
                        const stringX = [25, 60, 95, 130, 165, 200];
                        return (
                          <svg
                            viewBox="0 0 225 190"
                            style={{ width: '100%', height: 'auto', aspectRatio: '225 / 190', display: 'block' }}
                            className="select-none font-mono"
                          >
                            <line x1="25" y1="20" x2="200" y2="20" stroke="#ffffff" strokeWidth={4}></line>
                            {[48, 76, 104, 132, 160].map((y, idx) => (
                              <line
                                key={idx}
                                x1="25"
                                y1={y}
                                x2="200"
                                y2={y}
                                stroke="#6366f1"
                                strokeOpacity="0.5"
                                strokeWidth="1.5"
                              />
                            ))}
                            {stringX.map((x, idx) => (
                              <line
                                key={idx}
                                x1={x}
                                y1="20"
                                x2={x}
                                y2="160"
                                stroke="#818cf8"
                                strokeOpacity="0.8"
                                strokeWidth="2"
                              />
                            ))}

                            {subFingering.map((fret, stringIdx) => {
                              const x = stringX[stringIdx];

                              if (fret === -1) {
                                return (
                                  <g key={stringIdx} className="strum-note" style={{ transformOrigin: `${x}px 16px` }}>
                                    <text x={x - 6} y="16" fill="#ef4444" fontSize="14" fontFamily="monospace" fontWeight="bold">
                                      X
                                    </text>
                                  </g>
                                );
                              } else if (fret === 0) {
                                return (
                                  <g key={stringIdx} className="strum-note" style={{ transformOrigin: `${x}px 12px` }}>
                                    <circle cx={x} cy="12" r="5" fill="none" stroke="#10b981" strokeWidth="2"></circle>
                                  </g>
                                );
                              } else {
                                const y = 20 + fret * 28 - 14;
                                return (
                                  <g key={stringIdx} className="strum-note" style={{ transformOrigin: `${x}px ${y}px` }}>
                                    <circle cx={x} cy={y} r="11" fill="#4f46e5" stroke="#818cf8" strokeWidth="1.5"></circle>
                                    <text x={x} y={y + 4} fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                      {fret}
                                    </text>
                                  </g>
                                );
                              }
                            })}
                          </svg>
                        );
                      })()
                    ) : (
                      <div className="text-xs text-indigo-200/50 py-10 text-center italic">
                        Fingering shape not found
                      </div>
                    )}
                  </div>
                  {subTheory && subTheory.capoOptions.length > 0 && (
                    <div className="mt-3 w-full flex flex-wrap gap-1 justify-center shrink-0">
                      {subTheory.capoOptions.map((opt, oIdx) => (
                        <div key={oIdx} dangerouslySetInnerHTML={{ __html: opt }} className="inline-block" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Keys Panel */}
                <div className="flex-1 flex flex-col items-center bg-black/40 rounded-2xl p-4 border border-indigo-500/20 shadow-inner min-w-0">
                  <h4 className="text-xs text-indigo-300 font-black mb-3 uppercase tracking-wider text-center flex items-center gap-1.5">
                    🎹 Keyboard Voicing
                  </h4>
                  <div className="w-full flex-1 flex flex-col items-center justify-center gap-4">
                    {subTheory && (() => {
                      const lushNotes = subTheory.keysExtensions[0]?.notes || subTheory.openTenthNotes;
                      return (
                        <div className="w-full flex flex-col gap-4 items-center">
                          <PianoVisualizer
                            absoluteNotes={subTheory.pianoInversions[0].notes}
                            title="Root Position"
                            isStandalone={true}
                            scale={0.9}
                            onPlayClick={() => {
                              const midi = subTheory.pianoInversions[0].notes.map(n => 48 + n);
                              audioSynth.playMidiNotes(midi, 'chord', 'piano');
                            }}
                            onHelpClick={() => handleOpenHelpDetail(`${selectedSubChord} Root Position`, 'keys', 'chord', subTheory.pianoInversions[0].notes)}
                          />
                          <div className="w-full border-t border-indigo-500/20 my-1"></div>
                          <PianoVisualizer
                            absoluteNotes={lushNotes}
                            title="Lush Extension"
                            isStandalone={true}
                            scale={0.9}
                            onPlayClick={() => {
                              const midi = lushNotes.map(n => 48 + n);
                              audioSynth.playMidiNotes(midi, 'chord', 'piano');
                            }}
                            onHelpClick={() => handleOpenHelpDetail(`${selectedSubChord} Lush Extension`, 'keys', 'chord', lushNotes)}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Info Footer */}
              {subTheory && (
                <div className="bg-indigo-950/40 p-4 rounded-xl border border-indigo-500/20 text-xs text-indigo-200 leading-relaxed shadow-inner shrink-0 mt-auto space-y-1">
                  <div>
                    <span className="text-amber-400 font-bold font-mono">Role:</span> {subTheory.role} &mdash; {subTheory.roleDefinition}
                  </div>
                  <div>
                    <span className="text-sky-300 font-bold font-mono">Strategy:</span> {subTheory.guitarIdea}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Help Detail Popup Overlay */}
        {activeHelpDetail && (
          <div className="absolute inset-0 z-[700] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gradient-to-b from-indigo-950 to-slate-950 border border-amber-500/40 rounded-2xl max-w-md w-full p-5 sm:p-6 text-white shadow-2xl relative flex flex-col max-h-[90%] overflow-hidden animate-blur-fade">
              
              {/* Header */}
              <div className="flex justify-between items-start gap-3 mb-4 shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-slate-950 px-2 py-0.5 rounded shadow-sm">
                      {activeHelpDetail.type}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded border border-indigo-500/40">
                      {activeHelpDetail.instrument}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 leading-tight">
                    {activeHelpDetail.title}
                  </h3>
                </div>
                <button
                  onClick={() => setActiveHelpDetail(null)}
                  className="text-indigo-300 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-all active:scale-95 text-lg"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1.5 space-y-4 text-xs leading-relaxed text-indigo-100">
                {/* Notes list */}
                {activeHelpDetail.notes.length > 0 && (
                  <div className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/20 shadow-inner">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
                      Voiced Notes
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeHelpDetail.notes.map((note, idx) => (
                        <span key={idx} className="bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 rounded-full font-mono text-xs text-amber-200 font-extrabold shadow-sm">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Theory Info */}
                <div className="bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/10">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1.5">
                    Theory Insights
                  </span>
                  <p className="text-indigo-200 font-medium">
                    {activeHelpDetail.theoryInfo}
                  </p>
                </div>

                {/* Performance Technique */}
                {activeHelpDetail.technique && (
                  <div>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-2">
                      Technique & Pro Tips
                    </span>
                    <div className="space-y-2 bg-black/30 p-3.5 rounded-xl border border-indigo-500/10 shadow-inner">
                      {activeHelpDetail.technique.split('\n').filter(Boolean).map((line, lIdx) => (
                        <p key={lIdx} className="text-indigo-100 flex items-start gap-1.5 font-medium">
                          <span className="text-amber-400 mt-0.5 shrink-0">✦</span>
                          <span>{line.replace(/^•\s*/, '')}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer / Actions */}
              <div className="mt-5 pt-3 border-t border-indigo-500/20 flex gap-3 shrink-0">
                <button
                  onClick={() => {
                    const inst = activeHelpDetail.instrument;
                    if (inst === 'keys') {
                      const midi = (activeHelpDetail.dotsOrAbsoluteNotes as number[]).map(n => 48 + n);
                      audioSynth.playMidiNotes(midi, activeHelpDetail.type === 'chord' ? 'chord' : 'scale', 'piano');
                    } else {
                      const bases = inst === 'bass' ? [43, 38, 33, 28] : [64, 59, 55, 50, 45, 40];
                      const midi = (activeHelpDetail.dotsOrAbsoluteNotes as any[]).map(d => bases[d.s] + d.f);
                      audioSynth.playMidiNotes(midi, activeHelpDetail.type === 'chord' ? 'chord' : 'scale', inst === 'guitar' ? 'guitar' : inst === 'bass' ? 'bass' : 'lead');
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/10 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 border border-amber-300/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Hear Sound Voice</span>
                </button>
                <button
                  onClick={() => setActiveHelpDetail(null)}
                  className="bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/30 hover:border-indigo-400/50 text-indigo-200 hover:text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all active:scale-[0.98]"
                >
                  Got it!
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
