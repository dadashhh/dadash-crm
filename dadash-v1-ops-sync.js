(function () {
  var VERSION = 'lea-ops1';
  window.DADASH_V1_OPS_SYNC_VERSION = VERSION;
  if (window.__dadashV1OpsSync && window.__dadashV1OpsSync.version === VERSION) return;

  var state = window.__dadashV1OpsSync = {
    version: VERSION,
    openSince: Date.now(),
    lastSyncAt: 0,
    lastEvent: 'init',
    socketBound: false,
    socketConnected: false
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function clock(ts) {
    if (!ts) return '--:--:--';
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function openLabel() {
    var mins = Math.max(0, Math.floor((Date.now() - state.openSince) / 60000));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h > 0 ? h + 'h' + pad(m) : m + 'min';
  }
  function syncAgeMs() {
    return state.lastSyncAt ? Date.now() - state.lastSyncAt : Infinity;
  }
  function currentState() {
    if (!state.socketBound) return 'waiting';
    if (!state.socketConnected || syncAgeMs() > 90000) return 'reconnecting';
    return 'synced';
  }
  function ensureBadge() {
    var badge = document.getElementById('dadash-v1-ops-sync');
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'dadash-v1-ops-sync';
    badge.setAttribute('aria-live', 'polite');
    badge.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:9998',
      'display:flex',
      'gap:8px',
      'align-items:center',
      'max-width:min(420px,calc(100vw - 24px))',
      'padding:9px 11px',
      'border-radius:12px',
      'border:1px solid rgba(148,163,184,.35)',
      'background:rgba(15,23,42,.92)',
      'color:#e5e7eb',
      'font:600 11px/1.25 Inter,system-ui,sans-serif',
      'box-shadow:0 12px 32px rgba(0,0,0,.22)',
      'backdrop-filter:blur(10px)'
    ].join(';');
    document.body.appendChild(badge);
    return badge;
  }
  function render() {
    if (!document.body) return;
    var badge = ensureBadge();
    var st = currentState();
    var color = st === 'synced' ? '#22c55e' : st === 'reconnecting' ? '#f59e0b' : '#94a3b8';
    var label = st === 'synced' ? 'OK' : st === 'reconnecting' ? 'Reconnexion' : 'En attente';
    badge.setAttribute('data-state', st);
    badge.innerHTML = '<span style="width:7px;height:7px;border-radius:99px;background:' + color + ';display:inline-block"></span>' +
      '<span>Lea ops · ' + label + ' · Dernier sync ' + clock(state.lastSyncAt) + ' · Ouvert ' + openLabel() + '</span>';
  }
  function markSync(eventName) {
    state.lastSyncAt = Date.now();
    state.lastEvent = eventName || 'sync';
    render();
  }
  function bindSocket() {
    var socket = window.__dadashSocket;
    if (!socket || socket.__dadashV1OpsSyncBound) {
      render();
      return;
    }
    socket.__dadashV1OpsSyncBound = true;
    state.socketBound = true;
    state.socketConnected = socket.connected !== false;
    try {
      socket.on('connect', function () {
        state.socketConnected = true;
        markSync('socket.connect');
      });
      socket.on('disconnect', function () {
        state.socketConnected = false;
        render();
      });
      socket.on('connect_error', function () {
        state.socketConnected = false;
        render();
      });
      socket.on('conv_updated', function () { markSync('conv_updated'); });
      socket.on('new_message', function () { markSync('new_message'); });
      socket.on('message_read', function () { markSync('message_read'); });
    } catch (_) {}
    render();
  }
  function isSyncRead(url, method) {
    if (method && method !== 'GET') return false;
    return /\/conversations(\?|$)|\/messages(\?|$)|\/health(\?|$)/.test(String(url || ''));
  }

  var nativeFetch = window.fetch;
  if (nativeFetch && !nativeFetch.__dadashV1OpsSyncWrapped) {
    var wrappedFetch = function () {
      var args = arguments;
      var url = args[0] && args[0].url ? args[0].url : args[0];
      var opts = args[1] || {};
      var method = String(opts.method || (args[0] && args[0].method) || 'GET').toUpperCase();
      return nativeFetch.apply(this, arguments).then(function (res) {
        if (res && res.ok && isSyncRead(url, method)) markSync('fetch');
        return res;
      });
    };
    wrappedFetch.__dadashV1OpsSyncWrapped = true;
    window.fetch = wrappedFetch;
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      bindSocket();
      render();
    }
  });
  window.addEventListener('focus', function () {
    bindSocket();
    render();
  });
  window.addEventListener('dadashSocketReady', bindSocket);
  setInterval(function () {
    bindSocket();
    render();
  }, 15000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
  bindSocket();
})();
