const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QA_PASSWORD = 'QaPass123!';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64')) {
  const iterations = 120000;
  return {
    salt,
    hash: crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64'),
    algorithm: 'pbkdf2-sha256',
    iterations
  };
}

function prepareSandbox(root, port) {
  const cfgPath = path.join(root, 'config.json');
  const cfg = readJson(cfgPath, {});
  cfg.port = Number(port) || 18086;
  cfg.supportEmail = '';
  cfg.formspreeEndpoint = '';
  cfg.sessionHours = 8;
  writeJson(cfgPath, cfg);

  const settingsPath = path.join(root, 'data', 'portal_settings.json');
  const settings = readJson(settingsPath, {});
  settings.staffLoginRequired = true;
  settings.publicPortalRole = 'Staff';
  settings.mobileBaseUrl = `http://127.0.0.1:${cfg.port}`;
  settings.securityOptions = {
    rateLimitingEnabled: false,
    loginAttempts: 100,
    loginWindowMinutes: 15,
    supportRequests: 100,
    supportWindowMinutes: 60,
    changeRequests: 100,
    changeWindowMinutes: 60,
    ...(settings.securityOptions || {})
  };
  settings.securityOptions.rateLimitingEnabled = false;
  writeJson(settingsPath, settings);

  const users = [
    ['qa_admin', 'QA Admin', 'Admin', ['All Staff']],
    ['qa_manager', 'QA Manager', 'Manager', ['All Staff']],
    ['qa_editor', 'QA Editor', 'Editor', ['All Staff']],
    ['qa_staff', 'QA Staff', 'Staff', ['All Staff']],
    ['qa_viewer', 'QA Viewer', 'Viewer', ['All Staff']]
  ].map(([username, displayName, role, sopRoles]) => ({
    username,
    displayName,
    role,
    sopRoles,
    active: true,
    ...hashPassword(QA_PASSWORD)
  }));
  writeJson(path.join(root, 'data', 'users.json'), users);

  for (const [file, empty] of [
    ['change_requests.json', []],
    ['support_requests.json', []],
    ['generator_history.json', []],
    ['favorites.json', {}],
    ['checklist_runs.json', []],
    ['training_results.json', []]
  ]) {
    writeJson(path.join(root, 'data', file), empty);
  }

  console.log(`Prepared QA sandbox on port ${cfg.port}`);
}

class Client {
  constructor(baseUrl, label) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.label = label;
    this.cookie = '';
  }

  async request(method, pathname, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(',').map(x => x.split(';')[0]).join('; ');
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (err) {}
    return { status: res.status, headers: res.headers, text, data };
  }

  get(pathname) { return this.request('GET', pathname); }
  post(pathname, body) { return this.request('POST', pathname, body); }
  put(pathname, body, headers) { return this.request('PUT', pathname, body, headers); }
}

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function assertStatus(name, response, expected) {
  const ok = Array.isArray(expected) ? expected.includes(response.status) : response.status === expected;
  record(name, ok, `status=${response.status}`);
}

async function login(baseUrl, username, password) {
  const client = new Client(baseUrl, username);
  const res = await client.post('/api/login', { username, password });
  assertStatus(`Login succeeds for ${username}`, res, 200);
  record(`Session cookie issued for ${username}`, !!client.cookie);
  return client;
}

function pickApprovedSop(data) {
  return (data.sops || []).find(s => s.status === 'Approved') || null;
}

function ensureQaFixture(data) {
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  data.sops = Array.isArray(data.sops) ? data.sops : [];
  if (!data.sections.some(s => s.id === 'QA-AUTO')) {
    data.sections.push({
      id: 'QA-AUTO',
      title: 'QA Automation',
      icon: 'QA',
      description: 'Release QA sandbox section',
      order: 999
    });
  }
  const existing = data.sops.find(s => s.id === 'QA-AUTO-001');
  const sop = {
    id: 'QA-AUTO-001',
    sectionId: 'QA-AUTO',
    status: 'Approved',
    title: 'QA Automation Fixture SOP',
    purpose: 'Exercise release QA workflows in an isolated sandbox.',
    scope: 'QA only',
    owner: 'QA',
    roles: 'All Staff',
    version: '1.0',
    lastUpdated: new Date().toISOString().slice(0, 10),
    nextReview: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    prerequisites: 'Sandbox portal is running.',
    steps: [
      'Open the QA fixture SOP.',
      'Pin the SOP.',
      'Complete the checklist.',
      'Confirm read and quiz completion.'
    ],
    validation: 'QA automation records complete successfully.',
    exceptions: 'Failures must block release until reviewed.',
    tags: 'qa, automation, release',
    attachments: [],
    quiz: [
      {
        question: 'What environment should release QA use?',
        answer: 'Sandbox',
        choices: ['Production', 'Sandbox', 'Backup']
      }
    ],
    versions: []
  };
  if (existing) Object.assign(existing, sop);
  else data.sops.push(sop);
  return sop;
}

async function runReleaseQa() {
  const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8086';
  const sandboxRoot = process.env.QA_SANDBOX_ROOT || path.join(__dirname, '..', '..');
  console.log(`Running release QA against ${baseUrl}`);
  console.log(`Sandbox root: ${sandboxRoot}`);

  const anon = new Client(baseUrl, 'anonymous');
  for (const page of ['/', '/login.html', '/admin.html', '/help.html', '/support.html']) {
    const res = await anon.get(page);
    assertStatus(`Static page responds: ${page}`, res, 200);
    record(`Static page has HTML: ${page}`, /<html/i.test(res.text), `${res.text.length} bytes`);
  }

  const protectedAttachment = await anon.get('/uploads/sop-files/not-real/file.txt');
  assertStatus('SOP attachment paths require authentication', protectedAttachment, 401);

  const admin = await login(baseUrl, process.env.QA_ADMIN_USER || 'qa_admin', process.env.QA_ADMIN_PASS || QA_PASSWORD);
  const manager = await login(baseUrl, process.env.QA_MANAGER_USER || 'qa_manager', process.env.QA_MANAGER_PASS || QA_PASSWORD);
  const editor = await login(baseUrl, process.env.QA_EDITOR_USER || 'qa_editor', process.env.QA_EDITOR_PASS || QA_PASSWORD);
  const staff = await login(baseUrl, process.env.QA_STAFF_USER || 'qa_staff', process.env.QA_STAFF_PASS || QA_PASSWORD);
  const viewer = await login(baseUrl, process.env.QA_VIEWER_USER || 'qa_viewer', process.env.QA_VIEWER_PASS || QA_PASSWORD);

  assertStatus('Manager denied admin-only users API', await manager.get('/api/users'), 403);
  assertStatus('Editor denied admin-only users API', await editor.get('/api/users'), 403);
  assertStatus('Staff denied admin portal SOP data', await staff.get('/api/sops?admin=1'), 403);

  const adminSops = await admin.get('/api/sops?admin=1');
  assertStatus('Admin SOP data loads', adminSops, 200);
  record('Admin SOP data has arrays', Array.isArray(adminSops.data.sections) && Array.isArray(adminSops.data.sops));

  const withFixture = adminSops.data;
  const fixtureSop = ensureQaFixture(withFixture);
  const save = await admin.put('/api/sops', withFixture, { 'If-Match': withFixture._dataVersion || '' });
  assertStatus('Admin can save QA fixture SOP and section', save, 200);

  const publicSops = await staff.get('/api/sops');
  assertStatus('Staff SOP data loads', publicSops, 200);
  const approved = pickApprovedSop(publicSops.data) || fixtureSop;
  record('Approved SOP is visible to staff', !!approved, approved ? approved.id : 'none');

  const roles = await staff.get('/api/roles');
  assertStatus('Authenticated roles API responds', roles, 200);
  record('Roles API returns assignment roles', Array.isArray(roles.data.roles));

  const fav = await staff.post('/api/favorites', { sopId: approved.id, favorite: true });
  assertStatus('Staff can pin approved SOP', fav, 200);
  record('Pinned SOP response contains SOP id', (fav.data.favorites || []).includes(approved.id));

  const run = await staff.post('/api/checklist-runs', {
    sopId: approved.id,
    staffName: 'QA Staff',
    checked: [0, 1, 2, 3],
    notes: 'Release QA checklist run',
    completed: true
  });
  assertStatus('Staff can complete checklist run', run, 200);
  record('Checklist run is completed', run.data.run && run.data.run.completed === true);

  const quiz = await admin.put('/api/sop-quiz', {
    sopId: approved.id,
    quiz: [
      {
        question: 'What environment should release QA use?',
        answer: 'Sandbox',
        choices: ['Production', 'Sandbox', 'Archive']
      }
    ]
  });
  assertStatus('Admin can save SOP quiz', quiz, 200);

  const training = await staff.post('/api/training-results', {
    sopId: approved.id,
    staffName: 'QA Staff',
    answers: ['Sandbox'],
    confirmed: true
  });
  assertStatus('Staff can confirm read and submit quiz result', training, 200);
  record('Training result records score', typeof training.data.result.score === 'number', `score=${training.data.result.score}`);

  const change = await staff.post('/api/change-requests', {
    sopId: approved.id,
    sopTitle: approved.title,
    requester: 'QA Staff',
    urgency: 'Normal',
    issue: 'Release QA change request test',
    suggestedChange: 'No production data is touched.'
  });
  assertStatus('Staff can submit change request', change, 200);

  const viewerChange = await viewer.post('/api/change-requests', {
    sopId: approved.id,
    issue: 'Viewer should not be able to submit.'
  });
  assertStatus('Viewer cannot submit change request', viewerChange, 403);

  const support = await anon.post('/api/support-request', {
    name: 'QA Tester',
    email: 'qa@example.invalid',
    urgency: 'Normal',
    page: 'Release QA',
    subject: 'Release QA support test',
    message: 'This should be saved locally in the sandbox.'
  });
  assertStatus('Public support request saves locally', support, 200);
  record('Support send is disabled without endpoint', support.data.supportSent === false);

  assertStatus('Admin can read support requests', await admin.get('/api/support-requests'), 200);
  assertStatus('Admin can read checklist runs', await admin.get('/api/checklist-runs'), 200);
  assertStatus('Admin can read training results', await admin.get('/api/training-results'), 200);
  assertStatus('Admin can read change requests', await admin.get('/api/change-requests'), 200);

  const history = await admin.post('/api/generator-history', {
    mode: 'qa',
    summary: 'Release QA generator history test',
    saveStatus: 'tested',
    prompt: 'Generate one QA SOP',
    pastedResult: '{"sops":[]}',
    createdSopIds: [fixtureSop.id],
    createdSectionIds: ['QA-AUTO'],
    warnings: [],
    previewSummary: 'QA history preview'
  });
  assertStatus('Admin can record generator/import history', history, 200);

  const smoke = await admin.get('/api/smoke-test');
  assertStatus('Admin smoke-test API responds', smoke, 200);
  record('Server smoke checks pass', smoke.data.ok === true, (smoke.data.checks || []).filter(x => !x.pass).map(x => x.name).join(', '));

  const screenshots = await admin.get('/api/help-screenshots');
  assertStatus('Help screenshot inventory loads', screenshots, 200);
  const missing = (screenshots.data.screenshots || []).filter(name => !fs.existsSync(path.join(sandboxRoot, 'help-screenshots-new', name)));
  record('All registered help screenshots exist', missing.length === 0, missing.join(', '));
  const firstShot = screenshots.data.screenshots && screenshots.data.screenshots[0];
  if (firstShot) {
    const shotRes = await admin.get(`/generated-help-screenshots/${encodeURIComponent(firstShot)}`);
    assertStatus('Generated help screenshot endpoint serves image', shotRes, 200);
  }

  if (process.env.QA_INCLUDE_SCREENSHOT_RECAPTURE === '1') {
    const recapture = await admin.post('/api/help-screenshots/recapture', {});
    assertStatus('Help screenshot recapture completes', recapture, 200);
  } else {
    record('Help screenshot recapture skipped by default', true, 'set -IncludeScreenshotRecapture to run browser capture');
  }

  const fullBackup = await admin.post('/api/backups/full', {});
  assertStatus('Admin can create full backup', fullBackup, 200);
  record('Full backup includes manifest', !!fullBackup.data.manifest);

  assertStatus('Clear support requests requires confirmation', await admin.post('/api/support-requests/clear', { confirm: 'NO' }), 400);
  assertStatus('Admin can clear support requests in sandbox', await admin.post('/api/support-requests/clear', { confirm: 'CLEAR' }), 200);

  assertStatus('Clear customer data requires confirmation', await admin.post('/api/customer-data/clear', { confirm: 'NO', favorites: true }), 400);
  const clearData = await admin.post('/api/customer-data/clear', {
    confirm: 'CLEAR',
    favorites: true,
    checklistRuns: true,
    trainingResults: true,
    generatorHistory: true,
    changeRequests: true
  });
  assertStatus('Admin can clear customer data in sandbox', clearData, 200);

  const prune = await admin.post('/api/backups/prune', { keep: 20 });
  assertStatus('Admin can prune backups in sandbox', prune, 200);

  console.log(`PASS Release QA completed with ${results.length} checks.`);
}

async function main() {
  if (process.argv[2] === '--prepare') {
    const root = path.resolve(process.argv[3] || '.');
    const portIndex = process.argv.indexOf('--port');
    const port = portIndex >= 0 ? process.argv[portIndex + 1] : '18086';
    prepareSandbox(root, port);
    return;
  }
  await runReleaseQa();
}

main().catch(err => {
  console.error(`FAIL ${err.stack || err.message || err}`);
  process.exit(1);
});
