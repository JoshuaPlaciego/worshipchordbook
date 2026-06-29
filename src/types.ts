export interface Song {
  SongID: string | number;
  Title: string;
  Artist?: string;
  OriginalKey?: string;
  Version?: string;
  BPM?: number;
}

export interface SongLine {
  LineID?: string | number;
  SongID: string | number;
  SectionName?: string;
  Section?: string;
  section?: string;
  Order?: number;
  Chords?: string;
  Lyrics?: string;
}

export interface RoadmapBlock {
  id: string;
  name: string;
  enabledLines: number[];
  keyOffset: number;
}

export interface SectionEdit {
  name: string;
  lines: {
    chords: string;
    lyrics: string;
  }[];
}

export interface ChordTheoryData {
  notes: string[];
  pianoInversions: { name: string; notes: number[] }[];
  role: string;
  roleDefinition: string;
  scales: string[];
  scaleIntervals: number[];
  bassIntervals: number[];
  targetTones: string;
  bassIdea: string;
  beautiful: string[];
  genre: string;
  isMinor: boolean;
  scaleFiguresText: string;
  guitarIdea: string;
  capoOptions: string[];
  pickingPattern: string;
  strummingPattern: string;
  toneSuggestion: string;
  keysIdea: string;
  keysLeftHandWithBass: string;
  keysLeftHandNoBass: string;
  pedalPoint: string;
  passingChord: string;
  patchRecipe: string;
  organDrawbars: string;
  openTenthNotes: number[];
  keysExtensions: { name: string; notes: number[] }[];
  animatedScales: { name: string; intervals: number[] }[];
}
