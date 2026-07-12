import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const regex = /if \(isCurrentlyActive && activeSetlistFolder && currentSong\) \{[\s\S]*?try \{[\s\S]*?const payloadSet = \{[\s\S]*?action: 'deleteArrangement',[\s\S]*?songId: String\(currentSong.SongID\),[\s\S]*?name: `Set: \$\{activeSetlistFolder\}`,[\s\S]*?\};[\s\S]*?await fetch\(SCRIPT_URL, \{[\s\S]*?method: 'POST',[\s\S]*?body: JSON\.stringify\(payloadSet\),[\s\S]*?\}\);/m;

const newCode = `if (isCurrentlyActive && activeSetlistFolder && currentSong) {
        try {
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
          if (arrangements[sId]) {
            delete arrangements[sId];
          }
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

const regex2 = /if \(activeSetlistFolder\) \{[\s\S]*?try \{[\s\S]*?const payloadSet = \{[\s\S]*?action: 'deleteArrangement',[\s\S]*?songId: String\(currentSong.SongID\),[\s\S]*?name: `Set: \$\{activeSetlistFolder\}`,[\s\S]*?\};[\s\S]*?await fetch\(SCRIPT_URL, \{[\s\S]*?method: 'POST',[\s\S]*?body: JSON\.stringify\(payloadSet\),[\s\S]*?\}\);/m;

const newCode2 = `if (activeSetlistFolder) {
                      try {
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
                        if (arrangements[sId]) {
                          delete arrangements[sId];
                        }
                        const payloadMeta = {
                          action: 'saveSetlist',
                          name: activeSetlistFolder,
                          roadmap: { songIds, lastUpdated: Date.now(), locked: isSetlistLocked(activeSetlistFolder), arrangements }
                        };
                        await fetch(SCRIPT_URL, {
                          method: 'POST',
                          body: JSON.stringify(payloadMeta),
                        });`;

content = content.replace(regex2, newCode2);

fs.writeFileSync('src/App.tsx', content);
