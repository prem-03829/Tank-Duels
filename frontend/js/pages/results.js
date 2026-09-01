document.addEventListener("DOMContentLoaded", () => {
  const resultTitle = document.querySelector("#result-title");
  const resultDescription = document.querySelector("#result-description");

  const playerScoreName = document.querySelector("#player-score-name");

  const playerScore = document.querySelector("#player-score");
  const opponentScore = document.querySelector("#opponent-score");

  // =========================
  // PLAYER
  // =========================

  const playerName = localStorage.getItem("tankDuelPlayerName") || "Player";

  if (playerScoreName) {
    playerScoreName.textContent = playerName;
  }

  // =========================
  // TEMPORARY RESULT DATA
  // =========================
  // Actual game logic will save these later

  const gameResult = localStorage.getItem("tankDuelLastResult") || "win";

  const playerPoints =
    Number(localStorage.getItem("tankDuelLastPlayerScore")) || 1;

  const opponentPoints =
    Number(localStorage.getItem("tankDuelLastOpponentScore")) || 0;

  // =========================
  // UPDATE RESULT UI
  // =========================

  if (gameResult === "win") {
    resultTitle.textContent = "Victory";
    resultDescription.textContent = "You dominated the battlefield.";
  } else {
    resultTitle.textContent = "Defeat";
    resultDescription.textContent = "The battlefield belongs to your opponent.";
  }

  playerScore.textContent = playerPoints;
  opponentScore.textContent = opponentPoints;
});
