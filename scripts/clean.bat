@echo off
rem ==============================================================================
rem RapidReady - Windows Workspace Cleaner
rem
rem Purpose:
rem   Cleans build artifacts, compiler caches, and temporary files to reclaim
rem   disk space (typically frees 15–25+ GB from src-tauri\target).
rem
rem Explanation:
rem   1. Deletes Cargo target directory (src-tauri\target) containing intermediate
rem      compilation objects (.o, .rlib, .rmeta) and test executables.
rem   2. Deletes Vite dev cache (node_modules\.vite) and compiled frontend (dist\).
rem   3. Cleans OS metadata (Thumbs.db, .DS_Store) and stale temporary files.
rem   4. With /deep, /all, --deep, or --all: additionally removes node_modules.
rem
rem Usage:
rem   Standard clean:
rem     scripts\clean.bat
rem   Deep clean (including node_modules):
rem     scripts\clean.bat /deep
rem ==============================================================================

setlocal enabledelayedexpansion
title RapidReady Workspace Cleaner

cd /d "%~dp0\.."

set DEEP_CLEAN=0
if /i "%~1"=="/deep" set DEEP_CLEAN=1
if /i "%~1"=="--deep" set DEEP_CLEAN=1
if /i "%~1"=="/all" set DEEP_CLEAN=1
if /i "%~1"=="--all" set DEEP_CLEAN=1
if /i "%~1"=="-d" set DEEP_CLEAN=1
if /i "%~1"=="-a" set DEEP_CLEAN=1

echo [RapidReady] Cleaning workspace...

if exist "src-tauri\target\" (
    echo    Deleting src-tauri\target...
    rd /s /q "src-tauri\target" 2>nul
)

if exist "dist\" (
    echo    Deleting dist\...
    rd /s /q "dist" 2>nul
)

if exist "node_modules\.vite\" (
    echo    Deleting node_modules\.vite\...
    rd /s /q "node_modules\.vite" 2>nul
)

if exist "node_modules\.vite-temp\" (
    echo    Deleting node_modules\.vite-temp\...
    rd /s /q "node_modules\.vite-temp" 2>nul
)

if %DEEP_CLEAN% equ 1 (
    if exist "node_modules\" (
        echo [DEEP] Deleting node_modules\...
        rd /s /q "node_modules" 2>nul
    )
)

echo    Cleaning temporary files and OS metadata...
del /s /q /f Thumbs.db >nul 2>nul
del /s /q /f .DS_Store >nul 2>nul
del /s /q /f *.tmp >nul 2>nul

echo.
echo [SUCCESS] Workspace cleaned successfully!
if %DEEP_CLEAN% equ 1 (
    echo Next step: Run 'npm install' or 'scripts\dev.bat' to re-initialize dependencies.
) else (
    echo Next step: Run 'scripts\dev.bat' to start development or 'scripts\build-installer.bat' to build.
)

exit /b 0
