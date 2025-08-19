@echo off
echo Building BrightPal for Windows x64...

REM Check if Rust is installed
rustc --version >nul 2>&1
if errorlevel 1 (
    echo Rust is not installed. Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if pnpm is installed
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo Installing pnpm...
    npm install -g pnpm
)

REM Add Windows x64 target
echo Adding Windows x64 target...
rustup target add x86_64-pc-windows-msvc

REM Navigate to the app directory
cd apps\brightpal-app

REM Install dependencies
echo Installing dependencies...
pnpm install

REM Build frontend
echo Building frontend...
pnpm build

REM Build Windows x64 app
echo Building Windows x64 app...
cargo tauri build --target x86_64-pc-windows-msvc

echo Build completed! Check the target\x86_64-pc-windows-msvc\release\ directory for the output files.
pause



