/* ================================================================
   auth.js — Authentication logic
   ================================================================ */

const Auth = (() => {
  function login(username, password) {
    const users = Storage.Users.all();
    const user = users.find(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
    );
    if (!user) return { success: false, error: 'Invalid username or password.' };
    Storage.Session.set({ username: user.username, role: user.role, displayName: user.displayName });
    return { success: true, user };
  }

  function logout() {
    Storage.Session.clear();
    Router.navigate('login');
  }

  function requireAdmin() {
    if (!Storage.Session.isAdmin()) {
      Router.navigate('login');
      return false;
    }
    return true;
  }

  function requireAuth() {
    if (!Storage.Session.isLoggedIn()) {
      Router.navigate('login');
      return false;
    }
    return true;
  }

  function renderLoginPage(mode) {
    const session = Storage.Session.get();
    if (session) {
      Router.navigate(session.role === 'admin' ? 'admin' : 'user-dashboard');
      return;
    }

    _currentRole = 'admin'; // Default to admin

    document.getElementById('app-root').innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-logo">
            <div class="login-logo-icon">${UI.logoSVG}</div>
            <div>
              <div class="nav-logo-text">DataFlow</div>
              <div style="font-size:11px;color:var(--color-fog-veil);letter-spacing:1px;text-transform:uppercase;">Visual Workflow Builder</div>
            </div>
          </div>

          <div class="login-tabs" id="login-tabs">
            <button class="login-tab active" data-role="admin" onclick="Auth._switchTab('admin')">Admin</button>
            <button class="login-tab" data-role="user" onclick="Auth._switchTab('user')">Viewer</button>
          </div>

          <h1 class="login-title">Sign In</h1>
          <p class="login-subtitle" id="login-subtitle">Manage and build workflows as administrator.</p>

          <div class="login-error" id="login-error"></div>

          <form id="login-form" onsubmit="Auth._submit(event)">
            <div class="form-group">
              <label class="form-label" for="inp-username">Username</label>
              <input class="form-input" type="text" id="inp-username" value="admin" placeholder="Enter username" autocomplete="username" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="inp-password">Password</label>
              <input class="form-input" type="password" id="inp-password" value="admin123" placeholder="Enter password" autocomplete="current-password" required />
            </div>

            <div style="margin-top: var(--spacing-8); margin-bottom: var(--spacing-28);">
              <div style="font-size:12px;color:var(--color-fog-veil);padding:12px 16px;background:var(--surface-reef);border-radius:6px;line-height:1.6;" id="login-hint">
                Admin: <strong style="color:var(--color-snow-sheet)">admin</strong> / <strong style="color:var(--color-snow-sheet)">admin123</strong>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;" id="login-btn">
              Sign In ↗
            </button>
          </form>
        </div>
      </div>
    `;

    if (mode === 'auto') {
      const btn = document.getElementById('login-btn');
      if (btn) {
        btn.innerHTML = `<span class="spinner-inline" style="border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid var(--color-ice-mist); border-radius: 50%; width: 14px; height: 14px; display: inline-block; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle;"></span>Signing in as admin...`;
        btn.disabled = true;
      }
      setTimeout(() => {
        const form = document.getElementById('login-form');
        if (form) {
          Auth._submit(new Event('submit'));
        }
      }, 600);
    }
  }

  let _currentRole = 'admin';

  function _switchTab(role) {
    _currentRole = role;
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.login-tab[data-role="${role}"]`).classList.add('active');

    const subtitleMap = {
      admin: 'Manage and build workflows as administrator.',
      user: 'View shared workflows as a viewer.',
    };
    const hintMap = {
      admin: 'Admin: <strong style="color:var(--color-snow-sheet)">admin</strong> / <strong style="color:var(--color-snow-sheet)">admin123</strong>',
      user: 'Viewer: <strong style="color:var(--color-snow-sheet)">user</strong> / <strong style="color:var(--color-snow-sheet)">user123</strong>',
    };
    document.getElementById('login-subtitle').textContent = subtitleMap[role];
    document.getElementById('login-hint').innerHTML = hintMap[role];

    // Auto-fill credentials
    document.getElementById('inp-username').value = role === 'admin' ? 'admin' : 'user';
    document.getElementById('inp-password').value = role === 'admin' ? 'admin123' : 'user123';
  }

  function _submit(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;
    const errEl = document.getElementById('login-error');

    const result = login(username, password);
    if (!result.success) {
      errEl.textContent = result.error;
      errEl.classList.add('show');
      return;
    }

    errEl.classList.remove('show');
    UI.toast(`Welcome back, ${result.user.displayName}!`, 'success');

    setTimeout(() => {
      if (result.user.role === 'admin') {
        Router.navigate('admin');
      } else {
        Router.navigate('user-dashboard');
      }
    }, 300);
  }

  return { login, logout, requireAdmin, requireAuth, renderLoginPage, _switchTab, _submit };
})();

window.Auth = Auth;
