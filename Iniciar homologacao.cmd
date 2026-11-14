@echo off
cd /d "%~dp0"
node scripts\homologacao-local\iniciar.mjs %*
echo.
pause
