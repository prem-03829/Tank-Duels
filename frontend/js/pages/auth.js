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

      TD.getSupabaseClient()
        .then((supabase) => {
          return supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: redirectTo,
            },
          });
        })
        .catch((err) => {
          googleBtn.disabled = false;
          googleBtn.innerHTML = originalHtml;
          TD.notify(
            (err && err.message) || "Failed to initialize Google Sign-In.",
            "error",
          );
        });
    });
  }
  // =========================
  // LOGIN
  // =========================

  if (loginForm) {
    // Check for returning Google OAuth session on page load
    if (
      typeof TD !== "undefined" &&
      typeof TD.getSupabaseClient === "function"
    ) {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      if (
        hash.includes("access_token=") ||
        hash.includes("error=") ||
        search.includes("code=")
      ) {
        TD.getSupabaseClient()
          .then((supabase) => {
            return supabase.auth.getSession();
          })
          .then((res) => {
            if (!res) return;
            const session = res.data ? res.data.session : null;
            const error = res.error;

            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, "", window.location.pathname);
            }

            if (error || !session) {
              if (error)
                TD.notify(
                  "Google Sign-In failed: " +
                    (error.message || "Unknown error"),
                  "error",
                );
              return;
            }

            // Use existing session storage mechanism
            TD_saveSession(session);
            localStorage.setItem("tankDuelsPlayerType", "user");

            // Call existing authenticated profile GET /api/player/me
            return TD.profile()
              .then((profileRes) => {
                const player = profileRes.player || {};
                const username = player.username || "Player";
                localStorage.setItem(
                  "tankDuelsPlayerName",
                  String(username).replace(/[<>&"']/g, ""),
                );
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
          })
          .catch(() => {
            /* ignored if client fails */
          });
      }
    }

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const email = loginForm.email.value.trim();
      const password = loginForm.password.value.trim();

      if (!email || !password) {
        TD.formError(loginForm, "Please fill in all fields.");
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

          localStorage.setItem("tankDuelsPlayerType", "user");
          localStorage.setItem(
            "tankDuelsPlayerName",
            username.replace(/[<>&"']/g, ""),
          );

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
    const usernameInput = signupForm.querySelector("#username");
    const passwordInput = signupForm.querySelector("#password");
    const dotsContainer = signupForm.querySelector(
      "#password-strength-container",
    );
    const dots = dotsContainer
      ? dotsContainer.querySelectorAll(".strength-dot")
      : [];

    function updatePasswordStrength(val) {
      if (!dots || dots.length === 0) return;

      let score = 0;
      if (val.length >= 8) score++;
      if (/[a-zA-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^a-zA-Z0-9]/.test(val)) score++;
      if (score === 4) score = 5; // All 4 criteria satisfied = 5/5 overall valid/strong

      // Colors: score 1 = red, 2 = orange, 3-4 = yellow/gold, 5 = green
      let color = "rgba(255, 255, 255, 0.15)";
      if (score === 1)
        color = "#ff4d4d"; // red
      else if (score === 2)
        color = "#ff944d"; // orange
      else if (score >= 3 && score < 5)
        color = "#ffd11a"; // yellow
      else if (score === 5) color = "#2ecc71"; // green

      dots.forEach((dot, index) => {
        if (index < score) {
          dot.style.background = color;
        } else {
          dot.style.background = "rgba(255, 255, 255, 0.15)";
        }
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener("input", (e) => {
        TD.formErrorClear(signupForm);
        updatePasswordStrength(e.target.value);
      });
    }

    if (usernameInput) {
      usernameInput.addEventListener("input", () => {
        TD.formErrorClear(signupForm);
      });
    }

    signupForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const username = signupForm.username.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;
      const confirmPassword = signupForm["confirm-password"].value;

      if (!username || !email || !password || !confirmPassword) {
        TD.formError(signupForm, "Please fill in all fields.");
        return;
      }

      if (password.length < 8) {
        TD.formError(
          signupForm,
          "Password must be at least 8 characters long.",
        );
        return;
      }

      if (!/[a-zA-Z]/.test(password)) {
        TD.formError(signupForm, "Password must contain at least 1 letter.");
        return;
      }

      if (!/[0-9]/.test(password)) {
        TD.formError(signupForm, "Password must contain at least 1 number.");
        return;
      }

      if (!/[^a-zA-Z0-9]/.test(password)) {
        TD.formError(
          signupForm,
          "Password must contain at least 1 symbol or special character.",
        );
        return;
      }

      if (password !== confirmPassword) {
        TD.formError(signupForm, "Passwords do not match.");
        return;
      }

      TD.formErrorClear(signupForm);
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
            localStorage.setItem("tankDuelsPlayerType", "user");
            localStorage.setItem(
              "tankDuelsPlayerName",
              username.replace(/[<>&"']/g, ""),
            );
            window.location.href = "./dashboard.html";
            return;
          }

          // No session yet (email confirmation required): show inline success and redirect.
          TD.notify(
            "Account created! Please check your email to confirm, then log in.",
            "success",
          );
          setTimeout(function () {
            window.location.href = "./login.html";
          }, 2500);
        })
        .catch((error) => {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          if (
            error &&
            error.status === 409 &&
            error.error === "Username already taken"
          ) {
            TD.formError(signupForm, "Username already taken");
            return;
          }
          handleAuthError(error);
        });
    });
  }

  /* Map backend errors to friendly, human-readable messages. */
  function handleAuthError(error) {
    const status = (error && error.status) || 0;
    var msg;

    if (status === 400) {
      msg = (error && error.error) || "Please check your input.";
    } else if (status === 401) {
      msg = (error && error.error) || "Invalid email or password.";
    } else if (status === 404) {
      msg = (error && error.error) || "Account not found.";
    } else if (status === 409) {
      msg =
        (error && error.error) ||
        "An account with these details already exists.";
    } else if (status === 429) {
      msg = "Too many attempts. Please try again later.";
    } else if (status >= 500) {
      msg = "Something went wrong on our end. Please try again shortly.";
    } else if (!status) {
      msg = "Cannot reach the server. Please make sure the backend is running.";
    } else {
      msg = (error && error.error) || "Authentication failed.";
    }

    // Show in active form if present, otherwise toast
    var activeForm = loginForm || signupForm;
    if (activeForm) {
      TD.formError(activeForm, msg);
    } else {
      TD.notify(msg, "error");
    }
  }
});
