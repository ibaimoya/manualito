@echo off
setlocal
chcp 65001 >nul 2>nul
cls
set "MANUALITO_SCRIPT=%~dp0deploy\windows\manualito.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MANUALITO_SCRIPT%" -Action stop %*
set "MANUALITO_EXIT=%ERRORLEVEL%"
if not defined MANUALITO_NO_PAUSE pause
exit /b %MANUALITO_EXIT%
