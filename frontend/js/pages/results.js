document.addEventListener("DOMContentLoaded", () => {
  const resultTitle = document.querySelector("#result-title");
  const resultDescription = document.querySelector("#result-description");

  const playerScoreName = document.querySelector("#player-score-name");
  const opponentScoreName = document.querySelector("#opponent-score-name");

  const playerScore = document.querySelector("#player-score");
  const opponentScore = document.querySelector("#opponent-score");

  // =========================
  // PLAYER
  // =========================

  var cust = null;
  try {
    var raw = localStorage.getItem('tankDuelGameCustomization');
    if (raw) cust = JSON.parse(raw);
  } catch (e) { /* fall through */ }

  var playerName = (cust && cust.playerOneName && cust.playerOneName.trim()) ||
                   localStorage.getItem('tankDuelPlayerName') || 'Player';
  var opponentName = (cust && cust.playerTwoName && cust.playerTwoName.trim()) || 'Opponent';

  if (playerScoreName) {
    playerScoreName.textContent = playerName;
  }

  if (opponentScoreName) {
    opponentScoreName.textContent = opponentName;
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
