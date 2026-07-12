const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = `    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
      {/* Interactive A4 PDF Print Preview Modal */}`;

const replacement = `    if (rawSaved) {
      try {
        const dict = JSON.parse(rawSaved);
        savedSettings = dict[String(song.SongID)];
      } catch (e) {}
    }
    
    if (savedSettings) {
      if (savedSettings.key) activeKey = savedSettings.key;
      if (savedSettings.roadmap && savedSettings.roadmap.length > 0) {
        activeRoadmapToUse = savedSettings.roadmap;
      }
    }
    
    // Check if the current setlist has an override for this song
    if (activeSetlistFolder) {
      const existingMeta = allSharedSetlists.find((sl) => sl.PresetName === activeSetlistFolder);
      if (existingMeta) {
        try {
          const parsed = JSON.parse(existingMeta.RoadmapJSON);
          if (parsed.arrangements && parsed.arrangements[String(song.SongID)]) {
            const arr = parsed.arrangements[String(song.SongID)];
            if (arr.key) activeKey = arr.key;
            if (arr.roadmap && arr.roadmap.length > 0) activeRoadmapToUse = arr.roadmap;
          }
        } catch (e) {}
      }
    }

    return { song, activeKey, activeRoadmapToUse, templates };
  };

  return (
    <div className="min-h-screen bg-[#020205] text-white relative overflow-x-hidden font-sans selection:bg-indigo-500/30">
      {/* Interactive A4 PDF Print Preview Modal */}`;

content = content.replace(target, replacement);
fs.writeFileSync('src/App.tsx', content);
