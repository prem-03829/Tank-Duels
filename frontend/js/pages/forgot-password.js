document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("#forgot-password-form");
  var statusBox = document.querySelector("#forgot-status");

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var email = form.email.value.trim();
      if (!email) {
        alert("Please enter your email.");
        return;
      }

      var submitButton = form.querySelector('button[type="submit"]');
      var originalLabel = submitButton ? submitButton.textContent : null;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending link…";
      }

      var hostname = window.location.hostname;
      var redirectTo = "http://127.0.0.1:5500/pages/reset-password.html";
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        redirectTo = "https://tank-duels-flax.vercel.app/pages/reset-password.html";
      }

      TD.forgotPassword(email, redirectTo)
        .then(function () {
          showGenericSuccess();
        })
        .catch(function (error) {
          if (error && error.status === 429) {
            alert("Too many attempts. Please try again later.");
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = originalLabel;
            }
          } else {
            showGenericSuccess();
          }
        });

      function showGenericSuccess() {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalLabel;
        }
        if (statusBox) {
          statusBox.textContent =
            "If an account exists for this email, a password reset link has been sent.";
          statusBox.style.display = "block";
        }
        form.reset();
      }
    });
  }
});
