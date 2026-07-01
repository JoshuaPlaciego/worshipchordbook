/**
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
    var sheet = ss.getSheetByName(tabName);
    
    // Auto-create Arrangements sheet if it doesn't exist yet
    if (!sheet && tabName === "Arrangements") {
      sheet = ss.insertSheet("Arrangements");
      sheet.appendRow(["SongID", "PresetName", "RoadmapJSON"]);
    }
    
    // Auto-create Setlists sheet if it doesn't exist yet
    if (!sheet && tabName === "Setlists") {
      sheet = ss.insertSheet("Setlists");
      sheet.appendRow(["Set", "Songs & Arrangements"]);
    }
    
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
    
    var songId = new Date().getTime().toString();
    songSheet.appendRow([songId, params.song.title, params.song.artist, params.song.key, params.song.version]);
    
    var lineSheet = ss.getSheetByName("SongLines");
    params.lines.forEach(function(l) {
      lineSheet.appendRow([songId, l.section, l.order, l.chords, l.lyrics]);
    });

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
      songSheet.getRange(songRowToUpdate, 2, 1, 4).setValues([[
        params.song.title, 
        params.song.artist, 
        params.song.key, 
        params.song.version
      ]]);
    } else {
      return createJsonResponse({status: "error", message: "Song not found for updating."});
    }

    var lineSheet = ss.getSheetByName("SongLines");
    var existingLines = lineSheet.getDataRange().getDisplayValues();
    
    for (var j = existingLines.length - 1; j >= 1; j--) {
      if (existingLines[j][0].toString() === songIdStr) {
        lineSheet.deleteRow(j + 1); 
      }
    }
    
    params.lines.forEach(function(l) {
      lineSheet.appendRow([songIdStr, l.section, l.order, l.chords, l.lyrics]);
    });
    
    // Update versions automatically
    updateSyncVersion(ss, "Songs");
    updateSyncVersion(ss, "SongLines");

    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: SAVE SHARED ROADMAP ARRANGEMENT
  // ----------------------------------------------------
  if (params.action === "saveArrangement") {
    var arrSheet = ss.getSheetByName("Arrangements");
    if (!arrSheet) {
      arrSheet = ss.insertSheet("Arrangements");
      arrSheet.appendRow(["SongID", "PresetName", "RoadmapJSON"]);
    }
    var data = arrSheet.getDataRange().getDisplayValues();
    var songIdStr = params.songId.toString();
    var presetName = params.name.toString();
    var roadmapJson = JSON.stringify(params.roadmap);
    
    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === songIdStr && data[i][1].toString() === presetName) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow !== -1) {
      arrSheet.getRange(foundRow, 3).setValue(roadmapJson);
    } else {
      arrSheet.appendRow([songIdStr, presetName, roadmapJson]);
    }

    // Update versions automatically
    updateSyncVersion(ss, "Arrangements");
    
    return createJsonResponse({status: "success"});
  }

  // ----------------------------------------------------
  // ACTION: DELETE SHARED ROADMAP ARRANGEMENT
  // ----------------------------------------------------
  if (params.action === "deleteArrangement") {
    var arrSheet = ss.getSheetByName("Arrangements");
    if (!arrSheet) return createJsonResponse({status: "error", message: "No arrangements sheet found"});
    var data = arrSheet.getDataRange().getDisplayValues();
    var songIdStr = params.songId.toString();
    var presetName = params.name.toString();
    
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString() === songIdStr && data[i][1].toString() === presetName) {
        arrSheet.deleteRow(i + 1);
      }
    }
    
    // Update versions automatically
    updateSyncVersion(ss, "Arrangements");

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
  
  return createJsonResponse({status: "error", message: "Unknown action"});
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
