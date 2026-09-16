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
        this._afterExplosion();
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
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.angle = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, Math.round(value)));
  this._updateHUD();
  this._saveState();
};

TD.GameEngine.prototype.setPower = function (value) {
  if (this.state !== TD.STATES.AIMING) return;
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
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank || !tank.alive) return;

  this._enableControls(false);
  this.audio.playShoot();

  var tip = tank.getCannonTip();
  this.projectile.launch(tip.x, tip.y, tank.angle, tank.power, this.wind, tank.colors);

  this.state = TD.STATES.FLYING;
  this._updateHUD();
  this._saveState();
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
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.angle = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, tank.angle + delta));
  this._updateHUD();
  this._saveState();
};

TD.GameEngine.prototype.adjustPower = function (delta) {
  if (this.state !== TD.STATES.AIMING) return;
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
  var playerWins = this.scores[0];
  var opponentWins = this.scores[1];

  var result = 'loss';
  if (playerWins > opponentWins) result = 'win';
  else if (playerWins === opponentWins) result = 'win';

  localStorage.setItem('tankDuelLastResult', result);
  localStorage.setItem('tankDuelLastPlayerScore', String(playerWins));
  localStorage.setItem('tankDuelLastOpponentScore', String(opponentWins));
  localStorage.setItem('tankDuelLastPlayerName', this.playerName);
  localStorage.setItem('tankDuelLastOpponentName', this.opponentName);

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
