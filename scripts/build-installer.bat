@echo off
rem ==============================================================================
rem RapidReady - Windows Production Installer Builder
rem
rem Purpose:
rem   Builds optimized release binaries and generates the standalone NSIS installer
rem   executable (.exe) for Windows x64.
rem
rem Explanation:
rem   1. Validates Node.js and Rust environments.
rem   2. Runs 'npm run build', which bumps the hex build number (via bump-build.js),
rem      compiles TypeScript (tsc), and bundles frontend assets (Vite).
rem   3. Invokes Tauri CLI in release mode ('npm run tauri build').
rem   4. Packages the compiled release binary and dependencies into the final
rem      NSIS setup installer at:
rem      src-tauri\target\release\bundle\nsis\RapidReady_<version>_x64-setup.exe
rem
rem Usage:
rem   From File Explorer:
rem     Double-click 'scripts\build-installer.bat'
rem   From Command Prompt or PowerShell:
rem     scripts\build-installer.bat
rem ==============================================================================

setlocal enabledelayedexpansion
title RapidReady Release Builder (Windows)

echo ==============================================================================
echo  RapidReady - Windows Release Packaging
echo ==============================================================================

rem Ensure NSIS compiler (makensis.exe) is in PATH (Tauri downloads to %LOCALAPPDATA%\tauri\NSIS\Bin)
if exist "%LOCALAPPDATA%\tauri\NSIS\Bin" (
    set "PATH=%LOCALAPPDATA%\tauri\NSIS\Bin;%PATH%"
) else if exist "%ProgramFiles(x86)%\NSIS" (
    set "PATH=%ProgramFiles(x86)%\NSIS;%PATH%"
) else if exist "%ProgramFiles%\NSIS" (
    set "PATH=%ProgramFiles%\NSIS;%PATH%"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    pause
    exit /b 1
)

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Rust ^(cargo^) is not installed or not found in PATH.
    pause
    exit /b 1
)

rem Navigate to repository root (one level up from scripts/)
cd /d "%~dp0\.."

if not exist "node_modules\" (
    echo [RapidReady] Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b %errorlevel%
    )
)

if "%~1"=="--no-bump" set "NO_BUMP=1"

echo [RapidReady] Building frontend and compiling release installer...
call npm run tauri build

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed with exit code %errorlevel%.
    echo Please check compiler logs above for details.
    pause
    exit /b %errorlevel%
)

echo.
echo ==============================================================================
echo [SUCCESS] Installer successfully built!
echo Look in: src-tauri\target\release\bundle\nsis\
echo ==============================================================================
pause
