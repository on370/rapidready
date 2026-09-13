@echo off
rem ==============================================================================
rem RapidReady - Windows Development Launcher
rem
rem Purpose:
rem   Launches RapidReady in local development mode on Windows.
rem
rem Explanation:
rem   1. Validates that Node.js and Cargo (Rust) are accessible in PATH.
rem   2. Verifies that node_modules exists, running 'npm install' if needed.
rem   3. Starts the Vite development server and launches the native Tauri desktop window
rem      with hot-module reloading (HMR) and debug logging enabled.
rem
rem Usage:
rem   From File Explorer:
rem     Double-click 'scripts\dev.bat'
rem   From Command Prompt or PowerShell:
rem     scripts\dev.bat
rem ==============================================================================

setlocal enabledelayedexpansion
title RapidReady Dev Server

echo [RapidReady] Checking development environment...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js LTS from https://nodejs.org/
    pause
    exit /b 1
)

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Rust ^(cargo^) is not installed or not found in PATH.
    echo Please install Rust via rustup from https://rustup.rs/
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

echo [RapidReady] Starting Vite dev server and Tauri desktop app...
call npm run tauri dev

if %errorlevel% neq 0 (
    echo [RapidReady] Dev server exited with code %errorlevel%.
    pause
)
