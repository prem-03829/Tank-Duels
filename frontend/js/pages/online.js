/* =========================
   ONLINE BATTLE (1v1 MULTIPLAYER)
   Create / join an online battle against another authenticated player and
   translate the authoritative backend battle_state into the same active-match
   state the game engine already understands (tankDuelActiveMatch).

   Guest Mode is not allowed here: this page authenticates with the backend
   JWT, so an unsigned visitor is redirected to the existing login flow and
   never touches any authenticated API endpoint.

   Flow:
     menu ──► create ──► create_battle → WAITING ──► poll (every 2s)
                                                        │
     menu ──► join ──► join_battle → IN_PROGRESS ──────┤
                                                        ▼
                                             enter game (game.html)

   The active match put into tankDuelActiveMatch always maps the LOCAL human
   to index 0 (player 1) regardless of which backend side they were assigned,
   so the engine's existing restore path works unchanged.
========================= */

(function () {
  'use strict';

  /* =========================
     CONSTANTS / STATE
  ========================== */

  var POLL_INTERVAL_MS = 2000;

  var ONLINE_KEY = 'tankDuelOnlineBattle';

  var el = {};
  var currentBattle = null;       // latest battle snapshot from the server
  var pollTimer = null;
  var pollInFlight = false;
  var profileCache = null;        // promise resolving to TD.profile() payload

  /* =========================
     HELPERS
  ========================== */

  function $(id) { return document.getElementById(id); }

  function unwrapBattle(json) {
    return json && typeof json.battle === 'object' ? json.battle : (json || null);
  }

  function isAuthenticatedUser() {
    return localStorage.getItem('tankDuelPlayerType') === 'user' &&
      typeof TD_isAuthenticated === 'function' &&
      TD_isAuthenticated();
  }

  function requireLogin() {
    window.location.href = './login.html';
  }

  function getCustomization() {
    var raw = localStorage.getItem('tankDuelGameCustomization');
    var cust = null;
    if (raw) {
      try { cust = JSON.parse(raw); } catch (e) { cust = null; }
    }
    if (!cust || typeof cust !== 'object') cust = {};
    return {
      playerOneColor: cust.playerOneColor || 'orange',
      playerTwoColor: cust.playerTwoColor || 'blue',
      trajectoryTrail: cust.trajectoryTrail !== false
    };
  }

  function getMyUserId(profile) {
    return profile && profile.player ? String(profile.player.player_id) : '';
  }

  function getMyName(profile) {
    if (profile && profile.player && profile.player.username) {
      return profile.player.username;
    }
    return localStorage.getItem('tankDuelPlayerName') || 'PLAYER';
  }

  function getProfile() {
    if (profileCache) return profileCache;
    profileCache = TD.profile().then(function (json) {
      return { player: json.player || {} };
    });
    profileCache.catch(function () {
      profileCache = null; // allow one retry later if a transient failure hit
    });
    return profileCache;
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong. Please try again.';
    if (err.status === 401) return 'Your session has expired. Please log in again.';
    if (typeof err.error === 'string' && err.error) return err.error;
    return 'Could not reach the server. Please try again.';
  }

  function handleAuthError(err) {
    if (err && err.status === 401) {
      if (typeof TD_clearSession === 'function') TD_clearSession();
      localStorage.removeItem('tankDuelPlayerType');
      requireLogin();
      return true;
    }
    return false;
  }

  function saveOnlineBattle(battle) {
    try {
      localStorage.setItem(ONLINE_KEY, JSON.stringify({
        version: 1,
        battle_id: battle.battle_id,
        battle_code: battle.battle_code,
        status: battle.status,
        created_at: battle.created_at || null
      }));
    } catch (e) { /* storage unavailable — polling still continues in memory */ }
  }

  function clearOnlineBattle() {
    try { localStorage.removeItem(ONLINE_KEY); } catch (e) { /* ignore */ }
  }

  /* =========================
     VIEW SWITCHING
  ========================== */

  function showView(name) {
    var views = document.querySelectorAll('.online-view');
    for (var i = 0; i < views.length; i++) {
      views[i].hidden = views[i].getAttribute('data-view') !== name;
    }
    hideError('create-error');
    hideError('join-error');
    hideError('waiting-error');
  }

  function showError(id, message) {
    var node = $(id);
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
  }

  function hideError(id) {
    var node = $(id);
    if (node) node.hidden = true;
  }

  /* =========================
     MAP / ROUND SELECTION
     (reuses the same controls & storage as the local battle setup flow)
  ========================== */

  var selectedMap = null;
  var selectedRounds = null;

  function readStoredSelection() {
    var m = localStorage.getItem('tankDuelSelectedMap');
    selectedMap = m || 'desert';
    var r = localStorage.getItem('tankDuelSelectedRounds');
    selectedRounds = r || '1';
  }

  function applySelection() {
    var mapButtons = $('online-map-options');
    var maps = mapButtons.querySelectorAll('.setup-option');
    for (var i = 0; i < maps.length; i++) {
      maps[i].classList.toggle('active', maps[i].getAttribute('data-map') === selectedMap);
    }
    var roundButtons = el.matchOptions.querySelectorAll('.match-option');
    for (var j = 0; j < roundButtons.length; j++) {
      roundButtons[j].classList.toggle('active', roundButtons[j].getAttribute('data-rounds') === selectedRounds);
    }
  }

  function wireSelection() {
    var mapOptions = $('online-map-options');
    if (!mapOptions) return;
    mapOptions.addEventListener('click', function (e) {
      var option = e.target.closest('.setup-option');
      if (!option) return;
      selectedMap = option.getAttribute('data-map');
      applySelection();
    });
    if (el.matchOptions) {
      el.matchOptions.addEventListener('click', function (e) {
        var option = e.target.closest('.match-option');
        if (!option) return;
        selectedRounds = option.getAttribute('data-rounds');
        applySelection();
      });
    }
  }

  function persistSelection() {
    try {
      localStorage.setItem('tankDuelSelectedMap', selectedMap);
      localStorage.setItem('tankDuelSelectedRounds', selectedRounds);
    } catch (e) { /* ignore */ }
  }

  /* The ONLINE backend must know the exact battlefield up front (it generates
     the authoritative terrain + seed). "Random" becomes a client-side random
     pick so both players share the same deterministic map. */
  function resolveOnlineMap() {
    if (!selectedMap || selectedMap === 'random') {
      var keys = (typeof TD !== 'undefined' && TD.MAP_KEYS) ? TD.MAP_KEYS : ['dustlands', 'valley', 'frostbite', 'ashhill', 'moonbase', 'canyon'];
      return keys[Math.floor(Math.random() * keys.length)];
    }
    return selectedMap;
  }

  /* =========================
     BATTLE → ACTIVE MATCH CONVERSION
     Authoritative (backend) shape:
       battle.player1_id / player2_id / current_turn
       battle.battle_state.setup.{map, seed, terrain.heights, wind, round,
                                    max_rounds, players.{uuid:{x,y,health}},
                                    scores.{uuid:0}}
     Engine shape (version 1):
       { version, map, seed, terrain[], bg*, round, maxRounds, currentTurn,
         scores[], wind, trajectoryTrail, state, players.player1/player2 }
     The local human is always mapped to engine player 1 (index 0).
  ========================== */

  function buildActiveMatch(battle, profile) {
    var myId = getMyUserId(profile);
    var state = battle.battle_state || {};
    var setup = state.setup || {};
    var players = setup.players || {};
    var scores = setup.scores || {};

    var p1Id = String(battle.player1_id || '');
    var p2Id = String(battle.player2_id || '');
    var meIsP1 = myId === p1Id;
    var meId = meIsP1 ? p1Id : p2Id;
    var oppId = meIsP1 ? p2Id : p1Id;

    var mePos = players[meId] || {};
    var oppPos = players[oppId] || {};

    var myName = getMyName(profile);
    var cust = getCustomization();
    var oppName = 'OPPONENT';

    var meX = typeof mePos.x === 'number' ? mePos.x : 40;
    var oppX = typeof oppPos.x === 'number' ? oppPos.x : 600;
    var currentTurn = 0;
    if (battle.current_turn === oppId) currentTurn = 1;
    else if (battle.current_turn && battle.current_turn !== meId) currentTurn = meIsP1 ? 0 : 1;

    var heights = (setup.terrain && Array.isArray(setup.terrain.heights))
      ? setup.terrain.heights.slice()
      : [];

    var maxHealth = (typeof TD !== 'undefined' && TD.MAX_HEALTH) ? TD.MAX_HEALTH : 100;
    return {
      version: 1,
      active: true,
      status: 'active',
      online: true,
      map: setup.map || 'dustlands',
      seed: typeof setup.seed === 'number' ? setup.seed : 0,
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
        typeof scores[meId] === 'number' ? scores[meId] : 0,
        typeof scores[oppId] === 'number' ? scores[oppId] : 0
      ],
      wind: typeof setup.wind === 'number' ? setup.wind : 0,
      trajectoryTrail: cust.trajectoryTrail,
      state: 'turn_start',
      players: {
        player1: {
          name: myName,
          color: cust.playerOneColor,
          x: meX,
          y: typeof mePos.y === 'number' ? mePos.y : 0,
          health: typeof mePos.health === 'number' ? mePos.health : maxHealth,
          angle: meX < oppX ? 0 : 180,
          power: 50
        },
        player2: {
          name: oppName,
          color: cust.playerTwoColor,
          x: oppX,
          y: typeof oppPos.y === 'number' ? oppPos.y : 0,
          health: typeof oppPos.health === 'number' ? oppPos.health : maxHealth,
          angle: oppX < meX ? 0 : 180,
          power: 50
        }
      }
    };
  }

  function enterBattle(battle) {
    stopPolling();
    getProfile().then(function (profile) {
      var activeMatch = buildActiveMatch(battle, profile);
      if (typeof TD_clearActiveMatch === 'function') TD_clearActiveMatch();
      try {
        localStorage.setItem('tankDuelActiveMatch', JSON.stringify(activeMatch));
      } catch (e) { }
      clearOnlineBattle();
      window.location.href = './game.html';
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      if (el.viewWaiting && !el.viewWaiting.hidden) {
        showError('waiting-error', friendlyError(err));
      } else {
        showError('join-error', friendlyError(err));
      }
    });
  }

  /* =========================
     WAITING-LOBBY POLLING
  ========================== */

  function startPolling(battle) {
    stopPolling();
    currentBattle = battle;
    saveOnlineBattle(battle);
    showView('waiting');
    if (el.waitingCode) el.waitingCode.textContent = battle.battle_code || '----';
    hideError('waiting-error');
    pollOnce();
    pollTimer = window.setInterval(pollOnce, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    currentBattle = null;
  }

  function pollOnce() {
    if (!currentBattle || pollInFlight) return;
    pollInFlight = true;

    TD.getBattle(currentBattle.battle_id).then(function (json) {
      pollInFlight = false;
      var battle = unwrapBattle(json);
      if (!battle) {
        stopPolling();
        showError('waiting-error', 'This battle is no longer available.');
        return;
      }
      currentBattle = battle;

      if (battle.status === 'IN_PROGRESS') {
        enterBattle(battle);
        return;
      }
      if (battle.status === 'WAITING') {
        saveOnlineBattle(battle);
        return;
      }
      stopPolling();
      showError('waiting-error', 'This battle can no longer be joined.');
    }).catch(function (err) {
      pollInFlight = false;
      if (handleAuthError(err)) return;
      stopPolling();
      showError('waiting-error', friendlyError(err));
    });
  }

  /* =========================
     CREATE BATTLE
  ========================== */

  function handleCreate() {
    var btn = el.createBtn;
    if (btn) btn.disabled = true;
    hideError('create-error');

    var payload = {
      game_mode: 'ONLINE',
      map: resolveOnlineMap(),
      rounds: parseInt(selectedRounds, 10) || 1
    };
    persistSelection();

    TD.createBattle(payload).then(function (json) {
      if (btn) btn.disabled = false;
      var battle = unwrapBattle(json);
      if (!battle || !battle.battle_id) {
        showError('create-error', 'The battle could not be created. Please try again.');
        return;
      }
      startPolling(battle);
    }).catch(function (err) {
      if (btn) btn.disabled = false;
      if (handleAuthError(err)) return;
      showError('create-error', friendlyError(err));
    });
  }

  /* =========================
     JOIN BATTLE
  ========================== */

  var CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

  function sanitizeCode(value) {
    var cleaned = String(value || '').replace(/[\s-]/g, '').toUpperCase();
    cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
    return cleaned;
  }

  function handleJoin() {
    var btn = el.joinBtn;
    var input = el.codeInput;
    var code = sanitizeCode(input ? input.value : '');
    hideError('join-error');
    if (!code) {
      showError('join-error', 'Enter the 4-character battle code.');
      if (input) input.focus();
      return;
    }
    if (code.length !== 4 || !CODE_RE.test(code)) {
      showError('join-error', 'Codes use letters A–H, J–N, P–Z and digits 2–9.');
      if (input) input.focus();
      return;
    }

    if (btn) btn.disabled = true;
    TD.joinBattle(code).then(function (json) {
      if (btn) btn.disabled = false;
      var battle = unwrapBattle(json);
      if (!battle || !battle.battle_id) {
        showError('join-error', 'Could not join this battle. Please try again.');
        return;
      }
      if (battle.status !== 'IN_PROGRESS') {
        showError('join-error', 'This battle is not ready yet. Please try again.');
        return;
      }
      saveOnlineBattle(battle);
      enterBattle(battle);
    }).catch(function (err) {
      if (btn) btn.disabled = false;
      if (handleAuthError(err)) return;
      showError('join-error', friendlyError(err));
    });
  }

  /* =========================
     INIT
  ========================== */

  function cacheElements() {
    el.createChoice = $('online-create-choice');
    el.joinChoice = $('online-join-choice');
    el.createBack = $('create-back');
    el.joinBack = $('join-back');
    el.createBtn = $('online-create-btn');
    el.joinBtn = $('online-join-btn');
    el.codeInput = $('online-code-input');
    el.matchOptions = $('online-match-options');
    el.viewWaiting = $('view-waiting');
    el.waitingCode = $('waiting-code');
    el.copyBtn = $('waiting-copy-btn');
    el.cancelBtn = $('waiting-cancel-btn');
  }

  function wireEvents() {
    if (el.createChoice) el.createChoice.addEventListener('click', function () { showView('create'); });
    if (el.joinChoice) el.joinChoice.addEventListener('click', function () { showView('join'); });
    if (el.createBack) el.createBack.addEventListener('click', function () { showView('menu'); });
    if (el.joinBack) el.joinBack.addEventListener('click', function () { showView('menu'); });
    if (el.createBtn) el.createBtn.addEventListener('click', handleCreate);
    if (el.joinBtn) el.joinBtn.addEventListener('click', handleJoin);
    if (el.copyBtn) {
      el.copyBtn.addEventListener('click', function () {
        var code = (currentBattle && currentBattle.battle_code) || (el.waitingCode ? el.waitingCode.textContent : '');
        if (!code) return;
        function done() {
          var original = el.copyBtn.textContent;
          el.copyBtn.textContent = 'Copied';
          window.setTimeout(function () { el.copyBtn.textContent = original; }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = code;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) { }
          document.body.removeChild(ta);
          done();
        }
      });
    }
    if (el.cancelBtn) {
      el.cancelBtn.addEventListener('click', function () {
        stopPolling();
        clearOnlineBattle();
        showView('menu');
      });
    }
    if (el.codeInput) {
      el.codeInput.addEventListener('input', function () {
        el.codeInput.value = sanitizeCode(el.codeInput.value);
      });
      el.codeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleJoin();
      });
    }
  }

  function resumeWaitingBattle() {
    var raw = null;
    try { raw = localStorage.getItem(ONLINE_KEY); } catch (e) { return; }
    if (!raw) return;
    var stored = null;
    try { stored = JSON.parse(raw); } catch (e) { return; }
    if (!stored || !stored.battle_id || stored.status !== 'WAITING') {
      clearOnlineBattle();
      return;
    }
    // Re-validate against the server before showing the waiting lobby.
    TD.getBattle(stored.battle_id).then(function (json) {
      var battle = unwrapBattle(json);
      if (!battle) {
        clearOnlineBattle();
        return;
      }
      if (battle.status === 'IN_PROGRESS') {
        enterBattle(battle);
        return;
      }
      startPolling(battle);
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      clearOnlineBattle();
      // Allow the player to simply start again.
    });
  }

  function init() {
    if (typeof TD === 'undefined' || !TD.profile || !TD.createBattle) {
      requireLogin();
      return;
    }
    if (!isAuthenticatedUser()) {
      requireLogin();
      return;
    }

    cacheElements();
    wireSelection();
    readStoredSelection();
    applySelection();
    wireEvents();

    window.addEventListener('pagehide', stopPolling);
    window.addEventListener('beforeunload', stopPolling);

    resumeWaitingBattle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();