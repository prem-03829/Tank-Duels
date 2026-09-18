document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("#username-setup-form");
  var loadingBox = document.querySelector("#setup-loading");

  if (!TD_isAuthenticated()) {
    window.location.href = "./login.html";
    return;
  }

  TD.profile()
    .then(function (res) {
      if (res && res.player) {
        var name = res.player.username || "Player";
        localStorage.setItem("tankDuelsPlayerType", "user");
        localStorage.setItem(
          "tankDuelsPlayerName",
          String(name).replace(/[<>&"']/g, ""),
        );
        window.location.href = "./dashboard.html";
      } else {
        showForm();
      }
    })
    .catch(function (err) {
      if (err && err.status === 404) {
        showForm();
      } else {
        TD.notify("Session error. Please log in again.", "error");
        setTimeout(function () {
          window.location.href = "./login.html";
        }, 2000);
      }
    });

  function showForm() {
    if (loadingBox) loadingBox.style.display = "none";
    if (form) form.style.display = "flex";
  }

  if (form) {
    var usernameInput = form.querySelector("#username");
    if (usernameInput) {
      usernameInput.addEventListener("input", function () {
        TD.formErrorClear(form);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var username = form.username.value.trim();

      if (!username) {
        TD.formError(form, "Please enter a username.");
        return;
      }

      if (username.length < 3) {
        TD.formError(form, "Username must be at least 3 characters long.");
        return;
      }

      if (username.length > 50) {
        TD.formError(form, "Username must be 50 characters or fewer.");
        return;
      }

      TD.formErrorClear(form);
      var submitButton = form.querySelector('button[type="submit"]');
      var originalLabel = submitButton ? submitButton.textContent : null;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Saving username…";
      }

      TD.createProfile(username)
        .then(function (payload) {
          var player = (payload && payload.player) || {};
          var createdName = player.username || username;

          localStorage.setItem("tankDuelsPlayerType", "user");
          localStorage.setItem(
            "tankDuelsPlayerName",
            String(createdName).replace(/[<>&"']/g, ""),
          );

          window.location.href = "./dashboard.html";
        })
        .catch(function (error) {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          if (
            error &&
            error.status === 409 &&
            error.error === "Username already taken"
          ) {
            TD.formError(form, "Username already taken");
            return;
          }
          var msg =
            (error && error.error) ||
            "Could not create profile. Please try again.";
          TD.formError(form, msg);
        });
    });
  }
});
