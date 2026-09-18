document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("#reset-password-form");
  var errorBanner = document.querySelector("#reset-error-banner");
  var errorMessage = document.querySelector("#reset-error-message");
  var successBanner = document.querySelector("#reset-success-banner");
  var resetSwitch = document.querySelector("#reset-switch");

  var recoveryToken = null;

  function getParams() {
    var params = {};
    var hash = window.location.hash.substring(1);
    var search = window.location.search.substring(1);

    function parseString(str) {
      if (!str) return;
      var pairs = str.split("&");
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split("=");
        if (pair.length === 2) {
          params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
        }
      }
    }

    parseString(search);
    parseString(hash);
    return params;
  }

  var params = getParams();

  if (params.error || params.error_description) {
    showError(
      params.error_description || "The password reset link is invalid or has expired."
    );
  } else if (params.access_token) {
    recoveryToken = params.access_token;
  } else {
    showError("No valid reset token found in link. The link may have expired.");
  }

  function showError(msg) {
    if (form) form.style.display = "none";
    if (resetSwitch) resetSwitch.style.display = "none";
    if (errorMessage && msg) errorMessage.textContent = msg;
    if (errorBanner) errorBanner.style.display = "block";
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!recoveryToken) {
        showError("Invalid or missing reset token.");
        return;
      }

      var password = form.password.value;
      var confirmPassword = form["confirm-password"].value;

      if (!password || !confirmPassword) {
        alert("Please fill in both password fields.");
        return;
      }

      if (password.length < 6) {
        alert("Password must be at least 6 characters long.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      var submitButton = form.querySelector('button[type="submit"]');
      var originalLabel = submitButton ? submitButton.textContent : null;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Updating password…";
      }

      TD.resetPassword(password, recoveryToken)
        .then(function () {
          recoveryToken = null;
          if (form) form.style.display = "none";
          if (resetSwitch) resetSwitch.style.display = "none";
          if (successBanner) successBanner.style.display = "block";
        })
        .catch(function (error) {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
          }
          var msg =
            (error && error.error) ||
            "Failed to reset password. The link may have expired.";
          alert(msg);
        });
    });
  }
});
