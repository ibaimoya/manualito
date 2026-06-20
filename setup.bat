@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>nul
cls
set "MANUALITO_SCRIPT=%~dp0deploy\windows\manualito.ps1"
set "MANUALITO_PARENT_NO_PAUSE=%MANUALITO_NO_PAUSE%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MANUALITO_SCRIPT%" -Action setup %*
set "MANUALITO_EXIT=%ERRORLEVEL%"
if "%MANUALITO_EXIT%"=="42" (
    set "MANUALITO_NO_PAUSE=1"
    call "%~dp0start.bat"
    set "MANUALITO_EXIT=!ERRORLEVEL!"
    if defined MANUALITO_PARENT_NO_PAUSE (
        set "MANUALITO_NO_PAUSE=%MANUALITO_PARENT_NO_PAUSE%"
    ) else (
        set "MANUALITO_NO_PAUSE="
    )
)
if not defined MANUALITO_NO_PAUSE pause
exit /b %MANUALITO_EXIT%
