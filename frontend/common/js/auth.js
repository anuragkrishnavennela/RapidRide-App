// common/js/auth.js
// Hybrid auth: use backend when available (calls /auth/login, /auth/register, /auth/me),
// fall back to localStorage demo mode when not.

(function () {
  'use strict';

  const KEY_CUR = 'rr_current';
  const KEY_TOKEN = 'token'; // Firebase JWT token (primary)
  const KEY_FIREBASE_TOKEN = 'firebaseToken'; // Firebase ID token
  const KEY_LEGACY_TOKEN = 'rr_token'; // Legacy token (fallback only)

  // Cache for current user (only as temporary cache, always fetch from server when possible)
  let _userCache = null;

  function getCurrent() {
    // Return cached user if available (will be populated by populateFromServer)
    return _userCache;
  }

  function setCurrent(u) {
    _userCache = u;
    notifyChange();
  }

  const _listeners = [];
  function notifyChange() { _listeners.forEach(fn => { try { fn(); } catch (e) { } }); }
  function onChange(fn) { _listeners.push(fn); }

  // Ensure a basic appConfig and apiFetch exist so pages don't need to include extra scripts
  function readMeta(name) { var el = document.querySelector('meta[name="' + name + '"]'); return el ? el.getAttribute('content') : null; }

  // Use API_CONFIG if available, otherwise fallback to meta tag or production URL
  function getDefaultApiBase() {
    if (window.API_CONFIG && window.API_CONFIG.BASE_URL) {
      return window.API_CONFIG.BASE_URL;
    }
    return readMeta('api-base') || 'https://us-central1-rapidrideonline.cloudfunctions.net/api';
  }

  var defaultApiBase = getDefaultApiBase();
  if (!window.appConfig) window.appConfig = { apiBase: defaultApiBase, setApiBase: function (b) { this.apiBase = b; } };

  if (!window.apiFetch) {
    window.apiFetch = async function (path, options) {
      // Re-check API_CONFIG on each call in case it was loaded late
      var base = (window.API_CONFIG && window.API_CONFIG.BASE_URL) || (window.appConfig && window.appConfig.apiBase) || defaultApiBase;
      base = base.replace(/\/$/, '');
      var url = path.indexOf('http') === 0 ? path : base + (path.indexOf('/') === 0 ? path : '/' + path);
      options = options || {};
      options.headers = options.headers || {};
      if (options.body && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      // Get fresh Firebase ID token
      var token = null;
      try {
        if (typeof firebase !== 'undefined' && firebase.auth) {
          var currentUser = firebase.auth().currentUser;
          if (currentUser) {
            token = await currentUser.getIdToken(true); // Force refresh
          } else {
            console.warn('No Firebase user logged in');
          }
        }
      } catch (err) {
        console.error('Failed to get Firebase token:', err);
      }

      // Fallback: If no live Firebase user (e.g., page load), use stored token
      if (!token) {
        token = localStorage.getItem('token') || localStorage.getItem('firebaseToken');
      }

      if (token) options.headers['Authorization'] = 'Bearer ' + token;

      var res = await fetch(url, options).catch(err => { throw err; });
      var text = await res.text();
      try { return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null }; }
      catch (e) { return { ok: res.ok, status: res.status, data: text }; }
    };
  }

  // Expose Auth API
  window.Auth = {
    // register: tries backend /auth/register ONLY (no localStorage fallback)
    register: async function (user) {
      try {
        var res = await window.apiFetch('/auth/register', { method: 'POST', body: user });
        if (res.ok) {
          // No JWT token - Firebase handles authentication
          if (res.data && res.data.user) setCurrent(res.data.user);
          return { success: true };
        } else {
          // server returned error - surface message if provided
          return { success: false, message: (res.data && res.data.message) || ('Server returned ' + res.status) };
        }
      } catch (err) {
        // network error - NO FALLBACK, show error
        return { success: false, message: 'Cannot connect to server. Please ensure the backend is running.' };
      }
    },

    // login: async function (email, password) {
    //   try {
    //     var res = await window.apiFetch('/auth/login', { method: 'POST', body: { email: email, password: password } });
    //     if (res.ok) {
    //       if (res.data && res.data.token) localStorage.setItem(KEY_TOKEN, res.data.token);
    //       if (res.data && res.data.user) setCurrent(res.data.user);
    //       // try to determine role
    //       var role = (res.data && res.data.user && res.data.user.role) || (getCurrent() && getCurrent().role) || null;
    //       return { success: true, role: role };
    //     } else {
    //       return { success: false, message: (res.data && res.data.message) || ('Server returned ' + res.status) };
    //     }
    //   } catch (err) {
    //     // fallback to local
    //     try { return local_login(email, password); } catch (e) { return { success: false, message: e.message } }
    //   }
    // },
    login: async function (email, password) {
      try {
        var res = await window.apiFetch('/auth/login', { method: 'POST', body: { email: email, password: password } });
        if (res.ok) {
          if (res.data && res.data.token) localStorage.setItem('token', res.data.token);
          if (res.data && res.data.user) setCurrent(res.data.user);
          // try to determine role
          var role = (res.data && res.data.user && res.data.user.role) || (getCurrent() && getCurrent().role) || null;
          return { success: true, role: role };
        } else {
          return { success: false, message: (res.data && res.data.message) || ('Server returned ' + res.status) };
        }
      } catch (err) {
        // NO FALLBACK - show error
        return { success: false, message: 'Cannot connect to server. Please ensure the backend is running.' };
      }
    },

    // synchronous currentUser for pages that run on load (returns cached data)
    currentUser: function () { return getCurrent(); },

    // update current user cache
    setCurrent: function (u) { setCurrent(u); },

    // ALWAYS fetch current user from backend /auth/me (this is the primary method)
    populateFromServer: async function () {
      var token = localStorage.getItem('token') || localStorage.getItem('firebaseToken') || localStorage.getItem(KEY_LEGACY_TOKEN);
      if (!token) {
        setCurrent(null);
        return null;
      }
      try {
        var r = await window.apiFetch('/auth/me', { method: 'GET' });
        if (r.ok && r.data && r.data.user) {
          setCurrent(r.data.user);
          return r.data.user;
        } else {
          // Token invalid or user not found
          setCurrent(null);
          return null;
        }
      } catch (e) {
        console.warn('Failed to fetch user from server:', e);
        setCurrent(null);
        return null;
      }
    },

    // Security Question Helpers
    getSecurityQuestion: async function (email) {
      try {
        var res = await window.apiFetch('/auth/security-question/' + encodeURIComponent(email));
        return res.ok ? { success: true, question: res.data.question } : { success: false, message: res.data.message };
      } catch (e) { return { success: false, message: 'Network error' }; }
    },

    verifyAnswer: async function (email, answer) {
      try {
        var res = await window.apiFetch('/auth/verify-answer', { method: 'POST', body: { email: email, answer: answer } });
        return res.ok ? { success: true } : { success: false, message: res.data.message };
      } catch (e) { return { success: false, message: 'Network error' }; }
    },

    resetPassword: async function (email, answer, newPassword) {
      try {
        var res = await window.apiFetch('/auth/reset-password', { method: 'POST', body: { email: email, answer: answer, newPassword: newPassword } });
        return res.ok ? { success: true } : { success: false, message: res.data.message };
      } catch (e) { return { success: false, message: 'Network error' }; }
    },

    changePassword: async function (newPassword) {
      try {
        var res = await window.apiFetch('/auth/change-password', { method: 'POST', body: { newPassword: newPassword } });
        return res.ok ? { success: true } : { success: false, message: res.data.message };
      } catch (e) { return { success: false, message: 'Network error' }; }
    },

    logout: async function () {
      // try server logout but ignore errors
      try { await window.apiFetch('/auth/logout', { method: 'POST' }); } catch (e) { }
      // Clear all Firebase tokens and cache
      localStorage.removeItem(KEY_CUR);
      localStorage.removeItem('token');
      localStorage.removeItem('firebaseToken');
      localStorage.removeItem(KEY_LEGACY_TOKEN);
      localStorage.removeItem('emailToken');
      localStorage.removeItem('emailFirebaseToken');
      localStorage.removeItem('emailUser');
      sessionStorage.clear();
      setCurrent(null);
    }
  };

  // History guard: after successful login/register we push a protected history entry
  // so that pressing the browser Back button will pop to a pre-auth state — we
  // intercept popstate, show the confirm-logout modal, and push the protected
  // state back to keep the user on the page until they confirm logout.
  let historyGuardActive = false;
  function pushProtectedHistory() {
    try {
      if (historyGuardActive) return;
      // mark the current (pre-auth) entry so popstate can detect it
      const prevState = Object.assign({}, history.state || {}, { rr_prev: true });
      history.replaceState(prevState, document.title);
      // push a protected marker representing the authenticated view
      history.pushState({ rr_protected: true }, document.title);
      historyGuardActive = true;
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('popstate', function (e) {
    try {
      const state = e.state || {};
      // if navigating to a pre-auth marker while we are authenticated, show confirm
      if ((state.rr_prev || state.rr_previous) && Auth && Auth.currentUser && Auth.currentUser()) {
        // restore protected state so the user remains on the current page
        history.pushState({ rr_protected: true }, document.title);
        // show logout modal if available
        if (window.RRLogout && typeof window.RRLogout.showModal === 'function') {
          window.RRLogout.showModal();
        } else {
          // fallback confirmation
          const ok = window.confirm('Do you want to logout? Press OK to logout or Cancel to stay signed in.');
          if (ok) {
            Auth.logout().then(() => {
              // attempt safe redirect after logout
              try { window.location.href = 'index.html'; } catch (e) { location.reload(); }
            });
          }
        }
      }
    } catch (e) { /* ignore */ }
  });

  // ensure guard is enabled for backend or local success paths
  // modify register to enable history guard after successful sign-up
  const _origRegister = window.Auth && window.Auth.register ? window.Auth.register : null;
  if (_origRegister) {
    const newRegister = async function (user) {
      const res = await _origRegister.call(this, user);
      if (res && res.success) pushProtectedHistory();
      return res;
    };
    window.Auth.register = newRegister;
  }

  // modify login to enable history guard after successful login
  const _origLogin = window.Auth && window.Auth.login ? window.Auth.login : null;
  if (_origLogin) {
    const newLogin = async function (email, password) {
      const res = await _origLogin.call(this, email, password);
      if (res && res.success) pushProtectedHistory();
      return res;
    };
    window.Auth.login = newLogin;
  }

  // modify populateFromServer so that on successful populate we also enable the guard
  const _origPopulate = window.Auth && window.Auth.populateFromServer ? window.Auth.populateFromServer : null;
  if (_origPopulate) {
    const newPopulate = async function () {
      const u = await _origPopulate.call(this);
      if (u) pushProtectedHistory();
      return u;
    };
    window.Auth.populateFromServer = newPopulate;
  }

})();
