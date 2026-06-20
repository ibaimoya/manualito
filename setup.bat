@echo off
setlocal
chcp 65001 >nul 2>nul
cls
set "MANUALITO_SCRIPT=%~dp0deploy\windows\manualito.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MANUALITO_SCRIPT%" -Action setup %*
set "MANUALITO_EXIT=%ERRORLEVEL%"
if "%MANUALITO_EXIT%"=="42" (
    set "MANUALITO_NO_PAUSE=1"
    call "%~dp0start.bat"
    set "MANUALITO_EXIT=%ERRORLEVEL%"
)
if not defined MANUALITO_NO_PAUSE pause
exit /b %MANUALITO_EXIT%
