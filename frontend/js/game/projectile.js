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
  this.maxTrail = 20;
};

TD.Projectile.prototype.launch = function (x, y, angle, power, wind) {
  this.x = x;
  this.y = y;
  var rad = angle * Math.PI / 180;
  var speed = (power / 100) * TD.PROJECTILE_SPEED_CAP;
  this.vx = Math.cos(rad) * speed;
  this.vy = -Math.sin(rad) * speed;
  this.active = true;
  this.trail = [];
  this._wind = wind || 0;
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
  for (var i = 0; i < this.trail.length; i++) {
    var t = this.trail[i];
    var alpha = t.life * 0.4;
    ctx.fillStyle = 'rgba(255,180,80,' + alpha + ')';
    ctx.fillRect(Math.round(t.x), Math.round(t.y), 1, 1);
  }

  if (!this.active) return;

  ctx.fillStyle = '#ffe090';
  ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);

  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.round(this.x), Math.round(this.y), 1, 1);
};

TD.Projectile.prototype.deactivate = function () {
  this.active = false;
};
