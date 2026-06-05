@echo off
cd /d "%~dp0"
echo Starting SOP Portal... TechSavvy Consulting LLC - support@techsavvy.consulting
echo.
echo Staff portal: http://localhost:8011
echo Login page:   http://localhost:8011/login.html
echo Admin editor: http://localhost:8011/admin.html
echo Help section: http://localhost:8011/help.html
echo Support form: http://localhost:8011/support.html
echo.
node server.js
pause
