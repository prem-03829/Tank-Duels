/* =========================
   PARTICLE SYSTEM
========================== */

var TD = TD || {};

TD.ParticleSystem = function () {
  this.particles = [];
  this.maxParticles = 300;
};

TD.ParticleSystem.prototype.addExplosion = function (cx, cy, radius, palette) {
  var count = 22;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.5 + Math.random() * 2.5;
    var life = 14 + Math.random() * 20;
    var colors = ['#ff6030', '#ffaa30', '#ffe060', '#fff8e0', '#ff4020'];
    this.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.8,
      life: life, maxLife: life,
      size: 1 + Math.floor(Math.random() * 3),
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  var debrisCount = 10;
  var dc = palette ? palette.mid : '#6b4a2d';
  for (var i = 0; i < debrisCount; i++) {
    var angle = -Math.PI * 0.1 - Math.random() * Math.PI * 0.8;
    var speed = 1 + Math.random() * 3;
    var life = 18 + Math.random() * 28;
    this.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: Math.sin(angle) * speed,
      life: life, maxLife: life,
      size: 1 + Math.floor(Math.random() * 2),
      color: dc
    });
  }

  var smokeCount = 8;
  for (var i = 0; i < smokeCount; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.2 + Math.random() * 0.6;
    var life = 22 + Math.random() * 18;
    this.particles.push({
      x: cx + (Math.random() - 0.5) * radius * 0.4,
      y: cy + (Math.random() - 0.5) * radius * 0.2,
      vx: Math.cos(angle) * speed,
      vy: -0.3 - Math.random() * 0.5,
      life: life, maxLife: life,
      size: 2, color: 'smoke'
    });
  }
};

TD.ParticleSystem.prototype.addTankExplosion = function (x, y) {
  var count = 30;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.5 + Math.random() * 3.5;
    var life = 18 + Math.random() * 28;
    var colors = ['#ff3020', '#ff6030', '#ffaa30', '#ffe060', '#222', '#444'];
    this.particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 7,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      life: life, maxLife: life,
      size: 1 + Math.floor(Math.random() * 3),
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
};

TD.ParticleSystem.prototype.addBiomeAmbient = function (biome, W, H, heights) {
  if (this.particles.length > this.maxParticles * 0.6) return;

  var x, y, vx, vy, life, size, color;

  switch (biome) {
    case 'frostbite':
      x = Math.random() * W;
      y = -2;
      vx = -0.2 + Math.random() * 0.4;
      vy = 0.3 + Math.random() * 0.4;
      life = 80 + Math.random() * 60;
      size = 1;
      color = '#d0e0f0';
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
      break;

    case 'ashhill':
      if (Math.random() > 0.5) {
        x = Math.random() * W;
        y = H * 0.3 + Math.random() * H * 0.3;
        vx = 0.1 + Math.random() * 0.3;
        vy = -0.15 - Math.random() * 0.2;
        life = 60 + Math.random() * 40;
        size = 1;
        color = '#ff6630';
        this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
      } else {
        x = Math.random() * W;
        y = H * 0.2 + Math.random() * H * 0.2;
        vx = -0.1 + Math.random() * 0.2;
        vy = -0.1 - Math.random() * 0.15;
        life = 50 + Math.random() * 40;
        size = 1;
        color = '#666';
        this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: 'smoke' });
      }
      break;

    case 'dustlands':
      x = Math.random() * W;
      var idx = Math.floor(x);
      y = (idx >= 0 && idx < heights.length) ? heights[idx] - 3 : H * 0.6;
      vx = 0.3 + Math.random() * 0.5;
      vy = -0.1;
      life = 40 + Math.random() * 30;
      size = 1;
      color = '#a08060';
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
      break;

    case 'moonbase':
      x = Math.random() * W;
      y = H + 2;
      vx = -0.05 + Math.random() * 0.1;
      vy = -0.15 - Math.random() * 0.1;
      life = 100 + Math.random() * 80;
      size = 1;
      color = '#607080';
      this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
      break;

    default:
      break;
  }
};

TD.ParticleSystem.prototype.update = function () {
  for (var i = this.particles.length - 1; i >= 0; i--) {
    var p = this.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.color !== 'smoke') p.vy += 0.02;
    p.life -= 1;
    if (p.life <= 0) this.particles.splice(i, 1);
  }
  if (this.particles.length > this.maxParticles) {
    this.particles.splice(0, this.particles.length - this.maxParticles);
  }
};

TD.ParticleSystem.prototype.render = function (ctx) {
  for (var i = 0; i < this.particles.length; i++) {
    var p = this.particles[i];
    var alpha = Math.max(0, p.life / p.maxLife);
    if (p.color === 'smoke') {
      var gray = Math.round(40 + (1 - alpha) * 30);
      ctx.fillStyle = 'rgba(' + gray + ',' + gray + ',' + gray + ',' + (alpha * 0.3) + ')';
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
};

TD.ParticleSystem.prototype.clear = function () {
  this.particles = [];
};
