document.addEventListener("DOMContentLoaded", () => {
  applySavedAccentColor();
  applyReducedMotion();
});

/* =========================
   ACCENT COLOR
========================= */

function applySavedAccentColor() {
  const savedColor = localStorage.getItem("tankDuelAccentColor") || "orange";

  const savedCustomColor = localStorage.getItem("tankDuelCustomColor");

  const colors = {
    orange: {
      primary: "#ff8933",
      light: "#ffad70",
    },

    blue: {
      primary: "#4da3ff",
      light: "#85c1ff",
    },

    green: {
      primary: "#57c785",
      light: "#85e0a8",
    },

    purple: {
      primary: "#a878ff",
      light: "#c4a3ff",
    },
  };

  const root = document.documentElement;

  /* =========================
     CUSTOM COLOR
  ========================= */

  if (savedColor === "custom" && savedCustomColor) {
    root.style.setProperty("--color-primary", savedCustomColor);

    root.style.setProperty(
      "--color-primary-light",
      lightenColor(savedCustomColor, 25),
    );

    return;
  }

  /* =========================
     PRESET COLORS
  ========================= */

  const selected = colors[savedColor] || colors.orange;

  root.style.setProperty("--color-primary", selected.primary);

  root.style.setProperty("--color-primary-light", selected.light);
}

/* =========================
   LIGHTEN COLOR
========================= */

function lightenColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));

  g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));

  b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* =========================
   REDUCED MOTION
========================= */

function applyReducedMotion() {
  const reducedMotion =
    localStorage.getItem("tankDuelReducedMotion") === "true";

  document.body.classList.toggle("reduced-motion", reducedMotion);
}
