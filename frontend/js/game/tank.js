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
  var OUT = '#0c0c0b';
  var TIRE = '#2a2a26';
  var BTIRE = '#53534a';

  var cx = Math.round(this.x);
  var by = Math.round(this.y);
  var bt = by + this.bodyH;

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(this.facing, 1);
  ctx.translate(-cx, 0);

  // ===== TRACKS (facing right, mirrored for Player 2) =====

  // Ground contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(cx - 15, bt + 6, 30, 1);

  // Belt outline block with stepped front / rear skirts
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 14, bt, 28, 6);
  ctx.fillRect(cx - 16, bt + 1, 2, 4);
  ctx.fillRect(cx + 14, bt + 1, 2, 4);

  // Belt main plate
  ctx.fillStyle = c.tread;
  ctx.fillRect(cx - 14, bt + 1, 28, 4);

  // Track link segments (top and bottom rows)
  ctx.fillStyle = '#171715';
  for (var ti = 0; ti < 24; ti += 3) {
    ctx.fillRect(cx - 12 + ti, bt + 2, 1, 1);
    ctx.fillRect(cx - 11 + ti, bt + 4, 1, 1);
  }

  // Road wheels seated inside the belt
  var wheelXs = [-8, -4, 0, 4, 8];
  for (var w = 0; w < wheelXs.length; w++) {
    var wx = cx + wheelXs[w];
    ctx.fillStyle = TIRE;
    ctx.fillRect(wx - 1, bt + 1, 3, 3);
    ctx.fillStyle = c.treadLight;
    ctx.fillRect(wx, bt + 2, 1, 1);
    ctx.fillStyle = BTIRE;
    ctx.fillRect(wx - 1, bt + 1, 3, 1);
    ctx.fillStyle = OUT;
    if (w % 2 === 0) {
      ctx.fillRect(wx - 1, bt + 3, 2, 1);
    } else {
      ctx.fillRect(wx, bt + 3, 2, 1);
    }
  }

  // Rear idler wheel
  ctx.fillStyle = TIRE;
  ctx.fillRect(cx - 13, bt + 1, 2, 3);
  ctx.fillStyle = c.treadLight;
  ctx.fillRect(cx - 12, bt + 2, 1, 1);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 13, bt + 3, 1, 1);

  // Front drive sprocket (raised over the belt)
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 10, bt, 3, 4);
  ctx.fillStyle = c.tread;
  ctx.fillRect(cx + 11, bt, 1, 4);
  ctx.fillStyle = BTIRE;
  ctx.fillRect(cx + 11, bt + 1, 1, 1);

  // Belt rails (top highlight + bottom shadow) wrap over wheels
  ctx.fillStyle = c.treadLight;
  ctx.fillRect(cx - 12, bt + 1, 24, 1);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 14, bt + 5, 28, 1);

  // ===== HULL =====

  // Hull silhouette outline
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 13, by, 26, this.bodyH);

  // Lower hull (darker underside)
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 13, by + 5, 26, 2);

  // Side armor plate with light top edge
  ctx.fillStyle = c.body;
  ctx.fillRect(cx - 12, by + 2, 24, 3);
  ctx.fillStyle = c.light;
  ctx.fillRect(cx - 11, by + 2, 22, 1);

  // Side plate bolts
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 9, by + 3, 1, 1);
  ctx.fillRect(cx - 4, by + 3, 1, 1);
  ctx.fillRect(cx + 1, by + 3, 1, 1);
  ctx.fillRect(cx + 6, by + 3, 1, 1);

  // Rear engine deck with vents
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 13, by, 7, 3);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 12, by + 1, 5, 1);
  ctx.fillRect(cx - 12, by + 2, 3, 1);

  // Upper deck (turret platform)
  ctx.fillStyle = c.body;
  ctx.fillRect(cx - 5, by, 11, 3);
  ctx.fillStyle = c.light;
  ctx.fillRect(cx - 5, by, 11, 1);

  // Glacis slope — stepped angled front armor
  ctx.fillStyle = c.body;
  ctx.fillRect(cx + 6, by + 1, 7, 1);
  ctx.fillRect(cx + 7, by + 2, 6, 1);
  ctx.fillRect(cx + 8, by + 3, 5, 1);
  ctx.fillRect(cx + 9, by + 4, 4, 1);
  ctx.fillRect(cx + 10, by + 5, 3, 1);
  ctx.fillRect(cx + 11, by + 6, 2, 1);

  // Glacis top edge highlight
  ctx.fillStyle = c.light;
  ctx.fillRect(cx + 7, by + 1, 5, 1);

  // Deck / glacis seam
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx + 5, by + 1, 1, 3);

  // Side skirt armoring the top of the tracks
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 13, by + 7, 26, 1);

  // ===== TURRET =====

  // Turret ring
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 5, by, 11, 1);

  // Turret silhouette outline (angled front, curved rear)
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 6, by - 6, 12, 7);

  // Dome body rows
  ctx.fillStyle = c.body;
  ctx.fillRect(cx - 3, by - 6, 6, 1);
  ctx.fillRect(cx - 4, by - 5, 8, 1);
  ctx.fillRect(cx - 5, by - 4, 10, 1);
  ctx.fillRect(cx - 6, by - 3, 12, 3);

  // Roof edge highlight
  ctx.fillStyle = c.light;
  ctx.fillRect(cx - 4, by - 5, 4, 1);
  ctx.fillRect(cx - 3, by - 6, 5, 1);

  // Rear decklight column
  ctx.fillStyle = c.light;
  ctx.fillRect(cx - 6, by - 2, 1, 2);

  // Front / underside shadow
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx + 5, by - 3, 1, 3);
  ctx.fillRect(cx - 5, by - 1, 10, 1);

  // Commander's hatch cupola
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 3, by - 7, 3, 1);
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 3, by - 7, 2, 1);
  ctx.fillStyle = c.light;
  ctx.fillRect(cx - 3, by - 7, 1, 1);

  // Side vent grille
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx - 4, by - 2, 2, 1);
  ctx.fillRect(cx - 4, by - 1, 2, 1);

  // Cannon mantlet housing
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 3, by - 3, 3, 4);
  ctx.fillStyle = c.dark;
  ctx.fillRect(cx + 4, by - 3, 2, 3);
  ctx.fillStyle = c.light;
  ctx.fillRect(cx + 4, by - 3, 1, 1);

  ctx.restore();

  // ===== CANNON (rotates independently around the fixed pivot) =====

  var pivot = this.getTurretPivot();
  var rad = this.angle * Math.PI / 180;

  ctx.save();
  ctx.translate(Math.round(pivot.x), Math.round(pivot.y));
  ctx.rotate(-rad);

  // Breech / mantlet base
  ctx.fillStyle = OUT;
  ctx.fillRect(-3, -2, 3, 5);
  ctx.fillStyle = c.dark;
  ctx.fillRect(-2, -1, 2, 3);

  // Barrel outline
  ctx.fillStyle = OUT;
  ctx.fillRect(-1, -2, this.cannonLength - 2, 5);

  // Barrel breech section
  ctx.fillStyle = c.dark;
  ctx.fillRect(1, -1, 4, 3);

  // Barrel main tube — cylindrical 3-tone shading
  ctx.fillStyle = c.body;
  ctx.fillRect(3, -1, this.cannonLength - 6, 3);
  ctx.fillStyle = c.light;
  ctx.fillRect(3, -1, this.cannonLength - 6, 1);
  ctx.fillStyle = c.dark;
  ctx.fillRect(3, 1, this.cannonLength - 6, 1);

  // Thermal sleeve ribs
  ctx.fillStyle = c.dark;
  ctx.fillRect(6, -2, 1, 5);
  ctx.fillRect(11, -2, 1, 5);

  // Muzzle brake
  ctx.fillStyle = OUT;
  ctx.fillRect(this.cannonLength - 3, -2, 5, 5);
  ctx.fillStyle = c.dark;
  ctx.fillRect(this.cannonLength - 2, -1, 3, 3);
  ctx.fillStyle = c.light;
  ctx.fillRect(this.cannonLength - 2, -1, 2, 1);

  // Muzzle opening
  ctx.fillStyle = OUT;
  ctx.fillRect(this.cannonLength, -1, 1, 2);

  ctx.restore();
};
