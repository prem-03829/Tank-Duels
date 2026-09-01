document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTS
  // =========================

  const playerNameElement = document.querySelector("#player-one-name");
  const mapNameElement = document.querySelector("#map-name");
  const roundValueElement = document.querySelector("#round-value");
  const gameStatusElement = document.querySelector("#game-status");

  const quitButton = document.querySelector("#quit-game-btn");
  const quitModal = document.querySelector("#quit-modal");
  const cancelQuitButton = document.querySelector("#cancel-quit-btn");
  const confirmQuitButton = document.querySelector("#confirm-quit-btn");
  const modalBackdrop = document.querySelector("#quit-modal-backdrop");

  // =========================
  // PLAYER
  // =========================

  const playerName = localStorage.getItem("tankDuelPlayerName") || "PLAYER";

  if (playerNameElement) {
    playerNameElement.textContent = playerName.toUpperCase();
  }

  // =========================
  // MAP
  // =========================

  const selectedMap = localStorage.getItem("tankDuelSelectedMap") || "desert";

  const mapNames = {
    desert: "Desert",
    hills: "Highlands",
    random: "Random",
  };

  if (mapNameElement) {
    mapNameElement.textContent = mapNames[selectedMap] || "Desert";
  }

  // =========================
  // MATCH FORMAT
  // =========================

  const selectedRounds =
    Number(localStorage.getItem("tankDuelSelectedRounds")) || 1;

  if (roundValueElement) {
    roundValueElement.textContent = `1 / ${selectedRounds}`;
  }

  // =========================
  // INITIAL GAME STATE
  // =========================

  if (gameStatusElement) {
    gameStatusElement.textContent = `${playerName.toUpperCase()}'S TURN`;
  }

  // =========================
  // QUIT MODAL
  // =========================

  function openQuitModal() {
    if (!quitModal) return;

    quitModal.classList.add("is-open");
    quitModal.setAttribute("aria-hidden", "false");
  }

  function closeQuitModal() {
    if (!quitModal) return;

    quitModal.classList.remove("is-open");
    quitModal.setAttribute("aria-hidden", "true");
  }

  // Open modal

  if (quitButton) {
    quitButton.addEventListener("click", openQuitModal);
  }

  // Continue battle

  if (cancelQuitButton) {
    cancelQuitButton.addEventListener("click", closeQuitModal);
  }

  // Click backdrop

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", closeQuitModal);
  }

  // Escape key

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      quitModal &&
      quitModal.classList.contains("is-open")
    ) {
      closeQuitModal();
    }
  });

  // Confirm quit

  if (confirmQuitButton) {
    confirmQuitButton.addEventListener("click", () => {
      window.location.href = "./dashboard.html";
    });
  }
});
