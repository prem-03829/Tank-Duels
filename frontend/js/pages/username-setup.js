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
        localStorage.setItem("tankDuelPlayerType", "user");
        localStorage.setItem("tankDuelPlayerName", String(name).replace(/[<>&"']/g, ""));
        window.location.href = "./dashboard.html";
      } else {
        showForm();
      }
    })
    .catch(function (err) {
      if (err && err.status === 404) {
        showForm();
      } else {
        alert("Session error. Please log in again.");
        window.location.href = "./login.html";
      }
    });

  function showForm() {
    if (loadingBox) loadingBox.style.display = "none";
    if (form) form.style.display = "flex";
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var username = form.username.value.trim();

      if (!username) {
        alert("Please enter a username.");
        return;
      }

      if (username.length < 3) {
        alert("Username must be at least 3 characters long.");
        return;
      }

      if (username.length > 50) {
        alert("Username must be 50 characters or fewer.");
        return;
      }

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

          localStorage.setItem("tankDuelPlayerType", "user");
          localStorage.setItem("tankDuelPlayerName", String(createdName).replace(/[<>&"']/g, ""));

          window.location.href = "./dashboard.html";
        })
        .catch(function (error) {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          var msg = (error && error.error) || "Could not create profile. Please try again.";
          alert(msg);
        });
    });
  }
});
