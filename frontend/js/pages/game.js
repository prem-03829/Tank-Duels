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

  var angleSlider = document.querySelector('#angle-slider');
  var powerSlider = document.querySelector('#power-slider');
  var angleValue = document.querySelector('#angle-value');
  var powerValue = document.querySelector('#power-value');
  var angleMinus = document.querySelector('#angle-minus');
  var anglePlus = document.querySelector('#angle-plus');
  var powerMinus = document.querySelector('#power-minus');
  var powerPlus = document.querySelector('#power-plus');

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
      angleSlider: angleSlider,
      powerSlider: powerSlider,
      roundValue: roundValueElement,
      mapName: mapNameElement,
      windDisplay: windDisplay,
      tankOverlay0: tankOverlay0,
      tankOverlay1: tankOverlay1
    });

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

  /* =========================
     FIRE BUTTON
  ========================= */

  if (fireButton) {
    fireButton.addEventListener('click', function () {
      if (engine) {
        engine.audio.resume();
        engine.fire();
      }
    });
  }

  /* =========================
     ANGLE SLIDER
  ========================= */

  if (angleSlider && engine) {
    angleSlider.addEventListener('input', function () {
      engine.setAngle(Number(this.value));
    });
  }

  if (angleMinus && engine) {
    angleMinus.addEventListener('click', function () {
      engine.adjustAngle(-TD.ANGLE_STEP);
      if (angleSlider) angleSlider.value = engine.getAngle();
    });
  }

  if (anglePlus && engine) {
    anglePlus.addEventListener('click', function () {
      engine.adjustAngle(TD.ANGLE_STEP);
      if (angleSlider) angleSlider.value = engine.getAngle();
    });
  }

  /* =========================
     POWER SLIDER
  ========================= */

  if (powerSlider && engine) {
    powerSlider.addEventListener('input', function () {
      engine.setPower(Number(this.value));
    });
  }

  if (powerMinus && engine) {
    powerMinus.addEventListener('click', function () {
      engine.adjustPower(-TD.POWER_STEP);
      if (powerSlider) powerSlider.value = engine.getPower();
    });
  }

  if (powerPlus && engine) {
    powerPlus.addEventListener('click', function () {
      engine.adjustPower(TD.POWER_STEP);
      if (powerSlider) powerSlider.value = engine.getPower();
    });
  }

  /* =========================
     FULLSCREEN
  ========================= */

  function updateFullscreenBtn() {
    if (!fullscreenBtn) return;
    fullscreenBtn.textContent = document.fullscreenElement ? 'EXIT' : 'FULL';
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
