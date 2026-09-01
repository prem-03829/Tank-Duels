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

  const games = Number(localStorage.getItem("tankDuelGames")) || 0;

  const wins = Number(localStorage.getItem("tankDuelWins")) || 0;

  const winRate = games > 0 ? `${Math.round((wins / games) * 100)}%` : "—";

  document.querySelector("#profile-games").textContent = games;

  document.querySelector("#profile-wins").textContent = wins;

  document.querySelector("#profile-winrate").textContent = winRate;
});
