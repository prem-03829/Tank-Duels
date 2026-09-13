/* =========================
   PROJECTILE
========================== */

var TD = TD || {};

TD.Projectile = function () {
  this.x = 0;
  this.y = 0;
  this.vx = 0;
  this.vy = 0;
  this.active = false;
  this.trail = [];
  this.maxTrail = 26;
  /* Accent palette from the FIRING player's selected tank color. Falls back
     to the default orange only if launch is never given colors. */
  this._colors = { body: '#e07030', dark: '#a04a18', light: '#ff9050' };
  this._bodyRGB = '224,112,48';
};

TD.Projectile.prototype.launch = function (x, y, angle, power, wind, colors) {
  this.x = x;
  this.y = y;
  var rad = angle * Math.PI / 180;
  var speed = (power / 100) * TD.PROJECTILE_SPEED_CAP;
  this.vx = Math.cos(rad) * speed;
  this.vy = -Math.sin(rad) * speed;
  this.active = true;
  this.trail = [];
  this._wind = wind || 0;

  if (colors && colors.body) {
    this._colors = colors;
    var rgb = TD.hexToRgb(colors.body);
    this._bodyRGB = rgb.r + ',' + rgb.g + ',' + rgb.b;
  }
};

TD.Projectile.prototype.update = function () {
  if (!this.active) return false;

  this.trail.push({ x: this.x, y: this.y, life: 1.0 });
  if (this.trail.length > this.maxTrail) {
    this.trail.shift();
  }

  this.vx += this._wind * 0.008;
  this.vy += TD.GRAVITY;

  this.x += this.vx;
  this.y += this.vy;

  for (var i = 0; i < this.trail.length; i++) {
    this.trail[i].life -= 0.05;
  }
  while (this.trail.length > 0 && this.trail[0].life <= 0) {
    this.trail.shift();
  }

  if (this.x < -30 || this.x > TD.W + 30 || this.y > TD.H + 30) {
    this.active = false;
    this.trail = [];
    return true;
  }

  return false;
};

TD.Projectile.prototype.checkTerrainHit = function (terrain) {
  if (!this.active) return false;
  var ix = Math.round(this.x);
  if (ix < 0 || ix >= TD.W) return false;
  return this.y >= terrain.getHeight(ix);
};

TD.Projectile.prototype.checkTankHit = function (tank) {
  if (!this.active || !tank.alive) return false;
  var hb = tank.getHitbox();
  return (
    this.x >= hb.x &&
    this.x <= hb.x + hb.w &&
    this.y >= hb.y &&
    this.y <= hb.y + hb.h
  );
};

TD.Projectile.prototype.render = function (ctx) {
  /* Fire trail: pixel-art particles on the projectile's ACTUAL previous
     positions. Oldest points are smaller and dimmer, and each one gets a dark
     backing so it stays visible against both bright and dark skies. Uses the
     firing player's tank color; never the aiming-assist palette. */
  for (var i = 0; i < this.trail.length; i++) {
    var t = this.trail[i];
    var life = t.life;
    if (life <= 0) continue;

    var px = Math.round(t.x);
    var py = Math.round(t.y);
    var size = life > 0.7 ? 2 : 1;

    var backingAlpha = (life * 0.8).toFixed(3);
    ctx.fillStyle = 'rgba(5,5,5,' + backingAlpha + ')';
    ctx.fillRect(px - 1, py - 1, size + 2, size + 2);

    var accentAlpha = (life * 0.75).toFixed(3);
    ctx.fillStyle = 'rgba(' + this._bodyRGB + ',' + accentAlpha + ')';
    ctx.fillRect(px, py, size, size);
  }

  if (!this.active) return;

  /* Projectile core: small pixel-art shell with a 1px dark outline, the
     player's tank-color body, a bright highlight and a white-hot center so it
     reads clearly against every background. */
  var cx = Math.round(this.x);
  var cy = Math.round(this.y);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(cx - 2, cy - 2, 5, 5);

  ctx.fillStyle = this._colors.body;
  ctx.fillRect(cx - 1, cy - 1, 3, 3);

  ctx.fillStyle = this._colors.light;
  ctx.fillRect(cx - 1, cy - 1, 2, 2);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(cx, cy, 1, 1);
};

TD.Projectile.prototype.deactivate = function () {
  this.active = false;
  this.trail = [];
};
