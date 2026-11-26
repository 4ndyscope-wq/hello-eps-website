/* Keeps examination navigation private until the server confirms a signed-in teacher role. */
(function () {
  'use strict';

  const navItems = document.querySelectorAll('[data-student-portal-link]');
  if (!navItems.length) return;

  function setPortalLink(role) {
    navItems.forEach(function (link) {
      const prefix = link.getAttribute('data-root-prefix') || '';
      if (role === 'admin') {
        link.hidden = false;
        link.textContent = 'Exam Admin';
        link.href = prefix + 'exam-admin.html';
        link.setAttribute('aria-label', 'Open examination administration');
        link.dataset.authenticated = 'true';
      } else {
        // This build is administrator-only; teacher and anonymous sessions stay hidden.
        link.hidden = true;
        delete link.dataset.authenticated;
      }
    });
  }

  async function checkSession() {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Not signed in');
      const payload = await response.json();
      const role = payload && payload.user ? payload.user.role : null;
      setPortalLink(role);
    } catch (_) {
      // The HTML starts with this item hidden, so failed/anonymous sessions stay private.
      setPortalLink(null);
    }
  }

  checkSession();
})();
