document.addEventListener("DOMContentLoaded", () => {
  const playerType = localStorage.getItem("tankDuelPlayerType");
  const playerName = localStorage.getItem("tankDuelPlayerName");

  // No active session → return to main menu
  if (!playerType) {
    window.location.href = "../index.html";
    return;
  }

  // =========================
  // PLAYER IDENTITY
  // =========================

  const displayName = playerName || "PLAYER";

  document.querySelector("#profile-name").textContent = displayName;

  document.querySelector("#profile-initial").textContent = displayName
    .charAt(0)
    .toUpperCase();

  // =========================
  // ACCOUNT TYPE
  // =========================

  const isGuest = playerType === "guest";

  document.querySelector("#profile-type").textContent = isGuest
    ? "GUEST OPERATIVE"
    : "REGISTERED OPERATIVE";

  document.querySelector("#profile-account-type").textContent = isGuest
    ? "Guest"
    : "Registered";

  // =========================
  // PLAYER STATISTICS
  // =========================

  const stats = getPlayerStats();

  document.querySelector("#profile-games").textContent = stats.battles;

  document.querySelector("#profile-wins").textContent = stats.victories;

  document.querySelector("#profile-winrate").textContent = stats.winRate;
});
