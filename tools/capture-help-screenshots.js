const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const port = cfg.port || 8086;
const browserCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);
const outDir = process.env.CAPTURE_OUT_DIR || path.join(root, 'help-screenshots-new');
const profile = process.env.CAPTURE_PROFILE || path.join(root, '.edge-capture-profile');
const user = process.env.CAPTURE_USER || 'admin';
const pass = process.env.CAPTURE_PASS || '';
const debugPort = Number(process.env.CAPTURE_DEBUG_PORT || 9224);
let seq = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function portalData() {
  const data = readJsonSafe(path.join(root, 'data', 'sops.json'), { sops: [], sections: [] });
  const sops = Array.isArray(data.sops) ? data.sops : [];
  const approved = sops.find(s => String(s.status || '').toLowerCase() === 'approved');
  const first = approved || sops[0] || null;
  const attachmentSop = sops.find(s => String(s.status || '').toLowerCase() === 'approved' && Array.isArray(s.attachments) && s.attachments.length) ||
    sops.find(s => Array.isArray(s.attachments) && s.attachments.length) ||
    first;
  const noQuiz = sops.find(s => !Array.isArray(s.quiz) || s.quiz.length === 0) || first;
  return { data, first, attachmentSop, noQuiz };
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  let head;
  if (payload.length < 126) head = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(payload.length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([head, mask, masked]);
}

function decodeFrames(state, chunk, onMessage) {
  state.buf = Buffer.concat([state.buf, chunk]);
  while (state.buf.length >= 2) {
    const b0 = state.buf[0], b1 = state.buf[1], masked = !!(b1 & 0x80);
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (state.buf.length < 4) return; len = state.buf.readUInt16BE(2); off = 4; }
    if (len === 127) { if (state.buf.length < 10) return; len = Number(state.buf.readBigUInt64BE(2)); off = 10; }
    const maskOff = off;
    if (masked) off += 4;
    if (state.buf.length < off + len) return;
    let payload = state.buf.slice(off, off + len);
    if (masked) {
      const mask = state.buf.slice(maskOff, maskOff + 4);
      payload = Buffer.from(payload.map((v, i) => v ^ mask[i % 4]));
    }
    state.buf = state.buf.slice(off + len);
    if ((b0 & 0x0f) === 1) onMessage(payload.toString());
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const socket = net.connect(Number(u.port), u.hostname);
    const key = crypto.randomBytes(16).toString('base64');
    const pending = new Map();
    const state = { buf: Buffer.alloc(0), handshaken: false };
    let header = Buffer.alloc(0);

    socket.on('connect', () => {
      socket.write([
        `GET ${u.pathname}${u.search} HTTP/1.1`,
        `Host: ${u.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n'));
    });
    socket.on('data', chunk => {
      if (!state.handshaken) {
        header = Buffer.concat([header, chunk]);
        const split = header.indexOf('\r\n\r\n');
        if (split < 0) return;
        state.handshaken = true;
        const rest = header.slice(split + 4);
        if (rest.length) decodeFrames(state, rest, handle);
        resolve({
          send(method, params = {}) {
            const id = ++seq;
            socket.write(encodeFrame(JSON.stringify({ id, method, params })));
            return new Promise((ok, bad) => pending.set(id, { ok, bad }));
          },
          close() { socket.end(); }
        });
      } else decodeFrames(state, chunk, handle);
    });
    function handle(text) {
      const msg = JSON.parse(text);
      if (!msg.id || !pending.has(msg.id)) return;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.bad(new Error(msg.error.message));
      else p.ok(msg.result);
    }
    socket.on('error', reject);
  });
}

async function launch() {
  if (process.env.CAPTURE_USE_EXISTING === '1') {
    const tabs = await (await fetch(`http://localhost:${debugPort}/json`)).json();
    const tab = tabs.find(t => t.type === 'page');
    if (tab) return { child: null, tab };
  }
  const browserPath = browserCandidates.find(p => fs.existsSync(p));
  if (!browserPath) throw new Error('No supported browser found. Install Edge or Chrome, or set EDGE_PATH.');
  const args = [
    '--headless',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--disable-features=UseSkiaRenderer,VizDisplayCompositor,CalculateNativeWinOcclusion',
    '--no-sandbox',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-first-run',
    'about:blank'
  ];
  const child = spawn(browserPath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let browserOutput = '';
  if (child.stderr) child.stderr.on('data', d => { browserOutput = (browserOutput + String(d)).slice(-3000); });
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = await (await fetch(`http://localhost:${debugPort}/json`)).json();
      const tab = tabs.find(t => t.type === 'page');
      if (tab) return { child, tab };
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge DevTools did not start.' + (browserOutput ? `\nBrowser output:\n${browserOutput}` : ''));
}

async function capture(cdp, name) {
  await sleep(800);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, 'base64'));
  console.log('captured', name);
}

async function nav(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await sleep(1600);
}

async function evalJs(cdp, expression) {
  return cdp.send('Runtime.evaluate', { expression, awaitPromise: true });
}

async function waitFor(cdp, expression, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await evalJs(cdp, expression);
      if (result && result.result && result.result.value) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

async function setCaptureSession(cdp) {
  if (!process.env.CAPTURE_SESSION) return;
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookie', {
    name: 'sop_portal_session',
    value: process.env.CAPTURE_SESSION,
    url: `http://localhost:${port}/`,
    path: '/'
  });
}

async function closeAnyDialog(cdp) {
  await evalJs(cdp, `for (const el of document.querySelectorAll('dialog[open]')) el.close();`);
  await sleep(250);
}

(async () => {
  let child = null;
  let cdp = null;
  try {
    const launched = await launch();
    child = launched.child;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    cdp = await connect(launched.tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });

    if (process.env.CAPTURE_HELP_TOKEN && process.env.CAPTURE_REAL !== '1') {
      const shots = (process.env.CAPTURE_SHOTS || '').split(',').map(x => x.trim()).filter(Boolean);
      for (const name of shots) {
        await nav(cdp, `http://localhost:${port}/__help-capture?shot=${encodeURIComponent(name)}&captureToken=${encodeURIComponent(process.env.CAPTURE_HELP_TOKEN)}`);
        await capture(cdp, name);
      }
      return;
    }

    const { first, attachmentSop, noQuiz } = portalData();
    const firstId = first && first.id ? String(first.id) : '';
    const attachmentId = attachmentSop && attachmentSop.id ? String(attachmentSop.id) : firstId;
    const noQuizId = noQuiz && noQuiz.id ? String(noQuiz.id) : firstId;

    await nav(cdp, `http://localhost:${port}/login.html`);
    await capture(cdp, '01-login.png');
    if (process.env.CAPTURE_SESSION) {
      await setCaptureSession(cdp);
    } else {
      if (!pass) throw new Error('CAPTURE_PASS is required when CAPTURE_SESSION is not provided.');
      await evalJs(cdp, `username.value=${JSON.stringify(user)};password.value=${JSON.stringify(pass)};loginBtn.click();`);
      await sleep(1600);
    }

    await nav(cdp, `http://localhost:${port}/`);
    await waitFor(cdp, `!!window.DATA && !document.body.textContent.includes('Not authenticated')`);
    await capture(cdp, '02-staff-overview.png');
    if (firstId) await evalJs(cdp, `window.selectSop && window.selectSop(${JSON.stringify(firstId)}); window.scrollTo(0,0);`);
    await capture(cdp, '03-sop-detail.png');
    if (attachmentId) await evalJs(cdp, `window.selectSop && window.selectSop(${JSON.stringify(attachmentId)}); document.querySelector('.staff-attachment-list,.image-gallery,.file-list')?.scrollIntoView({block:'center'});`);
    await capture(cdp, '03-sop-attachments.png');
    if (noQuizId) await evalJs(cdp, `window.selectSop && window.selectSop(${JSON.stringify(noQuizId)}); window.scrollTo(0,0);`);
    await evalJs(cdp, `document.querySelector('#trainingQuizBtn')?.click();`);
    await capture(cdp, '20-staff-no-quiz.png');
    await evalJs(cdp, `document.querySelector('#cancelQuizBtn')?.click();`);
    await closeAnyDialog(cdp);
    if (firstId) await evalJs(cdp, `window.selectSop && window.selectSop(${JSON.stringify(firstId)});`);
    await evalJs(cdp, `document.querySelector('#showQrBtn')?.click(); document.querySelector('#qrBox')?.scrollIntoView({block:'center'});`);
    await capture(cdp, '14-staff-qr-link.png');
    await evalJs(cdp, `window.scrollTo(0,0); document.querySelector('#runChecklistBtn')?.click();`);
    await capture(cdp, '15-staff-checklist-run.png');
    await evalJs(cdp, `document.querySelector('#cancelRunBtn')?.click();`);
    await closeAnyDialog(cdp);
    await evalJs(cdp, `document.querySelector('[onclick^="openChangeRequest"]')?.click();`);
    await capture(cdp, '04-change-request.png');
    await closeAnyDialog(cdp);

    await nav(cdp, `http://localhost:${port}/admin.html`);
    await waitFor(cdp, `!!window.DATA && !document.querySelector('#adminApp')?.classList.contains('hidden')`);
    await capture(cdp, '05-admin-dashboard.png');
    await evalJs(cdp, `setTab('generator'); window.scrollTo(0,0);`);
    await capture(cdp, '06-sop-generator.png');
    await evalJs(cdp, `document.querySelector('#genPaste')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '06-sop-generator-lower.png');
    await evalJs(cdp, `setTab('import'); window.scrollTo(0,0);`);
    await capture(cdp, '06-sop-import.png');
    await evalJs(cdp, `document.querySelector('#importPaste')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '06-sop-import-lower.png');
    await evalJs(cdp, `setTab('sops'); window.scrollTo(0,0);`);
    await capture(cdp, '06-sop-editor-top.png');
    await evalJs(cdp, `document.querySelector('#bulkTools')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '06-sop-editor-bulk-lower.png');
    await evalJs(cdp, `document.querySelector('#sop_owner')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '06-sop-editor-middle.png');
    await evalJs(cdp, `document.querySelector('#tab-sops').scrollIntoView(); window.scrollTo(0,document.body.scrollHeight);`);
    await capture(cdp, '07-sop-editor-bottom.png');
    await evalJs(cdp, `setTab('sections'); window.scrollTo(0,0);`);
    await capture(cdp, '08-sections.png');
    await nav(cdp, `http://localhost:${port}/support.html`);
    await capture(cdp, '09-support-form.png');
    await nav(cdp, `http://localhost:${port}/admin.html`);
    await evalJs(cdp, `setTab('requests'); window.scrollTo(0,0);`);
    await capture(cdp, '10-change-requests.png');
    await evalJs(cdp, `setTab('users'); window.scrollTo(0,0);`);
    await capture(cdp, '11-users-logins.png');
    await evalJs(cdp, `document.querySelector('#userRolesCenter')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '17-sop-assignment-roles.png');
    await evalJs(cdp, `setTab('brand'); window.scrollTo(0,0);`);
    await capture(cdp, '12-brand-settings.png');
    await evalJs(cdp, `document.querySelector('#brandLogoFile')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '12-brand-settings-lower.png');
    await evalJs(cdp, `setTab('json'); window.scrollTo(0,0);`);
    await capture(cdp, '13-advanced-json.png');
    await evalJs(cdp, `document.querySelector('#advancedResetCenter')?.scrollIntoView({block:'start'});`);
    await sleep(500);
    await capture(cdp, '13-advanced-reset-snapshot.png');
    await evalJs(cdp, `setTab('backup'); window.scrollTo(0,0);`);
    await capture(cdp, '16-backup-restore.png');
    await evalJs(cdp, `Array.from(document.querySelectorAll('h3')).find(el => el.textContent.includes('Retention'))?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '16-backup-retention.png');
    await evalJs(cdp, `setTab('training'); window.scrollTo(0,0);`);
    await capture(cdp, '18-training-runs.png');
    await evalJs(cdp, `document.querySelector('#quizBuilder')?.scrollIntoView({block:'center'});`);
    await sleep(500);
    await capture(cdp, '18-training-quiz-builder.png');
    await evalJs(cdp, `setTab('support'); window.scrollTo(0,0);`);
    await capture(cdp, '21-support-requests.png');
  } finally {
    if (cdp) {
      try { cdp.close(); } catch {}
    }
    if (child) {
      try { child.kill(); } catch {}
    }
  }
})();
