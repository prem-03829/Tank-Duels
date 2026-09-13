document.addEventListener('DOMContentLoaded', function () {
  /* =========================
     ELEMENTS
  ========================= */

  var playerNameElement = document.querySelector('#player-one-name');
  var opponentNameElement = document.querySelector('#player-two-name');
  var mapNameElement = document.querySelector('#map-name');
  var roundValueElement = document.querySelector('#round-value');
  var gameStatusElement = document.querySelector('#game-status');
  var fireButton = document.querySelector('#fire-button');
  var canvas = document.querySelector('#game-canvas');

  var angleValue = document.querySelector('#angle-value');
  var powerValue = document.querySelector('#power-value');
  var angleMinus = document.querySelector('#angle-minus');
  var anglePlus = document.querySelector('#angle-plus');
  var powerMinus = document.querySelector('#power-minus');
  var powerPlus = document.querySelector('#power-plus');
  var angleControl = document.querySelector('#angle-control');
  var powerControl = document.querySelector('#power-control');
  var aimCrosshair = document.querySelector('#aim-crosshair');

  var fullscreenBtn = document.querySelector('#fullscreen-btn');
  var windDisplay = document.querySelector('#wind-display');

  var quitButton = document.querySelector('#quit-game-btn');
  var quitModal = document.querySelector('#quit-modal');
  var cancelQuitButton = document.querySelector('#cancel-quit-btn');
  var confirmQuitButton = document.querySelector('#confirm-quit-btn');
  var modalBackdrop = document.querySelector('#quit-modal-backdrop');

  var tankOverlay0 = document.querySelector('#tank-overlay-0');
  var tankOverlay1 = document.querySelector('#tank-overlay-1');

  /* =========================
     ACTIVE-PLAYER INDICATOR SPRITE
     Builds the multi-shade pixel-art arrow into the shared SVG <defs> so both
     player overlays can reference it through <use>. Per-player colors are
     resolved via CSS custom properties (--ind-hi/--ind-fill/--ind-mid/--ind-shade).
  ========================= */

  (function buildActiveIndicatorSprite() {
    var defsGroup = document.getElementById('active-player-indicator');
    if (!defsGroup || !defsGroup.ownerDocument) return;

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var map = [
      '......obo......',
      '......obo......',
      '......obo......',
      '......obo......',
      '..ooHbbbbbmoo..',
      '...ooHbbbmoo...',
      '....ooHbmoo....',
      '.....ooboo.....',
      '.....ooboo.....',
      '...............'
    ];
    var colors = {
      o: '#0a0a0a',
      H: 'var(--ind-hi)',
      b: 'var(--ind-fill)',
      m: 'var(--ind-mid)',
      s: 'var(--ind-shade)'
    };

    var rows = [];
    for (var ri = 0; ri < map.length; ri++) {
      var line = map[ri];
      var runs = [];
      var c = 0;
      while (c < line.length) {
        if (line[c] === '.') { c++; continue; }
        var ch = line[c];
        var start = c;
        while (c < line.length && line[c] === ch) c++;
        runs.push({ x: start, y: ri, w: c - start, h: 1, ch: ch, merged: false });
      }
      rows.push(runs);
    }

    for (var ri = 1; ri < rows.length; ri++) {
      for (var a = 0; a < rows[ri].length; a++) {
        var run = rows[ri][a];
        for (var b = 0; b < rows[ri - 1].length; b++) {
          var up = rows[ri - 1][b];
          if (!up.merged && up.x === run.x && up.w === run.w && up.ch === run.ch) {
            up.h += 1;
            run.merged = true;
            break;
          }
        }
      }
    }

    for (var ri = 0; ri < rows.length; ri++) {
      for (var a = 0; a < rows[ri].length; a++) {
        var run = rows[ri][a];
        if (run.merged || !colors[run.ch]) continue;
        var rect = defsGroup.ownerDocument.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', run.x);
        rect.setAttribute('y', run.y);
        rect.setAttribute('width', run.w);
        rect.setAttribute('height', run.h);
        rect.setAttribute('fill', colors[run.ch]);
        defsGroup.appendChild(rect);
      }
    }
  })();

  /* =========================
     PLAYER
  ========================= */

  var cust = null;
  try {
    var raw = localStorage.getItem('tankDuelGameCustomization');
    if (raw) cust = JSON.parse(raw);
  } catch (e) { /* fall through */ }

  var playerName = (cust && cust.playerOneName && cust.playerOneName.trim()) ||
                   localStorage.getItem('tankDuelPlayerName') || 'PLAYER';
  var opponentName = (cust && cust.playerTwoName && cust.playerTwoName.trim()) || 'OPPONENT';
  var p1ColorId = (cust && cust.playerOneColor) || 'orange';
  var p2ColorId = (cust && cust.playerTwoColor) || 'blue';
  var trajectoryTrail = cust ? (cust.trajectoryTrail !== false) : true;

  if (playerNameElement) {
    playerNameElement.textContent = playerName.toUpperCase();
  }

  if (opponentNameElement) {
    opponentNameElement.textContent = opponentName.toUpperCase();
  }

  /* =========================
     MAP
  ========================= */

  var selectedMap = localStorage.getItem('tankDuelSelectedMap') || 'desert';
  var mapNames = {
    desert: 'Dustlands',
    hills: 'Green Valley',
    dustlands: 'Dustlands',
    valley: 'Green Valley',
    frostbite: 'Frostbite',
    ashhill: 'Ashfall',
    moonbase: 'Moonbase',
    canyon: 'Canyon',
    random: 'Random'
  };

  if (mapNameElement) {
    mapNameElement.textContent = mapNames[selectedMap] || 'Dustlands';
  }

  /* =========================
     MATCH FORMAT
  ========================= */

  var selectedRounds = Number(localStorage.getItem('tankDuelSelectedRounds')) || 1;

  if (roundValueElement) {
    roundValueElement.textContent = '1 / ' + selectedRounds;
  }

  /* =========================
     SETTINGS
  ========================= */

  var accentColor = '#ff8933';
  var savedColor = localStorage.getItem('tankDuelAccentColor') || 'orange';
  var savedCustomColor = localStorage.getItem('tankDuelCustomColor');

  if (savedColor === 'custom' && savedCustomColor) {
    accentColor = savedCustomColor;
  } else {
    var colorMap = {
      orange: '#ff8933',
      blue: '#4da3ff',
      green: '#57c785',
      purple: '#a878ff'
    };
    accentColor = colorMap[savedColor] || '#ff8933';
  }

  var reducedMotion = localStorage.getItem('tankDuelReducedMotion') === 'true';

  /* =========================
     GAME STATUS
  ========================= */

  if (gameStatusElement) {
    gameStatusElement.textContent = playerName.toUpperCase() + "'S TURN";
  }

  /* =========================
     INITIAL GAME STATE
  ========================= */

  var engine = null;

  if (canvas) {
    engine = new TD.GameEngine(canvas, {
      gameStatus: gameStatusElement,
      turnLabel: gameStatusElement,
      angleValue: angleValue,
      powerValue: powerValue,
      angleControl: angleControl,
      powerControl: powerControl,
      roundValue: roundValueElement,
      mapName: mapNameElement,
      windDisplay: windDisplay,
      tankOverlay0: tankOverlay0,
      tankOverlay1: tankOverlay1
    });

    var activeMatch = TD.loadActiveMatch();

    if (activeMatch) {
      engine.restore(activeMatch, {
        accentColor: accentColor,
        reducedMotion: reducedMotion
      });
    } else {
      engine.init({
        playerName: playerName,
        opponentName: opponentName,
        maxRounds: selectedRounds,
        accentColor: accentColor,
        reducedMotion: reducedMotion,
        mapType: selectedMap,
        playerOneColor: p1ColorId,
        playerTwoColor: p2ColorId,
        trajectoryTrail: trajectoryTrail
      });

      engine._enableControls(false);
    }
  }

  /* =========================
     FIRE BUTTON
  ========================= */

  if (fireButton) {
    fireButton.addEventListener('click', function () {
      if (engine) {
        engine.audio.resume();
        endControlMode();
        engine.fire();
      }
    });
  }

  /* =========================
     DIAL MOUSE CONTROL

     ANGLE: click the circular dial and drag. The pointer direction around the
     dial maps to the angle via atan2 (0 = right, 90 = up, 180 = left,
     270 = down). Pointer capture keeps tracking even when the pointer leaves
     the dial.

     POWER: click the power value once to ENTER POWER CONTROL MODE (no need to
     hold the button). While active, horizontal mouse movement changes the
     power continuously. A left click anywhere CONFIRMS; ESC cancels and
     restores the value captured when the mode started.
  ========================= */

  var activeControl = null;
  var activeControlEl = null;
  var activePointerId = null;
  var dragCenterX = 0;
  var dragCenterY = 0;

  var powerBaseValue = 0;
  var powerAccum = 0;
  var lastPointerX = 0;
  var suppressNextClick = false;

  function controlInputEnabled() {
    return engine && engine.state === TD.STATES.AIMING;
  }

  function showAimCrosshair(x, y) {
    if (!aimCrosshair) return;
    if (engine) {
      aimCrosshair.style.color = engine.currentTurn === 0 ? '#ff8050' : '#50a0ff';
    }
    aimCrosshair.style.left = x + 'px';
    aimCrosshair.style.top = y + 'px';
    aimCrosshair.classList.add('is-visible');
  }

  function hideAimCrosshair() {
    if (aimCrosshair) aimCrosshair.classList.remove('is-visible');
  }

  function endControlMode() {
    if (activeControlEl && activePointerId !== null && activeControlEl.releasePointerCapture) {
      try {
        activeControlEl.releasePointerCapture(activePointerId);
      } catch (e) { /* capture already released */ }
    }
    activeControl = null;
    activeControlEl = null;
    activePointerId = null;
    hideAimCrosshair();
    if (angleControl) angleControl.classList.remove('is-active');
    if (powerControl) powerControl.classList.remove('is-active');
  }

  /* ---------------- ANGLE (unchanged) ---------------- */

  function beginControlMode(type, el, e) {
    if (!controlInputEnabled()) return;
    endControlMode();
    activeControl = type;
    activeControlEl = el;
    activePointerId = e.pointerId;
    el.classList.add('is-active');
    if (el.setPointerCapture) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }
    showAimCrosshair(e.clientX, e.clientY);

    var rect = el.getBoundingClientRect();
    dragCenterX = rect.left + rect.width / 2;
    dragCenterY = rect.top + rect.height / 2;
    updateAngleFromPoint(e);
  }

  function updateAngleFromPoint(e) {
    if (!engine) return;
    var dx = e.clientX - dragCenterX;
    var dy = e.clientY - dragCenterY;
    var deg = Math.round((Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360);
    engine.setAngle(deg);
    showAimCrosshair(e.clientX, e.clientY);
  }

  function handleDialMove(e) {
    if (activeControl !== 'angle' || e.pointerId !== activePointerId) return;
    if (!controlInputEnabled()) {
      endControlMode();
      return;
    }
    updateAngleFromPoint(e);
  }

  function handleDialUp(e) {
    if (activeControl === 'angle' && e.pointerId === activePointerId) {
      endControlMode();
    }
  }

  function attachAngleDialControl(el) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      beginControlMode('angle', el, e);
    });
    el.addEventListener('pointermove', handleDialMove);
    el.addEventListener('pointerup', handleDialUp);
    el.addEventListener('pointercancel', handleDialUp);
    el.addEventListener('lostpointercapture', handleDialUp);
  }

  attachAngleDialControl(angleControl);

  /* ---------------- POWER (click-activated, horizontal delta) ---------------- */

  function getPowerFromAccum() {
    var raw = powerBaseValue + powerAccum;
    return Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, Math.round(raw)));
  }

  function enterPowerControl(e) {
    if (!controlInputEnabled()) return;
    endControlMode();
    activeControl = 'power';
    activeControlEl = powerControl;
    activePointerId = null;
    if (powerControl) powerControl.classList.add('is-active');
    powerBaseValue = engine ? engine.getPower() : TD.POWER_DEFAULT;
    powerAccum = 0;
    lastPointerX = e.clientX;
  }

  function confirmPowerControl() {
    if (activeControl !== 'power') return;
    if (engine) engine.setPower(getPowerFromAccum());
    endControlMode();
    suppressNextClick = true;
  }

  function cancelPowerControl() {
    if (activeControl !== 'power') return;
    if (engine) engine.setPower(powerBaseValue);
    endControlMode();
  }

  function handlePowerControlDown(e) {
    if (e.button !== 0) return;
    if (activeControl === 'power') {
      confirmPowerControl();
      return;
    }
    if (activeControl) return;
    if (!controlInputEnabled()) return;
    enterPowerControl(e);
  }

  if (powerControl) {
    powerControl.addEventListener('pointerdown', handlePowerControlDown);
  }

  function handlePowerMove(e) {
    if (activeControl !== 'power') return;
    if (!controlInputEnabled()) {
      endControlMode();
      return;
    }
    var dx = e.clientX - lastPointerX;
    lastPointerX = e.clientX;
    powerAccum += dx * TD.POWER_MOUSE_SENSITIVITY;
    if (engine) engine.setPower(getPowerFromAccum());
  }

  document.addEventListener('pointermove', handlePowerMove);

  /* A left click anywhere while power mode is active CONFIRMS the power.
     Run in the capture phase and swallow the event so the confirming click
     cannot also trigger FIRE, the +/- buttons, or a new control mode. */

  function handleConfirmMouseDown(e) {
    if (e.button !== 0 || activeControl !== 'power') return;
    e.preventDefault();
    e.stopPropagation();
    confirmPowerControl();
  }

  document.addEventListener('pointerdown', handleConfirmMouseDown, true);

  /* The confirming click still dispatches a click event; eat it once. */

  function handleConsumeConfirmClick(e) {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  document.addEventListener('click', handleConsumeConfirmClick, true);

  /* ESC exits dial control mode (before the engine's quit-modal handler).
     For POWER it cancels and restores the value captured at mode start. */

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && activeControl) {
      e.preventDefault();
      e.stopPropagation();
      if (activeControl === 'power') {
        cancelPowerControl();
      } else {
        endControlMode();
      }
    }
  }, true);

  /* +/- buttons. POWER's buttons only act when power control mode is NOT
     active (a click while active confirms instead). ANGLE is unchanged. */

  if (angleMinus && engine) {
    angleMinus.addEventListener('click', function () {
      engine.adjustAngle(-TD.ANGLE_STEP);
    });
  }

  if (anglePlus && engine) {
    anglePlus.addEventListener('click', function () {
      engine.adjustAngle(TD.ANGLE_STEP);
    });
  }

  if (powerMinus && engine) {
    powerMinus.addEventListener('click', function () {
      if (activeControl === 'power') return;
      engine.adjustPower(-TD.POWER_STEP);
    });
  }

  if (powerPlus && engine) {
    powerPlus.addEventListener('click', function () {
      if (activeControl === 'power') return;
      engine.adjustPower(TD.POWER_STEP);
    });
  }

  /* =========================
     FULLSCREEN
  ========================= */

  function updateFullscreenBtn() {
    if (!fullscreenBtn) return;
    fullscreenBtn.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      } else {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    });

    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    updateFullscreenBtn();
  }

  /* =========================
     QUIT MODAL
  ========================= */

  function openQuitModal() {
    if (!quitModal) return;
    quitModal.classList.add('is-open');
    quitModal.setAttribute('aria-hidden', 'false');
  }

  function closeQuitModal() {
    if (!quitModal) return;
    quitModal.classList.remove('is-open');
    quitModal.setAttribute('aria-hidden', 'true');
  }

  if (quitButton) {
    quitButton.addEventListener('click', openQuitModal);
  }

  if (cancelQuitButton) {
    cancelQuitButton.addEventListener('click', closeQuitModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeQuitModal);
  }

  if (confirmQuitButton) {
    confirmQuitButton.addEventListener('click', function () {
      TD.clearActiveMatch();
      if (engine) {
        engine.cleanup();
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      }
      window.location.href = './dashboard.html';
    });
  }
});
