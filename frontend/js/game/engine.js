/* =========================
   GAME ENGINE
========================== */

var TD = TD || {};

TD.GameEngine = function (canvas, elements) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.el = elements;

  this.terrain = new TD.Terrain();
  this.projectile = new TD.Projectile();
  this.particles = new TD.ParticleSystem();
  this.audio = new TD.AudioManager();

  this.tanks = [];
  this.state = TD.STATES.SETUP;
  this.currentTurn = 0;
  this.round = 1;
  this.maxRounds = 1;
  this.scores = [0, 0];
  this.wind = 0;
  this.frame = 0;
  this.stateTimer = 0;
  this.running = false;
  this.animFrameId = null;
  this.lastTime = 0;

  this.shakeX = 0;
  this.shakeY = 0;
  this.shakeDuration = 0;
  this.shakeIntensity = 0;

  this.playerName = 'PLAYER';
  this.opponentName = 'OPPONENT';
  this.accentColor = '#ff8933';
  this.reducedMotion = false;
  this.trajectoryTrail = true;
  this.playerOneColorId = 'orange';
  this.playerTwoColorId = 'blue';
  this._onlineBattle = null;

  this._onlineFiringInFlight = false;
  this._onlineRequestPhase = '';
  this._onlineResolutionPending = false;
  this._onlineCompleted = false;
  this._onlineBattleStatus = '';
  this._onlineNavigatedAway = false;
  this._onlinePollingTimer = null;
  this._onlinePollInFlight = false;
  this._lastOnlineShotSignature = null;
  this._onOnlinePageUnload = null;

  this._bgImages = {};
  this._bgLoaded = {};
  this._onKeyDown = this._handleKeyDown.bind(this);
  this._onKeyUp = this._handleKeyUp.bind(this);
  this._boundLoop = this._loop.bind(this);
  this.keys = {};
};

TD.GameEngine.prototype.init = function (config) {
  this.playerName = config.playerName || 'PLAYER';
  this.opponentName = config.opponentName || 'OPPONENT';
  this.maxRounds = config.maxRounds || 1;
  this.accentColor = config.accentColor || '#ff8933';
  this.reducedMotion = config.reducedMotion || false;
  this._applyMotionPref();
  this.mapType = config.mapType || 'dustlands';
  this.playerOneColorId = config.playerOneColor || 'orange';
  this.playerTwoColorId = config.playerTwoColor || 'blue';
  this.trajectoryTrail = config.trajectoryTrail !== false;
  this._online = false;
  this._onlineBattle = config.onlineBattle || null;

  this.canvas.width = TD.W;
  this.canvas.height = TD.H;
  this.ctx.imageSmoothingEnabled = false;

  this.audio.init();

  this._preloadBackground(this.mapType);

  var seed = Date.now();
  this._terrainSeed = seed;
  this.terrain.generate(this.mapType, seed);

  this._placeTanks();
  this._generateWind();
  this._updateHUD();
  this._showRound();

  this.state = TD.STATES.TURN_START;
  this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
  this.currentTurn = 0;
  this.round = 1;
  this.scores = [0, 0];

  document.addEventListener('keydown', this._onKeyDown);
  document.addEventListener('keyup', this._onKeyUp);

  this.running = true;
  this.lastTime = performance.now();
  this._saveState();
  this._loop();

  /* No-op for local/guest matches; only an authenticated online init polls. */
  if (this._isOnlineBattle()) this._startOnlinePolling();
};

/* =========================
   ONLINE CONTEXT & TURN ENFORCEMENT
   In ONLINE matches the backend battle is authoritative: engine index 0 is
   backend player1 and index 1 is backend player2 on BOTH clients. The local
   human occupies one of those slots (onlineBattle.localServerSlot); only that
   slot's controls may be active. LOCAL/GUEST matches never set _onlineBattle,
   so every check below is a no-op for them.
========================== */

TD.GameEngine.prototype._isOnlineBattle = function () {
  return this._online === true && !!this._onlineBattle;
};

TD.GameEngine.prototype._canControl = function () {
  if (this.state !== TD.STATES.AIMING) return false;
  if (this._isOnlineBattle()) {
    var slot = this._onlineBattle.localServerSlot;
    if (typeof slot === 'number' && slot !== this.currentTurn) return false;
  }
  return true;
};

TD.GameEngine.prototype._preloadBackground = function (mapType) {
  var resolved = TD.resolveMap(mapType);

  if (resolved === 'random' || !TD.MAP_BG[resolved]) {
    for (var i = 0; i < TD.MAP_KEYS.length; i++) {
      this._preloadSingle(TD.MAP_KEYS[i]);
    }
    return;
  }

  this._preloadSingle(resolved);
};

TD.GameEngine.prototype._preloadSingle = function (key) {
  var bgPath = TD.MAP_BG[key];
  if (!bgPath) return;
  if (this._bgLoaded[key]) return;

  console.log('[MAP BG] Loading: ' + bgPath + ' for ' + key);
  var self = this;
  var img = new Image();
  img.onload = function () {
    self._bgLoaded[key] = true;
    console.log('[MAP BG] Loaded OK: ' + bgPath + ' (' + img.naturalWidth + 'x' + img.naturalHeight + ')');
  };
  img.onerror = function () {
    console.warn('[MAP BG] FAILED: ' + bgPath);
    self._bgLoaded[key] = false;
  };
  img.src = bgPath;
  this._bgImages[key] = img;
};

TD.GameEngine.prototype._getBgImage = function () {
  var resolved = this.terrain.type;
  var img = this._bgImages[resolved];
  if (img && this._bgLoaded[resolved]) return img;
  return null;
};

TD.GameEngine.prototype._placeTanks = function () {
  var p1x = Math.round(TD.W * (0.12 + this.terrain.rng() * 0.1));
  var p2x = Math.round(TD.W * (0.78 + this.terrain.rng() * 0.1));

  p1x = this._findFlatSpot(p1x, 20);
  p2x = this._findFlatSpot(p2x, 20);

  var p1colors = TD.makeTankColors(findPlayerColorHex(this.playerOneColorId));
  var p2colors = TD.makeTankColors(findPlayerColorHex(this.playerTwoColorId));

  this.tanks = [
    new TD.Tank(0, this.playerName, p1x, this.terrain, p1colors, 1),
    new TD.Tank(1, this.opponentName, p2x, this.terrain, p2colors, -1)
  ];

  this.tanks[0].angle = 0;
  this.tanks[1].angle = 180;
};

TD.GameEngine.prototype._findFlatSpot = function (x, range) {
  var bestX = x;
  var bestVariance = Infinity;
  for (var ox = -15; ox <= 15; ox++) {
    var cx = x + ox;
    if (cx < 25 || cx >= TD.W - 25) continue;
    var variance = 0;
    var cnt = 0;
    for (var dx = -range; dx <= range; dx++) {
      if (cx + dx < 0 || cx + dx >= TD.W) continue;
      var diff = this.terrain.heights[cx + dx] - this.terrain.heights[cx];
      variance += diff * diff;
      cnt++;
    }
    if (cnt > 0) variance /= cnt;
    if (variance < bestVariance) {
      bestVariance = variance;
      bestX = cx;
    }
  }
  return bestX;
};

TD.GameEngine.prototype._generateWind = function () {
  this.wind = Math.round((Math.random() * 2 - 1) * TD.WIND_ABS_MAX);
  if (Math.abs(this.wind) < 1) this.wind = Math.random() > 0.5 ? 1 : -1;
};

TD.GameEngine.prototype.cleanup = function () {
  this._stopOnlinePolling();
  this.running = false;
  if (this.animFrameId) {
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
  }
  document.removeEventListener('keydown', this._onKeyDown);
  document.removeEventListener('keyup', this._onKeyUp);
  if (document.body) document.body.classList.remove('motion-reduced');
};

TD.GameEngine.prototype._applyMotionPref = function () {
  if (!document.body) return;
  document.body.classList.toggle('motion-reduced', !!this.reducedMotion);
};

TD.GameEngine.prototype._loop = function () {
  if (!this.running) return;
  this.frame++;
  this._update();
  this._render();
  this._updateOverlays();
  this.animFrameId = requestAnimationFrame(this._boundLoop);
};

TD.GameEngine.prototype._update = function () {
  switch (this.state) {
    case TD.STATES.TURN_START:
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this.state = TD.STATES.AIMING;
        this._enableControls(true);
        this._updateHUD();
        this._saveState();
      }
      break;

    case TD.STATES.AIMING:
      break;

    case TD.STATES.FLYING:
      var outOfBounds = this.projectile.update();
      this.particles.update();

      if (!this.reducedMotion && this.frame % 6 === 0) {
        this.particles.addBiomeAmbient(this.terrain.type, TD.W, TD.H, this.terrain.heights);
      }

      if (outOfBounds) {
        this._onProjectileEnd(null);
        break;
      }

      if (this.projectile.checkTerrainHit(this.terrain)) {
        var ix = Math.round(this.projectile.x);
        var iy = this.terrain.getHeight(ix);
        this._onTerrainHit(ix, iy);
        break;
      }

      for (var i = 0; i < this.tanks.length; i++) {
        if (this.projectile.checkTankHit(this.tanks[i])) {
          this._onTankHit(this.tanks[i]);
          break;
        }
      }
      break;

    case TD.STATES.EXPLODING:
      this.particles.update();
      this.stateTimer--;
      if (this.shakeDuration > 0) {
        this.shakeDuration--;
        this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
        this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
        if (!this.reducedMotion) {
          this.shakeIntensity *= 0.9;
        } else {
          this.shakeX = 0;
          this.shakeY = 0;
        }
      }
      if (this.stateTimer <= 0) {
        if (this._onlineResolutionPending) {
          this._onlineResolutionPending = false;
          this._afterOnlineExplosion();
        } else {
          this._afterExplosion();
        }
      }
      break;

    case TD.STATES.GAME_OVER:
      this.particles.update();
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this._saveAndNavigate();
      }
      break;
  }
};

/* =========================
   RENDERING
========================== */

TD.GameEngine.prototype._render = function () {
  var ctx = this.ctx;

  ctx.save();
  ctx.translate(Math.round(this.shakeX), Math.round(this.shakeY));
  ctx.imageSmoothingEnabled = false;

  // 1. Sky or background image
  var bgImg = this._getBgImage();
  if (bgImg) {
    this.terrain.renderBackground(ctx, bgImg);
  } else {
    this.terrain.renderSky(ctx);
  }

  // 2. Background mountains (only when no image)
  if (!bgImg) {
    this.terrain.renderBgMountains(ctx);
    this.terrain.renderBgHills(ctx);
  }

  // 4. Trajectory preview (behind terrain for subtlety)
  if (this.state === TD.STATES.AIMING && this.trajectoryTrail) {
    var aimTank = this.tanks[this.currentTurn];
    if (aimTank && aimTank.alive) {
      this._renderTrajectoryPreview(ctx, aimTank);
    }
  }

  // 5. Terrain
  this.terrain.renderTerrain(ctx);

  // 6. Decorations
  this.terrain.renderDecorations(ctx);

  // 7. Tanks
  for (var i = 0; i < this.tanks.length; i++) {
    this.tanks[i].render(ctx);
  }

  // 8. Projectile
  if (this.projectile.active) {
    this.projectile.render(ctx);
  }

  // 9. Particles
  this.particles.render(ctx);

  ctx.restore();
};

/* Point ON the predicted projectile path at exactly `radius` from the turret
   pivot. Uses the SAME stepping math as _renderTrajectoryPreview (speed from
   power, gravity, wind, terrain break), so the fixed-radius "+" crosshair can
   sit exactly on the real trajectory instead of the straight launch ray. */

TD.GameEngine.prototype.getTrajectoryPointAtRadius = function (tank, radius) {
  var pivot = tank.getTurretPivot();
  var rad = tank.angle * Math.PI / 180;
  var speed = (tank.power / 100) * TD.PROJECTILE_SPEED_CAP;
  var vx = Math.cos(rad) * speed;
  var vy = -Math.sin(rad) * speed;
  var px = pivot.x;
  var py = pivot.y;
  var steps = 0;
  var maxSteps = 250;

  while (steps < maxSteps) {
    var prevX = px;
    var prevY = py;
    px += vx;
    py += vy;
    vy += TD.GRAVITY;
    vx += this.wind * 0.008;
    steps++;

    var ix = Math.round(px);
    if (ix >= 0 && ix < TD.W && py >= this.terrain.getHeight(ix)) {
      return { x: px, y: py };
    }

    var dx = px - pivot.x;
    var dy = py - pivot.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= radius) {
      // Interpolate between the straddling steps to land exactly on `radius`.
      var pdx = prevX - pivot.x;
      var pdy = prevY - pivot.y;
      var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      var t = (radius - pdist) / (dist - pdist || 1);
      return { x: prevX + (px - prevX) * t, y: prevY + (py - prevY) * t };
    }
  }

  return { x: px, y: py };
};

TD.GameEngine.prototype._renderTrajectoryPreview = function (ctx, tank) {
  var pivot = tank.getTurretPivot();
  var rad = tank.angle * Math.PI / 180;
  var speed = (tank.power / 100) * TD.PROJECTILE_SPEED_CAP;
  var vx = Math.cos(rad) * speed;
  var vy = -Math.sin(rad) * speed;
  var px = pivot.x;
  var py = pivot.y;
  var steps = 0;
  var maxSteps = 250;
  var dotInterval = 5;
  var dotCounter = 0;
  var markerIndex = 0;

  // Per-player accent colors (existing tank palette) with a dark backing so
  // the trail stays visible over both bright terrain and dark sky.
  var core = tank.colors ? tank.colors.light : '#ff9050';
  var hint = tank.colors ? tank.colors.body : '#e07030';
  var SHADOW = 'rgba(5,5,5,0.85)';

  while (steps < maxSteps) {
    px += vx;
    py += vy;
    vy += TD.GRAVITY;
    vx += this.wind * 0.008;
    steps++;
    dotCounter++;

    if (dotCounter >= dotInterval) {
      dotCounter = 0;
      var ix = Math.round(px);
      if (ix >= 0 && ix < TD.W && py >= 0 && py < TD.H) {
        if (py >= this.terrain.getHeight(ix)) {
          // Landing marker: a crisp block in the player accent color.
          var iy = Math.round(py);
          ctx.fillStyle = SHADOW;
          ctx.fillRect(ix - 2, iy - 1, 5, 3);
          ctx.fillStyle = hint;
          ctx.fillRect(ix - 1, iy - 1, 3, 1);
          ctx.fillStyle = core;
          ctx.fillRect(ix - 1, iy, 3, 1);
          break;
        }
        // Staggered pixel blocks: dark outline + bright accent core.
        var ox = markerIndex % 2;
        var oy = 1 - ox;
        var mx = ix + ox;
        var my = Math.round(py) + oy;
        if (mx + 1 < TD.W && my + 1 < TD.H) {
          ctx.fillStyle = SHADOW;
          ctx.fillRect(mx - 1, my - 1, 3, 3);
          ctx.fillStyle = core;
          ctx.fillRect(mx, my, 2, 2);
        }
        markerIndex++;
      } else {
        break;
      }
    }
  }
};

/* =========================
   HTML OVERLAYS
========================== */

TD.GameEngine.prototype._updateOverlays = function () {
  var container = this.canvas.parentElement;
  if (!container) return;

  var displayW = container.offsetWidth;
  var displayH = container.offsetHeight;
  var scaleX = displayW / TD.W;
  var scaleY = displayH / TD.H;

  // Active-player indicator: show during an active turn, hide at start/end
  var turnActive = this.state !== TD.STATES.SETUP && this.state !== TD.STATES.GAME_OVER;

  for (var i = 0; i < this.tanks.length; i++) {
    var tank = this.tanks[i];
    var overlay = this.el['tankOverlay' + i];
    if (!overlay) continue;

    var indicator = overlay.querySelector('.tank-overlay-indicator');

    if (!tank.alive) {
      overlay.style.opacity = '0';
      if (indicator) indicator.style.opacity = '0';
      continue;
    }
    overlay.style.opacity = '1';

    var px = tank.x * scaleX;
    var py = (tank.y - tank.turretH - 24) * scaleY;
    overlay.style.left = px + 'px';
    overlay.style.top = py + 'px';

    if (indicator) {
      indicator.style.opacity = (turnActive && i === this.currentTurn) ? '1' : '0';
    }

    var nameEl = overlay.querySelector('.tank-overlay-name');
    if (nameEl) nameEl.textContent = tank.name.toUpperCase();

    var hpFill = overlay.querySelector('.tank-overlay-hp-fill');
    if (hpFill) hpFill.style.width = (tank.health / tank.maxHealth * 100) + '%';

    var hpText = overlay.querySelector('.tank-overlay-hp-text');
    if (hpText) hpText.textContent = tank.health + ' HP';

    if (hpFill) {
      var pct = tank.health / tank.maxHealth;
      hpFill.style.background = pct > 0.5 ? '#4a8' : pct > 0.25 ? '#ca5' : '#e44';
    }
  }

  var windEl = this.el.windDisplay;
  if (windEl) {
    var absW = Math.abs(this.wind);
    var arrow = '';
    if (this.wind > 0) arrow = '\u25B6'.repeat(absW);
    else if (this.wind < 0) arrow = '\u25C0'.repeat(absW);
    else arrow = '\u2014';
    /* The numeric value is wrapped so the HUD can color it white while the
       arrows keep their direction-based accent color below. */
    windEl.innerHTML = arrow + ' <span class="wind-value">' + absW + '</span>';
    windEl.style.color = this.wind > 0 ? '#ff8050' : this.wind < 0 ? '#50a0ff' : '#888';
  }
};

/* =========================
   HUD
========================== */

TD.GameEngine.prototype._renderHUD = function (ctx) {
  if (this.state === TD.STATES.TURN_START) {
    this._renderTurnAnnouncement(ctx);
  }
  if (this.state === TD.STATES.GAME_OVER) {
    this._renderGameOverOverlay(ctx);
  }
};

TD.GameEngine.prototype._renderTurnAnnouncement = function (ctx) {
  var alpha = Math.min(1, this.stateTimer / 20);
  if (this.stateTimer < 12) alpha = this.stateTimer / 12;

  ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.5) + ')';
  ctx.fillRect(0, Math.round(TD.H / 2) - 22, TD.W, 44);
};

TD.GameEngine.prototype._renderGameOverOverlay = function (ctx) {
  var alpha = Math.min(1, (TD.GAME_OVER_DELAY - this.stateTimer) / 20);
  ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.6) + ')';
  ctx.fillRect(0, 0, TD.W, TD.H);
};

TD.GameEngine.prototype._updateHUD = function () {
  var name = this.currentTurn === 0 ? this.playerName : this.opponentName;

  if (this.el.gameStatus) {
    this.el.gameStatus.textContent = name.toUpperCase() + "'S TURN";
  }

  if (this.el.turnLabel) {
    this.el.turnLabel.textContent = name.toUpperCase() + "'S TURN";
  }

  /* Per-PLAYER identity colors: both players' own resolved tank colors, kept
     constant regardless of who is active (arrows, nameplates, top HUD). */
  var p1Colors = TD.makeTankColors(findPlayerColorHex(this.playerOneColorId));
  var p2Colors = TD.makeTankColors(findPlayerColorHex(this.playerTwoColorId));

  /* ACTIVE-player theme: the current turn owner's tank color drives the
     tank-related controls (ANGLE / POWER / FIRE / turn indicator). */
  var activeColors = this.currentTurn === 0 ? p1Colors : p2Colors;

  var rootEl = document.documentElement;
  if (rootEl) {
    var props = [
      ['--player-one-color', p1Colors.body],
      ['--player-one-color-light', p1Colors.light],
      ['--player-one-color-dark', p1Colors.dark],
      ['--player-one-color-shade', TD.adjustBrightness(p1Colors.body, 0.35)],
      ['--player-two-color', p2Colors.body],
      ['--player-two-color-light', p2Colors.light],
      ['--player-two-color-dark', p2Colors.dark],
      ['--player-two-color-shade', TD.adjustBrightness(p2Colors.body, 0.35)],
      ['--active-player-color', activeColors.body],
      ['--active-player-color-light', activeColors.light]
    ];
    for (var i = 0; i < props.length; i++) {
      rootEl.style.setProperty(props[i][0], props[i][1]);
    }
  }

  var tank = this.tanks[this.currentTurn];
  if (tank) {
    if (this.el.angleValue) this.el.angleValue.textContent = tank.angle + '\u00B0';
    if (this.el.powerValue) this.el.powerValue.textContent = tank.power + '%';
    if (this.el.angleControl) this.el.angleControl.style.setProperty('--dial-deg', tank.angle + 'deg');
    if (this.el.powerControl) this.el.powerControl.style.setProperty('--power-pct', tank.power + '%');
  }

  if (this.el.roundValue) {
    this.el.roundValue.textContent = this.round + ' / ' + this.maxRounds;
  }

  if (this.el.mapName) {
    this.el.mapName.textContent = TD.MAP_DISPLAY_NAMES[this.terrain.type] || this.terrain.type;
  }
};

TD.GameEngine.prototype._showRound = function () {
  this._updateHUD();
};

TD.GameEngine.prototype._enableControls = function (enabled) {
  if (enabled && this._isOnlineBattle()) {
    var slot = this._onlineBattle.localServerSlot;
    if (typeof slot === 'number' && slot !== this.currentTurn) enabled = false;
  }
  var fb = document.getElementById('fire-button');
  if (fb) fb.disabled = !enabled;
  if (this.el.angleControl) this.el.angleControl.classList.toggle('is-disabled', !enabled);
  if (this.el.powerControl) this.el.powerControl.classList.toggle('is-disabled', !enabled);
  var ids = ['angle-minus', 'angle-plus', 'power-minus', 'power-plus'];
  for (var i = 0; i < ids.length; i++) {
    var btn = document.getElementById(ids[i]);
    if (btn) btn.disabled = !enabled;
  }
};

TD.GameEngine.prototype.setAngle = function (value) {
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.angle = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, Math.round(value)));
  this._updateHUD();
  this._saveState();
};

TD.GameEngine.prototype.setPower = function (value) {
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.power = Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, Math.round(value)));
  this._updateHUD();
  this._saveState();
};

TD.GameEngine.prototype.getAngle = function () {
  var tank = this.tanks[this.currentTurn];
  return tank ? tank.angle : TD.ANGLE_DEFAULT;
};

TD.GameEngine.prototype.getPower = function () {
  var tank = this.tanks[this.currentTurn];
  return tank ? tank.power : TD.POWER_DEFAULT;
};

TD.GameEngine.prototype.fire = function () {
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank || !tank.alive) return;

  /* ONLINE matches fire through the authoritative backend; the local engine
     never simulates the projectile for them. LOCAL/GUEST games keep the
     original local physics path below untouched. */
  if (this._isOnlineBattle()) {
    this._fireOnline();
    return;
  }

  this._enableControls(false);
  this.audio.playShoot();

  var tip = tank.getCannonTip();
  this.projectile.launch(tip.x, tip.y, tank.angle, tank.power, this.wind, tank.colors);

  this.state = TD.STATES.FLYING;
  this._updateHUD();
  this._saveState();
};

/* =========================
   ONLINE FIRE (AUTHORITATIVE)
   Online shots are submitted and resolved by the backend:
     fire()   -> POST /api/battles/<id>/actions/fire   (stores pending_fire)
     resolve -> POST /api/battles/<id>/actions/fire/resolve
   The local engine NEVER simulates the projectile for an online match; the
   returned battle_state is the single source of truth. Visuals are cosmetic
   only (impact particles) and never affect any authoritative value.
========================== */

TD.GameEngine.prototype._fireOnline = function () {
  if (this._onlineFiringInFlight) return;
  var ctx = this._onlineBattle;
  if (!ctx || !ctx.battle_id) {
    this._showOnlineErrorMessage('THIS BATTLE IS NO LONGER AVAILABLE');
    return;
  }
  if (typeof TD.fireBattleAction !== 'function' || typeof TD.resolveBattleAction !== 'function') {
    this._showOnlineErrorMessage('ONLINE PLAY IS UNAVAILABLE');
    return;
  }

  var slot = ctx.localServerSlot;
  if (typeof slot !== 'number' || slot !== this.currentTurn) return;

  var tank = this.tanks[this.currentTurn];
  if (!tank || !tank.alive) return;

  this._onlineFiringInFlight = true;
  this._onlineRequestPhase = 'fire';
  this._enableControls(false);
  this.audio.playShoot();

  var battleId = ctx.battle_id;
  var angle = tank.angle;
  var power = tank.power;
  var self = this;

  TD.fireBattleAction(battleId, angle, power)
    .then(function () {
      self._onlineRequestPhase = 'resolve';
      return self._completeOnlineFire(battleId);
    })
    .catch(function (err) {
      self._onlineFiringInFlight = false;
      if (err && err.status === 401) {
        self._handleOnlineAuthError();
        return;
      }
      if (self._onlineRequestPhase === 'resolve') {
        self._reconcileOnlineAfterFailure(battleId);
      } else {
        self._restoreOnlineControls();
        self._showOnlineErrorMessage('FIRE FAILED - TRY AGAIN');
      }
    });
};

/* Resolve the shot the backend already recorded as pending_fire and commit the
   authoritative result. Reused by the normal fire flow and by reconciliation
   when the resolve call is retried after transient failure. */
TD.GameEngine.prototype._completeOnlineFire = function (battleId) {
  var self = this;
  return TD.resolveBattleAction(battleId)
    .then(function (json) {
      self._onlineFiringInFlight = false;
      var battleData = json && json.battle ? json.battle : null;
      var shotData = json && json.shot ? json.shot : null;
      if (!battleData) {
        self._restoreOnlineControls();
        self._showOnlineErrorMessage('COULD NOT RECONCILE BATTLE STATE');
        return;
      }
      self._beginOnlineResolution(battleData, shotData);
    });
};

/* Commit an authoritative back-end battle snapshot: rehydrate the engine from
   battle.battle_state, then show the (cosmetic) impact and run a brief
   explosion before advancing to the server-determined next turn. */
TD.GameEngine.prototype._beginOnlineResolution = function (battleData, shotData) {
  /* Mark this shot as processed so later polls observe (not replay) it. */
  this._lastOnlineShotSignature = this._onlineShotSignature(battleData);

  var completed = this._applyOnlineBattleState(battleData, shotData);

  this._playOnlineShotVisual(shotData);

  this.projectile.deactivate();
  this.state = TD.STATES.EXPLODING;
  this.stateTimer = 30;
  this._onlineResolutionPending = true;
  this._onlineCompleted = completed === true;

  this._updateHUD();
  this._saveState();
};

/* Apply the authoritative battle_state that the backend returned. The server
   owns terrain, positions, health, wind, round, scores and the winner — the
   frontend only rehydrates them. Returns true when the battle is COMPLETED. */
TD.GameEngine.prototype._applyOnlineBattleState = function (battleData, shotData) {
  var ctx = this._onlineBattle;
  if (!ctx || !battleData) return false;

  var p1Id = String(battleData.player1_id || ctx.player1_id || '');
  var p2Id = String(battleData.player2_id || ctx.player2_id || '');
  ctx.player1_id = p1Id;
  ctx.player2_id = p2Id;

  var state = battleData.battle_state || {};
  var setup = (state && typeof state === 'object') ? (state.setup || {}) : {};

  var completed = battleData.status === 'COMPLETED';
  this._onlineBattleStatus = battleData.status || this._onlineBattleStatus;

  if (setup.map && TD.MAP_KEYS.indexOf(setup.map) !== -1) this.mapType = setup.map;

  var seed = typeof setup.seed === 'number' ? setup.seed : this._terrainSeed;
  var heights = setup.terrain && Array.isArray(setup.terrain.heights)
    ? setup.terrain.heights
    : null;

  if (heights) {
    this._terrainSeed = seed;
    this.terrain.restore(this.mapType, seed, heights, {});
  }

  var round = Math.round(Number(setup.round));
  var maxRounds = Math.round(Number(setup.max_rounds));
  if (!isFinite(round) || round < 1) round = this.round;
  if (!isFinite(maxRounds) || maxRounds < 1) maxRounds = this.maxRounds;
  var roundChanged = round !== this.round;

  var players = setup.players || {};
  var scores = setup.scores || {};
  var p1 = players[p1Id] || {};
  var p2 = players[p2Id] || {};

  if (typeof p1.x === 'number') {
    this.tanks[0].x = Math.round(p1.x);
    this.tanks[0].health = Math.max(0, Math.min(TD.MAX_HEALTH, Math.round(Number(p1.health) || 0)));
    this.tanks[0].alive = this.tanks[0].health > 0;
    this.tanks[0].syncToTerrain(this.terrain);
  }
  if (typeof p2.x === 'number') {
    this.tanks[1].x = Math.round(p2.x);
    this.tanks[1].health = Math.max(0, Math.min(TD.MAX_HEALTH, Math.round(Number(p2.health) || 0)));
    this.tanks[1].alive = this.tanks[1].health > 0;
    this.tanks[1].syncToTerrain(this.terrain);
  }

  /* Face each tank toward the other (matches the backend's tank x convention). */
  var p1Left = this.tanks[0].x < this.tanks[1].x;
  this.tanks[0].facing = p1Left ? 1 : -1;
  this.tanks[1].facing = p1Left ? -1 : 1;

  if (roundChanged) {
    this.tanks[0].angle = p1Left ? 0 : 180;
    this.tanks[1].angle = p1Left ? 180 : 0;
    this.tanks[0].power = TD.POWER_DEFAULT;
    this.tanks[1].power = TD.POWER_DEFAULT;
  }

  this.round = round;
  this.maxRounds = maxRounds;
  if (typeof scores[p1Id] === 'number') this.scores[0] = scores[p1Id];
  if (typeof scores[p2Id] === 'number') this.scores[1] = scores[p2Id];
  if (typeof setup.wind === 'number') this.wind = setup.wind;

  if (!completed && battleData.current_turn != null && battleData.current_turn !== '') {
    if (String(battleData.current_turn) === p1Id) this.currentTurn = 0;
    else if (String(battleData.current_turn) === p2Id) this.currentTurn = 1;
  }

  return completed;
};

/* Cosmetic-only shot feedback: spark the authoritative impact point and, if a
   tank was destroyed, its wreck. This never alters the applied server state. */
TD.GameEngine.prototype._playOnlineShotVisual = function (shotData) {
  var impact = shotData && shotData.impact;
  var x = impact && typeof impact.x === 'number' ? impact.x : NaN;
  var y = impact && typeof impact.y === 'number' ? impact.y : NaN;
  if (isFinite(x) && isFinite(y)) {
    var tankHit = shotData && shotData.hit_type === 'tank';
    this.audio.playExplosion();
    this.particles.addExplosion(
      x, y,
      tankHit ? TD.EXPLOSION_RADIUS * 0.8 : TD.EXPLOSION_RADIUS,
      this.terrain.palette
    );
    this._startShake(tankHit ? 7 : 4, tankHit ? 5 : 3);
  }

  for (var i = 0; i < this.tanks.length; i++) {
    if (!this.tanks[i].alive) {
      var t = this.tanks[i];
      this.particles.addTankExplosion(t.x, t.y + t.bodyH / 2);
      this._startShake(8, 5);
      break;
    }
  }
};

/* Finish the brief post-shot explosion. A completed battle navigates to the
   results page; otherwise the engine moves to the server's next turn and the
   existing Online turn enforcement decides whether controls unlock. */
TD.GameEngine.prototype._afterOnlineExplosion = function () {
  this._onlineResolutionPending = false;
  if (this._onlineCompleted) {
    this._onlineCompleted = false;
    this._saveAndNavigate();
    return;
  }
  this.particles.clear();
  this.projectile.deactivate();
  this.state = TD.STATES.TURN_START;
  this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
  this._updateHUD();
  this._saveState();
  this._enableControls(false);
};

/* Restore control state using only the authoritative turn and battle status:
   the local slot's controls come back only when it is (still) their turn, the
   local tank is still alive, and the battle has not been completed/cancelled. */
TD.GameEngine.prototype._restoreOnlineControls = function () {
  var active = false;
  var ctx = this._onlineBattle;
  if (ctx && typeof ctx.localServerSlot === 'number') {
    var status = this._onlineBattleStatus || 'IN_PROGRESS';
    var localAlive =
      this.tanks && this.tanks[ctx.localServerSlot] &&
      this.tanks[ctx.localServerSlot].alive;
    active =
      status === 'IN_PROGRESS' &&
      ctx.localServerSlot === this.currentTurn &&
      localAlive;
  }
  this._enableControls(active && this.state === TD.STATES.AIMING);
};

/* Reconcile a failed resolve (or missing snapshot) by re-reading the battle
   from the server and applying whatever authoritative state exists. Never
   falls back to local projectile physics. */
TD.GameEngine.prototype._reconcileOnlineAfterFailure = function (battleId) {
  var self = this;
  if (typeof TD.getBattle !== 'function') {
    self._restoreOnlineControls();
    self._showOnlineErrorMessage('COULD NOT RECONCILE BATTLE STATE');
    return;
  }
  TD.getBattle(battleId)
    .then(function (json) {
      var battleData = json && json.battle ? json.battle : null;
      if (!battleData) {
        self._restoreOnlineControls();
        self._showOnlineErrorMessage('COULD NOT RECONCILE BATTLE STATE');
        return;
      }
      /* If the fire committed but the resolve never landed, the backend still
         holds our pending_fire — re-issuing the resolve is the correct, safe
         recovery instead of guessing an outcome locally. */
      var state = battleData.battle_state || {};
      var pending = state.pending_fire;
      var ctx = self._onlineBattle;
      if (battleData.status === 'IN_PROGRESS' && pending && ctx &&
          ctx.my_user_id && String(pending.player_id) === String(ctx.my_user_id)) {
        self._onlineFiringInFlight = true;
        self._onlineRequestPhase = 'resolve';
        self._completeOnlineFire(battleId).catch(function (err) {
          self._onlineFiringInFlight = false;
          if (err && err.status === 401) {
            self._handleOnlineAuthError();
            return;
          }
          self._restoreOnlineControls();
          self._showOnlineErrorMessage('COULD NOT RECONCILE BATTLE STATE');
        });
        return;
      }
      self._beginOnlineResolution(battleData, null);
    })
    .catch(function (err) {
      if (err && err.status === 401) {
        self._handleOnlineAuthError();
        return;
      }
      self._restoreOnlineControls();
      self._showOnlineErrorMessage('COULD NOT RECONCILE BATTLE STATE');
    });
};

TD.GameEngine.prototype._showOnlineErrorMessage = function (msg) {
  if (this.el && this.el.gameStatus) {
    this.el.gameStatus.textContent = String(msg).toUpperCase();
  }
  try { console.warn('[ONLINE] ' + msg); } catch (e) { /* console unavailable */ }
};

TD.GameEngine.prototype._handleOnlineAuthError = function () {
  if (typeof TD_clearSession === 'function') {
    try { TD_clearSession(); } catch (e) { /* ignore */ }
  }
  try { localStorage.removeItem('tankDuelPlayerType'); } catch (e) { /* ignore */ }
  TD.clearActiveMatch();
  this.cleanup();
  window.location.href = './login.html';
};

/* =========================
   ONLINE BATTLE POLLING (REMOTE SYNC)
   Only authenticated ONLINE matches poll. Guest and Same Device matches never
   set _onlineBattle, so every guard below is a no-op for them. Polling observes
   the authoritative backend battle_state — it never issues fire/resolve and
   never runs local projectile physics. The shooter's own fire/resolve response
   stays the immediate source of truth; a shot signature prevents replaying the
   same authoritative outcome on every interval.
========================== */

TD.GameEngine.prototype._startOnlinePolling = function () {
  if (!this._isOnlineBattle()) return;
  var ctx = this._onlineBattle;
  if (!ctx || !ctx.battle_id) return;
  if (this._onlinePollingTimer != null) return;

  var self = this;
  this._onlinePollingTimer = setInterval(function () {
    self._pollOnlineBattle();
  }, TD.ONLINE_POLL_INTERVAL_MS || 1700);

  if (typeof window !== 'undefined' && window.addEventListener) {
    this._onOnlinePageUnload = function () { self._stopOnlinePolling(); };
    window.addEventListener('pagehide', this._onOnlinePageUnload);
  }
};

TD.GameEngine.prototype._stopOnlinePolling = function () {
  if (this._onlinePollingTimer != null) {
    clearInterval(this._onlinePollingTimer);
    this._onlinePollingTimer = null;
  }
  this._onlinePollInFlight = false;
  if (this._onOnlinePageUnload && typeof window !== 'undefined') {
    window.removeEventListener('pagehide', this._onOnlinePageUnload);
    this._onOnlinePageUnload = null;
  }
};

TD.GameEngine.prototype._pollOnlineBattle = function () {
  if (!this._isOnlineBattle() || !this.running || this._onlineNavigatedAway) {
    this._stopOnlinePolling();
    return;
  }
  /* While the local player is mid fire/resolve, that direct flow owns the
     authoritative transition; polling must not read race it or replay it. */
  if (this._onlineFiringInFlight) return;
  if (this._onlinePollInFlight) return;

  var ctx = this._onlineBattle;
  if (!ctx || !ctx.battle_id || typeof TD.getBattle !== 'function') return;

  var self = this;
  this._onlinePollInFlight = true;
  TD.getBattle(ctx.battle_id)
    .then(function (json) {
      self._onlinePollInFlight = false;
      var battleData = json && json.battle ? json.battle : null;
      if (!battleData) return;
      self._handleOnlineBattleUpdate(battleData);
    })
    .catch(function (err) {
      self._onlinePollInFlight = false;
      if (err && err.status === 401) {
        self._handleOnlineAuthError();
        return;
      }
      /* The battle no longer exists: stop polling and leave cleanly. */
      if (err && (err.status === 404 || err.status === 410)) {
        self._stopOnlinePolling();
        self._handleOnlineBattleEnded();
        return;
      }
      /* Transient failure: keep the last valid authoritative state. */
    });
};

/* A stable identity for the newest authoritative shot. It is null when no shot
   has been resolved yet, and only changes when the server resolves a NEW shot
   (current_turn and round are folded in so two identical-looking shots cannot
   collide). Not persisted — remote-shot detection is per game-session only. */
TD.GameEngine.prototype._onlineShotSignature = function (battleData) {
  if (!battleData) return null;
  var state = battleData.battle_state;
  var ls = state && state.last_shot;
  if (!ls) return null;
  var im = ls.impact || {};
  return [
    String(ls.player_id || ''),
    ls.angle,
    ls.power,
    String(ls.hit_type || ''),
    im.x,
    im.y,
    String(battleData.current_turn || ''),
    (state.setup && state.setup.round) || ''
  ].join('|');
};

TD.GameEngine.prototype._handleOnlineBattleUpdate = function (battleData) {
  if (!this._isOnlineBattle() || this._onlineNavigatedAway) return;
  if (this._onlineFiringInFlight) return;
  if (!battleData) return;

  var status = battleData.status || '';

  if (status === 'CANCELLED') {
    this._stopOnlinePolling();
    this._handleOnlineBattleEnded();
    return;
  }

  var sig = this._onlineShotSignature(battleData);

  if (sig !== null && sig !== this._lastOnlineShotSignature) {
    /* A genuinely new authoritative shot (typically the opponent's). Apply the
       server result once and play its cosmetic impact — no local physics. */
    this._lastOnlineShotSignature = sig;
    this._beginOnlineResolution(
      battleData,
      battleData.battle_state ? battleData.battle_state.last_shot : null
    );
    return;
  }

  if (status === 'COMPLETED') {
    /* The battle is over. If the shooter's own resolve already began the final
       EXPLODING, let it finish and navigate exactly once; otherwise start it. */
    this._onlineCompleted = true;
    if (this.state !== TD.STATES.EXPLODING && this.state !== TD.STATES.GAME_OVER) {
      this._beginOnlineResolution(
        battleData,
        battleData.battle_state ? battleData.battle_state.last_shot : null
      );
    }
    return;
  }

  /* Same shot (or none): silently observe the resulting authoritative state
     without replaying any visual or state transition. */
  this._applyOnlineBattleState(battleData, null);
  this._updateHUD();
  this._saveState();
  this._restoreOnlineControls();
};

/* Battle is CANCELLED or the battle_id is no longer valid: stop polling, clear
   the local active match and return to the dashboard without a fabricated
   result. */
TD.GameEngine.prototype._handleOnlineBattleEnded = function () {
  this._stopOnlinePolling();
  if (this._onlineNavigatedAway) return;
  this._onlineNavigatedAway = true;
  TD.clearActiveMatch();
  this.cleanup();
  if (typeof window !== 'undefined') window.location.href = './dashboard.html';
};

/* =========================
   INPUT
========================== */

TD.GameEngine.prototype._handleKeyDown = function (e) {
  var GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Escape'];
  if (GAME_KEYS.indexOf(e.code) !== -1) e.preventDefault();

  if (this.keys[e.code]) return;
  this.keys[e.code] = true;

  if (e.code === 'Space') {
    if (this.state === TD.STATES.TURN_START) {
      this.state = TD.STATES.AIMING;
      this.stateTimer = 0;
      this._enableControls(true);
      this._updateHUD();
      this._saveState();
      this.audio.resume();
    } else if (this.state === TD.STATES.AIMING) {
      this.fire();
    }
    return;
  }

  if (e.code === 'Escape') {
    var quitModal = document.getElementById('quit-modal');
    if (quitModal && quitModal.classList.contains('is-open')) {
      var cancelBtn = document.getElementById('cancel-quit-btn');
      if (cancelBtn) cancelBtn.click();
    } else {
      var quitBtn = document.getElementById('quit-game-btn');
      if (quitBtn) quitBtn.click();
    }
    return;
  }

  if (this.state !== TD.STATES.AIMING) return;
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;

  var changed = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    tank.angle = Math.min(TD.ANGLE_MAX, tank.angle + TD.ANGLE_STEP);
    changed = true;
  }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    tank.angle = Math.max(TD.ANGLE_MIN, tank.angle - TD.ANGLE_STEP);
    changed = true;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    tank.power = Math.min(TD.POWER_MAX, tank.power + TD.POWER_STEP);
    changed = true;
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    tank.power = Math.max(TD.POWER_MIN, tank.power - TD.POWER_STEP);
    changed = true;
  }
  if (changed) {
    this._updateHUD();
    this._saveState();
  }
};

TD.GameEngine.prototype._handleKeyUp = function (e) {
  this.keys[e.code] = false;
};

TD.GameEngine.prototype.adjustAngle = function (delta) {
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.angle = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, tank.angle + delta));
  this._updateHUD();
  this._saveState();
};

TD.GameEngine.prototype.adjustPower = function (delta) {
  if (!this._canControl()) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.power = Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, tank.power + delta));
  this._updateHUD();
  this._saveState();
};

/* =========================
   COLLISION / DAMAGE
========================== */

TD.GameEngine.prototype._onTerrainHit = function (x, y) {
  this.projectile.deactivate();
  this.audio.playExplosion();
  this.particles.addExplosion(x, y, TD.EXPLOSION_RADIUS, this.terrain.palette);
  this.terrain.destroy(x, y, TD.EXPLOSION_RADIUS);

  for (var i = 0; i < this.tanks.length; i++) {
    if (!this.tanks[i].alive) continue;
    var t = this.tanks[i];
    var dx = t.x - x;
    var dy = (t.y + t.bodyH / 2) - y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TD.EXPLOSION_RADIUS) {
      var dmg = TD.MAX_DAMAGE * (1 - dist / TD.EXPLOSION_RADIUS);
      dmg = Math.max(TD.MIN_DAMAGE, Math.round(dmg));
      t.takeDamage(dmg);
      this.audio.playHit();
    }
  }

  this._startShake(5, 3);
  this.state = TD.STATES.EXPLODING;
  this.stateTimer = 35;
  this._saveState();
};

TD.GameEngine.prototype._onTankHit = function (tank) {
  this.projectile.deactivate();
  var x = this.projectile.x;
  var y = this.projectile.y;

  this.audio.playExplosion();
  this.particles.addExplosion(x, y, TD.EXPLOSION_RADIUS * 0.8, this.terrain.palette);

  tank.takeDamage(TD.MAX_DAMAGE);

  if (!tank.alive) {
    this.particles.addTankExplosion(tank.x, tank.y + tank.bodyH / 2);
    this._startShake(8, 5);
  } else {
    this.audio.playHit();
    this._startShake(4, 3);
  }

  this.terrain.destroy(x, y, TD.EXPLOSION_RADIUS * 0.6);
  this.state = TD.STATES.EXPLODING;
  this.stateTimer = 35;
  this._saveState();
};

TD.GameEngine.prototype._onProjectileEnd = function () {
  this.projectile.deactivate();
  this.state = TD.STATES.EXPLODING;
  this.stateTimer = 15;
  this._saveState();
};

TD.GameEngine.prototype._afterExplosion = function () {
  for (var i = 0; i < this.tanks.length; i++) {
    this.tanks[i].syncToTerrain(this.terrain);
  }

  var dead = -1;
  for (var i = 0; i < this.tanks.length; i++) {
    if (!this.tanks[i].alive) { dead = i; break; }
  }

  if (dead >= 0) {
    var bothDead = !this.tanks[0].alive && !this.tanks[1].alive;
    this._endRound(bothDead ? this.currentTurn : (dead === 0 ? 1 : 0));
    return;
  }

  this._nextTurn();
};

TD.GameEngine.prototype._nextTurn = function () {
  this.currentTurn = 1 - this.currentTurn;
  this._generateWind();
  this._updateHUD();
  this.state = TD.STATES.TURN_START;
  this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
  this._saveState();
};

TD.GameEngine.prototype._endRound = function (winnerIndex) {
  this.scores[winnerIndex]++;

  if (this.scores[0] > this.maxRounds / 2 || this.scores[1] > this.maxRounds / 2) {
    this.state = TD.STATES.GAME_OVER;
    this.stateTimer = TD.GAME_OVER_DELAY;
    this._saveState();
    return;
  }

  this.round++;
  this.currentTurn = 0;
  this._startNewRound();
};

TD.GameEngine.prototype._startNewRound = function () {
  var seed = Date.now();
  this._terrainSeed = seed;
  this.terrain.generate(this.mapType, seed);
  this._placeTanks();
  this.projectile.deactivate();
  this.particles.clear();
  this._generateWind();
  this._updateHUD();
  this.state = TD.STATES.TURN_START;
  this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
  this._saveState();
};

TD.GameEngine.prototype._startShake = function (intensity, duration) {
  if (this.reducedMotion) return;
  this.shakeIntensity = intensity;
  this.shakeDuration = duration;
};

TD.GameEngine.prototype._saveAndNavigate = function () {
  /* ONLINE matches map server slots to engine indices 0/1, and the local human
     may occupy either slot. For LOCAL/GUEST the engine keeps player 1 = index 0,
     so localSlot 0 reproduces the original behavior exactly. */
  var localSlot = 0;
  if (this._onlineBattle && typeof this._onlineBattle.localServerSlot === 'number') {
    localSlot = this._onlineBattle.localServerSlot;
  }
  var playerWins = this.scores[localSlot] || 0;
  var opponentWins = this.scores[1 - localSlot] || 0;

  var result = 'loss';
  if (playerWins > opponentWins) result = 'win';
  else if (playerWins === opponentWins) result = 'win';

  var localName =
    this.tanks && this.tanks[localSlot] ? this.tanks[localSlot].name : this.playerName;
  var oppTank =
    this.tanks && this.tanks[1 - localSlot] ? this.tanks[1 - localSlot].name : this.opponentName;

  localStorage.setItem('tankDuelLastResult', result);
  localStorage.setItem('tankDuelLastPlayerScore', String(playerWins));
  localStorage.setItem('tankDuelLastOpponentScore', String(opponentWins));
  localStorage.setItem('tankDuelLastPlayerName', localName);
  localStorage.setItem('tankDuelLastOpponentName', oppTank);

  // ONLINE matches are finalised on the server (a later step). A finished
  // online battle is never written into same-device / guest local history and
  // never touches the local win counters — only the result above is shown.
  if (this._online) {
    TD.clearActiveMatch();
    this.cleanup();
    window.location.href = './results.html';
    return;
  }

  var games = Number(localStorage.getItem('tankDuelGames')) || 0;
  var wins = Number(localStorage.getItem('tankDuelWins')) || 0;
  localStorage.setItem('tankDuelGames', String(games + 1));
  if (result === 'win') localStorage.setItem('tankDuelWins', String(wins + 1));

  // Record the completed match in history (only reached when the match
  // actually finishes — never on quit/refresh/interruption). Guest Mode stays
  // 100% local (existing localStorage behavior, untouched). Authenticated
  // same-device matches persist to the backend (public.local_battle), which
  // never updates player_statistics. The keepalive POST finishes even though
  // this method navigates to the results page immediately after.
  var isAuthenticated =
    typeof TD_isAuthenticated === 'function' && TD_isAuthenticated();

  if (isAuthenticated) {
    if (typeof TD.saveLocalBattle === 'function') {
      TD.saveLocalBattle({
        player1_name: this.playerName,
        player2_name: this.opponentName,
        winner: this.scores[0] >= this.scores[1] ? 'PLAYER1' : 'PLAYER2',
        player1_score: this.scores[0],
        player2_score: this.scores[1],
        map: TD.resolveMap(this.mapType),
        rounds: this.maxRounds
      }).catch(function () { /* best-effort history persistence */ });
    }
  } else {
    TD.addLocalMatchToHistory({
      playerOne: this.playerName,
      playerTwo: this.opponentName,
      playerOneScore: this.scores[0],
      playerTwoScore: this.scores[1],
      playerOneColor: findPlayerColorHex(this.playerOneColorId),
      playerTwoColor: findPlayerColorHex(this.playerTwoColorId),
      mapKey: TD.resolveMap(this.mapType),
      rounds: this.maxRounds,
      completedAt: new Date().toISOString()
    });
  }

  TD.clearActiveMatch();

  this.cleanup();
  window.location.href = './results.html';
};

/* =========================
   ACTIVE MATCH PERSISTENCE
========================== */

TD.GameEngine.prototype._saveState = function () {
  if (!this.tanks || this.tanks.length !== 2) return;
  if (!this.terrain || !this.terrain.heights || this.terrain.heights.length !== TD.W) return;

  var saved = {
    version: 1,
    active: true,
    status: 'active',
    online: this._online === true,
    map: this.terrain.type,
    seed: this._terrainSeed || this.terrain._s,
    terrain: this.terrain.heights,
    stars: this.terrain.stars,
    clouds: this.terrain.clouds,
    bgMountains: this.terrain.bgMountains,
    bgHills: this.terrain.bgHills,
    decorations: this.terrain.decorations,
    details: this.terrain.details,
    round: this.round,
    maxRounds: this.maxRounds,
    currentTurn: this.currentTurn,
    scores: [this.scores[0], this.scores[1]],
    wind: this.wind,
    trajectoryTrail: this.trajectoryTrail,
    state: this.state,
    players: {
      player1: {
        name: this.playerName,
        color: this.playerOneColorId,
        x: this.tanks[0].x,
        y: this.tanks[0].y,
        health: this.tanks[0].health,
        angle: this.tanks[0].angle,
        power: this.tanks[0].power
      },
      player2: {
        name: this.opponentName,
        color: this.playerTwoColorId,
        x: this.tanks[1].x,
        y: this.tanks[1].y,
        health: this.tanks[1].health,
        angle: this.tanks[1].angle,
        power: this.tanks[1].power
      }
    }
  };

  if (this._isOnlineBattle()) {
    saved.battle = {
      battle_id: this._onlineBattle.battle_id,
      my_user_id: this._onlineBattle.my_user_id,
      player1_id: this._onlineBattle.player1_id,
      player2_id: this._onlineBattle.player2_id,
      localServerSlot: this._onlineBattle.localServerSlot
    };
  }

  try {
    localStorage.setItem('tankDuelActiveMatch', JSON.stringify(saved));
  } catch (e) { /* storage may be unavailable or full */ }
};

TD.GameEngine.prototype.restore = function (saved, config) {
  config = config || {};
  this.accentColor = config.accentColor || '#ff8933';
  this.reducedMotion = config.reducedMotion || false;
  this._applyMotionPref();

  this.playerName = saved.players.player1.name;
  this.opponentName = saved.players.player2.name;
  this.maxRounds = saved.maxRounds;
  this.mapType = saved.map;
  this.playerOneColorId = saved.players.player1.color;
  this.playerTwoColorId = saved.players.player2.color;
  this.trajectoryTrail = saved.trajectoryTrail !== false;
  this._online = saved.online === true;
  this._onlineBattle = config.onlineBattle || (saved.battle || null);

  this.canvas.width = TD.W;
  this.canvas.height = TD.H;
  this.ctx.imageSmoothingEnabled = false;

  this.audio.init();
  this._preloadBackground(this.mapType);

  this.terrain.restore(saved.map, saved.seed, saved.terrain, saved);

  var p1colors = TD.makeTankColors(findPlayerColorHex(this.playerOneColorId));
  var p2colors = TD.makeTankColors(findPlayerColorHex(this.playerTwoColorId));

  // Local saved games always had player 1 on the left; ONLINE matches may put
  // the local player on either side, so derive the facing from tank positions.
  var dir0 = saved.players.player1.x < saved.players.player2.x ? 1 : -1;

  this.tanks = [
    new TD.Tank(0, this.playerName, saved.players.player1.x, this.terrain, p1colors, dir0),
    new TD.Tank(1, this.opponentName, saved.players.player2.x, this.terrain, p2colors, -dir0)
  ];

  this.tanks[0].x = saved.players.player1.x;
  this.tanks[0].y = saved.players.player1.y;
  this.tanks[0].health = saved.players.player1.health;
  this.tanks[0].maxHealth = TD.MAX_HEALTH;
  this.tanks[0].alive = saved.players.player1.health > 0;
  this.tanks[0].angle = saved.players.player1.angle;
  this.tanks[0].power = saved.players.player1.power;

  this.tanks[1].x = saved.players.player2.x;
  this.tanks[1].y = saved.players.player2.y;
  this.tanks[1].health = saved.players.player2.health;
  this.tanks[1].maxHealth = TD.MAX_HEALTH;
  this.tanks[1].alive = saved.players.player2.health > 0;
  this.tanks[1].angle = saved.players.player2.angle;
  this.tanks[1].power = saved.players.player2.power;

  this.round = saved.round;
  this.scores = [saved.scores[0], saved.scores[1]];
  this.currentTurn = saved.currentTurn;
  this.wind = saved.wind;
  this._terrainSeed = saved.seed;

  this.projectile.deactivate();
  this.particles.clear();

  this._updateHUD();

  if (saved.state === TD.STATES.GAME_OVER) {
    this._saveAndNavigate();
    return;
  }

  document.addEventListener('keydown', this._onKeyDown);
  document.addEventListener('keyup', this._onKeyUp);

  this.running = true;
  this.lastTime = performance.now();

  if (saved.state === TD.STATES.AIMING) {
    this.state = TD.STATES.AIMING;
    this.stateTimer = 0;
  } else if (saved.state === TD.STATES.EXPLODING) {
    this._resolveExplosionOutcome();
  } else {
    this.state = TD.STATES.TURN_START;
    this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
  }

  this._enableControls(this.state === TD.STATES.AIMING);
  this._loop();

  /* Only authenticated ONLINE matches start remote polling; guest/same-device
     games have no _onlineBattle so this is a no-op for them. */
  if (this._isOnlineBattle()) this._startOnlinePolling();
};

TD.GameEngine.prototype._resolveExplosionOutcome = function () {
  for (var i = 0; i < this.tanks.length; i++) {
    this.tanks[i].syncToTerrain(this.terrain);
  }

  var dead = -1;
  for (var i = 0; i < this.tanks.length; i++) {
    if (!this.tanks[i].alive) { dead = i; break; }
  }

  if (dead >= 0) {
    var bothDead = !this.tanks[0].alive && !this.tanks[1].alive;
    this._endRound(bothDead ? this.currentTurn : (dead === 0 ? 1 : 0));
    return;
  }

  this._nextTurn();
};

TD.loadActiveMatch = function () {
  var raw;
  try {
    raw = localStorage.getItem('tankDuelActiveMatch');
  } catch (e) {
    return null;
  }
  if (!raw) return null;

  var s;
  try {
    s = JSON.parse(raw);
  } catch (e) {
    return null;
  }

  if (!s || typeof s !== 'object') return null;
  if (s.version !== 1 || s.active !== true || s.status === 'completed') return null;

  var resolvedMap = TD.resolveMap(s.map);
  if (TD.MAP_KEYS.indexOf(resolvedMap) === -1) return null;
  s.map = resolvedMap;

  var seedNum = Number(s.seed);
  if (!isFinite(seedNum)) return null;
  s.seed = seedNum | 0;

  if (!Array.isArray(s.terrain) || s.terrain.length !== TD.W) return null;
  var heights = s.terrain;
  for (var i = 0; i < TD.W; i++) {
    var h = Number(heights[i]);
    if (!isFinite(h)) return null;
    h = Math.round(h / TD.TERRAIN_STEP) * TD.TERRAIN_STEP;
    heights[i] = Math.max(80, Math.min(TD.H, h));
  }

  var round = Math.round(Number(s.round));
  var maxRounds = Math.round(Number(s.maxRounds));
  if (!isFinite(round) || !isFinite(maxRounds)) return null;
  round = Math.max(1, round);
  maxRounds = Math.max(1, maxRounds);
  if (round > maxRounds) round = maxRounds;
  if (round < 1) round = 1;
  s.round = round;
  s.maxRounds = maxRounds;

  if (!Array.isArray(s.scores) || s.scores.length < 2) return null;
  var score1 = Math.round(Number(s.scores[0]));
  var score2 = Math.round(Number(s.scores[1]));
  if (!isFinite(score1) || !isFinite(score2)) return null;
  s.scores = [Math.max(0, score1), Math.max(0, score2)];

  s.currentTurn = s.currentTurn === 1 ? 1 : 0;

  var wind = Number(s.wind);
  if (!isFinite(wind)) wind = 0;
  s.wind = Math.max(-TD.WIND_ABS_MAX, Math.min(TD.WIND_ABS_MAX, Math.round(wind)));

  var colorIds = {};
  for (var c = 0; c < TD.PLAYER_COLORS.length; c++) {
    colorIds[TD.PLAYER_COLORS[c].id] = true;
  }

  var pls = s.players && typeof s.players === 'object' ? s.players : {};
  var defaults = [
    ['PLAYER', 'orange'],
    ['OPPONENT', 'blue']
  ];
  for (var pi = 0; pi < 2; pi++) {
    var key = 'player' + (pi + 1);
    var stored = pls[key] && typeof pls[key] === 'object' ? pls[key] : {};
    var name = typeof stored.name === 'string' && stored.name.trim()
      ? stored.name.trim().substring(0, 16)
      : defaults[pi][0];
    var color = typeof stored.color === 'string' && colorIds[stored.color] ? stored.color : defaults[pi][1];

    var hp = Math.round(Number(stored.health));
    if (!isFinite(hp)) return null;
    hp = Math.max(0, Math.min(TD.MAX_HEALTH, hp));

    var px = Math.round(Number(stored.x));
    if (!isFinite(px)) return null;
    px = Math.max(20, Math.min(TD.W - 20, px));

    var py = Math.round(Number(stored.y));
    if (!isFinite(py)) return null;
    py = Math.max(0, Math.min(TD.H, py));

    var ang = Math.round(Number(stored.angle));
    if (!isFinite(ang)) return null;
    ang = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, ang));

    var pow = Math.round(Number(stored.power));
    if (!isFinite(pow)) return null;
    pow = Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, pow));

    s.players[key] = {
      name: name,
      color: color,
      x: px,
      y: py,
      health: hp,
      angle: ang,
      power: pow
    };
  }

  s.trajectoryTrail = s.trajectoryTrail !== false;

  var st = s.state;
  s.state = (st === 'aiming' || st === 'turn_start' || st === 'exploding' || st === 'flying' || st === 'game_over')
    ? st
    : 'turn_start';

  var arr = ['stars', 'clouds', 'bgMountains', 'bgHills', 'decorations', 'details'];
  for (var a = 0; a < arr.length; a++) {
    if (!Array.isArray(s[arr[a]])) s[arr[a]] = [];
  }

  return s;
};

TD.clearActiveMatch = function () {
  try {
    localStorage.removeItem('tankDuelActiveMatch');
  } catch (e) { /* ignore */ }
};

function findPlayerColorHex(colorId) {
  for (var i = 0; i < TD.PLAYER_COLORS.length; i++) {
    if (TD.PLAYER_COLORS[i].id === colorId) return TD.PLAYER_COLORS[i].hex;
  }
  return TD.PLAYER_COLORS[0].hex;
}
