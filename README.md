# Cedar Ridge SOP Portal Demo

Branded live-demo seed of the SOP Portal for Cedar Ridge Dental Studio.

Live demo: https://techsavvy-consulting.github.io/sop-portal-live-demo/

## Demo Logins

All seeded users use this password:

```text
DemoPass!2026
```

Useful accounts:

- `admin` - Avery Collins, Admin
- `nora` - Nora Patel, Manager
- `miles` - Miles Romero, Editor
- `camila` - Camila Brooks, Staff
- `jules` - Jules Nguyen, Staff
- `eli` - Eli Warren, Viewer

## Run Locally

```bash
npm start
```

The portal uses `config.json` locally. On hosted Node services, `PORT` is honored when the platform assigns a port.

The GitHub Pages version uses the root-level static demo files and `static-demo.js` to serve the seeded JSON through browser storage. The Node runtime files remain available under `public/` and `server.js`.

## Demo Content

- 40 SOPs across 10 sections
- 29 approved SOPs plus draft, pending review, rejected, and archived examples
- 20 SOP quizzes
- 32 checklist runs and 48 training/read-confirmation records
- 3 change requests and 4 local support tickets
- Daily Office Opening Checklist opens first and includes example image/text attachments
- Help screenshots were recaptured after the Cedar Ridge branding and demo content were applied
