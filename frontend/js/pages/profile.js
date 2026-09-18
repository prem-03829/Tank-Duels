document.addEventListener("DOMContentLoaded", () => {
  const playerType = localStorage.getItem("tankDuelPlayerType");
  const playerName = localStorage.getItem("tankDuelPlayerName");

  // No active session -> return to main menu
  if (!playerType) {
    window.location.href = "../index.html";
    return;
  }

  const isGuest = playerType === "guest";

  // ===========================
  // STATE
  // ===========================

  let validPresetIds = ["tank-00"]; // Loaded dynamically from avatars.json
  let savedAvatarType  = "preset";
  let savedAvatarValue = "tank-00";
  let tempSelectedAvatarValue = "tank-00"; // Preset tab temp selection
  let activeTab = "preset";               // "preset" | "custom"

  // Crop state
  let cropImage      = null;  // HTMLImageElement loaded from file picker
  let cropOffsetX    = 0;
  let cropOffsetY    = 0;
  let cropScale      = 1;
  let cropIsDragging = false;
  let cropDragStartX = 0;
  let cropDragStartY = 0;
  let cropPinchStartDist  = 0;
  let cropPinchStartScale = 1;
  let pendingCustomBlob   = null; // WebP blob ready to upload when SAVE is clicked

  // ===========================
  // DOM ELEMENTS
  // ===========================

  const profileNameEl        = document.querySelector("#profile-name");
  const profileInitialEl     = document.querySelector("#profile-initial");
  const profileTypeEl        = document.querySelector("#profile-type");
  const profileAccountTypeEl = document.querySelector("#profile-account-type");
  const profileAvatarImgEl   = document.querySelector("#profile-avatar-img");
  const editAvatarBtn        = document.querySelector("#edit-avatar-btn");
  const avatarEditorSection  = document.querySelector("#avatar-editor-section");
  const avatarTabsEl         = document.querySelector("#avatar-tabs");
  const tabPresetBtn         = document.querySelector("#tab-preset");
  const tabCustomBtn         = document.querySelector("#tab-custom");
  const panelPreset          = document.querySelector("#panel-preset");
  const panelCustom          = document.querySelector("#panel-custom");
  const avatarGridEl         = document.querySelector("#avatar-grid");
  const saveAvatarBtn        = document.querySelector("#save-avatar-btn");
  const cancelAvatarBtn      = document.querySelector("#cancel-avatar-btn");
  const closeAvatarEditorBtn = document.querySelector("#close-avatar-editor-btn");

  // Custom panel elements
  const avatarUploadZone = document.querySelector("#avatar-upload-zone");
  const avatarFileInput  = document.querySelector("#avatar-file-input");
  const cancelCustomBtn  = document.querySelector("#cancel-custom-btn");

  // Crop modal elements
  const cropOverlay    = document.querySelector("#avatar-crop-overlay");
  const cropCanvas     = document.querySelector("#avatar-crop-canvas");
  const cropCancelBtn  = document.querySelector("#crop-cancel-btn");
  const cropCancelBtn2 = document.querySelector("#crop-cancel-btn-2");
  const cropApplyBtn   = document.querySelector("#crop-apply-btn");

  // ===========================
  // PLAYER IDENTITY
  // ===========================

  const displayName = playerName || "PLAYER";
  if (profileNameEl) profileNameEl.textContent = displayName;
  if (profileInitialEl) profileInitialEl.textContent = displayName.charAt(0).toUpperCase();

  // ===========================
  // ACCOUNT TYPE
  // ===========================

  if (profileTypeEl) {
    profileTypeEl.textContent = isGuest ? "GUEST OPERATIVE" : "REGISTERED OPERATIVE";
  }
  if (profileAccountTypeEl) {
    profileAccountTypeEl.textContent = isGuest ? "Guest" : "Registered";
  }

  // Show tabs only for authenticated users
  if (!isGuest && avatarTabsEl) {
    avatarTabsEl.style.display = "flex";
  }

  // ===========================
  // PLAYER STATISTICS
  // ===========================

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

  // ===========================
  // AVATAR DISPLAY
  // ===========================

  function updateHeaderAvatar(avatarValue, avatarType) {
    if (!profileAvatarImgEl) return;
    const resolvedType = avatarType || "preset";
    const url = (typeof TD !== "undefined" && typeof TD.resolveAvatarUrl === "function")
      ? TD.resolveAvatarUrl(
          { player: { avatar_type: resolvedType, avatar_value: avatarValue } },
          { basePath: "../assets/images/avatars/" }
        )
      : "../assets/images/avatars/" + avatarValue + ".png";

    profileAvatarImgEl.src = url;
    profileAvatarImgEl.onerror = () => {
      profileAvatarImgEl.src = "../assets/images/avatars/tank-00.png";
    };
    profileAvatarImgEl.onload = () => {
      profileAvatarImgEl.style.display = "block";
      if (profileInitialEl) profileInitialEl.style.display = "none";
    };
  }

  // ===========================
  // AVATAR MANIFEST
  // ===========================

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

  // ===========================
  // LOAD SAVED AVATAR
  // ===========================

  function loadSavedAvatar() {
    if (isGuest) {
      const storedGuestAvatar = localStorage.getItem("tankDuelGuestAvatar");
      if (storedGuestAvatar && validPresetIds.includes(storedGuestAvatar)) {
        savedAvatarValue = storedGuestAvatar;
      } else {
        savedAvatarValue = "tank-00";
      }
      savedAvatarType = "preset";
      tempSelectedAvatarValue = savedAvatarValue;
      updateHeaderAvatar(savedAvatarValue, "preset");
      return Promise.resolve();
    } else {
      if (typeof TD !== "undefined" && typeof TD.profile === "function") {
        return TD.profile()
          .then((res) => {
            if (res && res.player && res.player.avatar_value) {
              savedAvatarType  = res.player.avatar_type || "preset";
              savedAvatarValue = res.player.avatar_value;
              tempSelectedAvatarValue = savedAvatarValue;
              updateHeaderAvatar(savedAvatarValue, savedAvatarType);
            } else {
              savedAvatarType  = "preset";
              savedAvatarValue = "tank-00";
              tempSelectedAvatarValue = savedAvatarValue;
              updateHeaderAvatar("tank-00", "preset");
            }
          })
          .catch(() => {
            savedAvatarType  = "preset";
            savedAvatarValue = "tank-00";
            tempSelectedAvatarValue = savedAvatarValue;
            updateHeaderAvatar("tank-00", "preset");
          });
      } else {
        savedAvatarType  = "preset";
        savedAvatarValue = "tank-00";
        tempSelectedAvatarValue = savedAvatarValue;
        updateHeaderAvatar("tank-00", "preset");
        return Promise.resolve();
      }
    }
  }

  // ===========================
  // PRESET GRID
  // ===========================

  function renderAvatarGrid() {
    if (!avatarGridEl) return;
    avatarGridEl.innerHTML = "";

    validPresetIds.forEach((avatarId) => {
      const option = document.createElement("div");
      option.className =
        "avatar-option" +
        (avatarId === tempSelectedAvatarValue && activeTab === "preset" ? " selected" : "");
      option.setAttribute("role", "button");
      option.setAttribute("tabindex", "0");
      option.setAttribute("aria-label", "Select " + avatarId);

      const img = document.createElement("img");
      img.src = "../assets/images/avatars/" + avatarId + ".png";
      img.alt = avatarId;
      option.appendChild(img);

      option.addEventListener("click", () => {
        tempSelectedAvatarValue = avatarId;
        avatarGridEl.querySelectorAll(".avatar-option").forEach((opt) =>
          opt.classList.remove("selected")
        );
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

  // ===========================
  // TAB SWITCHING
  // ===========================

  function switchTab(tab) {
    activeTab = tab;

    if (tabPresetBtn) {
      tabPresetBtn.classList.toggle("active", tab === "preset");
      tabPresetBtn.setAttribute("aria-pressed", String(tab === "preset"));
    }
    if (tabCustomBtn) {
      tabCustomBtn.classList.toggle("active", tab === "custom");
      tabCustomBtn.setAttribute("aria-pressed", String(tab === "custom"));
    }

    if (panelPreset) panelPreset.style.display = tab === "preset" ? "" : "none";
    if (panelCustom) panelCustom.style.display  = tab === "custom"  ? "" : "none";
  }

  if (tabPresetBtn) tabPresetBtn.addEventListener("click", () => switchTab("preset"));
  if (tabCustomBtn) tabCustomBtn.addEventListener("click", () => switchTab("custom"));

  // ===========================
  // EDITOR OPEN / CLOSE
  // ===========================

  function openEditor() {
    tempSelectedAvatarValue = savedAvatarValue;
    pendingCustomBlob = null;
    switchTab("preset");
    renderAvatarGrid();
    if (avatarEditorSection) {
      avatarEditorSection.style.display = "block";
      avatarEditorSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function closeEditor() {
    tempSelectedAvatarValue = savedAvatarValue;
    pendingCustomBlob = null;
    hideCustomSaveButton();
    if (avatarEditorSection) avatarEditorSection.style.display = "none";
  }

  // ===========================
  // SAVE PRESET AVATAR
  // ===========================

  function savePresetAvatar() {
    if (!validPresetIds.includes(tempSelectedAvatarValue)) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Invalid avatar selection.", "error");
      }
      return;
    }

    if (isGuest) {
      localStorage.setItem("tankDuelGuestAvatar", tempSelectedAvatarValue);
      savedAvatarType  = "preset";
      savedAvatarValue = tempSelectedAvatarValue;
      updateHeaderAvatar(savedAvatarValue, "preset");
      closeEditor();
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Avatar updated successfully!", "success");
      }
    } else {
      setSaveBtnLoading(true);

      TD.updateProfile({ avatar_type: "preset", avatar_value: tempSelectedAvatarValue })
        .then(() => {
          savedAvatarType  = "preset";
          savedAvatarValue = tempSelectedAvatarValue;
          updateHeaderAvatar(savedAvatarValue, "preset");
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
        .finally(() => setSaveBtnLoading(false));
    }
  }

  function setSaveBtnLoading(loading) {
    if (!saveAvatarBtn) return;
    saveAvatarBtn.disabled = loading;
    saveAvatarBtn.textContent = loading ? "SAVING..." : "SAVE AVATAR";
  }

  if (saveAvatarBtn) saveAvatarBtn.addEventListener("click", savePresetAvatar);

  // ===========================
  // FILE PICKER / DROP ZONE
  // ===========================

  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/webp"];

  function handleFileSelected(file) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Only JPEG, PNG, or WebP images are accepted.", "error");
      }
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Image must be 5 MB or smaller.", "error");
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        cropImage = img;
        openCropModal();
      };
      img.onerror = () => {
        if (typeof TD !== "undefined" && typeof TD.notify === "function") {
          TD.notify("Could not read the image file.", "error");
        }
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Could not read the image file.", "error");
      }
    };
    reader.readAsDataURL(file);
  }

  if (avatarUploadZone) {
    avatarUploadZone.addEventListener("click", () => {
      if (avatarFileInput) avatarFileInput.click();
    });
    avatarUploadZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (avatarFileInput) avatarFileInput.click();
      }
    });
    avatarUploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      avatarUploadZone.classList.add("drag-over");
    });
    avatarUploadZone.addEventListener("dragleave", () => {
      avatarUploadZone.classList.remove("drag-over");
    });
    avatarUploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      avatarUploadZone.classList.remove("drag-over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFileSelected(file);
    });
  }

  if (avatarFileInput) {
    avatarFileInput.addEventListener("change", () => {
      const file = avatarFileInput.files && avatarFileInput.files[0];
      if (file) handleFileSelected(file);
      // Reset so same file can be picked again
      avatarFileInput.value = "";
    });
  }

  if (cancelCustomBtn) cancelCustomBtn.addEventListener("click", closeEditor);

  // ===========================
  // CROP MODAL
  // ===========================

  const CROP_SIZE = 256; // Output canvas size (px)

  function openCropModal() {
    if (!cropCanvas || !cropImage) return;

    // ISSUE 2 FIX: Show the overlay FIRST so the browser lays out the
    // viewport and clientWidth/clientHeight are non-zero before we draw.
    if (cropOverlay) cropOverlay.style.display = "flex";

    // Wait one animation frame for layout to settle, then size + draw.
    requestAnimationFrame(() => {
      const viewport = cropCanvas.parentElement;
      const vw = (viewport && viewport.clientWidth  > 0) ? viewport.clientWidth  : 400;
      const vh = (viewport && viewport.clientHeight > 0) ? viewport.clientHeight : 400;

      cropCanvas.width  = vw;
      cropCanvas.height = vh;

      // Fit image to canvas (cover style — fills the square)
      const imgAspect  = cropImage.width / cropImage.height;
      const canvAspect = vw / vh;

      if (imgAspect > canvAspect) {
        cropScale = vh / cropImage.height;
      } else {
        cropScale = vw / cropImage.width;
      }

      // Centre image
      cropOffsetX = (vw - cropImage.width  * cropScale) / 2;
      cropOffsetY = (vh - cropImage.height * cropScale) / 2;

      drawCrop();
    });
  }

  function closeCropModal() {
    if (cropOverlay) cropOverlay.style.display = "none";
    cropImage = null;
  }

  function drawCrop() {
    if (!cropCanvas || !cropImage) return;
    const ctx = cropCanvas.getContext("2d");
    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(
      cropImage,
      cropOffsetX,
      cropOffsetY,
      cropImage.width  * cropScale,
      cropImage.height * cropScale
    );
  }

  // ---- Pan ----
  if (cropCanvas) {
    cropCanvas.addEventListener("mousedown", (e) => {
      cropIsDragging = true;
      cropDragStartX = e.clientX - cropOffsetX;
      cropDragStartY = e.clientY - cropOffsetY;
    });

    document.addEventListener("mousemove", (e) => {
      if (!cropIsDragging) return;
      cropOffsetX = e.clientX - cropDragStartX;
      cropOffsetY = e.clientY - cropDragStartY;
      drawCrop();
    });

    document.addEventListener("mouseup", () => {
      cropIsDragging = false;
    });

    // ---- Wheel zoom ----
    cropCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.08 : 0.93;
      const cx = cropCanvas.width  / 2;
      const cy = cropCanvas.height / 2;
      cropOffsetX = cx - (cx - cropOffsetX) * delta;
      cropOffsetY = cy - (cy - cropOffsetY) * delta;
      cropScale  *= delta;
      drawCrop();
    }, { passive: false });

    // ---- Touch pan + pinch zoom ----
    let lastTouchX = 0;
    let lastTouchY = 0;

    cropCanvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        cropIsDragging = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        cropIsDragging = false;
        cropPinchStartDist  = getTouchDist(e.touches);
        cropPinchStartScale = cropScale;
      }
    }, { passive: true });

    cropCanvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && cropIsDragging) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        cropOffsetX += dx;
        cropOffsetY += dy;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        drawCrop();
      } else if (e.touches.length === 2) {
        const dist   = getTouchDist(e.touches);
        const ratio  = dist / cropPinchStartDist;
        const newScale = cropPinchStartScale * ratio;
        const cx = cropCanvas.width  / 2;
        const cy = cropCanvas.height / 2;
        const factor = newScale / cropScale;
        cropOffsetX = cx - (cx - cropOffsetX) * factor;
        cropOffsetY = cy - (cy - cropOffsetY) * factor;
        cropScale   = newScale;
        drawCrop();
      }
    }, { passive: false });

    cropCanvas.addEventListener("touchend", () => {
      cropIsDragging = false;
    }, { passive: true });
  }

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---- Apply crop -> 256x256 WebP blob ----
  function applyCrop() {
    if (!cropCanvas || !cropImage) return;

    const out = document.createElement("canvas");
    out.width  = CROP_SIZE;
    out.height = CROP_SIZE;
    const ctx  = out.getContext("2d");

    const displayW = cropCanvas.width;
    const displayH = cropCanvas.height;
    const scaleX = CROP_SIZE / displayW;
    const scaleY = CROP_SIZE / displayH;

    ctx.drawImage(
      cropImage,
      cropOffsetX * scaleX,
      cropOffsetY * scaleY,
      cropImage.width  * cropScale * scaleX,
      cropImage.height * cropScale * scaleY
    );

    out.toBlob(
      (blob) => {
        if (!blob) {
          if (typeof TD !== "undefined" && typeof TD.notify === "function") {
            TD.notify("Failed to process image. Please try again.", "error");
          }
          return;
        }
        pendingCustomBlob = blob;
        closeCropModal();
        // Show preview in header avatar
        const blobUrl = URL.createObjectURL(blob);
        if (profileAvatarImgEl) {
          profileAvatarImgEl.src = blobUrl;
          profileAvatarImgEl.style.display = "block";
          if (profileInitialEl) profileInitialEl.style.display = "none";
        }
        showCustomSaveButton();
      },
      "image/webp",
      0.85
    );
  }

  // ---- Dynamic SAVE AVATAR button for custom panel ----
  function showCustomSaveButton() {
    if (!panelCustom) return;
    let saveBtn = panelCustom.querySelector("#save-custom-avatar-btn");
    if (!saveBtn) {
      saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.id   = "save-custom-avatar-btn";
      saveBtn.className = "btn btn-primary";
      saveBtn.textContent = "SAVE AVATAR";
      saveBtn.addEventListener("click", saveCustomAvatar);
      const actions = panelCustom.querySelector(".avatar-editor-actions");
      if (actions) actions.insertBefore(saveBtn, actions.firstChild);
    }
    saveBtn.style.display = "";
  }

  function hideCustomSaveButton() {
    if (!panelCustom) return;
    const btn = panelCustom.querySelector("#save-custom-avatar-btn");
    if (btn) btn.style.display = "none";
  }

  // ---- Decode JWT to get auth.uid() without an extra network request ----
  // The access token is a Supabase JWT whose `sub` claim IS auth.uid().
  // Using this avoids a second TD.profile() round-trip AND eliminates any
  // UUID formatting mismatch that caused the 403 RLS violation.
  function _getAuthUidFromToken(token) {
    try {
      var parts = token.split(".");
      if (parts.length !== 3) return null;
      // Base64url → Base64 → JSON
      var payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      // Pad to multiple of 4
      while (payload.length % 4) payload += "=";
      var decoded = JSON.parse(atob(payload));
      return (decoded && decoded.sub) ? String(decoded.sub) : null;
    } catch (e) {
      return null;
    }
  }

  // ---- Upload to Supabase Storage via SDK, then PATCH backend ----
  //
  // WHY SDK UPLOAD instead of raw fetch():
  //   The Supabase Storage RLS policy evaluates auth.uid() from the session
  //   managed by the Supabase JS client.  A raw fetch() with a Bearer token
  //   works only when the SDK client has that session registered; otherwise
  //   auth.uid() resolves to null and RLS rejects the request.
  //   Using client.storage.from().upload() after setSession() guarantees
  //   the SDK attaches the correct authenticated headers automatically.
  function saveCustomAvatar() {
    if (!pendingCustomBlob) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("No cropped image ready. Please select and crop an image first.", "error");
      }
      return;
    }

    const saveBtn = panelCustom && panelCustom.querySelector("#save-custom-avatar-btn");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "UPLOADING..."; }

    const accessToken  = (typeof TD_getAccessToken  === "function") ? TD_getAccessToken()  : null;
    const refreshToken = localStorage.getItem("tankDuelRefreshToken") || null;

    if (!accessToken) {
      if (typeof TD !== "undefined" && typeof TD.notify === "function") {
        TD.notify("Not authenticated. Please log in and try again.", "error");
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "SAVE AVATAR"; }
      return;
    }

    // Step 1 — get (or create) the Supabase JS client
    TD.getSupabaseClient()
      .then((client) => {
        // Step 2 — inject the app's current session into the SDK client so
        // that auth.uid() resolves correctly in Storage RLS.
        return client.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken || "",
        }).then((sessionRes) => {
          if (sessionRes.error) {
            // Non-fatal: setSession might warn on missing refresh token.
            // As long as access_token is valid, upload will still succeed.
            console.warn("setSession warning:", sessionRes.error.message);
          }
          return client;
        });
      })
      .then((client) => {
        // Step 3 — resolve auth.uid() from the now-authenticated SDK session.
        // This is the exact UUID Supabase uses for RLS comparisons.
        return client.auth.getUser().then((userRes) => {
          const authUid = userRes.data && userRes.data.user ? userRes.data.user.id : null;
          if (!authUid) {
            // Fallback: decode JWT sub if SDK session not fully established
            const fallbackUid = _getAuthUidFromToken(accessToken);
            if (!fallbackUid) throw new Error("Could not determine authenticated user ID.");
            return { client, authUid: fallbackUid };
          }
          return { client, authUid };
        });
      })
      .then(({ client, authUid }) => {
        // Step 4 — upload 256×256 WebP blob via the SDK storage API.
        // The SDK automatically attaches the authenticated session headers.
        const storagePath = authUid + "/avatar.webp";

        return client.storage
          .from("user-avatars")
          .upload(storagePath, pendingCustomBlob, {
            contentType: "image/webp",
            upsert: true,           // create or replace
          })
          .then((uploadRes) => {
            if (uploadRes.error) {
              throw new Error("Storage upload failed: " + uploadRes.error.message);
            }
            return storagePath;
          });
      })
      .then((storagePath) => {
        // Step 5 — record the custom avatar in the player profile.
        return TD.updateProfile({ avatar_type: "custom", avatar_value: storagePath })
          .then(() => storagePath);
      })
      .then((storagePath) => {
        savedAvatarType   = "custom";
        savedAvatarValue  = storagePath;
        pendingCustomBlob = null;
        hideCustomSaveButton();
        closeEditor();
        updateHeaderAvatar(storagePath, "custom");
        if (typeof TD !== "undefined" && typeof TD.notify === "function") {
          TD.notify("Avatar updated successfully!", "success");
        }
      })
      .catch((err) => {
        console.error("Custom avatar save error:", err);
        if (typeof TD !== "undefined" && typeof TD.notify === "function") {
          TD.notify(
            (err && err.message) ? err.message : "Failed to upload avatar. Please try again.",
            "error"
          );
        }
      })
      .finally(() => {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "SAVE AVATAR"; }
      });
  }

  // Crop modal button wiring
  if (cropCancelBtn)  cropCancelBtn.addEventListener("click",  closeCropModal);
  if (cropCancelBtn2) cropCancelBtn2.addEventListener("click", closeCropModal);
  if (cropApplyBtn)   cropApplyBtn.addEventListener("click",   applyCrop);

  // ===========================
  // EDITOR TOGGLE + CANCEL
  // ===========================

  if (editAvatarBtn) {
    editAvatarBtn.addEventListener("click", () => {
      if (avatarEditorSection && avatarEditorSection.style.display === "block") {
        closeEditor();
      } else {
        openEditor();
      }
    });
  }

  if (cancelAvatarBtn)      cancelAvatarBtn.addEventListener("click", closeEditor);
  if (closeAvatarEditorBtn) closeAvatarEditorBtn.addEventListener("click", closeEditor);

  // ===========================
  // INITIALIZATION
  // ===========================

  loadAvatarManifest().then(() => {
    loadSavedAvatar();
  });
});
