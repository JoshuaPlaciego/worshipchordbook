import { ChordTheoryData } from "./types";

export const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const SCALE_NUMBERS = ['1', '2', '2', '3', '3', '4', '4', '5', '6', '6', '7', '7'];

export const NOTE_TO_INDEX: { [key: string]: number } = {
  'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
  'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11
};

export const GUITAR_DIAGRAMS: { [key: string]: number[] } = {
  'C': [ -1, 3, 2, 0, 1, 0 ], 'C#': [ -1, 4, 3, 1, 2, 1 ], 'Db': [ -1, 4, 3, 1, 2, 1 ],
  'D': [ -1, -1, 0, 2, 3, 2 ], 'D#': [ -1, -1, 1, 3, 4, 3 ], 'Eb': [ -1, -1, 1, 3, 4, 3 ],
  'E': [ 0, 2, 2, 1, 0, 0 ], 'F': [ 1, 3, 3, 2, 1, 1 ], 'F#': [ 2, 4, 4, 3, 2, 2 ],
  'Gb': [ 2, 4, 4, 3, 2, 2 ], 'G': [ 3, 2, 0, 0, 0, 3 ], 'Ab': [ 4, 6, 6, 5, 4, 4 ],
  'A': [ -1, 0, 2, 2, 2, 0 ], 'Bb': [ -1, 1, 3, 3, 3, 1 ], 'B': [ -1, 2, 4, 4, 4, 2 ],
  'Cm': [ -1, 3, 5, 5, 4, 3 ], 'C#m': [ -1, 4, 6, 6, 5, 4 ], 'Dm': [ -1, -1, 0, 2, 3, 1 ],
  'Em': [ 0, 2, 2, 0, 0, 0 ], 'Fm': [ 1, 3, 3, 1, 1, 1 ], 'F#m': [ 2, 4, 4, 2, 2, 2 ],
  'Gm': [ 3, 5, 5, 3, 3, 3 ], 'Am': [ -1, 0, 2, 2, 1, 0 ], 'Bm': [ -1, 2, 4, 4, 3, 2 ]
};

const CHORD_REGEX = /(^|[\s/()|-])([A-G][#b]?)/gi;

export function transposeChord(chord: string, semitones: number): string {
  if (!chord) return '';
  return chord.replace(CHORD_REGEX, (match, prefix, root) => {
    const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
    const idx = NOTE_TO_INDEX[formattedRoot];
    if (idx === undefined) return match;
    const newIdx = (idx + semitones + 12) % 12;
    return prefix + NOTES[newIdx];
  });
}

export function getNumberForChord(chord: string, blockKeyName: string, currentKey: string): string {
  if (!chord) return '';
  const keyToUse = blockKeyName || currentKey || 'C';
  const keyIdx = NOTE_TO_INDEX[keyToUse];
  if (keyIdx === undefined) return chord;
  return chord.replace(CHORD_REGEX, (match, prefix, root) => {
    const formattedRoot = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
    const rootIdx = NOTE_TO_INDEX[formattedRoot];
    if (rootIdx === undefined) return match;
    const num = SCALE_NUMBERS[(rootIdx - keyIdx + 12) % 12];
    return prefix + num;
  });
}

export function getModulatedKeyName(baseKey: string, offset: number): string {
  if (!baseKey) return 'C';
  const idx = NOTE_TO_INDEX[baseKey];
  if (idx === undefined) return baseKey;
  const newIdx = (idx + offset + 12) % 12;
  return NOTES[newIdx];
}

export function getChordTheoryData(root: string, quality: string, songKey: string): ChordTheoryData | null {
  const rootIdx = NOTE_TO_INDEX[root];
  const keyIdx = NOTE_TO_INDEX[songKey] !== undefined ? NOTE_TO_INDEX[songKey] : rootIdx;
  if (rootIdx === undefined) return null;

  const interval = (rootIdx - keyIdx + 12) % 12;
  const isMinor = quality.includes('m') && !quality.includes('dim');
  const isDim = quality.includes('dim');
  const isDom = quality.includes('7') && !quality.includes('maj7') && !isMinor && !isDim;
  
  const thirdIdx = (rootIdx + (isMinor || isDim ? 3 : 4)) % 12;
  const fifthIdx = (rootIdx + (isDim ? 6 : 7)) % 12;
  const seventhIdx = isDom ? (rootIdx + 10) % 12 : (quality.includes('maj7') ? (rootIdx + 11) % 12 : null);
  
  const notes = [NOTES[rootIdx], NOTES[thirdIdx], NOTES[fifthIdx]];
  if (seventhIdx !== null) notes.push(NOTES[seventhIdx]);

  let roleName = "";
  let roleDef = ""; 
  let scalesList: string[] = [];
  let scaleIntervals: number[] = [];
  let bassIntervals: number[] = [];
  let targetTones = "";
  let beautiful: string[] = [];
  let genre = "";
  let bassIdea = "";
  let scaleFiguresText = "";

  // Capo Calculator Logic
  let capoOptions: string[] = [];
  const openShapes = [
    { shape: 'E', r: 4 }, { shape: 'A', r: 9 }, { shape: 'D', r: 2 }, { shape: 'C', r: 0 }, { shape: 'G', r: 7 }
  ];
  openShapes.forEach(os => {
    let fret = (rootIdx - os.r + 12) % 12;
    if (fret > 0 && fret <= 9) {
      capoOptions.push(`<span class="bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 px-2 py-1 rounded text-[10px] shadow-sm font-semibold">Capo ${fret} ➔ <b>${os.shape}</b></span>`);
    }
  });

  // Dynamic Right Hand & Tone Suggestions
  let pickingPattern = isMinor ? "Thumb(R) - Index(3rd) - Middle(5th)" : "Thumb(R) - Middle(5th) - Index(3rd)";
  let strummingPattern = "D - D - U - U - D - U (Classic 16th)";
  let toneSuggestion = "Clean + Modulated Reverb + Dotted 8th Delay";
  
  // Dynamic Keys Suggestions (Defaults)
  let keysIdea = "• Main Mix: Play Root position in left hand, Inversions in right hand.\n• Ambient: Hold extensions (Sus2/Add9).";
  let keysLeftHandWithBass = "Omit root or play sparse 1-5. Stay out of the muddy low-end frequencies.";
  let keysLeftHandNoBass = "Play wide 1-5-8 or 1-5-10 octaves to fill the deep sub frequencies.";
  let pedalPoint = "Hold the root note of the song's key on top.";
  let passingChord = "Transition smoothly on the upbeat.";
  let patchRecipe = "Layer 1: Grand Piano (Cutoff 80%)\nLayer 2: Warm Analog Pad\nLayer 3: Shimmer Reverb (+1 Octave)\nArp: None";
  let organDrawbars = "88 8800 000";

  // Calculate Absolute Notes for Piano Inversions
  const rootAbs = (rootIdx < 5) ? rootIdx + 12 : rootIdx; 
  const thirdAbs = rootAbs + (isMinor || isDim ? 3 : 4);
  const fifthAbs = rootAbs + (isDim ? 6 : 7);
  const sevAbs = seventhIdx !== null ? rootAbs + (isDom ? 10 : 11) : null;

  let inv0 = [rootAbs, thirdAbs, fifthAbs];
  if (sevAbs) inv0.push(sevAbs);
  
  let inv1 = [thirdAbs, fifthAbs, rootAbs + 12];
  if (sevAbs) inv1.push(sevAbs > rootAbs + 12 ? sevAbs : sevAbs + 12);
  
  let inv2 = [fifthAbs, rootAbs + 12, thirdAbs + 12];
  if (sevAbs) inv2.push(sevAbs > fifthAbs ? sevAbs : sevAbs + 12);

  let pianoInversions = [
    { name: "Root Pos", notes: inv0 },
    { name: "1st Inv", notes: inv1 },
    { name: "2nd Inv", notes: inv2 }
  ];

  let openTenthNotes = [rootAbs, fifthAbs, rootAbs + (isMinor || isDim ? 15 : 16)];
  
  let keysExtensions: { name: string; notes: number[] }[] = [];
  let sus2Abs = [rootAbs, rootAbs + 2, fifthAbs, rootAbs + 12];
  keysExtensions.push({name: "Lush Sus2", notes: sus2Abs});
  let add9Abs = [rootAbs, thirdAbs, fifthAbs, rootAbs + 14];
  keysExtensions.push({name: isMinor ? "Minor Add9" : "Major Add9", notes: add9Abs});
  
  let guitarIdea = "• If acoustic, use the Capo Guide to stay in open position.\n• If electric and the chorus is huge, use the Power Chords to prevent muddiness.\n• For quiet verses, pick the Ambient Voicings or Triads individually.";

  let animatedScales: { name: string; intervals: number[] }[] = [];

  // Key-Relative Music Theory Intelligence Engine
  if (isMinor) {
    scaleIntervals = [0, 2, 3, 5, 7, 9, 10]; // Dorian Default
    bassIntervals = [0, 3, 7, 10];
    scaleFiguresText = `Dorian:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+3)%12]} - ${NOTES[(rootIdx+5)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]} - ${NOTES[(rootIdx+10)%12]}\n\nMinor Pentatonic:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+3)%12]} - ${NOTES[(rootIdx+5)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+10)%12]}\n\nMinor Blues:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+3)%12]} - ${NOTES[(rootIdx+5)%12]} - ${NOTES[(rootIdx+6)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+10)%12]}`;
    strummingPattern = "D - D - D - D U (Driving 8th)";

    animatedScales.push({ name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] });
    animatedScales.push({ name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] });
    animatedScales.push({ name: "Minor Blues", intervals: [0, 3, 5, 6, 7, 10] });
    animatedScales.push({ name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] });
    animatedScales.push({ name: "Melodic Minor", intervals: [0, 2, 3, 5, 7, 9, 11] });

    if (interval === 2) { // ii
      roleName = "ii (Supertonic)";
      roleDef = "A minor chord that naturally pulls towards the V (Dominant) chord. Great for smooth passing.";
      scalesList = ["Dorian", "Minor Pentatonic", "Minor Blues", "Melodic Minor"];
      targetTones = `Target the 9th (${NOTES[(rootIdx+2)%12]}) for a jazzy/neo-soul R&B vibe. Avoid the b6.`;
      beautiful = [`${root}m7`, `${root}m9`, `${root}m11`, `${root}m6`];
      genre = "Sets up the V chord beautifully. Great for smooth, walking transitions in Gospel/R&B/Jazz.";
      bassIdea = "Play the root, then walk up the scale to reach the next structural chord.";
      toneSuggestion = "Warm Clean + Compressor + Analog Delay";
      keysIdea = "• Main Mix: Play 1st inversion to leave room for the vocal melody.\n• Passing: Walk into this chord chromatically from the I.";
      pedalPoint = `Anchor the 5th (${NOTES[(keyIdx+7)%12]}) of the key on top.`;
      passingChord = `Approach with ${NOTES[(rootIdx-2+12)%12]}dim7 or VI7.`;
      patchRecipe = "Layer 1: Electric Piano (Rhodes)\nLayer 2: Vintage Chorus\nLayer 3: Subtle Spring Reverb";
      organDrawbars = "80 8800 008";
    } else if (interval === 4) { // iii
      roleName = "iii (Mediant)";
      roleDef = "A minor chord that creates descending, somewhat melancholic tension. Often passes to the IV or vi.";
      scaleIntervals = [0, 1, 3, 5, 7, 8, 10]; // Phrygian
      scalesList = ["Phrygian", "Minor Pentatonic", "Harmonic Minor"];
      targetTones = `Emphasize the b2 (${NOTES[(rootIdx+1)%12]}) for tension, or stick to root/5th for standard worship.`;
      beautiful = [`${root}m7`, `${root}m(add11)`, `${root}m7b9`];
      genre = "Creates a descending, melancholic transition to the IV or vi chord.";
      bassIdea = "Keep it sparse. Root notes usually suffice as this chord passes quickly.";
      pedalPoint = `Hold the 5th (${NOTES[(keyIdx+7)%12]}) of the key.`;
      passingChord = "Usually a quick passing chord; don't linger.";
      patchRecipe = "Layer 1: Soft Felt Piano\nLayer 2: String Ensemble Pad\nEQ: Low Pass Filter at 1kHz";
      organDrawbars = "00 8800 000";
    } else { // vi or Borrowed minor
      roleName = interval === 9 ? "vi (Submediant)" : "Borrowed Minor";
      roleDef = "The emotional, minor center of the key. Often used to build deep tension before a big chorus.";
      scaleIntervals = [0, 2, 3, 5, 7, 8, 10]; // Aeolian
      scalesList = ["Aeolian (Natural Minor)", "Harmonic Minor", "Minor Pentatonic", "Blues"];
      targetTones = `The b6 (${NOTES[(rootIdx+8)%12]}) gives this the classic sad, emotional anchor.`;
      beautiful = [`${root}m7`, `${root}m9`, `${root}m(maj7)`, `${root}m11`];
      genre = "The emotional center of the song. Builds deep tension before big victorious choruses (Pop/Rock/Worship).";
      bassIdea = "Anchor heavily. Lock in with the kick drum. Octave jumps work great here.";
      toneSuggestion = "Light Overdrive + Big Hall Reverb";
      keysIdea = "• Main Mix: Lean into minor 3rd emphasis for emotion.\n• Play dark 10th voicings in the left hand if no bass.";
      pedalPoint = `Hold the minor 3rd (${NOTES[thirdIdx]}) on top for maximum emotion.`;
      passingChord = `Approach strongly with a III7 (${NOTES[(rootIdx+7)%12]}7) chord.`;
      patchRecipe = "Layer 1: Upright Piano (Lid Closed)\nLayer 2: Swelling Analog Pad\nFX: Long Decay Hall Reverb";
      organDrawbars = "88 8000 000";
    }
  } else if (isDim) {
    roleName = "Diminished";
    roleDef = "Extreme, unresolved tension. Usually used as a quick passing chord to resolve up a half-step.";
    scaleIntervals = [0, 1, 3, 4, 6, 7, 9, 10];
    bassIntervals = [0, 3, 6, 9];
    scalesList = ["Half-Whole Diminished", "Locrian", "Altered Scale"];
    targetTones = `The b5 (${NOTES[fifthIdx]}) is your tension note. Lean into it.`;
    beautiful = [`${root}dim7`, `${root}m7b5`, `${root}dim(maj7)`];
    genre = "Creates extreme unresolved tension. Found heavily in Gospel turnarounds, Jazz, and classical hymns.";
    bassIdea = "Play the root, or act as a passing chromatic tone. Don't linger.";
    scaleFiguresText = `Half-Whole Diminished:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+1)%12]} - ${NOTES[(rootIdx+3)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+6)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]} - ${NOTES[(rootIdx+10)%12]}`;
    
    animatedScales.push({ name: "Half-Whole Dim", intervals: [0, 1, 3, 4, 6, 7, 9, 10] });
    animatedScales.push({ name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] });
    
    pedalPoint = "Do not pedal. Move chromatically.";
    passingChord = `Resolves upwards a half-step to ${NOTES[(rootIdx+1)%12]}.`;
    patchRecipe = "Layer 1: Aggressive Synth Brass\nLayer 2: Distortion\nFilter: Wide Open";
    organDrawbars = "88 8888 888";
  } else {
    // Major / Dominant
    if (interval === 7 && isDom) {
      roleName = "V (Dominant 7)";
      roleDef = "Maximum forward motion. Creates tension that strongly craves resolution back to the I (Tonic).";
      scaleIntervals = [0, 2, 4, 5, 7, 9, 10]; // Mixolydian
      bassIntervals = [0, 4, 7, 10];
      scalesList = ["Mixolydian", "Altered Scale", "Lydian Dominant", "Blues"];
      targetTones = `The flat 7 (${NOTES[(rootIdx+10)%12]}) creates the dominant pull back to I.`;
      beautiful = [`${root}7sus4`, `${root}9`, `${root}13`, `${root}7b9`, `${root}7#9`];
      genre = "Maximum forward motion. Craves resolution back to the Tonic (Blues/Jazz/Gospel).";
      bassIdea = "Walk the bass line down to the I chord, or pulse the dominant 5th.";
      scaleFiguresText = `Mixolydian:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+5)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]} - ${NOTES[(rootIdx+10)%12]}\n\nMajor Pentatonic:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]}`;
      toneSuggestion = "Edge of Breakup / Mid Overdrive";
      strummingPattern = "D - D - D - D (Building 4ths)";
      keysIdea = "• Main Mix: Punchy stabs on the upbeat to build energy.\n• Build tension by playing a V7sus4 and resolving to V before hitting the I.";
      pedalPoint = `Hold the Root (${NOTES[rootIdx]}) to build maximum dominant tension.`;
      passingChord = `Approach with a ii7 (${NOTES[(rootIdx-5+12)%12]}m7) chord.`;
      patchRecipe = "Layer 1: Grand Piano (Hard Velocity)\nLayer 2: Bright Synth Brass\nFX: Fast Leslie Spin";
      organDrawbars = "88 8888 000";
      
      animatedScales.push({ name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] });
      animatedScales.push({ name: "Major Blues", intervals: [0, 2, 3, 4, 7, 9] });
      animatedScales.push({ name: "Altered (Jazz)", intervals: [0, 1, 3, 4, 6, 8, 10] });
      animatedScales.push({ name: "Lydian Dominant", intervals: [0, 2, 4, 6, 7, 9, 10] });
    } else if (interval === 5) { // IV
      roleName = "IV (Subdominant)";
      roleDef = "The classic worship 'lift'. Floaty and open, pulling gently back to the I or pushing to the V.";
      scaleIntervals = [0, 2, 4, 6, 7, 9, 11]; // Lydian
      bassIntervals = [0, 4, 7, 9];
      scalesList = ["Lydian", "Major Pentatonic", "Ionian"];
      targetTones = `The #4 (${NOTES[(rootIdx+6)%12]}) from Lydian creates an incredibly dreamy, floaty atmosphere.`;
      beautiful = [`${root}maj7`, `${root}add9`, `${root}maj9`, `${root}sus2`, `${root}maj7#11`];
      genre = "The classic worship 'lift'. Often used for big instrumental sections and soaring choruses.";
      bassIdea = "Great place for higher register bass fills or melodic 10ths.";
      scaleFiguresText = `Lydian:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+6)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]} - ${NOTES[(rootIdx+11)%12]}\n\nMajor Pentatonic:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]}`;
      toneSuggestion = "Clean + Shimmer Reverb + Swells";
      keysIdea = "• Main Mix: Play wide open arpeggios in the right hand for an atmospheric lift.";
      pedalPoint = `Hold the 5th (${NOTES[(keyIdx+7)%12]}) of the key on top to float.`;
      passingChord = `Approach with a I/III (${NOTES[keyIdx]}/${NOTES[(keyIdx+4)%12]}) passing chord.`;
      patchRecipe = "Layer 1: Bright Grand Piano\nLayer 2: Massive Shimmer Pad\nArp: 1/16th notes UP (Soft)\nFX: 100% Wet Delay";
      organDrawbars = "80 8800 000";
      
      animatedScales.push({ name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] });
      animatedScales.push({ name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9] });
      animatedScales.push({ name: "Ionian (Major)", intervals: [0, 2, 4, 5, 7, 9, 11] });
    } else { // I, V, or Borrowed
      roleName = interval === 0 ? "I (Tonic)" : interval === 7 ? "V (Dominant Triad)" : "Major";
      roleDef = interval === 0 ? "The home base. Provides complete resolution, triumph, and stability." : "A major chord that provides strong structural support and stability.";
      scaleIntervals = [0, 2, 4, 5, 7, 9, 11]; // Ionian
      bassIntervals = [0, 4, 7, 9];
      scalesList = ["Ionian (Major)", "Major Pentatonic", "Lydian", "Blues"];
      targetTones = `Resolve to the Root (${NOTES[rootIdx]}) or Major 3rd (${NOTES[thirdIdx]}). The 9th (${NOTES[(rootIdx+2)%12]}) adds a modern pop/worship shimmer.`;
      beautiful = [`${root}maj7`, `${root}add9`, `${root}sus2`, `${root}6/9`, `${root}maj9`];
      genre = "Home base or structural anchor. Provides complete resolution and triumphant clarity.";
      bassIdea = "Solid, foundational root notes. Hold the low end down securely.";
      scaleFiguresText = `Major (Ionian):\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+5)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]} - ${NOTES[(rootIdx+11)%12]}\n\nMajor Pentatonic:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]}\n\nMajor Blues:\n${NOTES[rootIdx]} - ${NOTES[(rootIdx+2)%12]} - ${NOTES[(rootIdx+3)%12]} - ${NOTES[(rootIdx+4)%12]} - ${NOTES[(rootIdx+7)%12]} - ${NOTES[(rootIdx+9)%12]}`;
      strummingPattern = "D - D U - U D U (Classic Pop)";
      keysIdea = "• Main Mix: Play solid blocks or big rhythmic pulses.\n• Anchor the progression heavily.";
      pedalPoint = `Hold the Root (${NOTES[rootIdx]}) as an anchor for the whole section.`;
      passingChord = `Approach with a V7 (${NOTES[(rootIdx+7)%12]}7) or IV/I chord.`;
      patchRecipe = "Layer 1: Grand Piano (Full EQ)\nLayer 2: Subtle Saw Pad (Sidechained)\nCompression: Fast Attack";
      organDrawbars = "88 8888 000";
      
      animatedScales.push({ name: "Ionian (Major)", intervals: [0, 2, 4, 5, 7, 9, 11] });
      animatedScales.push({ name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9] });
      animatedScales.push({ name: "Major Blues", intervals: [0, 2, 3, 4, 7, 9] });
      animatedScales.push({ name: "Bebop Major", intervals: [0, 2, 4, 5, 7, 8, 9, 11] });
    }
  }

  return {
    notes,
    pianoInversions,
    role: roleName,
    roleDefinition: roleDef,
    scales: scalesList,
    scaleIntervals,
    bassIntervals,
    targetTones,
    bassIdea,
    beautiful,
    genre,
    isMinor,
    scaleFiguresText,
    guitarIdea,
    capoOptions,
    pickingPattern,
    strummingPattern,
    toneSuggestion,
    keysIdea,
    keysLeftHandWithBass,
    keysLeftHandNoBass,
    pedalPoint,
    passingChord,
    patchRecipe,
    organDrawbars,
    openTenthNotes,
    keysExtensions,
    animatedScales
  };
}
