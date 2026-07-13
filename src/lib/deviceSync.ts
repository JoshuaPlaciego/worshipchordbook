// Simple IndexedDB helper to persist the File System directory handle across sessions
const DB_NAME = 'WorshipChordbookDB';
const STORE_NAME = 'WorkspaceStore';
const HANDLE_KEY = 'workspaceDirHandle';

export function saveHandleToDB(handle: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(handle, HANDLE_KEY);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export function getHandleFromDB(): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(HANDLE_KEY);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export function removeHandleFromDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(HANDLE_KEY);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// Check and request permission for the handle
export async function verifyPermission(fileHandle: any, readWrite: boolean): Promise<boolean> {
  const options: any = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

// Get or create a subdirectory recursively
async function getDirectory(parentHandle: any, pathParts: string[], create = true): Promise<any> {
  let currentHandle = parentHandle;
  for (const part of pathParts) {
    if (!part) continue;
    currentHandle = await currentHandle.getDirectoryHandle(part, { create });
  }
  return currentHandle;
}

// Write JSON data to a file in a subfolder
export async function writeJsonToFile(
  rootHandle: any,
  subfolder: string,
  filename: string,
  data: any
): Promise<void> {
  try {
    const folderHandle = await getDirectory(rootHandle, [subfolder], true);
    const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (err) {
    console.error(`Failed to write file ${subfolder}/${filename}:`, err);
    throw err;
  }
}

// Read JSON data from a file in a subfolder
export async function readJsonFromFile(
  rootHandle: any,
  subfolder: string,
  filename: string
): Promise<any> {
  try {
    const folderHandle = await getDirectory(rootHandle, [subfolder], false);
    const fileHandle = await folderHandle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (err) {
    // If folder/file doesn't exist, return null
    return null;
  }
}

// Delete a file from a subfolder
export async function deleteFileFromFolder(
  rootHandle: any,
  subfolder: string,
  filename: string
): Promise<void> {
  try {
    const folderHandle = await getDirectory(rootHandle, [subfolder], false);
    await folderHandle.removeEntry(filename);
  } catch (err) {
    // Ignore if not found
  }
}

// List all files in a subfolder
export async function listFilesInSubfolder(rootHandle: any, subfolder: string): Promise<any[]> {
  try {
    const folderHandle = await getDirectory(rootHandle, [subfolder], true);
    const files = [];
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        files.push(entry);
      }
    }
    return files;
  } catch (err) {
    return [];
  }
}

// Recursively traverse and list files in arrangements subdirectory (arrangements/SongID/PresetName.json)
export async function listArrangementsRecursive(rootHandle: any): Promise<any[]> {
  const list: any[] = [];
  try {
    const arrangementsDir = await getDirectory(rootHandle, ['arrangements'], true);
    for await (const songDirEntry of arrangementsDir.values()) {
      if (songDirEntry.kind === 'directory') {
        const songId = songDirEntry.name;
        for await (const fileEntry of songDirEntry.values()) {
          if (fileEntry.kind === 'file' && fileEntry.name.endsWith('.json')) {
            list.push({ songId, fileEntry });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error listing recursive arrangements:', err);
  }
  return list;
}

// Export all in-app state data to physical workspace on the device
export async function exportAllToDevice(
  rootHandle: any,
  songs: any[],
  localSetlists: any[],
  localArrs: any[]
): Promise<void> {
  // 1. Export songs
  for (const song of songs) {
    if (!song.SongID) continue;
    await writeJsonToFile(rootHandle, 'songs', `${song.SongID}.json`, song);
  }

  // 2. Export local setlists
  for (const setlist of localSetlists) {
    if (!setlist.PresetName) continue;
    // Sanitize filename
    const safeName = setlist.PresetName.replace(/[\/\\:*?"<>|]/g, '_');
    await writeJsonToFile(rootHandle, 'setlists', `${safeName}.json`, setlist);
  }

  // 3. Export arrangements
  for (const arr of localArrs) {
    if (!arr.SongID || !arr.PresetName) continue;
    const safeSongId = String(arr.SongID).replace(/[\/\\:*?"<>|]/g, '_');
    const safePresetName = String(arr.PresetName).replace(/[\/\\:*?"<>|]/g, '_');
    
    // Get sub-directory handle: arrangements/SongID/
    const songArrHandle = await getDirectory(rootHandle, ['arrangements', safeSongId], true);
    const fileHandle = await songArrHandle.getFileHandle(`${safePresetName}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(arr, null, 2));
    await writable.close();
  }
}

// Import all data from physical workspace on the device
export async function importAllFromDevice(rootHandle: any): Promise<{
  songs: any[];
  localSetlists: any[];
  localArrs: any[];
}> {
  const songs: any[] = [];
  const localSetlists: any[] = [];
  const localArrs: any[] = [];

  // 1. Read songs
  try {
    const songFiles = await listFilesInSubfolder(rootHandle, 'songs');
    for (const fileEntry of songFiles) {
      const file = await fileEntry.getFile();
      const text = await file.text();
      try {
        songs.push(JSON.parse(text));
      } catch (e) {
        console.error(`Error parsing song file ${fileEntry.name}:`, e);
      }
    }
  } catch (err) {
    console.error('Error reading songs directory:', err);
  }

  // 2. Read local setlists
  try {
    const setlistFiles = await listFilesInSubfolder(rootHandle, 'setlists');
    for (const fileEntry of setlistFiles) {
      const file = await fileEntry.getFile();
      const text = await file.text();
      try {
        localSetlists.push(JSON.parse(text));
      } catch (e) {
        console.error(`Error parsing setlist file ${fileEntry.name}:`, e);
      }
    }
  } catch (err) {
    console.error('Error reading setlists directory:', err);
  }

  // 3. Read arrangements recursively
  try {
    const arrFileList = await listArrangementsRecursive(rootHandle);
    for (const item of arrFileList) {
      const file = await item.fileEntry.getFile();
      const text = await file.text();
      try {
        localArrs.push(JSON.parse(text));
      } catch (e) {
        console.error(`Error parsing arrangement file ${item.fileEntry.name}:`, e);
      }
    }
  } catch (err) {
    console.error('Error reading arrangements directory:', err);
  }

  return { songs, localSetlists, localArrs };
}

