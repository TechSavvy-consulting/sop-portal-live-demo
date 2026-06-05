SOP Portal - Release Build

This folder contains the local SOP Portal application for client deployment.

Run
1. Open this folder on the deployment computer.
2. Start the portal with start-sop-portal.bat.
3. Open http://localhost:8086.
4. Open Admin at http://localhost:8086/admin.html.
5. Open Help at http://localhost:8086/help.html.

Configuration
- config.json controls the local port, session duration, support email, and optional online support form endpoint.
- Brand / Settings in Admin controls portal name, customer/company name, logo, colors, QR base URL, and help screenshot recapture.
- If the port changes, restart the portal.

Data
- Live portal data is stored in data.
- Backups are stored in data/backups.
- Uploaded logos and SOP attachments are stored in public/uploads.
- Help screenshots are stored in help-screenshots-new.

Release QA
Run the sandboxed release QA suite before handoff:

powershell -ExecutionPolicy Bypass -File tools\qa\run-release-qa.ps1 -SourceRoot .

The release QA runner copies the portal to a temporary sandbox, changes the sandbox port, starts the sandbox server, and runs destructive tests against the copy only.

Security
- Create customer-specific user passwords before deployment.
- Remove or disable any setup/test users that should not remain active.
- Keep backups private because they may contain SOP content, user records, and operational history.
