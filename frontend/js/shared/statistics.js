/* =========================
   CENTRALIZED PLAYER STATISTICS
   Single source of truth for how the player's battle record is presented
   across the application (Dashboard, Profile, and any future pages).

   Console/local 1v1 SAME DEVICE matches are NOT the player's permanent
   battle record. Those battles are reserved for the future ONLINE
   multiplayer system, so until that system exists every consumer receives
   the empty placeholder state below.

   When online multiplayer is implemented, change the value returned by
   getPlayerStats() (for example, sourced from the online account/match
   data) and every page consuming it updates automatically — no consumer
   needs to be rewritten.
========================= */

/* Local 1v1 result tracking — preserved intact for the current game, but
   never surfaced as the player's profile/online statistics. */

function getPlayerStats() {
  const placeholder = "—";

  // The local console tally still exists for game functionality/history:
  const localGames = Number(localStorage.getItem("tankDuelsGames")) || 0;
  const localWins = Number(localStorage.getItem("tankDuelsWins")) || 0;
  const localWinRate =
    localGames > 0 ? `${Math.round((localWins / localGames) * 100)}%` : "—";

  // No online statistics system yet — always render the empty state.
  // Future (online): return { battles, victories, winRate } from account
  // data here instead of the placeholders.
  return {
    battles: placeholder,
    victories: placeholder,
    winRate: placeholder,
  };
}
