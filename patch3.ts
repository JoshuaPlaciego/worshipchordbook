import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const oldFunc = /const updateSetlistArrangementDirectly = async \([^)]*\) => {[\s\S]*?try {[\s\S]*?method: 'POST',[\s\S]*?\}\);[\s\S]*?const resArrJson = await resArr.json\(\);[\s\S]*?\} catch \(err: any\) {[\s\S]*?\} finally {[\s\S]*?\}\s*\};/m;

const newFunc = `const updateSetlistArrangementDirectly = async (
    songId: string,
    roadmap: RoadmapBlock[],
    optArrangementName?: string
  ) => {
    if (!activeSetlistFolder) return;
    setIsLoading(true);
    try {
      const capturedSettings = {
        key: currentKey,
        roadmap: roadmap,
        arrangementName: optArrangementName || currentArrangementName,
        snapshotSections: sectionTemplates,
      };

      const existingMeta = allSharedSetlists.find(
        (sl) => sl.PresetName === activeSetlistFolder
      );
      
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

      const sId = String(songId);
      if (!songIds.includes(sId)) {
        songIds.push(sId);
      }
      
      arrangements[sId] = capturedSettings;

      const payloadMeta = {
        action: 'saveSetlist',
        name: activeSetlistFolder,
        roadmap: { 
          songIds, 
          lastUpdated: Date.now(), 
          locked: isSetlistLocked(activeSetlistFolder),
          arrangements 
        },
      };

      const resMeta = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payloadMeta),
      });

      const resMetaJson = await resMeta.json();
      if (resMetaJson.status !== 'success') {
        throw new Error(resMetaJson.message || 'Failed to update setlist directly');
      }

    } catch (err: any) {
      console.error('Direct arrangement save error:', err);
    } finally {
      setIsLoading(false);
    }
  };`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync('src/App.tsx', content);
