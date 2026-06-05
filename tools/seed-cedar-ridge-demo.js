const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PUBLIC = path.join(ROOT, 'public');
const PASSWORD = 'DemoPass!2026';

function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2));
}

function hash(password, salt = crypto.randomBytes(16).toString('base64')) {
  const iterations = 120000;
  return {
    salt,
    hash: crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64'),
    iterations,
    algorithm: 'pbkdf2-sha256'
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function iso(daysAgo, hour = 14) {
  const d = new Date(Date.UTC(2026, 5, 5, hour, 15, 0));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function date(daysFromNow) {
  const d = new Date(Date.UTC(2026, 5, 5, 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function versionFor(sop, action, daysAgo) {
  return {
    id: `v-${sop.id.toLowerCase()}-${action.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    timestamp: iso(daysAgo),
    editor: action === 'Approved' ? 'nora' : 'admin',
    action,
    status: sop.status,
    summary: `${action} version for ${sop.title}.`,
    snapshot: {
      id: sop.id,
      sectionId: sop.sectionId,
      status: sop.status,
      version: sop.version,
      title: sop.title,
      purpose: sop.purpose,
      scope: sop.scope,
      prerequisites: sop.prerequisites,
      steps: sop.steps,
      validation: sop.validation,
      exceptions: sop.exceptions,
      owner: sop.owner,
      roles: sop.roles,
      lastUpdated: sop.lastUpdated,
      nextReview: sop.nextReview,
      tags: sop.tags,
      attachments: sop.attachments || []
    }
  };
}

const sections = [
  { id: 'OPEN', title: 'Opening and Closing', description: 'Daily readiness, closing, and facility handoff routines.', icon: 'Checklist' },
  { id: 'FRONT', title: 'Front Desk', description: 'Reception, phones, arrivals, and patient communication.', icon: 'Users' },
  { id: 'SCHED', title: 'Scheduling', description: 'Appointment flow, recalls, cancellations, and provider time.', icon: 'Calendar' },
  { id: 'CARE', title: 'Clinical Care', description: 'Chairside preparation, operatory flow, and clinical handoffs.', icon: 'Shield' },
  { id: 'STER', title: 'Sterilization', description: 'Instrument processing, infection control, and sterilizer logs.', icon: 'Wrench' },
  { id: 'RECORDS', title: 'Records and Imaging', description: 'Chart notes, x-rays, forms, and record requests.', icon: 'FileText' },
  { id: 'BILL', title: 'Billing and Insurance', description: 'Claims, ledgers, payments, estimates, and collections.', icon: 'CreditCard' },
  { id: 'SUPPLY', title: 'Supplies and Lab', description: 'Inventory, lab cases, ordering, and vendor follow-up.', icon: 'Folder' },
  { id: 'COMM', title: 'Patient Communication', description: 'Reminders, scripts, reviews, referrals, and outreach.', icon: 'Send' },
  { id: 'MGMT', title: 'Management', description: 'Staffing, training, incidents, reporting, and continuous improvement.', icon: 'TrendingUp' }
];

const users = [
  { username: 'admin', displayName: 'Avery Collins', role: 'Admin', active: true, sopRoles: ['All Staff', 'Management'] },
  { username: 'nora', displayName: 'Nora Patel', role: 'Manager', active: true, sopRoles: ['All Staff', 'Management', 'Front Desk'] },
  { username: 'miles', displayName: 'Miles Romero', role: 'Editor', active: true, sopRoles: ['All Staff', 'Clinical Team', 'Sterilization'] },
  { username: 'camila', displayName: 'Camila Brooks', role: 'Staff', active: true, sopRoles: ['All Staff', 'Front Desk', 'Billing'] },
  { username: 'jules', displayName: 'Jules Nguyen', role: 'Staff', active: true, sopRoles: ['All Staff', 'Clinical Team', 'Sterilization'] },
  { username: 'tessa', displayName: 'Tessa Grant', role: 'Staff', active: true, sopRoles: ['All Staff', 'Hygiene Team', 'Clinical Team'] },
  { username: 'eli', displayName: 'Eli Warren', role: 'Viewer', active: true, sopRoles: ['All Staff', 'Management'] },
  { username: 'temp', displayName: 'Temp Coverage', role: 'Staff', active: false, sopRoles: ['All Staff'] }
].map(u => ({ ...u, ...hash(PASSWORD) }));

const roles = [
  'All Staff',
  'Management',
  'Front Desk',
  'Clinical Team',
  'Hygiene Team',
  'Billing',
  'Sterilization',
  'Inventory Lead'
];

const specs = [
  ['CRD-001', 'OPEN', 'Approved', 'Daily Office Opening Checklist', 'Front Desk'],
  ['CRD-002', 'OPEN', 'Approved', 'End of Day Closing and Alarm Set', 'All Staff'],
  ['CRD-003', 'OPEN', 'Approved', 'Morning Huddle Preparation', 'Management'],
  ['CRD-004', 'OPEN', 'Draft', 'Weather Delay and Late Opening Decision Tree', 'Management'],
  ['CRD-005', 'FRONT', 'Approved', 'New Patient Welcome and Check-In', 'Front Desk'],
  ['CRD-006', 'FRONT', 'Approved', 'Phone Call Triage and Transfer Standards', 'Front Desk'],
  ['CRD-007', 'FRONT', 'Approved', 'Same-Day Emergency Patient Intake', 'Front Desk'],
  ['CRD-008', 'FRONT', 'Rejected', 'Walk-In Whitening Promotion Script', 'Front Desk'],
  ['CRD-009', 'SCHED', 'Approved', 'Recall Scheduling and Hygiene Recare', 'Hygiene Team'],
  ['CRD-010', 'SCHED', 'Approved', 'Cancellation Waitlist Fill Procedure', 'Front Desk'],
  ['CRD-011', 'SCHED', 'Approved', 'Provider Schedule Template Changes', 'Management'],
  ['CRD-012', 'SCHED', 'Pending Review', 'Online Booking Request Review', 'Front Desk'],
  ['CRD-013', 'CARE', 'Approved', 'Operatory Turnover Between Patients', 'Clinical Team'],
  ['CRD-014', 'CARE', 'Approved', 'Chairside Setup for Composite Restorations', 'Clinical Team'],
  ['CRD-015', 'CARE', 'Approved', 'Hygiene Room Periodontal Charting Workflow', 'Hygiene Team'],
  ['CRD-016', 'CARE', 'Approved', 'Medical History Alert Escalation', 'Clinical Team'],
  ['CRD-017', 'STER', 'Approved', 'Instrument Intake and Dirty Zone Handling', 'Sterilization'],
  ['CRD-018', 'STER', 'Approved', 'Sterilizer Load Logging and Spore Test', 'Sterilization'],
  ['CRD-019', 'STER', 'Approved', 'PPE Restock and Infection Control Station Check', 'Sterilization'],
  ['CRD-020', 'STER', 'Archived', 'Manual Ultrasonic Cleaner Log', 'Sterilization'],
  ['CRD-021', 'RECORDS', 'Approved', 'Clinical Note Lock and Provider Sign-Off', 'Clinical Team'],
  ['CRD-022', 'RECORDS', 'Approved', 'X-Ray Capture and Retake Documentation', 'Clinical Team'],
  ['CRD-023', 'RECORDS', 'Approved', 'HIPAA Record Release Request', 'Front Desk'],
  ['CRD-024', 'RECORDS', 'Draft', 'Paper Chart Scan Backlog Cleanup', 'Front Desk'],
  ['CRD-025', 'BILL', 'Approved', 'Insurance Verification Before Appointments', 'Billing'],
  ['CRD-026', 'BILL', 'Approved', 'Claim Submission and Attachment Review', 'Billing'],
  ['CRD-027', 'BILL', 'Approved', 'Patient Payment Posting and Receipt', 'Billing'],
  ['CRD-028', 'BILL', 'Pending Review', 'Past Due Balance Outreach', 'Billing'],
  ['CRD-029', 'SUPPLY', 'Approved', 'Weekly Dental Supply Inventory Count', 'Inventory Lead'],
  ['CRD-030', 'SUPPLY', 'Approved', 'Lab Case Shipping and Receiving', 'Clinical Team'],
  ['CRD-031', 'SUPPLY', 'Approved', 'Implant Component Special Order', 'Inventory Lead'],
  ['CRD-032', 'SUPPLY', 'Rejected', 'Emergency Same-Day Vendor Purchase', 'Inventory Lead'],
  ['CRD-033', 'COMM', 'Approved', 'Appointment Reminder Text Review', 'Front Desk'],
  ['CRD-034', 'COMM', 'Approved', 'Post-Op Follow-Up Call', 'Clinical Team'],
  ['CRD-035', 'COMM', 'Draft', 'Review Request After Completed Treatment', 'Front Desk'],
  ['CRD-036', 'COMM', 'Approved', 'Referral Thank-You Workflow', 'Front Desk'],
  ['CRD-037', 'MGMT', 'Approved', 'New Hire SOP Portal Onboarding', 'Management'],
  ['CRD-038', 'MGMT', 'Pending Review', 'Monthly OSHA Safety Walkthrough', 'Management'],
  ['CRD-039', 'MGMT', 'Draft', 'Quarterly KPI Review Meeting', 'Management'],
  ['CRD-040', 'MGMT', 'Archived', 'Legacy Paper Binder Update Process', 'Management']
];

const owners = {
  OPEN: 'Nora Patel',
  FRONT: 'Nora Patel',
  SCHED: 'Camila Brooks',
  CARE: 'Miles Romero',
  STER: 'Jules Nguyen',
  RECORDS: 'Miles Romero',
  BILL: 'Camila Brooks',
  SUPPLY: 'Jules Nguyen',
  COMM: 'Nora Patel',
  MGMT: 'Avery Collins'
};

function defaultSteps(title, sectionId) {
  const section = sections.find(s => s.id === sectionId).title;
  return [
    `Open the ${section.toLowerCase()} workspace and confirm the correct day, provider, and patient context.`,
    `Review the latest alerts, unread notes, pending tasks, and any manager comments tied to ${title.toLowerCase()}.`,
    'Complete the work using the approved system of record; avoid paper notes unless downtime mode is active.',
    'Document the outcome, initials, and any exception before moving to the next patient or task.',
    'Escalate blocked items to the named owner before the end of the current shift.',
    'Mark the checklist complete or confirm read in the SOP Portal when the task is finished.'
  ];
}

function openingSteps() {
  return [
    'Unlock the staff entrance, disarm the alarm, and turn on front desk, lobby, and hallway lights.',
    'Start the practice management system, time clock, phone console, and payment terminal.',
    'Check overnight voicemail, patient text inbox, online booking requests, and urgent email flags.',
    'Print or open the daily schedule and identify emergencies, new patients, major treatment, and pending balances.',
    'Confirm operatories are ready, sterilizer indicators are filed, and the waterline log is current.',
    'Set lobby music, beverage station, restroom supplies, and front desk cash drawer for opening.',
    'Post the morning huddle note in the SOP Portal checklist run with any blockers or staffing changes.'
  ];
}

function makeQuiz(sop) {
  return [
    {
      question: `Who owns ${sop.id}?`,
      answer: sop.owner,
      choices: [sop.owner, 'Avery Collins', 'Camila Brooks', 'Jules Nguyen'].filter((v, i, a) => a.indexOf(v) === i)
    },
    {
      question: 'What should be done when a blocker is found?',
      answer: 'Escalate to the named owner before the end of the current shift.',
      choices: [
        'Escalate to the named owner before the end of the current shift.',
        'Leave a sticky note for tomorrow.',
        'Skip the task if the schedule is busy.',
        'Delete the checklist run and restart later.'
      ]
    },
    {
      question: 'Where should completion be recorded?',
      answer: 'In the SOP Portal checklist or read confirmation.',
      choices: [
        'In the SOP Portal checklist or read confirmation.',
        'Only in a private notebook.',
        'Only by telling a coworker verbally.',
        'Nowhere if the task feels routine.'
      ]
    }
  ];
}

const attachmentDir = path.join(PUBLIC, 'uploads', 'sop-files', 'CRD-001');
ensureDir(attachmentDir);
const attachmentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#f4fbf8"/>
  <rect x="34" y="36" width="568" height="292" rx="20" fill="#ffffff" stroke="#bfd8cf" stroke-width="4"/>
  <path d="M92 108h150v74H92zM92 214h150v62H92zM300 108h92v168h-92zM450 108h86v64h-86zM450 208h86v68h-86z" fill="#d9efe7" stroke="#2f7d68" stroke-width="3"/>
  <circle cx="515" cy="76" r="24" fill="#f0b84a"/>
  <text x="70" y="70" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#12352f">Opening Station Map</text>
  <text x="92" y="205" font-family="Arial, sans-serif" font-size="18" fill="#12352f">Front Desk</text>
  <text x="300" y="298" font-family="Arial, sans-serif" font-size="18" fill="#12352f">Sterile Bay</text>
  <text x="448" y="198" font-family="Arial, sans-serif" font-size="18" fill="#12352f">Lobby</text>
</svg>`;
fs.writeFileSync(path.join(attachmentDir, 'opening-station-map.svg'), attachmentSvg);
fs.writeFileSync(path.join(attachmentDir, 'opening-shift-notes.txt'), [
  'Cedar Ridge Dental Studio - Opening Notes',
  '1. Cash drawer starting bank: $150.',
  '2. Check emergency line before huddle.',
  '3. Verify sterilizer log and waterline log are current.',
  '4. Log any blocker in the SOP Portal checklist run.'
].join('\n'));

const logoDir = path.join(PUBLIC, 'uploads', 'brand-logo');
ensureDir(logoDir);
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="92" fill="#0f3d33"/>
  <path d="M134 308c58-22 94-78 104-159 41 44 85 53 139 39-16 88-76 165-182 178-29 4-54-9-61-58z" fill="#8fd6bd"/>
  <path d="M169 330c78-28 135-87 171-178" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round"/>
  <text x="256" y="424" text-anchor="middle" font-family="Arial, sans-serif" font-size="78" font-weight="700" fill="#ffffff">CR</text>
</svg>`;
fs.writeFileSync(path.join(logoDir, 'cedar-ridge-logo.svg'), logoSvg);

const sops = specs.map((spec, index) => {
  const [id, sectionId, status, title, role] = spec;
  const owner = owners[sectionId];
  const lastOffset = 120 - index * 2;
  const sop = {
    id,
    sectionId,
    status,
    version: status === 'Approved' ? `1.${(index % 5) + 1}` : status === 'Archived' ? '0.9' : '0.3',
    title,
    purpose: `Make ${title.toLowerCase()} consistent, auditable, and easy for Cedar Ridge Dental Studio staff to complete during a busy clinic day.`,
    scope: `Applies to ${role} team members at the Cedar Ridge Dental Studio front office, clinical bay, and administrative workstations.`,
    prerequisites: 'Current SOP Portal login, assigned role access, working practice management system access, and any required protective equipment.',
    steps: id === 'CRD-001' ? openingSteps() : defaultSteps(title, sectionId),
    validation: `Owner ${owner} confirms completion through the SOP Portal activity history, daily huddle notes, or the relevant system report.`,
    exceptions: 'If patient safety, privacy, or urgent care timing conflicts with this SOP, stabilize the situation first and notify a manager before documenting the exception.',
    owner,
    roles: role,
    lastUpdated: date(-lastOffset),
    nextReview: status === 'Archived' ? date(-45) : status === 'Rejected' ? date(-10) : date((index % 9) * 14 - 20),
    tags: [sectionId.toLowerCase(), role.toLowerCase().replace(/\s+/g, '-'), status.toLowerCase().replace(/\s+/g, '-')].join(', '),
    attachments: [],
    versions: []
  };
  if (id === 'CRD-001') {
    sop.attachments = [
      {
        id: 'att-opening-map',
        name: 'opening-station-map.svg',
        type: 'image/svg+xml',
        size: Buffer.byteLength(attachmentSvg),
        url: '/uploads/sop-files/CRD-001/opening-station-map.svg',
        uploadedAt: iso(8),
        uploadedBy: 'admin'
      },
      {
        id: 'att-opening-notes',
        name: 'opening-shift-notes.txt',
        type: 'text/plain; charset=utf-8',
        size: fs.statSync(path.join(attachmentDir, 'opening-shift-notes.txt')).size,
        url: '/uploads/sop-files/CRD-001/opening-shift-notes.txt',
        uploadedAt: iso(7),
        uploadedBy: 'nora'
      }
    ];
  }
  if (index < 20) sop.quiz = makeQuiz(sop);
  sop.versions = [
    versionFor(sop, status === 'Approved' ? 'Approved' : status, Math.max(2, Math.floor(index / 2) + 3)),
    versionFor(sop, 'Saved', Math.max(7, Math.floor(index / 2) + 12))
  ];
  return sop;
});

const brand = {
  name: 'Cedar Ridge SOP Portal',
  subtitle: 'Dental Studio Operations',
  company: 'Cedar Ridge Dental Studio',
  tagline: 'Daily clinical, front desk, billing, and compliance SOPs in one searchable workspace.',
  primaryColor: '#1f7a65',
  accentColor: '#f0b84a',
  darkColor: '#12352f',
  lightColor: '#f4fbf8',
  logoUrl: '/uploads/brand-logo/cedar-ridge-logo.svg',
  vertical: 'Dental practice and patient care operations',
  website: 'https://cedarridgedental.example',
  staffHeaderTitle: 'Cedar Ridge Dental Studio SOPs, training, and daily checklists.',
  staffRules: [
    'Use approved SOPs for patient-facing and clinical work.',
    'Protect patient privacy and never place PHI in checklist notes.',
    'Submit a change request when a step is outdated or unsafe.'
  ],
  activeSectionHighlightColor: '#f0b84a'
};

writeJson('sops.json', {
  brand,
  settings: {
    reviewCadence: 'Quarterly',
    defaultOwner: 'Nora Patel',
    allowedEditors: 'Admin, Manager, Editor',
    hostingTarget: 'Online Node.js demo host',
    securityNote: 'Demo data only. Do not store real PHI, payment card data, credentials, or private patient records in SOP text or attachments.',
    roles: ['Admin', 'Manager', 'Editor', 'Staff', 'Viewer'],
    portalVersions: [
      { version: '1.0-demo', date: '2026-06-05', notes: 'Cedar Ridge Dental Studio live demo content seeded.' }
    ]
  },
  sections,
  sops,
  _dataVersion: new Date().toISOString()
});

writeJson('roles.json', roles);
writeJson('users.json', users);
writeJson('portal_settings.json', {
  staffLoginRequired: true,
  mobileBaseUrl: '',
  publicPortalRole: 'Staff',
  securityOptions: {
    rateLimitingEnabled: true,
    loginAttempts: 10,
    loginWindowMinutes: 15,
    supportRequests: 8,
    supportWindowMinutes: 60,
    changeRequests: 12,
    changeWindowMinutes: 60
  },
  qrCodeApiUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data={DATA}'
});
writeJson('brand_color_settings.json', {
  defaultColors: {
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    darkColor: brand.darkColor,
    lightColor: brand.lightColor,
    activeSectionHighlightColor: brand.activeSectionHighlightColor
  },
  previousColors: {
    primaryColor: '#1934b8',
    accentColor: '#15a394',
    darkColor: '#07151a',
    lightColor: '#f6fbfb'
  },
  updatedAt: new Date().toISOString()
});

writeJson('change_requests.json', [
  {
    id: 'cr-open-001',
    createdAt: iso(3, 16),
    status: 'Open',
    sopId: 'CRD-006',
    sopTitle: 'Phone Call Triage and Transfer Standards',
    requester: 'Camila Brooks',
    requesterUsername: 'camila',
    urgency: 'Normal',
    stepNumber: '3',
    issue: 'The voicemail callback target changed after the new phone queue was configured.',
    suggestedChange: 'Change callback target from two hours to one business hour for urgent treatment calls.',
    managerNote: ''
  },
  {
    id: 'cr-approved-002',
    createdAt: iso(6, 18),
    status: 'Approved',
    sopId: 'CRD-018',
    sopTitle: 'Sterilizer Load Logging and Spore Test',
    requester: 'Jules Nguyen',
    requesterUsername: 'jules',
    urgency: 'High',
    stepNumber: '5',
    issue: 'The spore test vendor pickup moved from Wednesday to Thursday.',
    suggestedChange: 'Update the pickup day and add a reminder to stage the envelope by 2 PM Thursday.',
    managerNote: 'Approved. Miles will update the SOP before next Thursday.'
  },
  {
    id: 'cr-complete-003',
    createdAt: iso(12, 20),
    status: 'Completed',
    sopId: 'CRD-025',
    sopTitle: 'Insurance Verification Before Appointments',
    requester: 'Nora Patel',
    requesterUsername: 'nora',
    urgency: 'Normal',
    stepNumber: '2',
    issue: 'Eligibility screenshots are now stored in the document center, not the old claim note.',
    suggestedChange: 'Point the verification step to the document center and add a note about checking annual maximums.',
    managerNote: 'Updated in version 1.2.'
  }
]);

writeJson('support_requests.json', [
  {
    id: 'sup-001',
    createdAt: iso(1, 15),
    status: 'New',
    requester: 'Avery Collins',
    requesterUsername: 'admin',
    email: 'avery@cedarridgedental.example',
    phone: '555-0142',
    urgency: 'Normal',
    page: 'Brand / Settings',
    subject: 'Need help updating QR base URL',
    message: 'The QR links still point at localhost after the new demo URL is assigned. Please confirm the right base URL format.',
    supportSent: false,
    supportError: 'Demo request seeded locally.'
  },
  {
    id: 'sup-002',
    createdAt: iso(4, 17),
    status: 'New',
    requester: 'Nora Patel',
    requesterUsername: 'nora',
    email: 'nora@cedarridgedental.example',
    phone: '555-0198',
    urgency: 'High',
    page: 'Training / Runs',
    subject: 'Quiz report question',
    message: 'Can the training report be filtered by staff assignment role for the June onboarding group?',
    supportSent: false,
    supportError: 'Demo request seeded locally.'
  },
  {
    id: 'sup-003',
    createdAt: iso(9, 13),
    status: 'New',
    requester: 'Miles Romero',
    requesterUsername: 'miles',
    email: 'miles@cedarridgedental.example',
    phone: '555-0177',
    urgency: 'Normal',
    page: 'SOP Editor',
    subject: 'Attachment preview on SVG',
    message: 'The opening station map previews correctly. Please confirm SVG uploads are acceptable for workstation maps.',
    supportSent: false,
    supportError: 'Demo request seeded locally.'
  },
  {
    id: 'sup-004',
    createdAt: iso(15, 14),
    status: 'New',
    requester: 'Camila Brooks',
    requesterUsername: 'camila',
    email: 'camila@cedarridgedental.example',
    phone: '555-0130',
    urgency: 'Low',
    page: 'Staff Portal',
    subject: 'Pinned SOP cleanup',
    message: 'Pinned SOP list looks good. Asking whether archived SOPs are automatically removed from pins.',
    supportSent: false,
    supportError: 'Demo request seeded locally.'
  }
]);

const activityUsers = [
  ['camila', 'Camila Brooks'],
  ['jules', 'Jules Nguyen'],
  ['tessa', 'Tessa Grant'],
  ['nora', 'Nora Patel']
];
const approved = sops.filter(s => s.status === 'Approved');

writeJson('checklist_runs.json', Array.from({ length: 32 }, (_, i) => {
  const sop = approved[i % approved.length];
  const [userKey, userName] = activityUsers[i % activityUsers.length];
  const checked = sop.steps.map((_, idx) => idx).filter((_, idx) => idx < sop.steps.length - (i % 5 === 0 ? 1 : 0));
  return {
    id: `run-${String(i + 1).padStart(3, '0')}`,
    sopId: sop.id,
    sopTitle: sop.title,
    createdAt: iso(i % 18, 12 + (i % 7)),
    completedAt: i % 5 === 0 ? '' : iso(i % 18, 13 + (i % 6)),
    userKey,
    userName,
    checked,
    notes: i % 5 === 0 ? 'Paused for provider question; will finish after huddle.' : 'Completed during normal shift flow.',
    completed: i % 5 !== 0
  };
}));

const training = [];
for (let i = 0; i < 48; i++) {
  const sop = approved[i % approved.length];
  const [userKey, userName] = activityUsers[(i + 1) % activityUsers.length];
  const quiz = Array.isArray(sop.quiz) && sop.quiz.length ? sop.quiz : [];
  const quizRun = quiz.length && i % 3 !== 0;
  const answers = quizRun ? quiz.map((q, idx) => (i % 7 === 0 && idx === 1 ? q.choices[1] : q.answer)) : [];
  const correct = quizRun ? quiz.reduce((n, q, idx) => n + (String(answers[idx]).toLowerCase() === String(q.answer).toLowerCase() ? 1 : 0), 0) : 0;
  training.push({
    id: `train-${String(i + 1).padStart(3, '0')}`,
    sopId: sop.id,
    sopTitle: sop.title,
    createdAt: iso(i % 24, 10 + (i % 8)),
    userKey,
    userName,
    answers,
    score: quizRun ? Math.round(correct / quiz.length * 100) : 100,
    correct,
    total: quizRun ? quiz.length : 0,
    confirmed: true
  });
}
writeJson('training_results.json', training);

writeJson('favorites.json', {
  camila: ['CRD-001', 'CRD-005', 'CRD-025', 'CRD-033'],
  jules: ['CRD-001', 'CRD-013', 'CRD-017', 'CRD-018', 'CRD-029'],
  tessa: ['CRD-001', 'CRD-009', 'CRD-015', 'CRD-034'],
  nora: ['CRD-001', 'CRD-003', 'CRD-011', 'CRD-037']
});

writeJson('generator_history.json', [
  {
    id: 'gen-cedar-clinical-refresh',
    createdAt: iso(10),
    mode: 'section',
    prompt: 'Generate clinical care SOP refresh suggestions for a dental practice.',
    summary: 'Drafted operatory turnover and medical alert refresh ideas.',
    addedSopIds: ['CRD-013', 'CRD-016'],
    status: 'Imported as draft, reviewed, and approved'
  },
  {
    id: 'gen-cedar-billing-review',
    createdAt: iso(18),
    mode: 'section',
    prompt: 'Generate billing office SOPs for insurance verification and patient balances.',
    summary: 'Created billing SOP drafts and manager review queue.',
    addedSopIds: ['CRD-025', 'CRD-028'],
    status: 'Partially approved'
  }
]);

console.log(`Seeded Cedar Ridge demo with ${sops.length} SOPs, ${sections.length} sections, ${users.length} users, ${training.length} training records, and shared password ${PASSWORD}.`);
