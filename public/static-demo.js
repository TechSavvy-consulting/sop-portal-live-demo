(function () {
  const isPages = /github\.io$/i.test(location.hostname) || new URLSearchParams(location.search).has('staticDemo');
  if (!isPages) return;
  window.STATIC_DEMO = true;

  const nativeFetch = window.fetch.bind(window);
  const repoBase = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length ? `/${parts[0]}/` : '/';
  })();
  const password = 'DemoPass!2026';
  const adminRoles = new Set(['Admin', 'Manager', 'Editor']);
  const managerRoles = new Set(['Admin', 'Manager']);
  const storePrefix = 'cedar-ridge-sop-demo:';
  let cache = {};

  function asset(path) {
    path = String(path || '').replace(/^\/+/, '');
    return repoBase + path;
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function textResponse(text, status = 200) {
    return new Response(text, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  function key(name) {
    return storePrefix + name;
  }

  function getStore(name, fallback) {
    try {
      const raw = localStorage.getItem(key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setStore(name, value) {
    localStorage.setItem(key(name), JSON.stringify(value));
  }

  async function loadJson(path) {
    if (!cache[path]) {
      const res = await nativeFetch(asset(path), { cache: 'no-store' });
      cache[path] = await res.json();
    }
    return JSON.parse(JSON.stringify(cache[path]));
  }

  async function load(name, path, fallback) {
    return getStore(name, await loadJson(path).catch(() => fallback));
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role || 'Staff',
      active: user.active !== false,
      sopRoles: Array.isArray(user.sopRoles) ? user.sopRoles : []
    };
  }

  async function currentUser() {
    const username = localStorage.getItem(key('session'));
    if (!username) return null;
    const users = await load('users', 'data/users.json', []);
    return publicUser(users.find(u => u.username === username && u.active !== false));
  }

  function rewriteUrls(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.brand && copy.brand.logoUrl) copy.brand.logoUrl = asset(copy.brand.logoUrl);
    for (const sop of copy.sops || []) {
      for (const att of sop.attachments || []) {
        if (att.url) att.url = asset(att.url);
      }
    }
    return copy;
  }

  function nextId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async function handleApi(url, options) {
    const method = String(options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const user = await currentUser();
    const path = url.pathname;

    if (path === '/api/login' && method === 'POST') {
      const users = await load('users', 'data/users.json', []);
      const found = users.find(u => u.username === String(body.username || '').toLowerCase() && u.active !== false);
      if (!found || String(body.password || '') !== password) return jsonResponse({ error: 'Invalid login' }, 403);
      localStorage.setItem(key('session'), found.username);
      return jsonResponse({ ok: true, user: publicUser(found) });
    }
    if (path === '/api/logout' && method === 'POST') {
      localStorage.removeItem(key('session'));
      return jsonResponse({ ok: true });
    }
    if (path === '/api/me' && method === 'GET') {
      return jsonResponse({
        authenticated: !!user,
        user,
        supportEmail: 'support@techsavvy.consulting',
        staffLoginRequired: true,
        publicPortalRole: 'Staff',
        mobileBaseUrl: location.origin + repoBase.replace(/\/$/, ''),
        qrCodeApiUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data={DATA}',
        lanUrls: [],
        license: { ok: true, licenseType: 'static-demo' }
      });
    }
    if (!user && !['/api/support-request'].includes(path)) return jsonResponse({ error: 'Not authenticated' }, 401);

    if (path === '/api/sops' && method === 'GET') {
      const data = rewriteUrls(await load('sops', 'data/sops.json', { brand: {}, sections: [], sops: [] }));
      if (url.searchParams.get('admin') === '1') {
        if (!adminRoles.has(user.role)) return jsonResponse({ error: 'Admin portal access denied' }, 403);
        return jsonResponse(data);
      }
      return jsonResponse({ ...data, sops: data.sops.filter(s => s.status === 'Approved') });
    }
    if (path === '/api/sops' && method === 'PUT') {
      if (!adminRoles.has(user.role)) return jsonResponse({ error: 'Admin portal access denied' }, 403);
      body._dataVersion = new Date().toISOString();
      setStore('sops', body);
      return jsonResponse({ ok: true, dataVersion: body._dataVersion });
    }
    if (path === '/api/portal-settings') {
      const current = await load('portal-settings', 'data/portal_settings.json', {});
      if (method === 'GET') return jsonResponse({ ...current, port: 8012, lanUrls: [] });
      if (method === 'PUT') {
        const next = { ...current, ...body };
        setStore('portal-settings', next);
        return jsonResponse({ ok: true, settings: { ...next, port: 8012, lanUrls: [] } });
      }
    }
    if (path === '/api/generator-history' && method === 'GET') {
      return jsonResponse(await load('generator-history', 'data/generator_history.json', []));
    }
    if (path === '/api/users') {
      let users = await load('users', 'data/users.json', []);
      if (user.role !== 'Admin') return jsonResponse({ error: 'Admin role required' }, 403);
      if (method === 'GET') return jsonResponse(users.map(publicUser));
      if (method === 'POST') {
        users.push({ username: body.username, displayName: body.displayName || body.username, role: body.role || 'Staff', active: body.active !== false, sopRoles: body.sopRoles || ['All Staff'] });
        setStore('users', users);
        return jsonResponse({ ok: true, users: users.map(publicUser) });
      }
      if (method === 'PUT') {
        const u = users.find(x => x.username === body.username);
        if (!u) return jsonResponse({ error: 'User not found' }, 404);
        Object.assign(u, body);
        setStore('users', users);
        return jsonResponse({ ok: true, users: users.map(publicUser) });
      }
      if (method === 'DELETE') {
        users = users.filter(u => u.username !== url.searchParams.get('username'));
        setStore('users', users);
        return jsonResponse({ ok: true, users: users.map(publicUser) });
      }
    }
    if (path === '/api/change-requests') {
      let requests = await load('change-requests', 'data/change_requests.json', []);
      if (method === 'GET') return jsonResponse(requests);
      if (method === 'POST') {
        const item = { id: nextId('cr'), createdAt: new Date().toISOString(), status: 'Open', requesterUsername: user.username, requester: user.displayName, managerNote: '', ...body };
        requests.unshift(item);
        setStore('change-requests', requests);
        return jsonResponse({ ok: true, request: item });
      }
      if (method === 'PUT') {
        const item = requests.find(r => r.id === body.id);
        if (!item) return jsonResponse({ error: 'Request not found' }, 404);
        item.status = body.status || item.status;
        item.managerNote = body.managerNote || '';
        setStore('change-requests', requests);
        return jsonResponse({ ok: true, requests });
      }
    }
    if (path === '/api/support-requests' && method === 'GET') {
      if (user.role !== 'Admin') return jsonResponse({ error: 'Admin role required' }, 403);
      return jsonResponse(await load('support-requests', 'data/support_requests.json', []));
    }
    if (path === '/api/support-request' && method === 'POST') {
      const requests = await load('support-requests', 'data/support_requests.json', []);
      const item = { id: nextId('sup'), createdAt: new Date().toISOString(), status: 'New', requesterUsername: user?.username || 'not_logged_in', requester: user?.displayName || body.name || 'Not logged in', supportSent: false, supportError: 'Static demo request saved in browser storage.', ...body };
      requests.unshift(item);
      setStore('support-requests', requests);
      return jsonResponse({ ok: true, request: item, supportSent: false });
    }
    if (path === '/api/favorites') {
      const all = getStore('favorites', await loadJson('data/favorites.json').catch(() => ({})));
      const current = all[user.username] || [];
      if (method === 'GET') return jsonResponse({ key: user.username, favorites: current });
      const next = new Set(current);
      body.favorite === false ? next.delete(body.sopId) : next.add(body.sopId);
      all[user.username] = [...next];
      setStore('favorites', all);
      return jsonResponse({ ok: true, key: user.username, favorites: all[user.username] });
    }
    if (path === '/api/checklist-runs') {
      const runs = await load('checklist-runs', 'data/checklist_runs.json', []);
      if (method === 'GET') return jsonResponse(runs);
      const data = await load('sops', 'data/sops.json', { sops: [] });
      const sop = data.sops.find(s => s.id === body.sopId) || {};
      const item = { id: nextId('run'), sopId: body.sopId, sopTitle: sop.title || body.sopId, createdAt: new Date().toISOString(), completedAt: body.completed ? new Date().toISOString() : '', userKey: user.username, userName: user.displayName, checked: body.checked || [], notes: body.notes || '', completed: !!body.completed };
      runs.unshift(item);
      setStore('checklist-runs', runs);
      return jsonResponse({ ok: true, run: item });
    }
    if (path === '/api/training-results') {
      const results = await load('training-results', 'data/training_results.json', []);
      if (method === 'GET') return jsonResponse(results);
      const data = await load('sops', 'data/sops.json', { sops: [] });
      const sop = data.sops.find(s => s.id === body.sopId) || {};
      const quiz = sop.quiz || [];
      const answers = body.answers || [];
      const correct = answers.length ? quiz.reduce((n, q, i) => n + (String(answers[i]).toLowerCase() === String(q.answer).toLowerCase() ? 1 : 0), 0) : 0;
      const item = { id: nextId('train'), sopId: body.sopId, sopTitle: sop.title || body.sopId, createdAt: new Date().toISOString(), userKey: user.username, userName: user.displayName, answers, score: answers.length ? Math.round(correct / quiz.length * 100) : 100, correct, total: answers.length ? quiz.length : 0, confirmed: !!body.confirmed };
      results.unshift(item);
      setStore('training-results', results);
      return jsonResponse({ ok: true, result: item });
    }
    if (path === '/api/sop-quiz' && method === 'PUT') {
      const data = await load('sops', 'data/sops.json', { sops: [] });
      const sop = data.sops.find(s => s.id === body.sopId);
      if (!sop) return jsonResponse({ error: 'SOP not found' }, 404);
      sop.quiz = body.quiz || [];
      setStore('sops', data);
      return jsonResponse({ ok: true, dataVersion: new Date().toISOString(), sop: { id: sop.id, quiz: sop.quiz, version: sop.version, lastUpdated: sop.lastUpdated, versions: sop.versions || [] } });
    }
    if (path === '/api/upload' || path === '/api/brand-logo') return jsonResponse({ error: 'Uploads are disabled in the static GitHub Pages demo.' }, 400);
    if (path === '/api/help-screenshots/recapture') return jsonResponse({ error: 'Screenshot recapture requires the Node version of the portal.' }, 400);
    if (path === '/api/smoke-test') return jsonResponse({ ok: true, checks: [{ name: 'Static demo adapter', pass: true, detail: 'GitHub Pages mode' }], diagnostics: {}, ranAt: new Date().toISOString() });
    if (path === '/api/export-pdf') return textResponse('PDF export requires the Node version of the portal.', 501);
    return jsonResponse({ error: 'Static demo route not implemented: ' + path }, 404);
  }

  window.fetch = function (input, options = {}) {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, location.origin);
    let normalizedPath = url.pathname;
    if (normalizedPath.startsWith(repoBase)) normalizedPath = normalizedPath.slice(repoBase.length - 1);
    if (normalizedPath.startsWith('/api/')) {
      url.pathname = normalizedPath;
      return handleApi(url, options);
    }
    if (normalizedPath.startsWith('/generated-help-screenshots/')) {
      return nativeFetch(asset('help-screenshots-new/' + normalizedPath.split('/').pop()), options);
    }
    return nativeFetch(input, options);
  };
})();
