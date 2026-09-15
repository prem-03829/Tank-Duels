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

function TD_apiRequest(method, path, body, authenticated) {
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

TD.logout = function () {
  var token = TD_getAccessToken();
  var request = PD_apiRequest ? TD_apiRequest("POST", "/api/auth/logout", undefined, true) : Promise.resolve();
  return request
    .catch(function (e) { /* ignore — local clear below is what matters */ })
    .then(function () {
      TD_clearSession();
      return true;
    });
};
