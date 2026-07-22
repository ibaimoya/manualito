@echo off
setlocal
chcp 65001 >nul 2>nul
set "MANUALITO_SCRIPT=%~dp0deploy\windows\local-ca.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MANUALITO_SCRIPT%" %*
exit /b %ERRORLEVEL%
