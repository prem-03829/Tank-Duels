document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#login-form");
  const signupForm = document.querySelector("#signup-form");

  // =========================
  // GOOGLE SIGN-IN
  // =========================
  const googleBtn = document.querySelector("#google-signin-btn");
  if (googleBtn) {
    googleBtn.addEventListener("click", () => {
      const originalHtml = googleBtn.innerHTML;
      googleBtn.disabled = true;
      googleBtn.textContent = "Connecting to Google…";

      const redirectTo = window.location.origin + "/pages/login.html";

      TD.getSupabaseClient().then((supabase) => {
        return supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectTo,
          },
        });
      }).catch((err) => {
        googleBtn.disabled = false;
        googleBtn.innerHTML = originalHtml;
        alert((err && err.message) || "Failed to initialize Google Sign-In.");
      });
    });
  }
  // =========================
  // LOGIN
  // =========================

  if (loginForm) {
    // Check for returning Google OAuth session on page load
    if (typeof TD !== "undefined" && typeof TD.getSupabaseClient === "function") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      if (hash.includes("access_token=") || hash.includes("error=") || search.includes("code=")) {
        TD.getSupabaseClient().then((supabase) => {
          return supabase.auth.getSession();
        }).then((res) => {
          if (!res) return;
          const session = res.data ? res.data.session : null;
          const error = res.error;

          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", window.location.pathname);
          }

          if (error || !session) {
            if (error) alert("Google Sign-In failed: " + (error.message || "Unknown error"));
            return;
          }

          // Use existing session storage mechanism
          TD_saveSession(session);
          localStorage.setItem("tankDuelPlayerType", "user");

          // Call existing authenticated profile GET /api/player/me
          return TD.profile()
            .then((profileRes) => {
              const player = profileRes.player || {};
              const username = player.username || "Player";
              localStorage.setItem("tankDuelPlayerName", String(username).replace(/[<>&"']/g, ""));
              window.location.href = "./dashboard.html";
            })
            .catch((profileErr) => {
              if (profileErr && profileErr.status === 404) {
                // First-time Google user: no profile yet
                window.location.href = "./username-setup.html";
              } else {
                handleAuthError(profileErr);
              }
            });
        }).catch(() => {
          /* ignored if client fails */
        });
      }
    }



    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const email = loginForm.email.value.trim();
      const password = loginForm.password.value.trim();

      if (!email || !password) {
        alert("Please fill in all fields.");
        return;
      }

      // Show a small loading state so users aren't left guessing during the
      // network round-trip.
      const submitButton = loginForm.querySelector('button[type="submit"]');
      const originalLabel = submitButton ? submitButton.textContent : null;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Signing in…";
      }

      TD.login(email, password)
        .then((payload) => {
          TD_saveSession(payload.session);

          // Authenticated session — the server owns the identity.
          const user = payload.user || {};
          const emailValue = user.email || email;
          const username = String(emailValue).split("@")[0] || "Player";

          localStorage.setItem("tankDuelPlayerType", "user");
          localStorage.setItem("tankDuelPlayerName", username.replace(/[<>&"']/g, ""));

          window.location.href = "./dashboard.html";
        })
        .catch((error) => {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          handleAuthError(error);
        });
    });
  }

  // =========================
  // SIGN UP
  // =========================

  if (signupForm) {
    signupForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const username = signupForm.username.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;
      const confirmPassword = signupForm['confirm-password'].value;

      if (!username || !email || !password || !confirmPassword) {
        alert("Please fill in all fields.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      const submitButton = signupForm.querySelector('button[type="submit"]');
      const originalLabel = submitButton ? submitButton.textContent : null;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Creating account…";
      }

      TD.signup(username, email, password)
        .then((payload) => {
          // A 201 with a session is common (email confirmation disabled).
          if (payload.session) {
            TD_saveSession(payload.session);
            localStorage.setItem("tankDuelPlayerType", "user");
            localStorage.setItem("tankDuelPlayerName", username.replace(/[<>&"']/g, ""));
            window.location.href = "./dashboard.html";
            return;
          }

          // No session yet (email confirmation required): go straight to login.
          alert("Account created. Please check your email to confirm, then log in.");
          window.location.href = "./login.html";
        })
        .catch((error) => {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          handleAuthError(error);
        });
    });
  }

  /* Map backend errors to friendly, human-readable messages. */
  function handleAuthError(error) {
    const status = (error && error.status) || 0;

    if (status === 400) {
      alert((error && error.error) || "Please check your input.");
    } else if (status === 401) {
      alert((error && error.error) || "Invalid email or password.");
    } else if (status === 404) {
      alert((error && error.error) || "Account not found.");
    } else if (status === 409) {
      alert((error && error.error) || "An account with these details already exists.");
    } else if (status === 429) {
      alert("Too many attempts. Please try again later.");
    } else if (status >= 500) {
      alert("Something went wrong on our end. Please try again shortly.");
    } else if (!status) {
      alert("Cannot reach the server. Please make sure the backend is running.");
    } else {
      alert((error && error.error) || "Authentication failed.");
    }
  }
});
