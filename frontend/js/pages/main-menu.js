document.addEventListener("DOMContentLoaded", () => {
  const guestButton = document.querySelector("[data-play-guest]");

  if (guestButton) {
    guestButton.addEventListener("click", () => {
      localStorage.setItem("tankDuelPlayerType", "guest");
      localStorage.setItem("tankDuelPlayerName", "Guest");
    });
  }
});
