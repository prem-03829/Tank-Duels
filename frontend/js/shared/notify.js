/* =========================
   TD.notify — lightweight toast notification
   TD.formError — inline form-level error banner

   Usage:
     TD.notify("Message", "error" | "success" | "warning" | "info")
     TD.formError(formEl, "Message")   // shows banner above submit button
     TD.formErrorClear(formEl)         // hides the banner
========================= */

(function () {
  var TD = window.TD || {};
  window.TD = TD;

  /* -------------------------------------------------------
     TOAST NOTIFICATION
     Appears fixed at the top-right and fades out after 4 s.
  ------------------------------------------------------- */

  var _toastContainer = null;

  function getToastContainer() {
    if (_toastContainer && document.body.contains(_toastContainer)) {
      return _toastContainer;
    }
    _toastContainer = document.createElement("div");
    _toastContainer.setAttribute("aria-live", "polite");
    _toastContainer.setAttribute("aria-atomic", "false");
    _toastContainer.style.cssText = [
      "position:fixed",
      "top:1.25rem",
      "right:1.25rem",
      "z-index:9999",
      "display:flex",
      "flex-direction:column",
      "gap:0.5rem",
      "max-width:min(360px, calc(100vw - 2.5rem))",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(_toastContainer);
    return _toastContainer;
  }

  var TYPE_STYLES = {
    error: {
      bg: "rgba(224,122,112,0.12)",
      border: "rgba(224,122,112,0.35)",
      color: "#ef9f97",
      icon: "x",
    },
    success: {
      bg: "rgba(125,156,98,0.12)",
      border: "rgba(125,156,98,0.35)",
      color: "#9dc874",
      icon: "v",
    },
    warning: {
      bg: "rgba(255,204,51,0.1)",
      border: "rgba(255,204,51,0.3)",
      color: "#f5cc55",
      icon: "!",
    },
    info: {
      bg: "rgba(77,163,255,0.1)",
      border: "rgba(77,163,255,0.3)",
      color: "#7dbfff",
      icon: "i",
    },
  };

  TD.notify = function (message, type) {
    var s = TYPE_STYLES[type] || TYPE_STYLES.info;
    var container = getToastContainer();

    var toast = document.createElement("div");
    toast.setAttribute("role", "alert");
    toast.style.cssText = [
      "display:flex",
      "align-items:flex-start",
      "gap:0.6rem",
      "padding:0.75rem 1rem",
      "border-radius:4px",
      "border:1px solid " + s.border,
      "background:" + s.bg,
      "color:" + s.color,
      "font-family:var(--font-body,'Hanken Grotesk',sans-serif)",
      "font-size:0.875rem",
      "line-height:1.45",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "box-shadow:0 4px 16px rgba(0,0,0,0.32)",
      "pointer-events:auto",
      "opacity:0",
      "transform:translateX(12px)",
      "transition:opacity 200ms ease,transform 200ms ease",
    ].join(";");

    var iconEl = document.createElement("span");
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.style.cssText = "flex-shrink:0;font-size:0.9rem;margin-top:1px;font-weight:700;";
    iconEl.textContent = s.icon;

    var textEl = document.createElement("span");
    textEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(textEl);
    container.appendChild(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(0)";
      });
    });

    var DURATION = 4000;
    var timer = setTimeout(function () {
      removeToast(toast);
    }, DURATION);

    toast.style.cursor = "pointer";
    toast.addEventListener("click", function () {
      clearTimeout(timer);
      removeToast(toast);
    });

    return toast;
  };

  function removeToast(toast) {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(12px)";
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }

  /* -------------------------------------------------------
     FORM-LEVEL INLINE BANNER
     Inserts / reuses a <div> immediately before the submit
     button inside the given form element.
  ------------------------------------------------------- */

  TD.formError = function (formEl, message) {
    if (!formEl) return;

    var banner = formEl.querySelector(".td-form-error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "td-form-error-banner";
      banner.setAttribute("role", "alert");
      banner.style.cssText = [
        "display:none",
        "padding:0.65rem 0.85rem",
        "border-radius:4px",
        "border:1px solid rgba(224,122,112,0.35)",
        "background:rgba(224,122,112,0.1)",
        "color:#ef9f97",
        "font-size:0.875rem",
        "line-height:1.45",
      ].join(";");

      var submitBtn = formEl.querySelector('button[type="submit"]');
      if (submitBtn) {
        formEl.insertBefore(banner, submitBtn);
      } else {
        formEl.appendChild(banner);
      }
    }

    banner.textContent = message;
    banner.style.display = "block";
  };

  TD.formErrorClear = function (formEl) {
    if (!formEl) return;
    var banner = formEl.querySelector(".td-form-error-banner");
    if (banner) banner.style.display = "none";
  };
})();
