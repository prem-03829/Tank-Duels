document.addEventListener("DOMContentLoaded", () => {
  const colorOptions = document.querySelectorAll(".color-option");
  const customColorPicker = document.querySelector("#custom-color-picker");

  const soundToggle = document.querySelector("#sound-toggle");
  const motionToggle = document.querySelector("#motion-toggle");

  // =========================
  // ACCENT COLOR
  // =========================

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

  const savedColor = localStorage.getItem("tankDuelAccentColor") || "orange";

  const savedCustomColor =
    localStorage.getItem("tankDuelCustomColor") || "#ff8933";

  if (savedColor === "custom") {
    applyAccentColor(savedCustomColor);
    setActiveColor("custom");

    if (customColorPicker) {
      customColorPicker.value = savedCustomColor;
    }
  } else {
    applyPresetColor(savedColor);
    setActiveColor(savedColor);
  }

  colorOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const selectedColor = option.dataset.color;

      if (selectedColor === "custom") {
        customColorPicker?.click();
        return;
      }

      localStorage.setItem("tankDuelAccentColor", selectedColor);

      applyPresetColor(selectedColor);
      setActiveColor(selectedColor);
    });
  });

  // =========================
  // CUSTOM COLOR
  // =========================

  customColorPicker?.addEventListener("input", (event) => {
    const selectedColor = event.target.value;

    localStorage.setItem("tankDuelAccentColor", "custom");
    localStorage.setItem("tankDuelCustomColor", selectedColor);

    applyAccentColor(selectedColor);
    setActiveColor("custom");

    updateCustomSwatch(selectedColor);
  });

  // Restore custom swatch appearance

  if (savedColor === "custom") {
    updateCustomSwatch(savedCustomColor);
  }

  // =========================
  // SOUND
  // =========================

  const soundEnabled = localStorage.getItem("tankDuelSound") !== "false";

  updateToggle(soundToggle, soundEnabled);

  soundToggle?.addEventListener("click", () => {
    const enabled = !soundToggle.classList.contains("active");

    localStorage.setItem("tankDuelSound", enabled);

    updateToggle(soundToggle, enabled);
  });

  // =========================
  // REDUCED MOTION
  // =========================

  const reducedMotion =
    localStorage.getItem("tankDuelReducedMotion") === "true";

  document.body.classList.toggle("reduced-motion", reducedMotion);

  updateToggle(motionToggle, reducedMotion);

  motionToggle?.addEventListener("click", () => {
    const enabled = !motionToggle.classList.contains("active");

    localStorage.setItem("tankDuelReducedMotion", enabled);

    document.body.classList.toggle("reduced-motion", enabled);

    updateToggle(motionToggle, enabled);
  });

  // =========================
  // HELPERS
  // =========================

  function updateToggle(toggle, enabled) {
    if (!toggle) return;

    toggle.classList.toggle("active", enabled);

    toggle.setAttribute("aria-pressed", String(enabled));
  }

  function setActiveColor(color) {
    colorOptions.forEach((option) => {
      option.classList.toggle("active", option.dataset.color === color);
    });
  }

  function applyPresetColor(color) {
    const selected = colors[color] || colors.orange;

    applyAccentColor(selected.primary, selected.light);
  }

  function applyAccentColor(primary, light = null) {
    const root = document.documentElement;

    root.style.setProperty("--color-primary", primary);

    root.style.setProperty(
      "--color-primary-light",
      light || lightenColor(primary, 25),
    );
  }

  function updateCustomSwatch(color) {
    const customButton = document.querySelector(
      '.color-option[data-color="custom"]',
    );

    if (!customButton) return;

    customButton.style.background = color;
    customButton.style.borderStyle = "solid";

    customButton.textContent = "";
  }

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
});
