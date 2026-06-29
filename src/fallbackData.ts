import { Song, SongLine } from './types';

export const FALLBACK_SONGS: Song[] = [
  {
    SongID: 'fallback-waymaker',
    Title: 'Way Maker',
    Artist: 'Sinach / Osinachi Nwachukwu',
    OriginalKey: 'C',
    Version: 'Standard'
  },
  {
    SongID: 'fallback-beautifulname',
    Title: 'What A Beautiful Name',
    Artist: 'Hillsong Worship',
    OriginalKey: 'D',
    Version: 'Standard'
  },
  {
    SongID: 'fallback-amazinggrace',
    Title: 'Amazing Grace (My Chains Are Gone)',
    Artist: 'Chris Tomlin',
    OriginalKey: 'G',
    Version: 'Acoustic'
  }
];

export const FALLBACK_SONG_LINES: SongLine[] = [
  // --- Way Maker (Key of C) ---
  // Verse 1
  { SongID: 'fallback-waymaker', SectionName: 'Verse 1', Chords: 'F C G Am', Lyrics: 'You are here, moving in our midst, I worship You, I worship You' },
  { SongID: 'fallback-waymaker', SectionName: 'Verse 1', Chords: 'F C G Am', Lyrics: 'You are here, working in this place, I worship You, I worship You' },
  // Chorus
  { SongID: 'fallback-waymaker', SectionName: 'Chorus', Chords: 'F C G Am', Lyrics: 'Way maker, miracle worker, promise keeper' },
  { SongID: 'fallback-waymaker', SectionName: 'Chorus', Chords: 'F C G Am', Lyrics: 'Light in the darkness, my God, that is who You are' },
  // Verse 2
  { SongID: 'fallback-waymaker', SectionName: 'Verse 2', Chords: 'F C G Am', Lyrics: 'You are here, touching every heart, I worship You, I worship You' },
  { SongID: 'fallback-waymaker', SectionName: 'Verse 2', Chords: 'F C G Am', Lyrics: 'You are here, healing every heart, I worship You, I worship You' },
  // Bridge
  { SongID: 'fallback-waymaker', SectionName: 'Bridge', Chords: 'F C G Am', Lyrics: 'Even when I don\'t see it, You\'re working' },
  { SongID: 'fallback-waymaker', SectionName: 'Bridge', Chords: 'F C G Am', Lyrics: 'Even when I don\'t feel it, You\'re working' },
  { SongID: 'fallback-waymaker', SectionName: 'Bridge', Chords: 'F C G Am', Lyrics: 'You never stop, You never stop working' },

  // --- What A Beautiful Name (Key of D) ---
  // Verse 1
  { SongID: 'fallback-beautifulname', SectionName: 'Verse 1', Chords: 'D G Bm A', Lyrics: 'You were the Word at the beginning, One with God the Lord Most High' },
  { SongID: 'fallback-beautifulname', SectionName: 'Verse 1', Chords: 'Bm A/C# D G Bm A', Lyrics: 'Your hidden glory in creation, Now revealed in You our Christ' },
  // Chorus 1
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 1', Chords: 'D A Bm A G', Lyrics: 'What a beautiful Name it is, What a beautiful Name it is' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 1', Chords: 'Bm A G', Lyrics: 'The Name of Jesus Christ my King' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 1', Chords: 'D/F# A Bm A G', Lyrics: 'What a beautiful Name it is, nothing compares to this' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 1', Chords: 'Bm A G', Lyrics: 'What a beautiful Name it is, the Name of Jesus' },
  // Verse 2
  { SongID: 'fallback-beautifulname', SectionName: 'Verse 2', Chords: 'D G Bm A', Lyrics: 'You didn\'t want heaven without us, So Jesus You brought heaven down' },
  { SongID: 'fallback-beautifulname', SectionName: 'Verse 2', Chords: 'Bm A/C# D G Bm A', Lyrics: 'My sin was great Your love was greater, What could separate us now' },
  // Chorus 2
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 2', Chords: 'D A Bm A G', Lyrics: 'What a wonderful Name it is, What a wonderful Name it is' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 2', Chords: 'Bm A G', Lyrics: 'The Name of Jesus Christ my King' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 2', Chords: 'D/F# A Bm A G', Lyrics: 'What a wonderful Name it is, nothing compares to this' },
  { SongID: 'fallback-beautifulname', SectionName: 'Chorus 2', Chords: 'Bm A G', Lyrics: 'What a wonderful Name it is, the Name of Jesus' },
  // Bridge
  { SongID: 'fallback-beautifulname', SectionName: 'Bridge', Chords: 'G A Bm F#m', Lyrics: 'Death could not hold You, the veil tore before You' },
  { SongID: 'fallback-beautifulname', SectionName: 'Bridge', Chords: 'G A Bm A', Lyrics: 'You silence the boast of sin and grave' },
  { SongID: 'fallback-beautifulname', SectionName: 'Bridge', Chords: 'G A Bm F#m', Lyrics: 'The heavens are roaring the praise of Your glory' },
  { SongID: 'fallback-beautifulname', SectionName: 'Bridge', Chords: 'G A Bm A', Lyrics: 'For You are raised to life again' },

  // --- Amazing Grace (Key of G) ---
  // Verse 1
  { SongID: 'fallback-amazinggrace', SectionName: 'Verse 1', Chords: 'G C/G G D/G', Lyrics: 'Amazing grace! How sweet the sound, That saved a wretch like me!' },
  { SongID: 'fallback-amazinggrace', SectionName: 'Verse 1', Chords: 'G C/G G D C G', Lyrics: 'I once was lost, but now am found; Was blind, but now I see.' },
  // Chorus
  { SongID: 'fallback-amazinggrace', SectionName: 'Chorus', Chords: 'G C G D', Lyrics: 'My chains are gone, I\'ve been set free' },
  { SongID: 'fallback-amazinggrace', SectionName: 'Chorus', Chords: 'G/B C G/D D G', Lyrics: 'My Savior God has ransomed me' },
  { SongID: 'fallback-amazinggrace', SectionName: 'Chorus', Chords: 'C G/B Am7 D G', Lyrics: 'And like a flood His mercy reigns, Unending love, amazing grace' },
  // Verse 2
  { SongID: 'fallback-amazinggrace', SectionName: 'Verse 2', Chords: 'G C/G G D/G', Lyrics: 'The Lord has promised good to me, His word my hope secures' },
  { SongID: 'fallback-amazinggrace', SectionName: 'Verse 2', Chords: 'G C/G G D C G', Lyrics: 'He will my shield and portion be, As long as life endures' }
];
