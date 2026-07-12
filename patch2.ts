import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Replacements
content = content.replace(
  /const setPreset = arrangementsToUse\.find\(\s*\(arr\) => String\(arr\.SongID\) === String\(song\.SongID\) && arr\.PresetName === `Set: \$\{activeFolder\}`\s*\);/g,
  "const setPreset = getSetlistArrangement(activeFolder, String(song.SongID));"
);

content = content.replace(
  /const setPreset = allSharedArrangements\.find\(\s*\(arr\) => String\(arr\.SongID\) === String\(song\.SongID\) && arr\.PresetName === `Set: \$\{activeSetlistFolder\}`\s*\);/g,
  "const setPreset = getSetlistArrangement(activeSetlistFolder, String(song.SongID));"
);

fs.writeFileSync('src/App.tsx', content);
