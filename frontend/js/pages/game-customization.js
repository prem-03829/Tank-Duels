document.addEventListener('DOMContentLoaded', function () {
  /* =========================
     ELEMENTS
  ========================= */

  var nameInput0 = document.querySelector('#player-one-name-input');
  var nameInput1 = document.querySelector('#player-two-name-input');
  var swatches0 = document.querySelector('#color-swatches-0');
  var swatches1 = document.querySelector('#color-swatches-1');
  var preview0 = document.querySelector('#tank-preview-0');
  var preview1 = document.querySelector('#tank-preview-1');
  var warningEl = document.querySelector('#same-color-warning');
  var startBtn = document.querySelector('#start-game-btn');
  var backBtn = document.querySelector('#back-btn');

  /* =========================
     STATE
  ========================= */

  var customization = loadCustomization();

  var state = {
    p1Name: customization.playerOneName,
    p2Name: customization.playerTwoName,
    p1ColorId: customization.playerOneColor,
    p2ColorId: customization.playerTwoColor,
    trajectoryTrail: customization.trajectoryTrail
  };

  /* =========================
     RENDER COLOR SWATCHES
  ========================= */

  function renderSwatches(container, selectedId, playerIndex) {
    container.innerHTML = '';
    for (var i = 0; i < TD.PLAYER_COLORS.length; i++) {
      var pc = TD.PLAYER_COLORS[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (pc.id === selectedId ? ' selected' : '');
      btn.style.background = pc.hex;
      btn.setAttribute('aria-label', pc.name);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', pc.id === selectedId ? 'true' : 'false');
      btn.setAttribute('data-color', pc.id);
      btn.setAttribute('data-player', playerIndex);

      if (pc.id === selectedId) {
        btn.setAttribute('tabindex', '0');
      } else {
        btn.setAttribute('tabindex', '-1');
      }

      container.appendChild(btn);
    }
  }

  /* =========================
     TANK PREVIEW RENDERING
  ========================= */

  function renderTankPreview(canvas, colorId, facing) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    var pc = findPlayerColor(colorId);
    var hex = pc ? pc.hex : '#e07030';
    var colors = TD.makeTankColors(hex);

    var previewTank = new TD.Tank(0, '', Math.round(w / 2), { getHeight: function () { return h - 8; } }, colors, facing);
    previewTank.y = h - 8 - previewTank.trackH - previewTank.bodyH - 1;
    previewTank.angle = facing === 1 ? 30 : 150;
    previewTank.render(ctx);
  }

  /* =========================
     COLOR CONFLICT CHECK
  ========================= */

  function checkColorConflict() {
    if (state.p1ColorId === state.p2ColorId) {
      warningEl.classList.add('visible');
    } else {
      warningEl.classList.remove('visible');
    }
  }

  /* =========================
     FULL UI UPDATE
  ========================= */

  function updateUI() {
    renderSwatches(swatches0, state.p1ColorId, 0);
    renderSwatches(swatches1, state.p2ColorId, 1);
    renderTankPreview(preview0, state.p1ColorId, 1);
    renderTankPreview(preview1, state.p2ColorId, -1);
    checkColorConflict();
    updateTrajectoryButtons();
  }

  /* =========================
     COLOR SELECTION HANDLER
  ========================= */

  function handleSwatchClick(e) {
    var btn = e.target.closest('.color-swatch');
    if (!btn) return;

    var colorId = btn.getAttribute('data-color');
    var playerIndex = parseInt(btn.getAttribute('data-player'), 10);

    if (playerIndex === 0) {
      state.p1ColorId = colorId;
    } else {
      state.p2ColorId = colorId;
    }

    updateUI();
    saveCustomization(state);
  }

  if (swatches0) swatches0.addEventListener('click', handleSwatchClick);
  if (swatches1) swatches1.addEventListener('click', handleSwatchClick);

  /* =========================
     NAME INPUT HANDLERS
  ========================= */

  function handleNameInput(e, playerIndex) {
    var val = e.target.value;
    if (playerIndex === 0) state.p1Name = val;
    else state.p2Name = val;
  }

  if (nameInput0) {
    nameInput0.addEventListener('input', function (e) {
      handleNameInput(e, 0);
    });
  }

  if (nameInput1) {
    nameInput1.addEventListener('input', function (e) {
      handleNameInput(e, 1);
    });
  }

  /* =========================
     TRAJECTORY TOGGLE
  ========================= */

  function updateTrajectoryButtons() {
    var btns = document.querySelectorAll('.trajectory-btn');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var trail = btn.getAttribute('data-trail');
      var isActive = (trail === 'on' && state.trajectoryTrail) ||
                     (trail === 'off' && !state.trajectoryTrail);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    }
  }

  var trajectoryBtns = document.querySelectorAll('.trajectory-btn');
  for (var i = 0; i < trajectoryBtns.length; i++) {
    trajectoryBtns[i].addEventListener('click', function () {
      var trail = this.getAttribute('data-trail');
      state.trajectoryTrail = trail === 'on';
      updateTrajectoryButtons();
      saveCustomization(state);
    });
  }

  /* =========================
     NAME VALIDATION
  ========================= */

  function validateName(val) {
    if (val === null || val === undefined) return '';
    var trimmed = String(val).trim();
    if (trimmed.length === 0) return '';
    if (trimmed.length > 16) trimmed = trimmed.substring(0, 16);
    return trimmed;
  }

  function stripHtml(str) {
    return str.replace(/[<>&"']/g, '');
  }

  /* =========================
     START GAME
  ========================= */

  if (startBtn) {
    startBtn.addEventListener('click', function () {
      var p1 = validateName(state.p1Name);
      var p2 = validateName(state.p2Name);

      if (!p1) p1 = TD.DEFAULT_PLAYER_NAMES.playerOne;
      if (!p2) p2 = TD.DEFAULT_PLAYER_NAMES.playerTwo;

      p1 = stripHtml(p1);
      p2 = stripHtml(p2);

      state.p1Name = p1;
      state.p2Name = p2;

      saveCustomization(state);

      window.location.href = './game.html';
    });
  }

  /* =========================
     INIT
  ========================= */

  if (nameInput0) nameInput0.value = state.p1Name;
  if (nameInput1) nameInput1.value = state.p2Name;

  updateUI();
});

/* =========================
   LOCALSTORAGE HELPERS
========================== */

function loadCustomization() {
  var raw = localStorage.getItem('tankDuelGameCustomization');
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      return {
        playerOneName: parsed.playerOneName || TD.DEFAULT_PLAYER_NAMES.playerOne,
        playerTwoName: parsed.playerTwoName || TD.DEFAULT_PLAYER_NAMES.playerTwo,
        playerOneColor: parsed.playerOneColor || 'orange',
        playerTwoColor: parsed.playerTwoColor || 'blue',
        trajectoryTrail: parsed.trajectoryTrail !== false
      };
    } catch (e) { /* fall through */ }
  }

  var p1Name = localStorage.getItem('tankDuelPlayerName');
  return {
    playerOneName: (p1Name && p1Name.trim()) || TD.DEFAULT_PLAYER_NAMES.playerOne,
    playerTwoName: TD.DEFAULT_PLAYER_NAMES.playerTwo,
    playerOneColor: 'orange',
    playerTwoColor: 'blue',
    trajectoryTrail: true
  };
}

function saveCustomization(state) {
  var data = {
    playerOneName: state.p1Name,
    playerTwoName: state.p2Name,
    playerOneColor: state.p1ColorId,
    playerTwoColor: state.p2ColorId,
    trajectoryTrail: state.trajectoryTrail
  };
  localStorage.setItem('tankDuelGameCustomization', JSON.stringify(data));
}

function getCustomization() {
  return loadCustomization();
}

function findPlayerColor(colorId) {
  for (var i = 0; i < TD.PLAYER_COLORS.length; i++) {
    if (TD.PLAYER_COLORS[i].id === colorId) return TD.PLAYER_COLORS[i];
  }
  return TD.PLAYER_COLORS[0];
}
