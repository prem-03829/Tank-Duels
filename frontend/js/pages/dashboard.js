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

  const statGamesElement = document.querySelector("#stat-games");
  const statWinsElement = document.querySelector("#stat-wins");
  const statWinRateElement = document.querySelector("#stat-winrate");

  function setStats(battles, victories, winRate) {
    if (!statGamesElement || !statWinsElement || !statWinRateElement) return;
    statGamesElement.textContent = battles;
    statWinsElement.textContent = victories;
    statWinRateElement.textContent = winRate;
  }

  // =========================
  // PLAYER STATS
  // =========================

  const isAuthenticated =
    playerType === "user" &&
    typeof TD !== "undefined" &&
    typeof TD_isAuthenticated === "function" &&
    TD_isAuthenticated();

  if (isAuthenticated) {
    // Authenticated: the Flask backend is the source of truth.
    // Guest Mode must NEVER reach these endpoints — the branch above guards it.
    Promise.all([TD.profile(), TD.stats()])
      .then(([profileRes, statsRes]) => {
        const player = (profileRes && profileRes.player) || null;
        const statistics = (statsRes && statsRes.statistics) || null;

        if (player && player.username) {
          localStorage.setItem(
            "tankDuelPlayerName",
            String(player.username).replace(/[<>&"']/g, "")
          );
        }

        const battles = statistics ? Number(statistics.battles_played) || 0 : 0;
        const victories = statistics ? Number(statistics.battles_won) || 0 : 0;
        const winRate =
          battles > 0 ? Math.round((victories / battles) * 100) + "%" : "—";

        setStats(battles, victories, winRate);
      })
      .catch((error) => {
        const status = error && error.status;

        // 401 → the session is expired/invalid. Clear it and send the user
        // back to login rather than showing stale or invented statistics.
        if (status === 401) {
          if (typeof TD_clearSession === "function") {
            TD_clearSession();
          }
          localStorage.removeItem("tankDuelPlayerType");
          localStorage.removeItem("tankDuelPlayerName");
          window.location.href = "./login.html";
          return;
        }

        // 404 → the backend has no profile/statistics row for this player.
        // Render the empty placeholder state; never create records from here.
        if (status === 404) {
          setStats("—", "—", "—");
          return;
        }

        // Network failure / 5xx: keep the placeholder defaults (no fabricated
        // values) and surface a readable message via the existing dashboard UI.
        setStats("—", "—", "—");
        if (window.alert) {
          alert(
            "Could not load your statistics right now. Please try again shortly."
          );
        }
      });
  } else {
    // Guest Mode: 100% local, untouched.
    const stats = getPlayerStats();
    setStats(stats.battles, stats.victories, stats.winRate);
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
      // Authenticated user: route logout through the existing Flask
      // session/API client (shared/api.js). That revokes the server-side
      // session and clears the stored access/refresh tokens — guests must
      // never reach it, so only call it when a real "user" session exists.
      if (
        playerType === "user" &&
        typeof TD !== "undefined" &&
        typeof TD.logout === "function"
      ) {
        TD.logout()
          .then(() => {
            localStorage.removeItem("tankDuelPlayerType");
            localStorage.removeItem("tankDuelPlayerName");
            window.location.href = "../index.html";
          })
          .catch(() => {
            // Even if the server call fails, end the local session so the
            // user is never stranded on a dashboard with nowhere to go.
            localStorage.removeItem("tankDuelPlayerType");
            localStorage.removeItem("tankDuelPlayerName");
            window.location.href = "../index.html";
          });
        return;
      }

      // Guest mode: 100% local, untouched.
      localStorage.removeItem("tankDuelPlayerType");
      localStorage.removeItem("tankDuelPlayerName");

      window.location.href = "../index.html";
    });
  }
});