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

      // Temporary session
      // Flask authentication will replace this later

      const username = email.split("@")[0];

      localStorage.setItem("tankDuelPlayerType", "user");
      localStorage.setItem("tankDuelPlayerName", username);

      window.location.href = "./dashboard.html";
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
      const confirmPassword = signupForm["confirm-password"].value;

      if (!username || !email || !password || !confirmPassword) {
        alert("Please fill in all fields.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      // Temporary session
      // Flask + Supabase will handle account creation later

      localStorage.setItem("tankDuelPlayerType", "user");
      localStorage.setItem("tankDuelPlayerName", username);

      window.location.href = "./dashboard.html";
    });
  }
});
