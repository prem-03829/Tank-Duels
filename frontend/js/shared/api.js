/* =========================
   SERVER API / SESSION CLIENT
   Single authenticated entry point for the Tank Duels Flask backend.

   Guest Mode must NEVER use this module. Guest authentication and gameplay
   remain 100% local (localStorage only) — this file is ONLY loaded by the
   authenticated pages (login, signup, dashboard) and must never be included
   on pages where guests log in through the existing localStorage flow.

   The Flask API runs at http://127.0.0.1:5000 (see backend/main.py). Override
   the base URL for a deployed environment without touching this file by
   setting tankDuelApiBaseUrl first.
========================= */

var TD = TD || {};

/* =========================
   CONFIG
========================= */

var TD_API_BASE_URL_DEFAULT = "http://127.0.0.1:5000";

function TD_apiBaseUrl() {
  var override = null;
  try {
    override = localStorage.getItem("tankDuelApiBaseUrl");
  } catch (e) { /* ignored — use default */ }
  return (override && override.trim()) || TD_API_BASE_URL_DEFAULT;
}

/* =========================
   SESSION STORAGE
========================= */

function TD_saveSession(session) {
  if (!session || typeof session !== "object") return;
  try {
    if (session.access_token) {
      localStorage.setItem("tankDuelAccessToken", session.access_token);
    }
    if (session.refresh_token) {
      localStorage.setItem("tankDuelRefreshToken", session.refresh_token);
    }
  } catch (e) { /* storage unavailable — session lost on reload */ }
}

function TD_getAccessToken() {
  try {
    return localStorage.getItem("tankDuelAccessToken") || null;
  } catch (e) { return null; }
}

function TD_clearSession() {
  try {
    localStorage.removeItem("tankDuelAccessToken");
    localStorage.removeItem("tankDuelRefreshToken");
  } catch (e) { /* ignored */ }
}

function TD_isAuthenticated() {
  return !!TD_getAccessToken();
}

/* =========================
   FETCH WRAPPER
========================= */

function TD_apiRequest(method, path, body, authenticated, keepalive) {
  var headers = { "Content-Type": "application/json" };

  if (authenticated) {
    var token = TD_getAccessToken();
    if (!token) {
      return Promise.reject({ status: 401, error: "no session token" });
    }
    headers["Authorization"] = "Bearer " + token;
  }

  return fetch(TD_apiBaseUrl() + path, {
    method: method,
    keepalive: !!keepalive,
    headers: headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
    .then(async function (response) {
      var payload = null;
      try {
        payload = await response.json();
      } catch (e) { payload = null; }

      if (!response.ok) {
        var error = payload && payload.error ? payload.error : "Request failed";
        throw { status: response.status, error: error };
      }
      return payload;
    });
}

/* =========================
   AUTH ACTIONS
========================= */

var TD = TD || {};

TD.login = function (email, password) {
  return TD_apiRequest("POST", "/api/auth/login", { email: email, password: password }, false);
};

TD.signup = function (username, email, password) {
  return TD_apiRequest("POST", "/api/auth/signup", { username: username, email: email, password: password }, false);
};

TD.me = function () {
  return TD_apiRequest("GET", "/api/auth/me", undefined, true);
};

/* =========================
   PLAYER PROFILE
   GET /api/player/me → {"player": {player_id, username, created_at, updated_at}}
   GET /api/player/stats → {"statistics": {player_id, battles_played,
   battles_won, battles_lost, total_damage, updated_at}}
========================= */

TD.profile = function () {
  return TD_apiRequest("GET", "/api/player/me", undefined, true);
};

TD.stats = function () {
  return TD_apiRequest("GET", "/api/player/stats", undefined, true);
};

/* =========================
   LOCAL BATTLE HISTORY (SAME DEVICE)
   Authenticated same-device matches are persisted to and loaded from the
   Flask backend (public.local_battle). These are history records only — they
   never touch player_statistics. Guest Mode must NEVER call either function;
   guests keep the existing localStorage path in shared/history.js.
========================= */

/* Persist one completed same-device match. `keepalive` lets the request
   finish even though the game engine navigates to the results page right after
   the match ends. player_id is never part of the payload — the backend derives
   it from the JWT. */
TD.saveLocalBattle = function (data) {
  return TD_apiRequest("POST", "/api/local-battles", data, true, true);
};

/* Fetch the authenticated player's same-device match history, newest first. */
TD.getLocalBattles = function () {
  return TD_apiRequest("GET", "/api/local-battles", undefined, true);
};

/* =========================
   ONLINE BATTLES (1v1 MULTIPLAYER)
   Create / join the authenticated player's online battles and poll a waiting
   battle until an opponent joins (GET when status flips to IN_PROGRESS).
   These endpoints require the JWT; Guest Mode must NEVER call them.
   game_mode, battle_code and every control field are derived server-side.
   The create response is a WAITING battle carrying the join code; the join
   response is the IN_PROGRESS battle whose battle_state is authoritative.
   GET /api/battles/<id> refreshes a waiting battle.
   Errors are normalized to { status, error } by TD_apiRequest and only ever
   contain backend-provided, already user-facing strings.
========================= */

TD.createBattle = function (data) {
  return TD_apiRequest("POST", "/api/battles", data, true);
};

TD.joinBattle = function (battleCode) {
  return TD_apiRequest(
    "POST",
    "/api/battles/join",
    { battle_code: battleCode },
    true
  );
};

TD.getBattle = function (battleId) {
  return TD_apiRequest(
    "GET",
    "/api/battles/" + encodeURIComponent(battleId),
    undefined,
    true
  );
};

/* Register the authenticated player's shot on the authoritative server battle.
   The server validates the caller is a participant AND it is their turn, then
   stores the pending_fire. angle/power are normalized server-side. */
TD.fireBattleAction = function (battleId, angle, power) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/actions/fire",
    { angle: angle, power: power },
    true
  );
};

/* Ask the server to resolve the currently pending shot (empty body). Returns
   the updated authoritative battle_state plus the shot outcome. */
TD.resolveBattleAction = function (battleId) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/actions/fire/resolve",
    {},
    true
  );
};

/* Confirm whether it is currently the authenticated caller's turn. */
TD.checkBattleTurn = function (battleId) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/turn/check",
    undefined,
    true
  );
};

TD.logout = function () {
  var token = TD_getAccessToken();
  var request = TD_apiRequest ? TD_apiRequest("POST", "/api/auth/logout", undefined, true) : Promise.resolve();
  return request
    .catch(function (e) { /* ignore — local clear below is what matters */ })
    .then(function () {
      TD_clearSession();
      return true;
    });
};
