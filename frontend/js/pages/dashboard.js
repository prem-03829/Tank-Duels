document.addEventListener("DOMContentLoaded", () => {
  const playerNameElement = document.querySelector("#player-name");
  const logoutButton = document.querySelector("#logout-btn");

  // =========================
  // PLAYER STATE
  // =========================

  const playerType = localStorage.getItem("tankDuelPlayerType");
  const playerName = localStorage.getItem("tankDuelPlayerName");

  // If no player session exists, return to main menu
  if (!playerType) {
    window.location.href = "../index.html";
    return;
  }

  // Display player name
  if (playerNameElement) {
    playerNameElement.textContent = playerName || "PLAYER";
  }

  // =========================
  // PLAYER STATS
  // =========================

  const games = Number(localStorage.getItem("tankDuelGames")) || 0;
  const wins = Number(localStorage.getItem("tankDuelWins")) || 0;

  const winRate = games > 0 ? `${Math.round((wins / games) * 100)}%` : "—";

  document.querySelector("#stat-games").textContent = games;
  document.querySelector("#stat-wins").textContent = wins;
  document.querySelector("#stat-winrate").textContent = winRate;

  // =========================
  // LOGOUT
  // =========================

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("tankDuelPlayerType");
      localStorage.removeItem("tankDuelPlayerName");

      window.location.href = "../index.html";
    });
  }
});
