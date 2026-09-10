/* =========================
   AUDIO MANAGER
========================== */

var TD = TD || {};

TD.AudioManager = function () {
  this.ctx = null;
  this.enabled = true;
  this.initialized = false;
};

TD.AudioManager.prototype.init = function () {
  this.enabled = localStorage.getItem('tankDuelSound') !== 'false';
  if (!this.enabled) return;
  try {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.initialized = true;
  } catch (e) {
    this.enabled = false;
  }
};

TD.AudioManager.prototype.resume = function () {
  if (this.ctx && this.ctx.state === 'suspended') {
    this.ctx.resume();
  }
};

TD.AudioManager.prototype.playNoise = function (duration, freq, rampDown, volume) {
  if (!this.enabled || !this.ctx) return;
  this.resume();
  var ctx = this.ctx;
  var sr = ctx.sampleRate;
  var len = Math.floor(sr * duration);
  var buf = ctx.createBuffer(1, len, sr);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  var src = ctx.createBufferSource();
  src.buffer = buf;
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + rampDown);
  var filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.1, 20), ctx.currentTime + rampDown);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(ctx.currentTime);
  src.stop(ctx.currentTime + duration);
};

TD.AudioManager.prototype.playShoot = function () {
  this.playNoise(0.15, 800, 0.12, 0.18);
  this.playTone(220, 0.08, 0.12);
};

TD.AudioManager.prototype.playExplosion = function () {
  this.playNoise(0.4, 300, 0.35, 0.25);
  this.playTone(60, 0.2, 0.18);
};

TD.AudioManager.prototype.playHit = function () {
  this.playNoise(0.1, 1200, 0.08, 0.12);
};

TD.AudioManager.prototype.playTone = function (freq, dur, vol) {
  if (!this.enabled || !this.ctx) return;
  this.resume();
  var ctx = this.ctx;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur);
};
