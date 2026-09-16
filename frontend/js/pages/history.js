document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     BACK CONTROL
     Prefer the page the player came from; fall back to the Dashboard.
  ========================= */

  const backLink = document.querySelector("#history-back");

  if (backLink) {
    const referrer = document.referrer;

    if (referrer) {
      try {
        const referrerUrl = new URL(referrer);

        if (referrerUrl.origin === window.location.origin) {
          backLink.href = referrerUrl.pathname + referrerUrl.search;
        }
      } catch (e) {
        /* malformed referrer — keep the Dashboard default */
      }
    }
  }

  /* =========================
     RENDER HISTORY
     Each completed match becomes one compact horizontal row.
     Authenticated users read backend history (local_battle + completed online
     battle rows); guests keep the existing localStorage file. Both render
     identically below.

     FILTERS
     The three pills narrow the already-loaded, already-sorted list entirely
     client-side: switching filters never touches the backend. ALL is the
     default; "same_device" maps to the mode "local" via TD.getHistoryCategory.
  ========================= */

  const list = document.querySelector("#history-list");
  if (!list) return;

  const filterButtons = Array.prototype.slice.call(
    document.querySelectorAll(".history-filter[data-history-filter]")
  );

  let allMatches = [];
  let currentFilter = "all";

  function visibleMatches(filter) {
    if (filter === "all") return allMatches;
    return allMatches.filter(
      (match) => TD.getHistoryCategory(match.mode) === filter
    );
  }

  /* The existing empty-state block, rebuilt to fit the active filter. */
  function emptyStateFor(filter) {
    const wrapper = document.createElement("div");
    wrapper.className = "history-empty";

    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "history-empty-title";

    const sectionMessage = document.createElement("p");
    sectionMessage.className = "history-empty-message";

    if (filter === "online") {
      sectionTitle.textContent = "No Online Matches";
      sectionMessage.textContent = "Complete an online battle to see it here.";
    } else if (filter === "same_device") {
      sectionTitle.textContent = "No Same Device Matches";
      sectionMessage.textContent = "Complete a Same Device battle to see it here.";
    } else {
      sectionTitle.textContent = "No Match History";
      sectionMessage.textContent = "Completed battles will appear here.";
    }

    wrapper.appendChild(sectionTitle);
    wrapper.appendChild(sectionMessage);
    return wrapper;
  }

  function renderHistory() {
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    const matches = visibleMatches(currentFilter);
    if (matches.length === 0) {
      list.appendChild(emptyStateFor(currentFilter));
      return;
    }

    for (let i = 0; i < matches.length; i++) {
      list.appendChild(renderMatch(matches[i]));
    }
  }

  function selectFilter(filter) {
    currentFilter = filter;
    for (let i = 0; i < filterButtons.length; i++) {
      const button = filterButtons[i];
      const active =
        button.getAttribute("data-history-filter") === currentFilter;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    renderHistory();
  }

  for (let i = 0; i < filterButtons.length; i++) {
    filterButtons[i].addEventListener("click", function () {
      selectFilter(this.getAttribute("data-history-filter"));
    });
  }

  TD.loadMatchHistory().then((matches) => {
    allMatches = matches || [];
    renderHistory();
  });
});

function renderMatch(match) {
  const nameOf = (name) => name || "PLAYER";

  const winnerName = nameOf(match.winner);
  const loserName = nameOf(match.loser);

  const winnerColor = colorForSide(match, "winner");
  const loserColor = colorForSide(match, "loser");

  const winnerScore = match.winner === match.playerOne
    ? match.playerOneScore
    : match.playerTwoScore;

  const loserScore = match.loser === match.playerOne
    ? match.playerOneScore
    : match.playerTwoScore;

  const row = document.createElement("article");
  row.className = "history-row";

  /* ---- PLAYER RESULT ([CROWN] winner vs loser, one line) ---- */

  const playerSection = document.createElement("div");
  playerSection.className = "history-player";

  const winnerGroup = document.createElement("span");
  winnerGroup.className = "history-winner";

  const crown = document.createElement("span");
  crown.className = "history-crown";
  crown.textContent = "\uD83D\uDC51"; // 👑
  crown.setAttribute("aria-hidden", "true");

  const winnerEl = document.createElement("span");
  winnerEl.className = "history-name is-winner";
  winnerEl.style.color = lightenHex(winnerColor);
  winnerEl.textContent = winnerName;

  winnerGroup.appendChild(crown);
  winnerGroup.appendChild(winnerEl);

  const vs = document.createElement("span");
  vs.className = "history-vs";
  vs.textContent = "vs";

  const loserEl = document.createElement("span");
  loserEl.className = "history-name";
  loserEl.style.color = lightenHex(loserColor);
  loserEl.textContent = loserName;

  playerSection.appendChild(winnerGroup);
  playerSection.appendChild(vs);
  playerSection.appendChild(loserEl);
  row.appendChild(playerSection);

  /* ---- MODE ---- */

  row.appendChild(buildSection("MODE", TD.getHistoryModeLabel(match.mode)));

  /* ---- MAP (thumbnail + name) ---- */

  row.appendChild(buildMapSection(match));

  /* ---- SCORE ---- */

  row.appendChild(
    buildSection("SCORE", String(winnerScore) + " \u2014 " + String(loserScore))
  );

  /* ---- DATE ---- */

  row.appendChild(buildSection("DATE", formatCompletedAt(match.completedAt)));

  return row;
}

function colorForSide(match, side) {
  if (match.playerOne === match[side]) return match.playerOneColor;
  if (match.playerTwo === match[side]) return match.playerTwoColor;
  return "#e07030";
}

function buildSection(label, value) {
  const section = document.createElement("div");
  section.className = "history-section";

  const labelEl = document.createElement("span");
  labelEl.className = "history-section-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "history-section-value";
  valueEl.textContent = value;

  section.appendChild(labelEl);
  section.appendChild(valueEl);

  return section;
}

function buildMapSection(match) {
  const section = document.createElement("div");
  section.className = "history-section";

  const labelEl = document.createElement("span");
  labelEl.className = "history-section-label";
  labelEl.textContent = "MAP";

  const map = document.createElement("span");
  map.className = "history-map";

  const thumb = document.createElement("span");
  thumb.className = "history-map-thumb map-thumb-" + (match.mapKey || "");
  thumb.setAttribute("aria-hidden", "true");

  const mapName = document.createElement("span");
  mapName.className = "history-map-name";
  mapName.textContent = match.map || "\u2014";

  map.appendChild(thumb);
  map.appendChild(mapName);

  section.appendChild(labelEl);
  section.appendChild(map);

  return section;
}

/* Player-name colors are shown as the bright variant of the tank color, the
   same treatment the in-game nameplates use (reuses the existing helper). */

function lightenHex(hex) {
  if (window.TD && TD.adjustBrightness) {
    return TD.adjustBrightness(hex || "#e07030", 1.35);
  }
  return hex || "#e07030";
}

function formatCompletedAt(iso) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const date = new Date(iso);
  if (isNaN(date.getTime())) return "\u2014";

  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return day + " " + month + " " + year + ", " + hour + ":" + minute;
}