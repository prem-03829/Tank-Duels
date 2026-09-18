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

var TD_API_BASE_URL_LOCAL = "http://127.0.0.1:5000";
var TD_API_BASE_URL_PRODUCTION = "https://tank-duels.onrender.com";

function TD_apiBaseUrl() {
  var override = null;

  try {
    override = localStorage.getItem("tankDuelApiBaseUrl");
  } catch (e) {
    /* ignored */
  }

  if (override && override.trim()) {
    return override.trim();
  }

  var hostname = window.location.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return TD_API_BASE_URL_LOCAL;
  }

  return TD_API_BASE_URL_PRODUCTION;
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
  } catch (e) {
    /* storage unavailable — session lost on reload */
  }
}

function TD_getAccessToken() {
  try {
    return localStorage.getItem("tankDuelAccessToken") || null;
  } catch (e) {
    return null;
  }
}

function TD_clearSession() {
  try {
    localStorage.removeItem("tankDuelAccessToken");
    localStorage.removeItem("tankDuelRefreshToken");
  } catch (e) {
    /* ignored */
  }
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
    var token = typeof authenticated === "string" ? authenticated : TD_getAccessToken();
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
  }).then(async function (response) {
    var payload = null;
    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

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
  return TD_apiRequest(
    "POST",
    "/api/auth/login",
    { email: email, password: password },
    false,
  );
};

TD.signup = function (username, email, password) {
  return TD_apiRequest(
    "POST",
    "/api/auth/signup",
    { username: username, email: email, password: password },
    false,
  );
};

TD.forgotPassword = function (email, redirectTo) {
  var body = { email: email };
  if (redirectTo) {
    body.redirect_to = redirectTo;
  }
  return TD_apiRequest("POST", "/api/auth/forgot-password", body, false);
};

TD.resetPassword = function (password, recoveryToken) {
  return TD_apiRequest(
    "POST",
    "/api/auth/reset-password",
    { password: password },
    recoveryToken || true
  );
};

TD.me = function () {
  return TD_apiRequest("GET", "/api/auth/me", undefined, true);
};

var _supabaseInstance = null;

TD.getSupabaseClient = function () {
  if (_supabaseInstance) {
    return Promise.resolve(_supabaseInstance);
  }
  return TD_apiRequest("GET", "/api/auth/config", undefined, false).then(function (cfg) {
    if (cfg && cfg.supabase_url) {
      try { localStorage.setItem("tankDuelSupabaseUrl", cfg.supabase_url); } catch (e) {}
    }
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase JS SDK not loaded");
    }
    _supabaseInstance = window.supabase.createClient(cfg.supabase_url, cfg.supabase_key);
    return _supabaseInstance;
  });
};

/* =========================
   PLAYER PROFILE
   GET /api/player/me → {"player": {player_id, username, created_at, updated_at}}
   POST /api/player/me → create first-time player profile
   GET /api/player/stats → {"statistics": {player_id, battles_played,
   battles_won, battles_lost, total_damage, updated_at}}
========================= */

TD.profile = function () {
  return TD_apiRequest("GET", "/api/player/me", undefined, true);
};

TD.createProfile = function (username) {
  return TD_apiRequest("POST", "/api/player/me", { username: username }, true);
};

TD.updateProfile = function (data) {
  return TD_apiRequest("PATCH", "/api/player/me", data, true);
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
    true,
  );
};

TD.getBattle = function (battleId) {
  return TD_apiRequest(
    "GET",
    "/api/battles/" + encodeURIComponent(battleId),
    undefined,
    true,
  );
};

/* List the authenticated player's ONLINE battles, newest first (battle_id
   participants only — RLS ensures the caller never sees other players'
   battles). Optional status filter, e.g. TD.getBattles("COMPLETED") for
   online match history. */
TD.getBattles = function (status) {
  var url = "/api/battles";
  if (status) {
    url += "?status=" + encodeURIComponent(status);
  }
  return TD_apiRequest("GET", url, undefined, true);
};

/* Register the authenticated player's shot on the authoritative server battle.
   The server validates the caller is a participant AND it is their turn, then
   stores the pending_fire. angle/power are normalized server-side. */
TD.fireBattleAction = function (battleId, angle, power) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/actions/fire",
    { angle: angle, power: power },
    true,
  );
};

/* Ask the server to resolve the currently pending shot (empty body). Returns
   the updated authoritative battle_state plus the shot outcome. */
TD.resolveBattleAction = function (battleId) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/actions/fire/resolve",
    {},
    true,
  );
};

/* Confirm whether it is currently the authenticated caller's turn. */
TD.checkBattleTurn = function (battleId) {
  return TD_apiRequest(
    "POST",
    "/api/battles/" + encodeURIComponent(battleId) + "/turn/check",
    undefined,
    true,
  );
};

TD.logout = function () {
  var token = TD_getAccessToken();
  var request = TD_apiRequest
    ? TD_apiRequest("POST", "/api/auth/logout", undefined, true)
    : Promise.resolve();
  return request
    .catch(function (e) {
      /* ignore — local clear below is what matters */
    })
    .then(function () {
      TD_clearSession();
      return true;
    });
};

/* Reconstruct a complete authoritative activeMatch object for the GameEngine
   from a server battle snapshot and optional user profile / myUserId. */
TD.buildOnlineActiveMatch = function (battle, profile, myUserId) {
  var myId =
    myUserId ||
    (profile && profile.player ? String(profile.player.player_id) : "");
  var state = (battle && battle.battle_state) || {};
  var setup = state.setup || {};
  var players = setup.players || {};
  var scores = setup.scores || {};

  var p1Id = String(battle.player1_id || "");
  var p2Id = String(battle.player2_id || "");
  var meIsP1 = !!myId && myId === p1Id;
  var meIsP2 = !!myId && myId === p2Id;
  var localSlot = meIsP1 ? 0 : meIsP2 ? 1 : -1;

  var p1Pos = players[p1Id] || {};
  var p2Pos = players[p2Id] || {};

  var p1Name = battle.player1_name || "PLAYER";
  var p2Name = battle.player2_name || "OPPONENT";

  var P1_COLOR = "orange";
  var P2_COLOR = "blue";

  var p1x = typeof p1Pos.x === "number" ? p1Pos.x : 40;
  var p2x = typeof p2Pos.x === "number" ? p2Pos.x : 600;

  var currentTurn = 0;
  if (String(battle.current_turn || "") === p2Id) currentTurn = 1;

  var heights =
    setup.terrain && Array.isArray(setup.terrain.heights)
      ? setup.terrain.heights.slice()
      : [];

  var maxHealth =
    typeof TD !== "undefined" && TD.MAX_HEALTH ? TD.MAX_HEALTH : 100;
  var p1Health = typeof p1Pos.health === "number" ? p1Pos.health : maxHealth;
  var p2Health = typeof p2Pos.health === "number" ? p2Pos.health : maxHealth;

  return {
    version: 1,
    active: true,
    status: "active",
    online: true,
    map: setup.map || "dustlands",
    seed: typeof setup.seed === "number" ? setup.seed : 0,
    terrain: heights,
    stars: [],
    clouds: [],
    bgMountains: [],
    bgHills: [],
    decorations: [],
    details: [],
    round: setup.round || 1,
    maxRounds: setup.max_rounds || 1,
    currentTurn: currentTurn,
    scores: [
      typeof scores[p1Id] === "number" ? scores[p1Id] : 0,
      typeof scores[p2Id] === "number" ? scores[p2Id] : 0,
    ],
    wind: typeof setup.wind === "number" ? setup.wind : 0,
    trajectoryTrail: setup.trajectory !== false,
    battle: {
      battle_id: battle.battle_id || "",
      my_user_id: myId,
      player1_id: p1Id,
      player2_id: p2Id,
      localServerSlot: localSlot,
    },
    state: "aiming",
    players: {
      player1: {
        name: p1Name,
        color: P1_COLOR,
        x: p1x,
        y: typeof p1Pos.y === "number" ? p1Pos.y : 0,
        health: p1Health,
        angle: p1x < p2x ? 0 : 180,
        power: 50,
      },
      player2: {
        name: p2Name,
        color: P2_COLOR,
        x: p2x,
        y: typeof p2Pos.y === "number" ? p2Pos.y : 0,
        health: p2Health,
        angle: p2x < p1x ? 0 : 180,
        power: 50,
      },
    },
  };
};
