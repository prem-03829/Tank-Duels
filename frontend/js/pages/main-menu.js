document.addEventListener("DOMContentLoaded", () => {
  const guestButton = document.querySelector("[data-play-guest]");

  if (guestButton) {
    guestButton.addEventListener("click", () => {
      localStorage.setItem("tankDuelPlayerType", "guest");
      localStorage.setItem("tankDuelPlayerName", "Guest");
    });
  }

  // =========================
  // EXISTING AUTHENTICATED SESSION
  // =========================
  //
  // The main menu is the page that must NOT clear tokens merely because the
  // user navigates here, and it must NEVER make authenticated API calls
  // (Guest Mode lives 100% in localStorage and never reaches the backend).
  // So we detect an existing session with the SAME localStorage marker the
  // dashboard and auth pages use: tankDuelPlayerType === "user".
  //
  // Authenticated → reveal the hidden #menu-authed "CONTINUE AS <name>"
  // button and replace the anonymous cluster (guest / divider / login /
  // signup) with it.
  //
  // Guest / first-time visitor → early return: nothing is shown differently,
  // nothing is cleared, and no authenticated call is ever made on this page.
  // This preserves Guest Mode 100% as-is.

  if (localStorage.getItem("tankDuelPlayerType") !== "user") {
    return;
  }

  const authedButton = document.querySelector("#menu-authed");
  const authedNameEl = document.querySelector("#menu-authed-name");
  const anonymousSelectors = [
    "#menu-play-guest",
    "#menu-divider",
    "#menu-login",
    "#menu-signup",
  ];
  const anonymousEls = anonymousSelectors
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  const storedName = localStorage.getItem("tankDuelPlayerName") || "PLAYER";
  const safeName = String(storedName).replace(/[<>&"']/g, "");

  anonymousEls.forEach((el) => {
    el.style.display = "none";
  });

  if (authedNameEl) authedNameEl.textContent = safeName;

  if (authedButton) authedButton.style.display = "";
});
