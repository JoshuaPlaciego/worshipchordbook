import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const regex = /if \(isCurrentlyActive && activeSetlistFolder && currentSong\) \{[\s\S]*?const payloadArrangement = \{[\s\S]*?action: 'saveArrangement',[\s\S]*?songId: String\(currentSong.SongID\),[\s\S]*?name: `Set: \$\{activeSetlistFolder\}`,[\s\S]*?roadmap: capturedSettings,[\s\S]*?\};[\s\S]*?await fetch\(SCRIPT_URL, \{[\s\S]*?method: 'POST',[\s\S]*?body: JSON\.stringify\(payloadArrangement\),[\s\S]*?\}\);/m;

const newCode = `if (isCurrentlyActive && activeSetlistFolder && currentSong) {
          const existingMeta = allSharedSetlists.find((sl) => sl.PresetName === activeSetlistFolder);
          let songIds: string[] = [];
          let arrangements: { [songId: string]: any } = {};
          if (existingMeta) {
            try {
              const parsed = JSON.parse(existingMeta.RoadmapJSON);
              songIds = Array.isArray(parsed.songIds) ? parsed.songIds : [];
              if (parsed.arrangements) {
                arrangements = parsed.arrangements;
              }
            } catch {}
          }
          const sId = String(currentSong.SongID);
          if (!songIds.includes(sId)) {
            songIds.push(sId);
          }
          arrangements[sId] = capturedSettings;
          const payloadMeta = {
            action: 'saveSetlist',
            name: activeSetlistFolder,
            roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder), arrangements }
          };
          await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payloadMeta),
          });`;

content = content.replace(regex, newCode);
fs.writeFileSync('src/App.tsx', content);
