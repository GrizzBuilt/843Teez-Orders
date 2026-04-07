@echo off
setlocal

cd /d C:\Users\Todd\Documents\GrizzBuilt\843Teez-Orders
node scripts\export-public-status.js
if errorlevel 1 exit /b 1

cd /d C:\Users\Todd\Documents\GrizzBuilt\843Teez

git add order-status\data\order-status.json

git diff --cached --quiet
if %errorlevel%==0 exit /b 0

git -c core.editor=true commit -m "Update public order status" --no-gpg-sign
if errorlevel 1 exit /b 1

git push origin main
if errorlevel 1 exit /b 1

endlocal
exit /b 0