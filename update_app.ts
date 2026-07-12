import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Helper to add
const helper = `
  const getSetlistArrangement = (setName: string, songId: string) => {
    const meta = allSharedSetlists.find((sl) => sl.PresetName === setName);
    if (!meta) return null;
    try {
      const parsed = JSON.parse(meta.RoadmapJSON);
      if (parsed && parsed.arrangements && parsed.arrangements[songId]) {
        return { RoadmapJSON: JSON.stringify(parsed.arrangements[songId]) };
      }
    } catch {}
    return null;
  };
`;

// Insert the helper after allSharedSetlists state
content = content.replace(
  /const \[allSharedSetlists, setAllSharedSetlists\] = useState<any\[\]>\(\(\) => \{[^}]*\}\);\s*/,
  '$&' + helper
);

fs.writeFileSync('src/App.tsx', content);
