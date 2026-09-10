/* =========================
   TERRAIN
========================== */

var TD = TD || {};

TD.Terrain = function () {
  this.heights = [];
  this.palette = TD.PALETTES.dustlands;
  this.type = 'dustlands';
  this.details = [];
  this.decorations = [];
  this.clouds = [];
  this.bgMountains = [];
  this.bgHills = [];
  this.stars = [];
};

TD.Terrain.prototype.seed = function (s) {
  this._s = s | 0;
};

TD.Terrain.prototype.rng = function () {
  this._s = this._s + 0x6D2B79F5 | 0;
  var t = Math.imul(this._s ^ this._s >>> 15, 1 | this._s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

TD.Terrain.prototype.generate = function (type, mapSeed) {
  var resolved = TD.resolveMap(type);
  if (TD.MAP_KEYS.indexOf(resolved) === -1) resolved = 'dustlands';

  this.type = resolved;
  this.palette = TD.PALETTES[resolved];
  this.seed(mapSeed);
  this._surfaceSeed = this._s + 200;

  this._generateHeights(resolved);
  this._generateStars();
  this._generateClouds();
  this._generateBgMountains(resolved);
  this._generateBgHills(resolved);
  this._generateDecorations(resolved);
  this._generateDetails(resolved);
};

/* =========================
   BIOME TERRAIN GENERATION
========================== */

TD.Terrain.prototype._generateHeights = function (biome) {
  var W = TD.W;
  var H = TD.H;
  var step = TD.TERRAIN_STEP;
  this.heights = new Array(W);

  var baseY, layers;

  switch (biome) {
    case 'dustlands':
      baseY = Math.round(H * 0.77);
      layers = [
        { amp: 14, freq: 0.008, phase: this.rng() * 6.28 },
        { amp: 7,  freq: 0.022, phase: this.rng() * 6.28 },
        { amp: 3,  freq: 0.055, phase: this.rng() * 6.28 },
        { amp: 1,  freq: 0.12,  phase: this.rng() * 6.28 }
      ];
      break;

    case 'valley':
      baseY = Math.round(H * 0.76);
      layers = [
        { amp: 16, freq: 0.012, phase: this.rng() * 6.28 },
        { amp: 9,  freq: 0.028, phase: this.rng() * 6.28 },
        { amp: 4,  freq: 0.06,  phase: this.rng() * 6.28 },
        { amp: 2,  freq: 0.14,  phase: this.rng() * 6.28 }
      ];
      break;

    case 'frostbite':
      baseY = Math.round(H * 0.78);
      layers = [
        { amp: 12, freq: 0.01,  phase: this.rng() * 6.28 },
        { amp: 6,  freq: 0.025, phase: this.rng() * 6.28 },
        { amp: 3,  freq: 0.06,  phase: this.rng() * 6.28 },
        { amp: 1,  freq: 0.13,  phase: this.rng() * 6.28 }
      ];
      break;

    case 'ashhill':
      baseY = Math.round(H * 0.75);
      layers = [
        { amp: 12, freq: 0.015, phase: this.rng() * 6.28 },
        { amp: 8,  freq: 0.035, phase: this.rng() * 6.28 },
        { amp: 5,  freq: 0.07,  phase: this.rng() * 6.28 },
        { amp: 2,  freq: 0.15,  phase: this.rng() * 6.28 }
      ];
      break;

    case 'moonbase':
      baseY = Math.round(H * 0.78);
      layers = [
        { amp: 10, freq: 0.01,  phase: this.rng() * 6.28 },
        { amp: 5,  freq: 0.03,  phase: this.rng() * 6.28 },
        { amp: 3,  freq: 0.07,  phase: this.rng() * 6.28 },
        { amp: 2,  freq: 0.16,  phase: this.rng() * 6.28 }
      ];
      break;

    case 'canyon':
      baseY = Math.round(H * 0.74);
      layers = [
        { amp: 14, freq: 0.014, phase: this.rng() * 6.28 },
        { amp: 10, freq: 0.032, phase: this.rng() * 6.28 },
        { amp: 6,  freq: 0.065, phase: this.rng() * 6.28 },
        { amp: 3,  freq: 0.14,  phase: this.rng() * 6.28 }
      ];
      break;

    default:
      baseY = Math.round(H * 0.77);
      layers = [
        { amp: 14, freq: 0.008, phase: 0 },
        { amp: 7,  freq: 0.022, phase: 1.3 }
      ];
  }

  for (var x = 0; x < W; x++) {
    var y = baseY;
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      y += l.amp * Math.sin(l.freq * x + l.phase);
    }
    y = Math.round(y / step) * step;
    y = Math.max(80, Math.min(H - 10, y));
    this.heights[x] = y;
  }
};

/* =========================
   BACKGROUND GENERATION
========================== */

TD.Terrain.prototype._generateStars = function () {
  this.stars = [];
  this.seed(this._s + 7);
  var count = 25 + Math.floor(this.rng() * 20);
  for (var i = 0; i < count; i++) {
    this.stars.push({
      x: Math.floor(this.rng() * TD.W),
      y: Math.floor(this.rng() * (TD.H * 0.35)),
      s: this.rng() > 0.85 ? 2 : 1,
      b: 0.3 + this.rng() * 0.7
    });
  }
};

TD.Terrain.prototype._generateClouds = function () {
  this.clouds = [];
  this.seed(this._s + 13);
  var count = 3 + Math.floor(this.rng() * 4);
  for (var i = 0; i < count; i++) {
    this.clouds.push({
      x: Math.floor(this.rng() * TD.W),
      y: 15 + Math.floor(this.rng() * 50),
      w: 30 + Math.floor(this.rng() * 60),
      h: 3 + Math.floor(this.rng() * 3)
    });
  }
};

TD.Terrain.prototype._generateBgMountains = function (biome) {
  this.bgMountains = [];
  this.seed(this._s + 31);
  var W = TD.W;
  var peaks = 4 + Math.floor(this.rng() * 4);
  var baseY = TD.H * 0.42;
  var maxH = 50 + Math.floor(this.rng() * 35);

  var pts = [];
  for (var i = 0; i <= peaks * 4; i++) {
    var x = (i / (peaks * 4)) * W;
    var y = baseY - Math.abs(Math.sin(i * 0.8 + this.rng() * 2)) * maxH * (0.5 + this.rng() * 0.5);
    pts.push({ x: x, y: y });
  }

  for (var i = 0; i < pts.length - 1; i++) {
    var p1 = pts[i];
    var p2 = pts[i + 1];
    this.bgMountains.push({
      x1: p1.x, y1: p1.y,
      x2: p2.x, y2: p2.y
    });
  }
};

TD.Terrain.prototype._generateBgHills = function (biome) {
  this.bgHills = [];
  this.seed(this._s + 47);
  var W = TD.W;
  var count = 6 + Math.floor(this.rng() * 5);
  var baseY = TD.H * 0.48;

  for (var i = 0; i < count; i++) {
    var cx = this.rng() * W;
    var w = 40 + this.rng() * 80;
    var h = 15 + this.rng() * 30;
    this.bgHills.push({
      x: cx - w / 2,
      y: baseY + 10,
      w: w,
      h: h
    });
  }
};

/* =========================
   DECORATION GENERATION
========================== */

TD.Terrain.prototype._generateDecorations = function (biome) {
  this.decorations = [];
  this.seed(this._s + 61);
  var W = TD.W;

  var count;
  switch (biome) {
    case 'dustlands':
      count = 12 + Math.floor(this.rng() * 8);
      break;
    case 'valley':
      count = 18 + Math.floor(this.rng() * 10);
      break;
    case 'frostbite':
      count = 10 + Math.floor(this.rng() * 6);
      break;
    case 'ashhill':
      count = 14 + Math.floor(this.rng() * 8);
      break;
    case 'moonbase':
      count = 8 + Math.floor(this.rng() * 6);
      break;
    case 'canyon':
      count = 10 + Math.floor(this.rng() * 7);
      break;
    default:
      count = 8;
  }

  for (var i = 0; i < count; i++) {
    var x = Math.floor(this.rng() * (W - 40)) + 20;
    var h = this.heights[Math.min(x, W - 1)];
    var kind = this._pickDeco(biome);
    this.decorations.push({
      x: x,
      y: h,
      type: kind,
      size: 1 + Math.floor(this.rng() * 2)
    });
  }
};

TD.Terrain.prototype._pickDeco = function (biome) {
  var r = this.rng();
  switch (biome) {
    case 'dustlands':
      if (r < 0.3) return 'rock';
      if (r < 0.5) return 'cactus';
      if (r < 0.7) return 'shrub';
      return 'stone';
    case 'valley':
      if (r < 0.25) return 'tree';
      if (r < 0.45) return 'bush';
      if (r < 0.65) return 'rock';
      if (r < 0.8) return 'grass';
      return 'flower';
    case 'frostbite':
      if (r < 0.3) return 'ice';
      if (r < 0.55) return 'rock';
      if (r < 0.75) return 'snowshrub';
      return 'icechunk';
    case 'ashhill':
      if (r < 0.35) return 'darkrock';
      if (r < 0.55) return 'ember';
      if (r < 0.75) return 'volrock';
      return 'skull';
    case 'moonbase':
      if (r < 0.3) return 'moonrock';
      if (r < 0.5) return 'crystal';
      if (r < 0.7) return 'antenna';
      return 'dish';
    case 'canyon':
      if (r < 0.35) return 'boulder';
      if (r < 0.55) return 'shrub';
      if (r < 0.75) return 'spire';
      return 'stone';
    default:
      return 'rock';
  }
};

TD.Terrain.prototype._generateDetails = function (biome) {
  this.details = [];
  this.seed(this._s + 77);
  var W = TD.W;
  var count = 50 + Math.floor(this.rng() * 30);
  var p = this.palette;

  for (var i = 0; i < count; i++) {
    var x = Math.floor(this.rng() * W);
    var h = this.heights[x];
    if (h <= 0 || h >= TD.H) continue;

    var r = this.rng();
    switch (biome) {
      case 'dustlands':
        if (r < 0.25) {
          this.details.push({ x: x, y: h - 1, w: 1 + Math.floor(this.rng() * 2), h: 1, color: p.rock });
        } else if (r < 0.45) {
          this.details.push({ x: x, y: h - 2, w: 1, h: 2, color: p.grassColor });
        } else if (r < 0.6) {
          this.details.push({ x: x, y: h - 1, w: 2, h: 1, color: p.surfaceHi });
        } else {
          this.details.push({ x: x, y: h + 2 + Math.floor(this.rng() * 4), w: 1, h: 1, color: p.detail });
        }
        break;

      case 'valley':
        if (r < 0.2) {
          this.details.push({ x: x, y: h - 3, w: 1, h: 3, color: p.detail });
        } else if (r < 0.4) {
          this.details.push({ x: x, y: h - 2, w: 2, h: 1, color: p.grassColor });
        } else if (r < 0.55) {
          this.details.push({ x: x, y: h - 1, w: 3, h: 1, color: p.surfaceHi });
        } else if (r < 0.7) {
          this.details.push({ x: x, y: h - 4, w: 1, h: 4, color: p.detail });
          this.details.push({ x: x - 1, y: h - 5, w: 3, h: 2, color: p.grassColor });
        } else {
          this.details.push({ x: x, y: h + 3 + Math.floor(this.rng() * 5), w: 2, h: 1, color: p.rock });
        }
        break;

      case 'frostbite':
        if (r < 0.25) {
          this.details.push({ x: x, y: h - 1, w: 2, h: 1, color: p.surfaceHi });
        } else if (r < 0.45) {
          this.details.push({ x: x, y: h - 2, w: 3, h: 2, color: p.detail });
        } else if (r < 0.6) {
          this.details.push({ x: x, y: h - 1, w: 1, h: 2, color: p.rock });
        } else if (r < 0.75) {
          this.details.push({ x: x, y: h - 3, w: 2, h: 3, color: p.surface });
        } else {
          this.details.push({ x: x, y: h + 2 + Math.floor(this.rng() * 4), w: 1, h: 1, color: p.mid });
        }
        break;

      case 'ashhill':
        if (r < 0.2) {
          this.details.push({ x: x, y: h - 2, w: 2, h: 2, color: p.dark });
        } else if (r < 0.4) {
          this.details.push({ x: x, y: h - 1, w: 1, h: 1, color: p.lava || '#cc4420' });
        } else if (r < 0.55) {
          this.details.push({ x: x, y: h - 1, w: 3, h: 1, color: p.rock });
        } else if (r < 0.7) {
          this.details.push({ x: x, y: h + 3 + Math.floor(this.rng() * 5), w: 2, h: 1, color: p.dark });
        } else {
          this.details.push({ x: x, y: h - 2, w: 1, h: 2, color: p.detail });
        }
        break;

      case 'moonbase':
        if (r < 0.2) {
          this.details.push({ x: x, y: h - 1, w: 2, h: 1, color: p.detail });
        } else if (r < 0.4) {
          this.details.push({ x: x, y: h - 2, w: 1, h: 2, color: p.rock });
        } else if (r < 0.55) {
          this.details.push({ x: x, y: h - 1, w: 3, h: 1, color: p.surfaceHi });
        } else if (r < 0.7) {
          this.details.push({ x: x, y: h + 2 + Math.floor(this.rng() * 4), w: 2, h: 1, color: p.mid });
        } else {
          this.details.push({ x: x, y: h - 3, w: 2, h: 2, color: p.dark });
        }
        break;

      case 'canyon':
        if (r < 0.2) {
          this.details.push({ x: x, y: h - 1, w: 2, h: 1, color: p.surfaceHi });
        } else if (r < 0.4) {
          this.details.push({ x: x, y: h - 2, w: 1, h: 2, color: p.rock });
        } else if (r < 0.55) {
          this.details.push({ x: x, y: h + 2 + Math.floor(this.rng() * 6), w: 3, h: 1, color: p.mid });
        } else if (r < 0.7) {
          this.details.push({ x: x, y: h - 1, w: 1, h: 1, color: p.detail });
        } else {
          this.details.push({ x: x, y: h + 4 + Math.floor(this.rng() * 4), w: 2, h: 1, color: p.dark });
        }
        break;

      default:
        this.details.push({ x: x, y: h - 1, w: 1 + Math.floor(this.rng() * 2), h: 1, color: p.rock });
    }
  }
};

/* =========================
   HEIGHT ACCESS
========================== */

TD.Terrain.prototype.getHeight = function (x) {
  var ix = Math.round(x);
  if (ix < 0) return TD.H;
  if (ix >= TD.W) return TD.H;
  return this.heights[ix];
};

TD.Terrain.prototype.destroy = function (cx, cy, radius) {
  var r = Math.ceil(radius);
  var x0 = Math.max(0, Math.floor(cx - r));
  var x1 = Math.min(TD.W - 1, Math.ceil(cx + r));
  var step = TD.TERRAIN_STEP;

  for (var x = x0; x <= x1; x++) {
    var dx = x - cx;
    if (Math.abs(dx) > r) continue;
    var craterDepth = Math.sqrt(r * r - dx * dx) * 0.6;
    var craterBottom = cy + craterDepth;
    if (this.heights[x] < craterBottom) {
      this.heights[x] = Math.min(TD.H, Math.round(craterBottom / step) * step);
    }
  }
};

/* =========================
   RENDERING
========================== */

TD.Terrain.prototype.renderSky = function (ctx) {
  var p = this.palette;
  var H = TD.H;
  var W = TD.W;
  var bandH = Math.ceil(H / 4);

  ctx.fillStyle = p.skyTop;
  ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = p.skyMid;
  ctx.fillRect(0, bandH, W, bandH);
  ctx.fillStyle = p.skyBot;
  ctx.fillRect(0, bandH * 2, W, H - bandH * 2);

  for (var i = 0; i < this.stars.length; i++) {
    var st = this.stars[i];
    ctx.fillStyle = 'rgba(255,255,255,' + st.b + ')';
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }

  ctx.fillStyle = p.cloud;
  ctx.globalAlpha = p.cloudAlpha || 0.12;
  for (var c = 0; c < this.clouds.length; c++) {
    var cl = this.clouds[c];
    ctx.fillRect(cl.x, cl.y, cl.w, cl.h);
    ctx.fillRect(cl.x + 6, cl.y - Math.floor(cl.h * 0.6), cl.w - 12, cl.h);
    ctx.fillRect(cl.x + 3, cl.y + cl.h, cl.w - 6, Math.max(1, cl.h - 1));
  }
  ctx.globalAlpha = 1;

  if (this.type === 'moonbase') {
    this._renderPlanet(ctx);
  }
};

TD.Terrain.prototype.renderBackground = function (ctx, img) {
  var W = TD.W;
  var H = TD.H;
  var imgW = img.naturalWidth;
  var imgH = img.naturalHeight;
  if (!imgW || !imgH) return;

  var imgAspect = imgW / imgH;
  var canvasAspect = W / H;
  var drawW, drawH, drawX, drawY;

  if (imgAspect > canvasAspect) {
    drawH = H;
    drawW = Math.round(H * imgAspect);
    drawX = Math.round((W - drawW) / 2);
    drawY = 0;
  } else {
    drawW = W;
    drawH = Math.round(W / imgAspect);
    drawX = 0;
    drawY = H - drawH;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
};

TD.Terrain.prototype._renderPlanet = function (ctx) {
  var p = this.palette;
  var px = Math.round(TD.W * 0.82);
  var py = Math.round(TD.H * 0.18);
  var r = 18;

  ctx.fillStyle = p.planet;
  for (var dy = -r; dy <= r; dy++) {
    var rowW = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(px - rowW, py + dy, rowW * 2, 1);
  }

  ctx.fillStyle = p.bgNear;
  ctx.globalAlpha = 0.3;
  for (var dy = -r; dy <= r * 0.3; dy++) {
    var rowW = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(px - rowW, py + dy, rowW, 1);
  }
  ctx.globalAlpha = 1;
};

TD.Terrain.prototype.renderBgMountains = function (ctx) {
  var p = this.palette;
  ctx.fillStyle = p.bgFar;
  for (var i = 0; i < this.bgMountains.length; i++) {
    var m = this.bgMountains[i];
    var x1 = Math.round(m.x1);
    var x2 = Math.round(m.x2);
    var y1 = Math.round(m.y1);
    var y2 = Math.round(m.y2);
    if (x2 <= x1) continue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, TD.H);
    ctx.lineTo(x1, TD.H);
    ctx.closePath();
    ctx.fill();
  }
};

TD.Terrain.prototype.renderBgHills = function (ctx) {
  var p = this.palette;
  ctx.fillStyle = p.bgMid;
  for (var i = 0; i < this.bgHills.length; i++) {
    var h = this.bgHills[i];
    var hx = Math.round(h.x);
    var hw = Math.round(h.w);
    var hh = Math.round(h.h);
    for (var dx = 0; dx < hw; dx++) {
      var frac = dx / hw;
      var hillY = h.y - Math.sin(frac * Math.PI) * hh;
      ctx.fillRect(hx + dx, Math.round(hillY), 1, TD.H - Math.round(hillY));
    }
  }
};

TD.Terrain.prototype.renderTerrain = function (ctx) {
  var p = this.palette;
  var h = this.heights;
  var W = TD.W;
  var H = TD.H;

  for (var x = 0; x < W; x++) {
    var sy = h[x];
    if (sy >= H) continue;

    var depth = H - sy;

    var leftH = x > 0 ? h[x - 1] : sy;
    var rightH = x < W - 1 ? h[x + 1] : sy;
    var slopeL = sy - leftH;
    var slopeR = sy - rightH;

    var base = p.dark;
    var deep = p.deep;
    var mid = p.mid;
    var surf = p.surface;
    var hi = p.surfaceHi;
    var det = p.detail;
    var rock = p.rock;

    ctx.fillStyle = base;
    ctx.fillRect(x, sy + 10, 1, depth - 10 > 0 ? depth - 10 : 0);

    ctx.fillStyle = deep;
    ctx.fillRect(x, sy + 7, 1, 3);

    ctx.fillStyle = mid;
    ctx.fillRect(x, sy + 3, 1, 4);

    ctx.fillStyle = surf;
    ctx.fillRect(x, sy, 1, 3);

    ctx.fillStyle = hi;
    ctx.fillRect(x, sy, 1, 1);

    if (slopeL > 2) {
      ctx.fillStyle = mid;
      ctx.fillRect(x, sy + 1, 1, 3);
      ctx.fillStyle = hi;
      ctx.fillRect(x, sy, 1, 1);
    }
    if (slopeR > 2) {
      ctx.fillStyle = hi;
      ctx.fillRect(x, sy + 1, 1, 1);
    }
  }

  this._renderTerrainLayers(ctx);

  this._renderTerrainSurfaceTexture(ctx);

  for (var d = 0; d < this.details.length; d++) {
    var det = this.details[d];
    ctx.fillStyle = det.color;
    ctx.fillRect(det.x, det.y, det.w, det.h);
  }
};

TD.Terrain.prototype._renderTerrainLayers = function (ctx) {
  var p = this.palette;
  var h = this.heights;
  var W = TD.W;
  var H = TD.H;
  this.seed(this._s + 150);

  switch (this.type) {
    case 'dustlands':
      for (var i = 0; i < 50; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.3) {
          ctx.fillStyle = p.rock;
          var ly = sy + 4 + Math.floor(this.rng() * Math.min(depth - 6, 12));
          var lw = 2 + Math.floor(this.rng() * 4);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.deep;
          var ly = sy + 6 + Math.floor(this.rng() * Math.min(depth - 8, 16));
          var lw = 3 + Math.floor(this.rng() * 5);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.mid;
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 8));
          ctx.fillRect(x, ly, 1 + Math.floor(this.rng() * 2), 1);
        } else {
          ctx.fillStyle = p.surface;
          var ly = sy + 1 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, 1, 1);
        }
      }
      for (var i = 0; i < 15; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 12) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 10 + Math.floor(this.rng() * (H - sy - 12));
        ctx.fillRect(x, ry, 2 + Math.floor(this.rng() * 3), 2);
      }
      break;

    case 'valley':
      for (var i = 0; i < 55; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.25) {
          ctx.fillStyle = p.rock;
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 10));
          var lw = 2 + Math.floor(this.rng() * 4);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.45) {
          ctx.fillStyle = p.deep;
          var ly = sy + 5 + Math.floor(this.rng() * Math.min(depth - 7, 14));
          var lw = 3 + Math.floor(this.rng() * 5);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.65) {
          ctx.fillStyle = p.mid;
          var ly = sy + 2 + Math.floor(this.rng() * Math.min(depth - 4, 7));
          ctx.fillRect(x, ly, 1 + Math.floor(this.rng() * 3), 1);
        } else {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(x, sy + 1, 1, 1);
        }
      }
      for (var i = 0; i < 12; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 10) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 8 + Math.floor(this.rng() * (H - sy - 10));
        ctx.fillRect(x, ry, 2 + Math.floor(this.rng() * 3), 2);
      }
      break;

    case 'frostbite':
      for (var i = 0; i < 45; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.25) {
          ctx.fillStyle = p.surfaceHi;
          var ly = sy + 1 + Math.floor(this.rng() * 3);
          var lw = 2 + Math.floor(this.rng() * 4);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.rock;
          var ly = sy + 4 + Math.floor(this.rng() * Math.min(depth - 6, 10));
          var lw = 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.mid;
          var ly = sy + 5 + Math.floor(this.rng() * Math.min(depth - 7, 12));
          ctx.fillRect(x, ly, 2, 1);
        } else {
          ctx.fillStyle = p.detail;
          var ly = sy + 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, 1, 1);
        }
      }
      for (var i = 0; i < 10; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 10) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 8 + Math.floor(this.rng() * (H - sy - 10));
        ctx.fillRect(x, ry, 2, 2);
      }
      break;

    case 'ashhill':
      for (var i = 0; i < 50; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.2) {
          ctx.fillStyle = p.dark;
          var ly = sy + 4 + Math.floor(this.rng() * Math.min(depth - 6, 14));
          var lw = 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, lw, 2);
        } else if (rr < 0.4) {
          ctx.fillStyle = p.rock;
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 10));
          var lw = 3 + Math.floor(this.rng() * 4);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.6) {
          ctx.fillStyle = p.mid;
          var ly = sy + 2 + Math.floor(this.rng() * Math.min(depth - 4, 8));
          ctx.fillRect(x, ly, 2, 1);
        } else if (rr < 0.75) {
          ctx.fillStyle = p.lava || '#cc4420';
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 10));
          ctx.fillRect(x, ly, 1, 1);
        } else {
          ctx.fillStyle = p.deep;
          ctx.fillRect(x, sy + 6 + Math.floor(this.rng() * 4), 2, 1);
        }
      }
      for (var i = 0; i < 8; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 8) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 6 + Math.floor(this.rng() * (H - sy - 8));
        ctx.fillRect(x, ry, 2 + Math.floor(this.rng() * 2), 2);
      }
      break;

    case 'moonbase':
      for (var i = 0; i < 40; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.25) {
          ctx.fillStyle = p.rock;
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 10));
          var lw = 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.mid;
          var ly = sy + 4 + Math.floor(this.rng() * Math.min(depth - 6, 10));
          var lw = 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.dark;
          var ly = sy + 6 + Math.floor(this.rng() * Math.min(depth - 8, 8));
          ctx.fillRect(x, ly, 3, 1);
        } else {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(x, sy + 1, 1, 1);
        }
      }
      for (var i = 0; i < 8; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 8) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 6 + Math.floor(this.rng() * (H - sy - 8));
        ctx.fillRect(x, ry, 2, 2);
      }
      break;

    case 'canyon':
      for (var i = 0; i < 50; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H) continue;
        var rr = this.rng();
        var depth = H - sy;
        if (rr < 0.2) {
          ctx.fillStyle = p.rock;
          var ly = sy + 3 + Math.floor(this.rng() * Math.min(depth - 5, 12));
          var lw = 2 + Math.floor(this.rng() * 4);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.4) {
          ctx.fillStyle = p.mid;
          var ly = sy + 4 + Math.floor(this.rng() * Math.min(depth - 6, 14));
          var lw = 3 + Math.floor(this.rng() * 5);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.6) {
          ctx.fillStyle = p.deep;
          var ly = sy + 2 + Math.floor(this.rng() * Math.min(depth - 4, 10));
          var lw = 2 + Math.floor(this.rng() * 3);
          ctx.fillRect(x, ly, lw, 1);
        } else if (rr < 0.8) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(x, sy + 1, 1 + Math.floor(this.rng() * 2), 1);
        } else {
          ctx.fillStyle = p.dark;
          ctx.fillRect(x, sy + 8 + Math.floor(this.rng() * 4), 2, 1);
        }
      }
      for (var i = 0; i < 12; i++) {
        var x = Math.floor(this.rng() * W);
        var sy = h[x];
        if (sy >= H || H - sy < 10) continue;
        ctx.fillStyle = p.dark;
        var ry = sy + 8 + Math.floor(this.rng() * (H - sy - 10));
        ctx.fillRect(x, ry, 2 + Math.floor(this.rng() * 2), 2);
      }
      break;
  }
};

TD.Terrain.prototype._renderTerrainSurfaceTexture = function (ctx) {
  var p = this.palette;
  var h = this.heights;
  var W = TD.W;
  var H = TD.H;
  this.seed(this._surfaceSeed || 42);

  switch (this.type) {
    case 'dustlands':
      for (var i = 0; i < 45; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.3) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy - 1, 1, 1);
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 2), 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 3), 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 2 + Math.floor(this.rng() * 3), 1, 1);
        } else {
          ctx.fillStyle = p.detail;
          ctx.fillRect(sx, sy + 1 + Math.floor(this.rng() * 4), 1, 1);
        }
      }
      break;

    case 'valley':
      for (var i = 0; i < 40; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.3) {
          ctx.fillStyle = p.detail;
          ctx.fillRect(sx, sy - 1, 1, 1);
          if (this.rng() > 0.5) ctx.fillRect(sx + 1, sy - 2, 1, 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 3), 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy + 2 + Math.floor(this.rng() * 3), 1 + Math.floor(this.rng() * 2), 1);
        } else {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 1, 1, 1);
        }
      }
      break;

    case 'frostbite':
      for (var i = 0; i < 40; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.35) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 3), 1);
        } else if (rr < 0.55) {
          ctx.fillStyle = p.detail;
          ctx.fillRect(sx, sy - 1, 1, 1);
        } else if (rr < 0.75) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy + 2 + Math.floor(this.rng() * 3), 1, 1);
        } else {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 1 + Math.floor(this.rng() * 2), 1, 1);
        }
      }
      break;

    case 'ashhill':
      for (var i = 0; i < 45; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.25) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 2), 1);
        } else if (rr < 0.45) {
          ctx.fillStyle = p.lava || '#cc4420';
          ctx.fillRect(sx, sy + 1 + Math.floor(this.rng() * 4), 1, 1);
        } else if (rr < 0.65) {
          ctx.fillStyle = p.dark;
          ctx.fillRect(sx, sy + 2 + Math.floor(this.rng() * 3), 2, 1);
        } else {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 1, 1, 1);
        }
      }
      break;

    case 'moonbase':
      for (var i = 0; i < 35; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.3) {
          ctx.fillStyle = p.detail;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 2), 1);
        } else if (rr < 0.55) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy + 1 + Math.floor(this.rng() * 3), 2, 1);
        } else if (rr < 0.75) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(sx, sy, 1, 1);
        } else {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 2, 1, 1);
        }
      }
      break;

    case 'canyon':
      for (var i = 0; i < 45; i++) {
        var sx = Math.floor(this.rng() * W);
        var sy = h[sx];
        if (sy >= H) continue;
        var rr = this.rng();
        if (rr < 0.25) {
          ctx.fillStyle = p.rock;
          ctx.fillRect(sx, sy + 1 + Math.floor(this.rng() * 4), 2 + Math.floor(this.rng() * 3), 1);
        } else if (rr < 0.5) {
          ctx.fillStyle = p.mid;
          ctx.fillRect(sx, sy + 2 + Math.floor(this.rng() * 3), 2, 1);
        } else if (rr < 0.7) {
          ctx.fillStyle = p.surfaceHi;
          ctx.fillRect(sx, sy, 1 + Math.floor(this.rng() * 2), 1);
        } else {
          ctx.fillStyle = p.deep;
          ctx.fillRect(sx, sy + 4 + Math.floor(this.rng() * 4), 2, 1);
        }
      }
      break;
  }
};

TD.Terrain.prototype.renderDecorations = function (ctx) {
  var p = this.palette;
  for (var i = 0; i < this.decorations.length; i++) {
    var d = this.decorations[i];
    var dx = d.x;
    var dy = d.y;
    switch (d.type) {
      case 'rock':
        ctx.fillStyle = p.rock;
        ctx.fillRect(dx - 2, dy - 2, 5, 3);
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        break;
      case 'stone':
        ctx.fillStyle = p.rock;
        ctx.fillRect(dx - 1, dy - 1, 3, 2);
        break;
      case 'cactus':
        ctx.fillStyle = '#3a6a2a';
        ctx.fillRect(dx, dy - 6, 2, 7);
        ctx.fillRect(dx - 2, dy - 5, 2, 2);
        ctx.fillRect(dx + 2, dy - 4, 2, 2);
        break;
      case 'shrub':
        ctx.fillStyle = p.grassColor;
        ctx.fillRect(dx - 2, dy - 2, 5, 2);
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        break;
      case 'tree':
        ctx.fillStyle = p.treeColor;
        ctx.fillRect(dx - 1, dy - 8, 2, 9);
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx - 4, dy - 14, 9, 6);
        ctx.fillRect(dx - 3, dy - 15, 7, 2);
        ctx.fillRect(dx - 2, dy - 16, 5, 2);
        break;
      case 'bush':
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx - 3, dy - 3, 7, 3);
        ctx.fillRect(dx - 2, dy - 4, 5, 1);
        break;
      case 'grass':
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx, dy - 3, 1, 3);
        ctx.fillRect(dx + 2, dy - 2, 1, 2);
        ctx.fillRect(dx - 1, dy - 2, 1, 2);
        break;
      case 'flower':
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx, dy - 2, 1, 2);
        ctx.fillStyle = '#d060a0';
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        break;
      case 'ice':
        ctx.fillStyle = p.surfaceHi;
        ctx.fillRect(dx - 2, dy - 4, 5, 5);
        ctx.fillRect(dx - 1, dy - 5, 3, 1);
        ctx.fillStyle = p.surface;
        ctx.fillRect(dx - 1, dy - 3, 3, 3);
        break;
      case 'icechunk':
        ctx.fillStyle = p.surface;
        ctx.fillRect(dx - 1, dy - 2, 4, 3);
        ctx.fillRect(dx, dy - 3, 2, 1);
        break;
      case 'snowshrub':
        ctx.fillStyle = p.mid;
        ctx.fillRect(dx - 2, dy - 2, 5, 2);
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        break;
      case 'darkrock':
        ctx.fillStyle = p.dark;
        ctx.fillRect(dx - 2, dy - 3, 5, 4);
        ctx.fillRect(dx - 1, dy - 4, 3, 1);
        break;
      case 'ember':
        ctx.fillStyle = '#cc4420';
        ctx.fillRect(dx, dy - 1, 1, 1);
        ctx.fillStyle = '#ff6630';
        ctx.fillRect(dx + 1, dy - 2, 1, 1);
        break;
      case 'volrock':
        ctx.fillStyle = p.rock;
        ctx.fillRect(dx - 2, dy - 2, 5, 3);
        ctx.fillStyle = '#cc4420';
        ctx.fillRect(dx, dy - 1, 1, 1);
        break;
      case 'skull':
        ctx.fillStyle = '#c0b8a8';
        ctx.fillRect(dx - 1, dy - 2, 3, 2);
        ctx.fillRect(dx - 2, dy - 3, 5, 1);
        break;
      case 'moonrock':
        ctx.fillStyle = p.mid;
        ctx.fillRect(dx - 2, dy - 2, 5, 3);
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        break;
      case 'crystal':
        ctx.fillStyle = '#80c0e0';
        ctx.fillRect(dx, dy - 4, 1, 5);
        ctx.fillRect(dx - 1, dy - 3, 3, 1);
        ctx.fillRect(dx - 1, dy - 2, 3, 1);
        break;
      case 'antenna':
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx, dy - 8, 1, 9);
        ctx.fillStyle = '#cc3333';
        ctx.fillRect(dx - 1, dy - 9, 3, 1);
        break;
      case 'dish':
        ctx.fillStyle = p.detail;
        ctx.fillRect(dx, dy - 4, 1, 5);
        ctx.fillRect(dx - 2, dy - 5, 5, 1);
        ctx.fillRect(dx - 1, dy - 6, 3, 1);
        break;
      case 'boulder':
        ctx.fillStyle = p.rock;
        ctx.fillRect(dx - 3, dy - 3, 7, 4);
        ctx.fillRect(dx - 2, dy - 4, 5, 1);
        ctx.fillStyle = p.mid;
        ctx.fillRect(dx - 2, dy - 2, 5, 2);
        break;
      case 'spire':
        ctx.fillStyle = p.mid;
        ctx.fillRect(dx, dy - 10, 2, 11);
        ctx.fillRect(dx - 1, dy - 8, 4, 1);
        ctx.fillRect(dx - 1, dy - 5, 4, 1);
        break;
    }
  }
};
