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
  ========================= */

  const list = document.querySelector("#history-list");
  if (!list) return;

  const matches = TD.getMatchHistory();

  if (!matches || matches.length === 0) return; // keep the empty state

  const emptyEl = document.querySelector("#history-empty");
  if (emptyEl) emptyEl.remove();

  for (let i = 0; i < matches.length; i++) {
    list.appendChild(renderMatch(matches[i]));
  }
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