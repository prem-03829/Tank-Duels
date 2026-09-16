document.addEventListener('DOMContentLoaded', function () {
  /* 1v1 SAME DEVICE is a plain link to the existing game setup flow; nothing
     to wire here. ONLINE is only available to an authenticated session: the
     card navigates to the online flow for logged-in players and stays a
     non-interactive "coming soon" for guests. Guest Mode must never reach the
     authenticated API layer, so a guest click is swallowed here (no server
     call, no navigation). */
  var onlineCard = document.querySelector('#online-mode');
  var onlineNotice = document.querySelector('#online-message');
  var onlineStatus = document.querySelector('#online-mode-status');

  var isAuthenticated =
    localStorage.getItem('tankDuelPlayerType') === 'user' &&
    typeof TD_isAuthenticated === 'function' &&
    TD_isAuthenticated();

  function showNotice(text) {
    if (onlineNotice) onlineNotice.textContent = text;
    if (!onlineNotice) return;
    onlineNotice.classList.remove('is-visible');
    void onlineNotice.offsetWidth;
    onlineNotice.classList.add('is-visible');
  }

  if (!onlineCard) return;

  if (isAuthenticated) {
    onlineCard.classList.remove('mode-disabled');
    onlineCard.setAttribute('aria-disabled', 'false');
    if (onlineStatus) {
      onlineStatus.textContent = 'Available';
      onlineStatus.classList.remove('coming-soon');
      onlineStatus.classList.add('available');
    }
    return;
  }

  // Guest / unsigned visitor: the card stays disabled and never navigates.
  onlineCard.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    showNotice('Log in to play online.');
  });
});