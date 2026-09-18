document.addEventListener("DOMContentLoaded", () => {
  const playerType = localStorage.getItem("tankDuelPlayerType");
  const playerName = localStorage.getItem("tankDuelPlayerName");

  // No active session → return to main menu
  if (!playerType) {
    window.location.href = "../index.html";
    return;
  }

  const isGuest = playerType === "guest";

  // State variables
  let validPresetIds = ["tank-00"]; // Loaded dynamically from avatars.json
  let savedAvatarValue = "tank-00"; // Persisted avatar
  let tempSelectedAvatarValue = "tank-00"; // Currently selected in editor before saving

  // DOM Elements
  const profileNameEl = document.querySelector("#profile-name");
  const profileInitialEl = document.querySelector("#profile-initial");
  const profileTypeEl = document.querySelector("#profile-type");
  const profileAccountTypeEl = document.querySelector("#profile-account-type");
  const profileAvatarImgEl = document.querySelector("#profile-avatar-img");
  const editAvatarBtn = document.querySelector("#edit-avatar-btn");
  const avatarEditorSection = document.querySelector("#avatar-editor-section");
  const avatarGridEl = document.querySelector("#avatar-grid");
  const saveAvatarBtn = document.querySelector("#save-avatar-btn");
  const cancelAvatarBtn = document.querySelector("#cancel-avatar-btn");
  const closeAvatarEditorBtn = document.querySelector("#close-avatar-editor-btn");

  // =========================
  // PLAYER IDENTITY
  // =========================

  const displayName = playerName || "PLAYER";
  if (profileNameEl) profileNameEl.textContent = displayName;
  if (profileInitialEl) profileInitialEl.textContent = displayName.charAt(0).toUpperCase();

  // =========================
  // ACCOUNT TYPE
  // =========================

  if (profileTypeEl) {
    profileTypeEl.textContent = isGuest
      ? "GUEST OPERATIVE"
      : "REGISTERED OPERATIVE";
  }

  if (profileAccountTypeEl) {
    profileAccountTypeEl.textContent = isGuest ? "Guest" : "Registered";
  }

  // =========================
  // PLAYER STATISTICS
  // =========================

  if (typeof getPlayerStats === "function") {
    const stats = getPlayerStats();
    if (document.querySelector("#profile-games")) {
      document.querySelector("#profile-games").textContent = stats.battles;
    }
    if (document.querySelector("#profile-wins")) {
      document.querySelector("#profile-wins").textContent = stats.victories;
    }
    if (document.querySelector("#profile-winrate")) {
      document.querySelector("#profile-winrate").textContent = stats.winRate;
    }
  }

  // Update header avatar image display
  function updateHeaderAvatar(avatarId, avatarType) {
    if (!profileAvatarImgEl) return;
    const url = typeof TD !== "undefined" && typeof TD.resolveAvatarUrl === "function"
      ? TD.resolveAvatarUrl({ player: { avatar_type: avatarType || "preset", avatar_value: avatarId } }, { basePath: "../assets/images/avatars/" })
      : `../assets/images/avatars/${avatarId}.png`;

    profileAvatarImgEl.src = url;
    profileAvatarImgEl.onerror = () => {
      profileAvatarImgEl.src = "../assets/images/avatars/tank-00.png";
    };
    profileAvatarImgEl.onload = () => {
      profileAvatarImgEl.style.display = "block";
      if (profileInitialEl) profileInitialEl.style.display = "none";
    };
  }

  // Load avatar manifest dynamically from avatars.json
  function loadAvatarManifest() {
    return fetch("../assets/images/avatars/avatars.json")
      .then((res) => {
        if (!res.ok) throw new Error("Manifest load failed");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          validPresetIds = data;
        }
      })
      .catch((err) => {
        console.warn("Could not load avatars.json, using default list:", err);
      });
  }

  // Load current saved avatar (backend for authenticated, localStorage for guest)
  function loadSavedAvatar() {
    if (isGuest) {
      const storedGuestAvatar = localStorage.getItem("tankDuelGuestAvatar");
      if (storedGuestAvatar && validPresetIds.includes(storedGuestAvatar)) {
        savedAvatarValue = storedGuestAvatar;
      } else {
        savedAvatarValue = "tank-00";
      }
      tempSelectedAvatarValue = savedAvatarValue;
      updateHeaderAvatar(savedAvatarValue, "preset");
      return Promise.resolve();
    } else {
      if (typeof TD !== "undefined" && typeof TD.profile === "function") {
        return TD.profile()
          .then((res) => {
            if (res && res.player && res.player.avatar_value) {
              const avatarVal = res.player.avatar_value;
              const avatarType = res.player.avatar_type || "preset";
              savedAvatarValue = avatarVal;
              tempSelectedAvatarValue = avatarVal;
              updateHeaderAvatar(avatarVal, avatarType);
            } else {
              savedAvatarValue = "tank-00";
              tempSelectedAvatarValue = savedAvatarValue;
              updateHeaderAvatar("tank-00", "preset");
            }
          })
          .catch(() => {
            savedAvatarValue = "tank-00";
            tempSelectedAvatarValue = savedAvatarValue;
            updateHeaderAvatar("tank-00", "preset");
          });
      } else {
        savedAvatarValue = "tank-00";
        tempSelectedAvatarValue = savedAvatarValue;
        updateHeaderAvatar("tank-00", "preset");
        return Promise.resolve();
      }
    }
  }

  // Render preset avatars in editor grid
  function renderAvatarGrid() {
    if (!avatarGridEl) return;
    avatarGridEl.innerHTML = "";

    validPresetIds.forEach((avatarId) => {
      const option = document.createElement("div");
      option.className =
        "avatar-option" +
        (avatarId === tempSelectedAvatarValue ? " selected" : "");
      option.setAttribute("role", "button");
      option.setAttribute("tabindex", "0");
      option.setAttribute("aria-label", `Select ${avatarId}`);

      const img = document.createElement("img");
      img.src = `../assets/images/avatars/${avatarId}.png`;
      img.alt = avatarId;

      option.appendChild(img);

      option.addEventListener("click", () => {
        tempSelectedAvatarValue = avatarId;
        const allOptions = avatarGridEl.querySelectorAll(".avatar-option");
        allOptions.forEach((opt) => opt.classList.remove("selected"));
        option.classList.add("selected");
      });

      option.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          option.click();
        }
      });

      avatarGridEl.appendChild(option);
    });
  }

  function openEditor() {
    tempSelectedAvatarValue = savedAvatarValue;
    renderAvatarGrid();
    if (avatarEditorSection) {
      avatarEditorSection.style.display = "block";
      avatarEditorSection.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  function closeEditor() {
    tempSelectedAvatarValue = savedAvatarValue;
    if (avatarEditorSection) {
      avatarEditorSection.style.display = "none";
    }
  }

  function saveAvatar() {
    if (!validPresetIds.includes(tempSelectedAvatarValue)) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Invalid avatar selection.", "error");
      }
      return;
    }

    if (isGuest) {
      localStorage.setItem("tankDuelGuestAvatar", tempSelectedAvatarValue);
      savedAvatarValue = tempSelectedAvatarValue;
      updateHeaderAvatar(savedAvatarValue);
      closeEditor();
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Avatar updated successfully!", "success");
      }
    } else {
      if (saveAvatarBtn) {
        saveAvatarBtn.disabled = true;
        saveAvatarBtn.textContent = "SAVING...";
      }

      const updatePayload = {
        avatar_type: "preset",
        avatar_value: tempSelectedAvatarValue,
      };

      const updatePromise =
        typeof TD !== "undefined" && typeof TD.updateProfile === "function"
          ? TD.updateProfile(updatePayload)
          : TD_apiRequest("PATCH", "/api/player/me", updatePayload, true);

      updatePromise
        .then(() => {
          savedAvatarValue = tempSelectedAvatarValue;
          updateHeaderAvatar(savedAvatarValue);
          closeEditor();
          if (typeof TD !== "undefined" && typeof TD.notify === "function") {
            TD.notify("Avatar updated successfully!", "success");
          }
        })
        .catch((err) => {
          console.error("Avatar save error:", err);
          if (typeof TD !== "undefined" && typeof TD.notify === "function") {
            TD.notify("Failed to update avatar. Please try again.", "error");
          }
        })
        .finally(() => {
          if (saveAvatarBtn) {
            saveAvatarBtn.disabled = false;
            saveAvatarBtn.textContent = "SAVE AVATAR";
          }
        });
    }
  }

  // Event Listeners
  if (editAvatarBtn) {
    editAvatarBtn.addEventListener("click", () => {
      if (
        avatarEditorSection &&
        avatarEditorSection.style.display === "block"
      ) {
        closeEditor();
      } else {
        openEditor();
      }
    });
  }

  if (cancelAvatarBtn) {
    cancelAvatarBtn.addEventListener("click", closeEditor);
  }
  if (closeAvatarEditorBtn) {
    closeAvatarEditorBtn.addEventListener("click", closeEditor);
  }
  if (saveAvatarBtn) {
    saveAvatarBtn.addEventListener("click", saveAvatar);
  }

  // Initialization
  loadAvatarManifest().then(() => {
    loadSavedAvatar();
  });
});
