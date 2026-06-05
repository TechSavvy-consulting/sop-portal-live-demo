const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const port = cfg.port || 8086;
const host = process.env.SMOKE_HOST || 'localhost';
const base = `http://${host}:${port}`;

function request(method, pathname, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      method,
      host,
      port,
      path: pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(cookie ? { Cookie: cookie } : {})
      }
    }, (res) => {
      let out = '';
      res.on('data', (chunk) => out += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: out
      }));
    });
    req.on('error', (err) => resolve({ status: 0, body: err.message, headers: {} }));
    if (data) req.write(data);
    req.end();
  });
}

function check(results, name, pass, detail = '') {
  results.push({ name, pass, detail });
}

(async () => {
  const results = [];
  const sops = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sops.json'), 'utf8'));
  const firstAttachment = (sops.sops || []).flatMap(s => s.attachments || [])[0];

  const home = await request('GET', '/', null);
  check(results, 'Home page responds', home.status === 200, `status=${home.status}`);

  const me = await request('GET', '/api/me', null);
  check(results, 'Unauthenticated /api/me responds', me.status === 200 && /"authenticated": false/.test(me.body), `status=${me.status}`);

  if (firstAttachment) {
    const att = await request('GET', firstAttachment.url, null);
    check(results, 'SOP attachment blocks unauthenticated download when staff login is enabled', att.status === 401, `status=${att.status}`);
  } else {
    check(results, 'SOP attachment check skipped', true, 'no attachments found');
  }

  const user = process.env.SMOKE_USER;
  const pass = process.env.SMOKE_PASS;
  if (user && pass) {
    const login = await request('POST', '/api/login', { username: user, password: pass });
    const cookie = (login.headers['set-cookie'] || []).map(x => x.split(';')[0]).join('; ');
    check(results, 'Configured smoke login succeeds', login.status === 200 && !!cookie, `status=${login.status}`);
    if (cookie) {
      const apiSmoke = await request('GET', '/api/smoke-test', null, cookie);
      check(results, 'Admin smoke-test API responds', apiSmoke.status === 200, `status=${apiSmoke.status}`);
    }
  } else {
    check(results, 'Authenticated admin smoke checks skipped', true, 'set SMOKE_USER and SMOKE_PASS to include them');
  }

  const ok = results.every(r => r.pass);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${base}`);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' - ' + r.detail : ''}`);
  process.exit(ok ? 0 : 1);
})();
