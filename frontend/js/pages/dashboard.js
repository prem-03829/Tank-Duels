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
  // Reserved for the future online multiplayer system. Storage reads and the
  // win-rate calculation are preserved below, but the dashboard always renders
  // the "—" placeholder because there is no online-match statistics system yet.
  // =========================

  const games = Number(localStorage.getItem("tankDuelGames")) || 0;
  const wins = Number(localStorage.getItem("tankDuelWins")) || 0;

  const winRate = games > 0 ? `${Math.round((wins / games) * 100)}%` : "—";

  const statGamesElement = document.querySelector("#stat-games");
  const statWinsElement = document.querySelector("#stat-wins");
  const statWinRateElement = document.querySelector("#stat-winrate");

  if (statGamesElement && statWinsElement && statWinRateElement) {
    statGamesElement.textContent = "—";
    statWinsElement.textContent = "—";
    statWinRateElement.textContent = "—";
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
