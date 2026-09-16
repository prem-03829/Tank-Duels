document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#login-form");
  const signupForm = document.querySelector("#signup-form");

  // =========================
  // LOGIN
  // =========================

  if (loginForm) {
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
