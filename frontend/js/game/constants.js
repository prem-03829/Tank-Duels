/* =========================
   GAME CONSTANTS
========================== */

var TD = TD || {};

TD.W = 640;
TD.H = 360;

TD.GRAVITY = 0.09;
TD.WIND_MIN = -3;
TD.WIND_MAX = 3;
TD.WIND_ABS_MAX = 4;

TD.MAX_HEALTH = 100;
TD.EXPLOSION_RADIUS = 26;
TD.MAX_DAMAGE = 40;
TD.MIN_DAMAGE = 5;

TD.ANGLE_MIN = 0;
TD.ANGLE_MAX = 180;
TD.ANGLE_STEP = 1;
TD.ANGLE_DEFAULT = 45;

TD.POWER_MIN = 5;
TD.POWER_MAX = 100;
TD.POWER_STEP = 1;
TD.POWER_DEFAULT = 50;
TD.POWER_SCALE = 0.1;

TD.PROJECTILE_RADIUS = 1;
TD.PROJECTILE_SPEED_CAP = 10;

TD.TURN_ANNOUNCE_DURATION = 90;
TD.GAME_OVER_DELAY = 120;

TD.TERRAIN_STEP = 2;

TD.MAP_KEYS = ['dustlands', 'valley', 'frostbite', 'ashhill', 'moonbase', 'canyon'];

TD.MAP_ALIASES = {
  desert: 'dustlands',
  hills: 'valley'
};

TD.MAP_DISPLAY_NAMES = {
  dustlands: 'Dustlands',
  valley: 'Green Valley',
  frostbite: 'Frostbite',
  ashhill: 'Ashfall',
  moonbase: 'Moonbase',
  canyon: 'Canyon'
};

TD.resolveMap = function (key) {
  return TD.MAP_ALIASES[key] || key;
};

TD.MAP_BG = {
  dustlands: '../assets/images/maps/dustlands.png',
  valley:    '../assets/images/maps/green-valley.png',
  frostbite: '../assets/images/maps/frostbite.png',
  ashhill:   '../assets/images/maps/ashfall.png',
  moonbase:  '../assets/images/maps/moonbase.png',
  canyon:    '../assets/images/maps/canyon.png'
};

TD.PALETTES = {
  dustlands: {
    skyTop:    '#1a0f0a',
    skyMid:    '#3a2215',
    skyBot:    '#5a3520',
    stars:     '#4a3525',
    surface:   '#c8956a',
    surfaceHi: '#d8a878',
    mid:       '#8b6340',
    deep:      '#6b4a2d',
    dark:      '#4a3320',
    detail:    '#a07850',
    rock:      '#6b4a2d',
    cloud:     '#3a2818',
    cloudAlpha: 0.15,
    bgFar:     '#2a1a10',
    bgMid:     '#3a2a18',
    bgNear:    '#4a3820',
    treeColor: '#5a4028',
    grassColor:'#8a7048'
  },
  valley: {
    skyTop:    '#0a1828',
    skyMid:    '#182838',
    skyBot:    '#283848',
    stars:     '#203048',
    surface:   '#4a8a3a',
    surfaceHi: '#5a9a48',
    mid:       '#3a6a2a',
    deep:      '#2a5020',
    dark:      '#1a3a15',
    detail:    '#6ab850',
    rock:      '#5a6a40',
    cloud:     '#304858',
    cloudAlpha: 0.12,
    bgFar:     '#1a3020',
    bgMid:     '#2a4830',
    bgNear:    '#3a5a38',
    treeColor: '#2a4a20',
    grassColor:'#5aaa40'
  },
  frostbite: {
    skyTop:    '#0a1020',
    skyMid:    '#182838',
    skyBot:    '#283848',
    stars:     '#304868',
    surface:   '#b8c8d8',
    surfaceHi: '#d0e0f0',
    mid:       '#8898a8',
    deep:      '#607080',
    dark:      '#405060',
    detail:    '#e0e8f0',
    rock:      '#708090',
    cloud:     '#405868',
    cloudAlpha: 0.15,
    bgFar:     '#304058',
    bgMid:     '#405868',
    bgNear:    '#506878',
    treeColor: '#506070',
    grassColor:'#90b0c0'
  },
  ashhill: {
    skyTop:    '#100808',
    skyMid:    '#281010',
    skyBot:    '#401818',
    stars:     '#301515',
    surface:   '#5a4a3a',
    surfaceHi: '#6a5a48',
    mid:       '#4a3a2a',
    deep:      '#3a2a1a',
    dark:      '#2a1a10',
    detail:    '#6a4830',
    rock:      '#3a2a1a',
    cloud:     '#301818',
    cloudAlpha: 0.2,
    bgFar:     '#200c0c',
    bgMid:     '#301818',
    bgNear:    '#402820',
    treeColor: '#3a2010',
    grassColor:'#5a4030',
    lava:      '#cc4420',
    lavaGlow:  '#ff6630'
  },
  moonbase: {
    skyTop:    '#05080f',
    skyMid:    '#0a1020',
    skyBot:    '#101828',
    stars:     '#203050',
    surface:   '#606878',
    surfaceHi: '#788090',
    mid:       '#485060',
    deep:      '#384050',
    dark:      '#283040',
    detail:    '#8890a0',
    rock:      '#505868',
    cloud:     '#182030',
    cloudAlpha: 0.08,
    bgFar:     '#101828',
    bgMid:     '#1a2038',
    bgNear:    '#283048',
    treeColor: '#404858',
    grassColor:'#607080',
    planet:    '#1a2840'
  },
  canyon: {
    skyTop:    '#18101a',
    skyMid:    '#302028',
    skyBot:    '#4a3038',
    stars:     '#382830',
    surface:   '#b07048',
    surfaceHi: '#c08058',
    mid:       '#8a5838',
    deep:      '#6a4028',
    dark:      '#4a3020',
    detail:    '#c08850',
    rock:      '#6a4028',
    cloud:     '#382830',
    cloudAlpha: 0.12,
    bgFar:     '#301820',
    bgMid:     '#482830',
    bgNear:    '#5a3838',
    treeColor: '#5a3820',
    grassColor:'#906848'
  }
};

TD.STATES = {
  SETUP: 'setup',
  TURN_START: 'turn_start',
  AIMING: 'aiming',
  FLYING: 'flying',
  EXPLODING: 'exploding',
  GAME_OVER: 'game_over'
};

TD.TANK_COLORS = [
  { body: '#e07030', dark: '#a04a18', light: '#ff9050', tread: '#3a3530', treadLight: '#5a5548' },
  { body: '#4090b0', dark: '#2a6080', light: '#60b8d8', tread: '#3a3530', treadLight: '#5a5548' }
];

TD.PLAYER_COLORS = [
  { id: 'orange',  hex: '#e07030', name: 'Orange' },
  { id: 'blue',    hex: '#4090b0', name: 'Blue' },
  { id: 'red',     hex: '#c03828', name: 'Red' },
  { id: 'green',   hex: '#3a9850', name: 'Green' },
  { id: 'yellow',  hex: '#d0b030', name: 'Yellow' },
  { id: 'purple',  hex: '#8058b0', name: 'Purple' },
  { id: 'cyan',    hex: '#30a8a8', name: 'Cyan' },
  { id: 'white',   hex: '#c8c0b8', name: 'White' }
];

TD.DEFAULT_PLAYER_NAMES = {
  playerOne: 'Guest',
  playerTwo: 'Opponent'
};

TD.hexToRgb = function (hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
};

TD.rgbToHex = function (r, g, b) {
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

TD.adjustBrightness = function (hex, factor) {
  var rgb = TD.hexToRgb(hex);
  return TD.rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
};

TD.makeTankColors = function (hex) {
  return {
    body: hex,
    dark: TD.adjustBrightness(hex, 0.6),
    light: TD.adjustBrightness(hex, 1.3),
    tread: '#3a3530',
    treadLight: '#5a5548'
  };
};
