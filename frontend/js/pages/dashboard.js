document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // PLAYER STATE
  // =========================

  const playerType = localStorage.getItem("tankDuelPlayerType");

  // If no player session exists, return to main menu
  if (!playerType) {
    window.location.href = "../index.html";
    return;
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
  // ACCOUNT MENU
  // =========================

  const menu = document.querySelector("#account-menu");
  const toggle = document.querySelector("#account-menu-toggle");
  const dropdown = document.querySelector("#account-menu-dropdown");

  function isOpen() {
    return !!dropdown && dropdown.classList.contains("is-open");
  }

  function openMenu() {
    if (!dropdown || !toggle) return;
    dropdown.classList.add("is-open");
    dropdown.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    if (!dropdown || !toggle) return;
    dropdown.classList.remove("is-open");
    dropdown.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
  }

  if (menu && toggle && dropdown) {
    // Enter/Space on the <button> trigger naturally produces a click.
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen()) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close after selecting a menu item.
    dropdown.addEventListener("click", (e) => {
      if (e.target.closest(".account-menu-item")) {
        closeMenu();
      }
    });

    // Escape closes and returns focus to the trigger.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) {
        closeMenu();
        toggle.focus();
      }
    });

    // Close when clicking outside the menu.
    document.addEventListener("click", (e) => {
      if (isOpen() && !menu.contains(e.target)) {
        closeMenu();
      }
    });
  }

  // =========================
  // LOGOUT
  // =========================

  const logoutButton = document.querySelector("#logout-btn");

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("tankDuelPlayerType");
      localStorage.removeItem("tankDuelPlayerName");

      window.location.href = "../index.html";
    });
  }
});