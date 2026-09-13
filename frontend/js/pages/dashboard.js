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

  const stats = getPlayerStats();

  const statGamesElement = document.querySelector("#stat-games");
  const statWinsElement = document.querySelector("#stat-wins");
  const statWinRateElement = document.querySelector("#stat-winrate");

  if (statGamesElement && statWinsElement && statWinRateElement) {
    statGamesElement.textContent = stats.battles;
    statWinsElement.textContent = stats.victories;
    statWinRateElement.textContent = stats.winRate;
  }

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
