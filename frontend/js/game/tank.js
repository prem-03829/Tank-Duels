/* =========================
   TANK
========================== */

var TD = TD || {};

TD.Tank = function (id, name, x, terrain, colors, facing) {
  this.id = id;
  this.name = name;
  this.x = x;
  this.y = 0;
  this.health = TD.MAX_HEALTH;
  this.maxHealth = TD.MAX_HEALTH;
  this.angle = TD.ANGLE_DEFAULT;
  this.power = TD.POWER_DEFAULT;
  this.colors = colors;
  this.alive = true;
  this.facing = facing || 1;
  this.bodyW = 26;
  this.bodyH = 8;
  this.trackW = 28;
  this.trackH = 5;
  this.turretW = 10;
  this.turretH = 6;
  this.cannonLength = 20;
  this.cannonWidth = 3;
  this._placeOnTerrain(terrain);
};

TD.Tank.prototype._placeOnTerrain = function (terrain) {
  this.y = terrain.getHeight(this.x) - this.trackH - this.bodyH - 1;
};

TD.Tank.prototype.syncToTerrain = function (terrain) {
  this.y = terrain.getHeight(this.x) - this.trackH - this.bodyH - 1;
};

TD.Tank.prototype.getCannonTip = function () {
  var pivot = this.getTurretPivot();
  var rad = this.angle * Math.PI / 180;
  return {
    x: pivot.x + Math.cos(rad) * this.cannonLength,
    y: pivot.y - Math.sin(rad) * this.cannonLength
  };
};

TD.Tank.prototype.getTurretPivot = function () {
  return {
    x: this.x,
    y: this.y - 1
  };
};

TD.Tank.prototype.getHitbox = function () {
  return {
    x: this.x - this.trackW / 2,
    y: this.y - this.turretH - 1,
    w: this.trackW,
    h: this.turretH + this.bodyH + this.trackH + 2
  };
};

TD.Tank.prototype.takeDamage = function (amount) {
  this.health = Math.max(0, this.health - Math.round(amount));
  if (this.health <= 0) {
    this.alive = false;
  }
};

TD.Tank.prototype.render = function (ctx) {
  if (!this.alive) return;

  var c = this.colors;
  var cx = Math.round(this.x);
  var by = Math.round(this.y);

  // BODY: mirrored horizontally based on facing direction
  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(this.facing, 1);
  ctx.translate(-cx, 0);

  // Tracks
  ctx.fillStyle = c.tread;
  ctx.fillRect(cx - this.trackW / 2, by + this.bodyH, this.trackW, this.trackH);

  ctx.fillStyle = c.treadLight;
  for (var i = 0; i < 7; i++) {
    var tx = cx - this.trackW / 2 + 1 + i * 4;
    if (tx + 2 > cx + this.trackW / 2) break;
    ctx.fillRect(tx, by + this.bodyH + 1, 2, 3);
  }

  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - this.bodyW / 2, by - 1, this.bodyW, this.bodyH + 2);

  ctx.fillStyle = c.body;
  ctx.fillRect(cx - this.bodyW / 2 + 1, by, this.bodyW - 2, this.bodyH);

  ctx.fillStyle = c.light;
  ctx.fillRect(cx - this.bodyW / 2 + 1, by, this.bodyW - 2, 1);

  // Turret
  var tux = cx - this.turretW / 2;
  var tuy = by - this.turretH + 1;

  ctx.fillStyle = c.dark;
  ctx.fillRect(tux - 1, tuy - 1, this.turretW + 2, this.turretH + 1);

  ctx.fillStyle = c.body;
  ctx.fillRect(tux, tuy, this.turretW, this.turretH);

  ctx.fillStyle = c.light;
  ctx.fillRect(tux, tuy, this.turretW, 1);

  ctx.restore();

  // CANNON: NOT mirrored — driven by aim angle
  var pivot = this.getTurretPivot();
  var rad = this.angle * Math.PI / 180;

  ctx.save();
  ctx.translate(Math.round(pivot.x), Math.round(pivot.y));
  ctx.rotate(-rad);

  ctx.fillStyle = c.dark;
  ctx.fillRect(0, -this.cannonWidth / 2 - 1, this.cannonLength + 1, this.cannonWidth + 2);

  ctx.fillStyle = c.body;
  ctx.fillRect(1, -this.cannonWidth / 2, this.cannonLength - 1, this.cannonWidth);

  ctx.fillStyle = c.light;
  ctx.fillRect(1, -this.cannonWidth / 2, this.cannonLength - 1, 1);

  ctx.restore();
};
