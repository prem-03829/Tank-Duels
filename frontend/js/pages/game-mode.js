document.addEventListener('DOMContentLoaded', function () {
  /* 1v1 SAME DEVICE is a plain link to the existing game setup flow; nothing
     to wire here. ONLINE is visual-only for now: clicking it never navigates,
     contacts a server, or starts a game — it only reveals a short notice. */
  var onlineButton = document.querySelector('#online-mode');
  var onlineNotice = document.querySelector('#online-message');

  if (onlineButton && onlineNotice) {
    onlineButton.addEventListener('click', function (e) {
      e.preventDefault();
      if (e) e.stopPropagation();
      onlineNotice.classList.remove('is-visible');
      void onlineNotice.offsetWidth;
      onlineNotice.classList.add('is-visible');
    });
  }
});