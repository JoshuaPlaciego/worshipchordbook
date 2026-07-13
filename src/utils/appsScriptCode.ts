export const APPS_SCRIPT_CODE = `/**
 * GOOGLE APPS SCRIPT BACKEND FOR SONGS, ARRANGEMENTS & SETLISTS
 * 
 * INSTRUCTIONS TO UPDATE YOUR GOOGLE SHEET APPS SCRIPT:
 * 1. Open your Google Spreadsheet.
 * 2. In the top menu, go to "Extensions" -> "Apps Script".
 * 3. Replace the entire content of your current script editor (usually "Code.gs") with this code.
 * 4. Click the Save icon (floppy disk).
 * 5. In the top right, click "Deploy" -> "Manage deployments".
 * 6. Click the edit icon (pencil) next to your active deployment, change "Version" to "New version", and click "Deploy".
 *    (Make sure it's set to "Execute as: Me" and "Who has access: Anyone" so the app can communicate).
 */

function doGet(e) {
  e = e || { parameter: { tab: "Songs" } };
  var tabName = e.parameter.tab || "Songs";
  return getSheetData(tabName);
}

function getSheetData(tabName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Unified Setlists / Arrangements storage to save cells!
    if (tabName === "Arrangements" || tabName === "Setlists") {
      var setlistSheet = ss.getSheetByName("Setlists");
      if (!setlistSheet) {
        setlistSheet = ss.insertSheet("Setlists");
        setlistSheet.appendRow(["Set", "Songs & Arrangements"]);
      }
      
      var data = setlistSheet.getDataRange().getDisplayValues();
      
      if (tabName === "Arrangements") {
        var arrangements = [];
        for (var i = 1; i < data.length; i++) {
          var key = data[i][0].toString();
          if (key.indexOf("ARR_") === 0) {
            var rest = key.substring(4);
            var firstUnderscore = rest.indexOf("_");
            if (firstUnderscore !== -1) {
              var songId = rest.substring(0, firstUnderscore);
              var presetName = rest.substring(firstUnderscore + 1);
              arrangements.push({
                "SongID": songId,
                "PresetName": presetName,
                "RoadmapJSON": data[i][1]
              });
            }
          }
        }
        
        // Auto-migration: Check for legacy Arrangements tab and migrate rows
        var legacyArrSheet = ss.getSheetByName("Arrangements");
        if (legacyArrSheet) {
          var legacyData = legacyArrSheet.getDataRange().getDisplayValues();
          if (legacyData.length > 1) {
            for (var k = 1; k < legacyData.length; k++) {
              var lSongId = legacyData[k][0].toString();
              var lPreset = legacyData[k][1].toString();
              var lRoadmap = legacyData[k][2].toString();
              
              var alreadyExists = false;
              for (var m = 0; m < arrangements.length; m++) {
                if (arrangements[m].SongID === lSongId && arrangements[m].PresetName === lPreset) {
                  alreadyExists = true;
                  break;
                }
              }
              if (!alreadyExists) {
                arrangements.push({
                  "SongID": lSongId,
                  "PresetName": lPreset,
                  "RoadmapJSON": lRoadmap
                });
                var compoundKey = "ARR_" + lSongId + "_" + lPreset;
                setlistSheet.appendRow([compoundKey, lRoadmap]);
              }
            }
            try {
              ss.deleteSheet(legacyArrSheet);
            } catch (err) {
              console.warn("Could not delete legacy Arrangements sheet:", err);
            }
          } else {
            try {
              ss.deleteSheet(legacyArrSheet);
            } catch (err) {}
          }
        }
        return createJsonResponse(arrangements);
        
      } else { // tabName === "Setlists"
        var setlists = [];
        for (var i = 1; i < data.length; i++) {
          var key = data[i][0].toString();
          if (key.indexOf("ARR_") !== 0) {
            setlists.push({
              "Set": key,
              "Songs & Arrangements": data[i][1]
            });
          }
        }
        return createJsonResponse(setlists);
      }
    }
    
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return createJsonResponse([]);
    
    // Use getDisplayValues() instead of getValues()
    // This forces Google Sheets to return exactly what you see on the screen as plain text
    // preventing it from turning "June 24" into a long Date object format.
    var data = sheet.getDataRange().getDisplayValues();
    
    if (data.length <= 1) return createJsonResponse([]);
    var headers = data[0];
    var json = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < headers.length; j++) { row[headers[j]] = data[i][j]; }
      json.push(row);
    }
    return createJsonResponse(json);
  } catch (err) { return createJsonResponse({error: err.toString()}); }
}

// ----------------------------------------------------
// AUTO-UPDATE VERSION HELPER
// ----------------------------------------------------
function updateSyncVersion(ss, tabName) {
  var syncSheet = ss.getSheetByName("SyncVersion");
  if (!syncSheet) {
    syncSheet = ss.insertSheet("SyncVersion");
    syncSheet.appendRow(["TabName", "Version"]);
  }
  
  var data = syncSheet.getDataRange().getValues();
  var newVersion = new Date().getTime().toString(); // Use timestamp as version
  var foundRow = -1;
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === tabName) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    syncSheet.getRange(foundRow, 2).setValue(newVersion);
  } else {
    syncSheet.appendRow([tabName, newVersion]);
  }
}

// ----------------------------------------------------
// ON EDIT TRIGGER (Tracks manual edits in Google Sheets)
// ----------------------------------------------------
function onEdit(e) {
  if (!e || !e.range) return; // Make sure we have an event object
  
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  
  // Only update versions if the edited sheet is one of our core data sheets
  if (sheetName === "Songs" || sheetName === "SongLines" || sheetName === "Arrangements" || sheetName === "Setlists") {
    var ss = e.source; // Get the active spreadsheet from the event
    updateSyncVersion(ss, sheetName);
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = JSON.parse(e.postData.contents);
  
  // Helper function to verify credentials against the "Users" sheet
  function isUserValid(username, passkey) {
    if (!username || passkey == null) return false;
    var userSheet = ss.getSheetByName("Users");
    if (!userSheet) return false; // Fail safely if the Users sheet isn't created yet
    
    var usersData = userSheet.getDataRange().getDisplayValues(); // Use DisplayValues here too for safety
    // Loop through rows (skipping header row 0)
    for (var i = 1; i < usersData.length; i++) {
      if (usersData[i][0].toString() === username && usersData[i][1].toString() === passkey) {
        return true;
      }
    }
    return false;
  }

  // Handle frontend login verification
  if (params.action === "verifyAdmin") {
    var isValid = isUserValid(params.user, params.passkey);
    return createJsonResponse({ success: isValid });
  }

  // Handle pessimistic lock actions
  if (params.action === "checkLock") {
    var res = checkLockStatus(params.lockId);
    return createJsonResponse(res);
  }
  if (params.action === "acquireLock") {
    var res = acquireLock(params.lockId, params.username);
    return createJsonResponse(res);
  }
  if (params.action === "releaseLock") {
    var res = releaseLock(params.lockId, params.username);
    return createJsonResponse(res);
  }
  if (params.action === "updateLockHeartbeat") {
    var res = updateLockHeartbeat(params.lockId, params.username);
    return createJsonResponse(res);
  }

  // For all other master write actions (like bulkAdd or updateSong), require valid credentials dynamically
  if (params.action === "bulkAdd" || params.action === "updateSong") {
    if (!isUserValid(params.user, params.secret)) {
      return createJsonResponse({status: "error", message: "Unauthorized"});
    }
  }

  // ----------------------------------------------------
  // ACTION: ADD NEW SONG
  // ----------------------------------------------------
  if (params.action === "bulkAdd") {
    var songSheet = ss.getSheetByName("Songs");
    var existingSongs = songSheet.getDataRange().getDisplayValues();
    
    // Check for duplicate: Title (col 2), Artist (col 3), Version (col 5)
    for (var i = 1; i < existingSongs.length; i++) {
      var matchTitle = existingSongs[i][1].toString().toLowerCase() === params.song.title.toString().toLowerCase();
      var matchArtist = existingSongs[i][2].toString().toLowerCase() === params.song.artist.toString().toLowerCase();
      var matchVersion = existingSongs[i][4].toString().toLowerCase() === params.song.version.toString().toLowerCase();
      
      if (matchTitle && matchArtist && matchVersion) {
        return createJsonResponse({status: "error", message: "This version of the song already exists."});
      }
    }
    
    // Ensure "SongLinesJSON" column exists in headers, if not add it
    var headers = songSheet.getRange(1, 1, 1, songSheet.getLastColumn()).getValues()[0];
    var colIdx = headers.indexOf("SongLinesJSON");
    if (colIdx === -1) {
      colIdx = headers.length;
      songSheet.getRange(1, colIdx + 1).setValue("SongLinesJSON");
    }
    
    var songId = new Date().getTime().toString();
    
    // Build row array matching headers length
    var newRow = [songId, params.song.title, params.song.artist, params.song.key, params.song.version];
    while (newRow.length < colIdx) {
      newRow.push("");
    }
    newRow[colIdx] = JSON.stringify(params.lines);
    songSheet.appendRow(newRow);
    
    // Update versions automatically
    updateSyncVersion(ss, "Songs");
    updateSyncVersion(ss, "SongLines");
    
    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: UPDATE EXISTING SONG
  // ----------------------------------------------------
  if (params.action === "updateSong") {
    var songIdStr = params.song.id.toString();
    
    // Safety Net: Read-Before-Write check right before final save to Sheet
    var lockId = "song_" + songIdStr;
    var lockCheck = checkLockStatus(lockId);
    if (lockCheck.isLocked && lockCheck.lockedBy !== params.user) {
      return createJsonResponse({status: "error", message: "This song is locked for editing by " + lockCheck.lockedBy});
    }
    
    var songSheet = ss.getSheetByName("Songs");
    var existingSongs = songSheet.getDataRange().getDisplayValues();
    var songRowToUpdate = -1;
    
    for (var i = 1; i < existingSongs.length; i++) {
      if (existingSongs[i][0].toString() === songIdStr) {
        songRowToUpdate = i + 1; 
        break;
      }
    }
    
    if (songRowToUpdate !== -1) {
      // Ensure "SongLinesJSON" column exists in headers, if not add it
      var headers = songSheet.getRange(1, 1, 1, songSheet.getLastColumn()).getValues()[0];
      var colIdx = headers.indexOf("SongLinesJSON");
      if (colIdx === -1) {
        colIdx = headers.length;
        songSheet.getRange(1, colIdx + 1).setValue("SongLinesJSON");
        headers = songSheet.getRange(1, 1, 1, songSheet.getLastColumn()).getValues()[0];
      }
      
      // Update Title, Artist, Key, Version
      songSheet.getRange(songRowToUpdate, 2).setValue(params.song.title);
      songSheet.getRange(songRowToUpdate, 3).setValue(params.song.artist);
      songSheet.getRange(songRowToUpdate, 4).setValue(params.song.key);
      songSheet.getRange(songRowToUpdate, 5).setValue(params.song.version);
      
      // Set the packed lines cell
      songSheet.getRange(songRowToUpdate, colIdx + 1).setValue(JSON.stringify(params.lines));
    } else {
      return createJsonResponse({status: "error", message: "Song not found for updating."});
    }

    // Delete the legacy lines from SongLines tab if they exist (to save cells!)
    var lineSheet = ss.getSheetByName("SongLines");
    if (lineSheet) {
      var existingLines = lineSheet.getDataRange().getDisplayValues();
      for (var j = existingLines.length - 1; j >= 1; j--) {
        if (existingLines[j][0].toString() === songIdStr) {
          lineSheet.deleteRow(j + 1); 
        }
      }
    }
    
    // Update versions automatically
    updateSyncVersion(ss, "Songs");
    updateSyncVersion(ss, "SongLines");

    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: SAVE SHARED ROADMAP ARRANGEMENT (Consolidated to Setlists Sheet to save cells)
  // ----------------------------------------------------
  if (params.action === "saveArrangement") {
    var setlistSheet = ss.getSheetByName("Setlists");
    if (!setlistSheet) {
      setlistSheet = ss.insertSheet("Setlists");
      setlistSheet.appendRow(["Set", "Songs & Arrangements"]);
    }
    var data = setlistSheet.getDataRange().getDisplayValues();
    var songIdStr = params.songId.toString();
    var presetName = params.name.toString();
    var roadmapJson = JSON.stringify(params.roadmap);
    var compoundKey = "ARR_" + songIdStr + "_" + presetName;
    
    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === compoundKey) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow !== -1) {
      setlistSheet.getRange(foundRow, 2).setValue(roadmapJson);
    } else {
      setlistSheet.appendRow([compoundKey, roadmapJson]);
    }

    // Update versions automatically for both so caches invalidate correctly
    updateSyncVersion(ss, "Arrangements");
    updateSyncVersion(ss, "Setlists");
    
    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: DELETE SHARED ROADMAP ARRANGEMENT (Consolidated to Setlists Sheet to save cells)
  // ----------------------------------------------------
  if (params.action === "deleteArrangement") {
    var setlistSheet = ss.getSheetByName("Setlists");
    if (!setlistSheet) return createJsonResponse({status: "success"}); // Fail gracefully
    var data = setlistSheet.getDataRange().getDisplayValues();
    var songIdStr = params.songId.toString();
    var presetName = params.name.toString();
    var compoundKey = "ARR_" + songIdStr + "_" + presetName;
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString() === compoundKey) {
        setlistSheet.deleteRow(i + 1);
      }
    }
    
    // Update versions automatically for both so caches invalidate correctly
    updateSyncVersion(ss, "Arrangements");
    updateSyncVersion(ss, "Setlists");

    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: SAVE SHARED SETLIST
  // ----------------------------------------------------
  if (params.action === "saveSetlist") {
    var setlistSheet = ss.getSheetByName("Setlists");
    if (!setlistSheet) {
      setlistSheet = ss.insertSheet("Setlists");
      setlistSheet.appendRow(["Set", "Songs & Arrangements"]);
    }
    var data = setlistSheet.getDataRange().getDisplayValues();
    var setName = params.name.toString();
    var songsAndArrangements = JSON.stringify(params.roadmap);
    
    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === setName) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow !== -1) {
      setlistSheet.getRange(foundRow, 2).setValue(songsAndArrangements);
    } else {
      setlistSheet.appendRow([setName, songsAndArrangements]);
    }

    // Update versions automatically
    updateSyncVersion(ss, "Setlists");
    
    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: DELETE SHARED SETLIST
  // ----------------------------------------------------
  if (params.action === "deleteSetlist") {
    var setlistSheet = ss.getSheetByName("Setlists");
    if (!setlistSheet) return createJsonResponse({status: "error", message: "No setlists sheet found"});
    var data = setlistSheet.getDataRange().getDisplayValues();
    var setName = params.name.toString();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString() === setName) {
        setlistSheet.deleteRow(i + 1);
      }
    }
    
    // Update versions automatically
    updateSyncVersion(ss, "Setlists");

    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: SEND CAPACITY ALERT EMAIL
  // ----------------------------------------------------
  if (params.action === "sendAlertEmail") {
    var subject = params.subject || "Worship Chord Book: Database Capacity Alert";
    var body = params.body || "Storage warning threshold has been crossed.";
    var recipients = params.recipients;
    if (recipients) {
      try {
        MailApp.sendEmail(recipients, subject, body);
        return createJsonResponse({status: "success"});
      } catch (e) {
        return createJsonResponse({status: "error", message: e.toString()});
      }
    }
    return createJsonResponse({status: "error", message: "No recipients provided"});
  }
  
  return createJsonResponse({status: "error", message: "Unknown action"});
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------
// PESSIMISTIC LOCKING MECHANISM FOR HIGH-CONCURRENCY
// ----------------------------------------------------
function getLocksSheet(ss) {
  var sheet = ss.getSheetByName("Locks");
  if (!sheet) {
    sheet = ss.insertSheet("Locks");
    sheet.appendRow(["LockID", "LockedBy", "LastActive", "IsLocked"]);
  }
  return sheet;
}

function checkLockStatus(lockId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getLocksSheet(ss);
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === lockId) {
      var lockedBy = data[i][1];
      var lastActive = data[i][2];
      var isLocked = data[i][3] === "true" || data[i][3] === true || data[i][3] === "TRUE";
      
      // Auto-unlock if lock is older than 5 minutes of inactivity (300000 ms)
      var now = new Date().getTime();
      if (isLocked && lastActive && (now - Number(lastActive) > 300000)) {
        sheet.getRange(i + 1, 4).setValue("false");
        return { isLocked: false, lockedBy: "" };
      }
      
      return { isLocked: isLocked, lockedBy: lockedBy, lastActive: lastActive };
    }
  }
  return { isLocked: false, lockedBy: "" };
}

function acquireLock(lockId, username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getLocksSheet(ss);
  var data = sheet.getDataRange().getValues();
  var now = new Date().getTime().toString();
  
  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === lockId) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    var currentIsLocked = data[foundRow - 1][3] === "true" || data[foundRow - 1][3] === true || data[foundRow - 1][3] === "TRUE";
    var currentLockedBy = data[foundRow - 1][1];
    var currentLastActive = data[foundRow - 1][2];
    var currentTime = new Date().getTime();
    
    // Check if locked by someone else and still active
    if (currentIsLocked && currentLockedBy !== username && (currentTime - Number(currentLastActive) <= 300000)) {
      return { success: false, isLocked: true, lockedBy: currentLockedBy };
    }
    
    sheet.getRange(foundRow, 2).setValue(username);
    sheet.getRange(foundRow, 3).setValue(now);
    sheet.getRange(foundRow, 4).setValue("true");
  } else {
    sheet.appendRow([lockId, username, now, "true"]);
  }
  
  return { success: true, isLocked: true, lockedBy: username };
}

function releaseLock(lockId, username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getLocksSheet(ss);
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === lockId) {
      var currentLockedBy = data[i][1];
      if (currentLockedBy === username || username === "Admin" || username === "admin") {
        sheet.getRange(i + 1, 4).setValue("false");
        return { success: true };
      }
      return { success: false, message: "Locked by another user" };
    }
  }
  return { success: true };
}

function updateLockHeartbeat(lockId, username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getLocksSheet(ss);
  var data = sheet.getDataRange().getValues();
  var now = new Date().getTime().toString();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === lockId) {
      var currentIsLocked = data[i][3] === "true" || data[i][3] === true || data[i][3] === "TRUE";
      var currentLockedBy = data[i][1];
      
      if (currentIsLocked && currentLockedBy !== username) {
        return { success: false, lockedBy: currentLockedBy };
      }
      
      sheet.getRange(i + 1, 2).setValue(username);
      sheet.getRange(i + 1, 3).setValue(now);
      sheet.getRange(i + 1, 4).setValue("true");
      return { success: true };
    }
  }
  
  return acquireLock(lockId, username);
}
`;
