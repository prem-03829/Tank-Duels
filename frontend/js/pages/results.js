document.addEventListener("DOMContentLoaded", () => {
  const resultTitle = document.querySelector("#result-title");
  const resultDescription = document.querySelector("#result-description");

  const playerScoreName = document.querySelector("#player-score-name");
  const opponentScoreName = document.querySelector("#opponent-score-name");

  const playerScore = document.querySelector("#player-score");
  const opponentScore = document.querySelector("#opponent-score");

  /* =========================
     SAFE STORAGE HELPERS
     The pre-fix code used `Number(...) || 1` which turned a genuine "0" score
     into 1 (the losing player's 0 displayed as 1). These helpers preserve 0.
  ========================= */

  function scoreFromStorage(key) {
    var raw = localStorage.getItem(key);
    if (raw === null || raw === "") return null;
    var n = Number(raw);
    return isFinite(n) ? Math.max(0, n) : null;
  }

  function nameFromStorage(key) {
    var raw = localStorage.getItem(key);
    if (raw === null) return null;
    var s = String(raw).trim();
    return s ? s : null;
  }

  /* =========================
     RENDER
  ========================= */

  function renderData(result, playerName, opponentName, playerPoints, opponentPoints) {
    var win = result === "win";

    if (resultTitle) resultTitle.textContent = win ? "Victory" : "Defeat";
    if (resultDescription) {
      resultDescription.textContent = win
        ? "You dominated the battlefield."
        : "The battlefield belongs to your opponent.";
    }

    if (playerScoreName) playerScoreName.textContent = playerName || "Player";
    if (opponentScoreName) opponentScoreName.textContent = opponentName || "Opponent";

    if (playerScore) playerScore.textContent = String(Number(playerPoints) || 0);
    if (opponentScore) opponentScore.textContent = String(Number(opponentPoints) || 0);
  }

  /* =======================
     FALLBACK PLAYER NAMES
     (same customization lookup as before)
  ======================= */

  var cust = null;
  try {
    var raw = localStorage.getItem("tankDuelGameCustomization");
    if (raw) cust = JSON.parse(raw);
  } catch (e) { /* fall through */ }

  function defaultPlayerName() {
    return (cust && cust.playerOneName && cust.playerOneName.trim()) ||
           localStorage.getItem("tankDuelPlayerName") || "Player";
  }

  function defaultOpponentName() {
    return (cust && cust.playerTwoName && cust.playerTwoName.trim()) || "Opponent";
  }

  /* =======================
     ONLINE RESULT (authenticated)
     The engine stamps these keys right before navigating here:
       tankDuelLastResultOnline === "true"
       tankDuelLastBattleId     — the completed battle_id
       tankDuelLastLocalSlot    — 0 or 1 (server slot = engine index of the local player)
     When possible we RE-FETCH the completed battle by battle_id from the
     authenticated API and render the AUTHORITATIVE server scores
     (battle_state.setup.scores, keyed by player id), so a stale or tampered
     localStorage value can never leak into the current Online result.
  ======================= */

  var isOnlineResult = localStorage.getItem("tankDuelLastResultOnline") === "true";
  var battleId = isOnlineResult ? localStorage.getItem("tankDuelLastBattleId") : null;
  var localSlot = Number(localStorage.getItem("tankDuelLastLocalSlot"));

  var fallbackResult = localStorage.getItem("tankDuelLastResult") || "win";
  var fallbackPlayerPoints = scoreFromStorage("tankDuelLastPlayerScore");
  var fallbackOpponentPoints = scoreFromStorage("tankDuelLastOpponentScore");
  var fallbackPlayerName = nameFromStorage("tankDuelLastPlayerName") || defaultPlayerName();
  var fallbackOpponentName = nameFromStorage("tankDuelLastOpponentName") || defaultOpponentName();

  // Same-device behavior keeps its original defaults when no result was written
  // (only genuine "0" values are now preserved).
  if (fallbackPlayerPoints === null) fallbackPlayerPoints = 1;
  if (fallbackOpponentPoints === null) fallbackOpponentPoints = 0;

  renderData(
    fallbackResult,
    fallbackPlayerName,
    fallbackOpponentName,
    fallbackPlayerPoints,
    fallbackOpponentPoints
  );

  if (isOnlineResult && battleId && typeof TD !== "undefined" && typeof TD.getBattle === "function") {
    TD.getBattle(battleId)
      .then(function (json) {
        var battle = json && json.battle ? json.battle : null;
        if (!battle || battle.status !== "COMPLETED") return;

        var state = battle.battle_state || {};
        var setup = state.setup || {};
        var scores = setup.scores || {};

        var p1Id = String(battle.player1_id || "");
        var p2Id = String(battle.player2_id || "");
        if (!p1Id || !p2Id) return;

        var slot = (isFinite(localSlot) && (localSlot === 0 || localSlot === 1)) ? localSlot : 0;
        var myId = slot === 0 ? p1Id : p2Id;
        var theirId = slot === 0 ? p2Id : p1Id;

        var myScore = isFinite(Number(scores[myId])) ? Math.max(0, Number(scores[myId])) : null;
        var theirScore = isFinite(Number(scores[theirId])) ? Math.max(0, Number(scores[theirId])) : null;
        if (myScore === null || theirScore === null) return;

        var p1Name = typeof battle.player1_name === "string" ? battle.player1_name : null;
        var p2Name = typeof battle.player2_name === "string" ? battle.player2_name : null;
        var myName = (slot === 0 ? p1Name : p2Name) || fallbackPlayerName;
        var theirName = (slot === 0 ? p2Name : p1Name) || fallbackOpponentName;

        var authoritativeResult = "loss";
        if (myScore > theirScore) authoritativeResult = "win";
        else if (myScore === theirScore) authoritativeResult = "win";

        renderData(
          authoritativeResult,
          myName,
          theirName,
          myScore,
          theirScore
        );
      })
      .catch(function () {
        /* Network/auth failure: the engine's freshly stamped authoritative
           values are already rendered — keep them. */
      });
  }
});