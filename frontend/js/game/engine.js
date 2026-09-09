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
  this.mapType = config.mapType || 'dustlands';
  this.playerOneColorId = config.playerOneColor || 'orange';
  this.playerTwoColorId = config.playerTwoColor || 'blue';
  this.trajectoryTrail = config.trajectoryTrail !== false;

  this.canvas.width = TD.W;
  this.canvas.height = TD.H;
  this.ctx.imageSmoothingEnabled = false;

  this.audio.init();

  var seed = Date.now();
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
  this._loop();
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

  // 1. Sky
  this.terrain.renderSky(ctx);

  // 2. Background mountains
  this.terrain.renderBgMountains(ctx);

  // 3. Background hills
  this.terrain.renderBgHills(ctx);

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

  // 10. Active player indicator
  if (this.state === TD.STATES.AIMING) {
    var activeTank = this.tanks[this.currentTurn];
    if (activeTank && activeTank.alive) {
      this._renderActiveIndicator(ctx, activeTank);
    }
  }

  ctx.restore();
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

  ctx.fillStyle = 'rgba(255,255,255,0.2)';

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
          ctx.fillStyle = 'rgba(255,100,50,0.25)';
          ctx.fillRect(ix - 1, Math.round(py) - 1, 3, 2);
          break;
        }
        ctx.fillRect(ix, Math.round(py), 1, 1);
      } else {
        break;
      }
    }
  }
};

TD.GameEngine.prototype._renderActiveIndicator = function (ctx, tank) {
  var pulse = Math.sin(this.frame * 0.12) * 0.3 + 0.7;
  ctx.fillStyle = this.accentColor;
  ctx.globalAlpha = pulse;
  var ix = Math.round(tank.x);
  var iy = Math.round(tank.y - tank.turretH - 22);
  ctx.fillRect(ix - 1, iy, 2, 3);
  ctx.fillRect(ix - 2, iy + 3, 4, 1);
  ctx.globalAlpha = 1;
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

  for (var i = 0; i < this.tanks.length; i++) {
    var tank = this.tanks[i];
    var overlay = this.el['tankOverlay' + i];
    if (!overlay) continue;

    if (!tank.alive) {
      overlay.style.opacity = '0';
      continue;
    }
    overlay.style.opacity = '1';

    var px = tank.x * scaleX;
    var py = (tank.y - tank.turretH - 20) * scaleY;
    overlay.style.left = px + 'px';
    overlay.style.top = py + 'px';

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
    windEl.textContent = arrow + ' ' + absW;
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
    this.el.turnLabel.style.color = this.currentTurn === 0 ? '#ff8050' : '#50a0ff';
  }

  var tank = this.tanks[this.currentTurn];
  if (tank) {
    if (this.el.angleValue) this.el.angleValue.textContent = tank.angle + '\u00B0';
    if (this.el.powerValue) this.el.powerValue.textContent = tank.power + '%';
    if (this.el.angleSlider) this.el.angleSlider.value = tank.angle;
    if (this.el.powerSlider) this.el.powerSlider.value = tank.power;
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
  if (this.el.angleSlider) this.el.angleSlider.disabled = !enabled;
  if (this.el.powerSlider) this.el.powerSlider.disabled = !enabled;
};

TD.GameEngine.prototype.setAngle = function (value) {
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.angle = Math.max(TD.ANGLE_MIN, Math.min(TD.ANGLE_MAX, Math.round(value)));
  this._updateHUD();
};

TD.GameEngine.prototype.setPower = function (value) {
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.power = Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, Math.round(value)));
  this._updateHUD();
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
  this.projectile.launch(tip.x, tip.y, tank.angle, tank.power, this.wind);

  this.state = TD.STATES.FLYING;
  this._updateHUD();
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
  if (changed) this._updateHUD();
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
};

TD.GameEngine.prototype.adjustPower = function (delta) {
  if (this.state !== TD.STATES.AIMING) return;
  var tank = this.tanks[this.currentTurn];
  if (!tank) return;
  tank.power = Math.max(TD.POWER_MIN, Math.min(TD.POWER_MAX, tank.power + delta));
  this._updateHUD();
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
};

TD.GameEngine.prototype._onProjectileEnd = function () {
  this.projectile.deactivate();
  this.state = TD.STATES.EXPLODING;
  this.stateTimer = 15;
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
};

TD.GameEngine.prototype._endRound = function (winnerIndex) {
  this.scores[winnerIndex]++;

  if (this.scores[0] > this.maxRounds / 2 || this.scores[1] > this.maxRounds / 2) {
    this.state = TD.STATES.GAME_OVER;
    this.stateTimer = TD.GAME_OVER_DELAY;
    return;
  }

  this.round++;
  this.currentTurn = 0;
  this._startNewRound();
};

TD.GameEngine.prototype._startNewRound = function () {
  var seed = Date.now();
  this.terrain.generate(this.mapType, seed);
  this._placeTanks();
  this.projectile.deactivate();
  this.particles.clear();
  this._generateWind();
  this._updateHUD();
  this.state = TD.STATES.TURN_START;
  this.stateTimer = TD.TURN_ANNOUNCE_DURATION;
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

  var games = Number(localStorage.getItem('tankDuelGames')) || 0;
  var wins = Number(localStorage.getItem('tankDuelWins')) || 0;
  localStorage.setItem('tankDuelGames', String(games + 1));
  if (result === 'win') localStorage.setItem('tankDuelWins', String(wins + 1));

  this.cleanup();
  window.location.href = './results.html';
};

function findPlayerColorHex(colorId) {
  for (var i = 0; i < TD.PLAYER_COLORS.length; i++) {
    if (TD.PLAYER_COLORS[i].id === colorId) return TD.PLAYER_COLORS[i].hex;
  }
  return TD.PLAYER_COLORS[0].hex;
}
