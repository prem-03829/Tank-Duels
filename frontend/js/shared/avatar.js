/* =========================
   TD.avatar — Shared avatar resolution & rendering helper
   
   Usage:
     TD.resolveAvatarUrl(profileData, options)
     TD.renderUserAvatars(elements, options)
========================= */

(function () {
  var TD = window.TD || {};
  window.TD = TD;

  /**
   * Resolves the avatar URL for a given profile or guest state.
   * @param {Object} [profileData] Player profile object containing avatar_type & avatar_value
   * @param {Object} [options] Optional config { basePath: "../assets/images/avatars/" }
   * @returns {string} The resolved avatar image URL
   */
  TD.resolveAvatarUrl = function (profileData, options) {
    var opts = options || {};
    var basePath = opts.basePath || "../assets/images/avatars/";
    var isGuest = localStorage.getItem("tankDuelPlayerType") === "guest";

    if (isGuest) {
      var guestAvatar = localStorage.getItem("tankDuelGuestAvatar") || "tank-00";
      return basePath + guestAvatar + ".png";
    }

    var player = profileData && profileData.player ? profileData.player : profileData;

    if (player && player.avatar_type === "custom" && player.avatar_value) {
      var supabaseUrl = localStorage.getItem("tankDuelSupabaseUrl") || window._supabaseUrl || "";
      if (supabaseUrl) {
        return supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/user-avatars/" + player.avatar_value;
      }
    }

    var avatarValue = (player && player.avatar_value) ? player.avatar_value : "tank-00";
    return basePath + avatarValue + ".png";
  };

  /**
   * Renders the current user's avatar into target elements or default identity containers.
   * @param {HTMLElement|NodeList|Array<HTMLElement>} [elements] Target elements to populate.
   * @param {Object} [options] Config options e.g. { basePath: "../assets/images/avatars/" }
   * @returns {Promise<string>} Resolves with the avatar URL used
   */
  TD.renderUserAvatars = function (elements, options) {
    var opts = options || {};
    var basePath = opts.basePath || "../assets/images/avatars/";
    var isGuest = localStorage.getItem("tankDuelPlayerType") === "guest";

    function applyUrlToElements(url) {
      var targetEls = [];

      if (elements) {
        if (elements instanceof HTMLElement) {
          targetEls = [elements];
        } else if (elements instanceof NodeList || Array.isArray(elements)) {
          targetEls = Array.from(elements);
        }
      } else {
        targetEls = Array.from(
          document.querySelectorAll("#profile-avatar-img, [data-user-avatar], .account-menu-trigger, #account-menu-toggle")
        );
      }

      targetEls.forEach(function (el) {
        if (!el) return;

        if (el.tagName === "IMG") {
          el.src = url;
          el.style.display = "block";
          el.onerror = function () {
            el.src = basePath + "tank-00.png";
          };
        } else if (el.classList.contains("account-menu-trigger") || el.id === "account-menu-toggle") {
          var existingImg = el.querySelector("img.account-avatar-img");
          if (!existingImg) {
            existingImg = document.createElement("img");
            existingImg.className = "account-avatar-img";
            existingImg.alt = "Account Avatar";
            existingImg.style.width = "100%";
            existingImg.style.height = "100%";
            existingImg.style.objectFit = "contain";
            existingImg.style.display = "block";

            var svg = el.querySelector("svg");
            if (svg) svg.style.display = "none";

            el.appendChild(existingImg);
          }
          existingImg.src = url;
          existingImg.onerror = function () {
            existingImg.src = basePath + "tank-00.png";
          };
        } else {
          var containerImg = el.querySelector("img");
          if (!containerImg) {
            containerImg = document.createElement("img");
            containerImg.alt = "User Avatar";
            containerImg.style.width = "100%";
            containerImg.style.height = "100%";
            containerImg.style.objectFit = "contain";
            el.appendChild(containerImg);
          }
          containerImg.src = url;
          containerImg.onerror = function () {
            containerImg.src = basePath + "tank-00.png";
          };
        }
      });

      return url;
    }

    if (isGuest) {
      var guestUrl = TD.resolveAvatarUrl(null, opts);
      applyUrlToElements(guestUrl);
      return Promise.resolve(guestUrl);
    } else {
      if (typeof TD.profile === "function") {
        return TD.profile()
          .then(function (res) {
            var authUrl = TD.resolveAvatarUrl(res, opts);
            applyUrlToElements(authUrl);
            return authUrl;
          })
          .catch(function () {
            var fallbackUrl = TD.resolveAvatarUrl(null, opts);
            applyUrlToElements(fallbackUrl);
            return fallbackUrl;
          });
      } else {
        var fallbackUrl = TD.resolveAvatarUrl(null, opts);
        applyUrlToElements(fallbackUrl);
        return Promise.resolve(fallbackUrl);
      }
    }
  };

  // Automatically render avatars on DOMContentLoaded
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      TD.renderUserAvatars();
    });
  }
})();
