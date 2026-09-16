/* =========================
   CENTRALIZED MATCH HISTORY
   Single store for completed Tank Duel matches.

   Every page reads completed matches through TD.getMatchHistory(). Completed
   local 1v1 matches are recorded exactly once via TD.addLocalMatchToHistory()
   from the game-completion flow (engine._saveAndNavigate), which only runs
   when a match actually ends.

   Active matches (tankDuelActiveMatch) are never written here — only finished
   matches belong in History.

   Records are mode-aware:
     mode: "local"   -> current 1v1 — SAME DEVICE matches
     mode: "online"  -> completed ONLINE multiplayer matches (backend
                        public.battle, loaded via TD.loadOnlineMatchHistory).
   The record shape is forward-compatible: future online entries can carry
   additional fields (matchId, opponent, onlinePlayerId) without breaking
   existing local entries or requiring consumers to change.
========================= */

var TD = TD || {};

TD.HISTORY_STORAGE_KEY = 'tankDuelMatchHistory';

/* Read all completed matches, newest first. The stored list is written with
   newest entries first; sorting guards against any reordering over time. */
TD.getMatchHistory = function () {
  var list = [];
  try {
    var raw = localStorage.getItem(TD.HISTORY_STORAGE_KEY);
    if (raw) list = JSON.parse(raw) || [];
  } catch (e) { /* corrupted/blocked storage — empty list */ }

  if (!Array.isArray(list)) list = [];

  list.sort(function (a, b) {
    return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
  });

  return list;
};

/* Persist a completed match record. A stable id plus id-based dedupe ensure a
   match processed more than once never appears twice in History. */
TD.addMatchToHistory = function (record) {
  if (!record || typeof record !== 'object' || !record.id) return;

  var list = [];
  try {
    var raw = localStorage.getItem(TD.HISTORY_STORAGE_KEY);
    if (raw) list = JSON.parse(raw) || [];
  } catch (e) { /* start fresh */ }

  if (!Array.isArray(list)) list = [];

  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === record.id) return; // already recorded
  }

  list.unshift(record);

  try {
    localStorage.setItem(TD.HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (e) { /* storage full/blocked — ignore */ }
};

/* Resolve the readable map name from a stored map key. */
TD.getHistoryMapName = function (mapKey) {
  if (mapKey && TD.MAP_DISPLAY_NAMES && TD.MAP_DISPLAY_NAMES[mapKey]) {
    return TD.MAP_DISPLAY_NAMES[mapKey];
  }
  if (mapKey === 'random') return 'Random';
  return mapKey || 'Dustlands';
};

/* Display label for a match mode value. */
TD.getHistoryModeLabel = function (mode) {
  if (mode === 'online') return 'ONLINE';
  return '1v1 • SAME DEVICE';
};

/* Canonical filter category for a record's mode. Record values are kept as-is
   ("local" for the same-device store) — the pills filter on this normalized
   category so existing records are never renamed. */
TD.getHistoryCategory = function (mode) {
  if (mode === 'online') return 'online';
  return 'same_device';
};

/* Build and store a completed local (1v1 — SAME DEVICE) match record from the
   engine's end-of-match data. Winner/loser are derived from the round scores;
   a tie resolves to Player 1, matching the existing results behavior. */
TD.addLocalMatchToHistory = function (data) {
  if (!data || typeof data !== 'object') return;

  var p1Score = Number(data.playerOneScore) || 0;
  var p2Score = Number(data.playerTwoScore) || 0;

  var p1Name = data.playerOne || 'PLAYER';
  var p2Name = data.playerTwo || 'OPPONENT';
  var p1Wins = p1Score >= p2Score;

  var record = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    mode: 'local',
    winner: p1Wins ? p1Name : p2Name,
    loser: p1Wins ? p2Name : p1Name,
    playerOne: p1Name,
    playerTwo: p2Name,
    playerOneScore: p1Score,
    playerTwoScore: p2Score,
    playerOneColor: data.playerOneColor || '#e07030',
    playerTwoColor: data.playerTwoColor || '#4090b0',
    map: TD.getHistoryMapName(data.mapKey),
    mapKey: data.mapKey || '',
    rounds: Number(data.rounds) || 1,
    completedAt: data.completedAt || new Date().toISOString()
  };

  TD.addMatchToHistory(record);
};

/* =========================
   AUTHENTICATED HISTORY SOURCE
   History is source-agnostic: guests read the existing localStorage file;
   authenticated players read their backend history. Two sources are merged:
     public.local_battle  -> mode "local"  (1v1 — SAME DEVICE)
     public.battle        -> mode "online" (completed ONLINE multiplayer)
   Returns a Promise resolving to display records, newest first. Guests never
   reach the backend — the branch below short-circuits to localStorage.
   A failure in either source degrades to that source's empty list so a
   backend hiccup never blanks a working source.
======================== */

TD.loadMatchHistory = function () {
  var isAuthed = typeof TD_isAuthenticated === "function" && TD_isAuthenticated();

  if (!isAuthed) {
    return Promise.resolve(TD.getMatchHistory());
  }

  var localPromise;
  if (typeof TD.getLocalBattles === "function") {
    localPromise = TD.getLocalBattles().catch(function () {
      return { local_battles: [] };
    });
  } else {
    localPromise = Promise.resolve({ local_battles: [] });
  }

  var onlinePromise = TD.loadOnlineMatchHistory().catch(function () {
    return [];
  });

  return Promise.all([localPromise, onlinePromise]).then(function (results) {
    var records = [];
    var rows = (results[0] && results[0].local_battles) || [];
    for (var i = 0; i < rows.length; i++) {
      records.push(TD.mapLocalBattleRecord(rows[i]));
    }
    var online = results[1] || [];
    for (var j = 0; j < online.length; j++) {
      records.push(online[j]);
    }
    records.sort(function (a, b) {
      return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
    });
    return records;
  });
};

/* Fetch the authenticated player's completed ONLINE battles and convert them
   to history records. The caller's own player_id/username come from their
   profile; the opponent appears as "OPPONENT" (the online flow never exposes
   the opponent's username). Degrades to [] when the endpoint is unavailable. */
TD.loadOnlineMatchHistory = function () {
  if (typeof TD.getBattles !== "function" || typeof TD.profile !== "function") {
    return Promise.resolve([]);
  }
  return TD.profile()
    .catch(function () {
      return { player: {} };
    })
    .then(function (payload) {
      var me = (payload && payload.player) || {};
      return TD.getBattles("COMPLETED").then(function (battlePayload) {
        var rows = (battlePayload && battlePayload.battles) || [];
        var records = [];
        for (var i = 0; i < rows.length; i++) {
          records.push(TD.mapBattleRecord(rows[i], me));
        }
        return records;
      });
    });
};

/* Convert one backend battle row (ONLINE, COMPLETED) into the shared history
   record shape. The caller's side is matched by player_id; the opponent is
   labeled "OPPONENT". Final scores come from battle_state.setup.scores; map
   and round count from battle_state.setup. */
TD.mapBattleRecord = function (row, me) {
  var setup = (row && row.battle_state && row.battle_state.setup) || {};
  var scores = setup.scores || {};
  var p1 = row && row.player1_id;
  var p2 = row && row.player2_id;
  var ownId = me && me.player_id;
  var myName = (me && me.username) || 'PLAYER';
  var p1Name = String(p1) === String(ownId) ? myName : 'OPPONENT';
  var p2Name = String(p2) === String(ownId) ? myName : 'OPPONENT';
  var s1 = Number(scores[p1]) || 0;
  var s2 = Number(scores[p2]) || 0;
  var winnerP1 = String(row && row.winner_player_id) === String(p1);

  return {
    id: 'online-' + (row && row.battle_id) || '',
    mode: 'online',
    winner: winnerP1 ? p1Name : p2Name,
    loser: winnerP1 ? p2Name : p1Name,
    playerOne: p1Name,
    playerTwo: p2Name,
    playerOneScore: s1,
    playerTwoScore: s2,
    playerOneColor: '#e07030',
    playerTwoColor: '#4090b0',
    map: TD.getHistoryMapName(setup.map),
    mapKey: setup.map || '',
    rounds: Number(setup.max_rounds) || 1,
    completedAt: (row && row.ended_at) || (row && row.started_at) || new Date().toISOString()
  };
};

/* Convert one backend local_battle row into the shared history record shape
   the history page already renders. Names, scores, and winner mirror the
   localStorage guest record so both sources display identically. */
TD.mapLocalBattleRecord = function (row) {
  var p1 = (row && row.player1_name) || 'PLAYER';
  var p2 = (row && row.player2_name) || 'OPPONENT';
  var p1Wins = !row || row.winner === 'PLAYER1';

  return {
    id: (row && row.local_battle_id) || '',
    mode: 'local',
    winner: p1Wins ? p1 : p2,
    loser: p1Wins ? p2 : p1,
    playerOne: p1,
    playerTwo: p2,
    playerOneScore: Number(row && row.player1_score) || 0,
    playerTwoScore: Number(row && row.player2_score) || 0,
    playerOneColor: '#e07030',
    playerTwoColor: '#4090b0',
    map: TD.getHistoryMapName(row && row.map),
    mapKey: (row && row.map) || '',
    rounds: Number(row && row.rounds) || 1,
    completedAt: (row && row.created_at) || new Date().toISOString()
  };
};