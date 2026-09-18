document.addEventListener("DOMContentLoaded", () => {
  applySavedAccentColor();
  applyReducedMotion();
  initPasswordToggles();
});

/* =========================
   PASSWORD TOGGLE
========================= */

function initPasswordToggles(rootElement = document) {
  const eyeIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffIconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  const passwordInputs = (rootElement || document).querySelectorAll(
    'input[type="password"]',
  );

  passwordInputs.forEach((input) => {
    // Avoid double wrapping if already initialized
    if (
      input.parentElement &&
      input.parentElement.classList.contains("password-input-wrapper")
    ) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "password-input-wrapper";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "password-toggle-btn";
    toggleBtn.setAttribute("aria-label", "Show password");
    toggleBtn.innerHTML = eyeIconSvg;

    // Insert wrapper before input, move input inside wrapper, append toggle button
    if (input.parentNode) {
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      wrapper.appendChild(toggleBtn);
    }

    toggleBtn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      toggleBtn.setAttribute(
        "aria-label",
        isPassword ? "Hide password" : "Show password",
      );
      toggleBtn.innerHTML = isPassword ? eyeOffIconSvg : eyeIconSvg;
    });
  });
}

window.TD_initPasswordToggles = initPasswordToggles;

// Automatically observe for dynamically added password fields in the DOM
if (typeof MutationObserver !== "undefined") {
  const observer = new MutationObserver(() => {
    initPasswordToggles();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/* =========================
   ACCENT COLOR
========================= */

function applySavedAccentColor() {
  const savedColor = localStorage.getItem("tankDuelsAccentColor") || "orange";

  const savedCustomColor = localStorage.getItem("tankDuelsCustomColor");

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
    localStorage.getItem("tankDuelsReducedMotion") === "true";

  document.body.classList.toggle("reduced-motion", reducedMotion);
}
