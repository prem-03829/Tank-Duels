document.addEventListener("DOMContentLoaded", () => {
  const mapOptions = document.querySelectorAll(".setup-option");
  const matchOptions = document.querySelectorAll(".match-option");
  const startBattleButton = document.querySelector("#start-battle");

  let selectedMap = localStorage.getItem("tankDuelSelectedMap") || "desert";

  let selectedRounds = localStorage.getItem("tankDuelSelectedRounds") || "1";

  // =========================
  // INITIAL STATE
  // =========================

  mapOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.map === selectedMap);
  });

  matchOptions.forEach((option) => {
    option.classList.toggle("active", option.dataset.rounds === selectedRounds);
  });

  // =========================
  // MAP SELECTION
  // =========================

  mapOptions.forEach((option) => {
    option.addEventListener("click", () => {
      selectedMap = option.dataset.map;

      mapOptions.forEach((item) => {
        item.classList.toggle("active", item === option);
      });
    });
  });

  // =========================
  // MATCH FORMAT
  // =========================

  matchOptions.forEach((option) => {
    option.addEventListener("click", () => {
      selectedRounds = option.dataset.rounds;

      matchOptions.forEach((item) => {
        item.classList.toggle("active", item === option);
      });
    });
  });

  // =========================
  // START BATTLE
  // =========================

  startBattleButton?.addEventListener("click", () => {
    localStorage.setItem("tankDuelSelectedMap", selectedMap);

    localStorage.setItem("tankDuelSelectedRounds", selectedRounds);
  });
});
