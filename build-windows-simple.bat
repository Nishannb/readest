@echo off
echo ========================================
echo    Building Readest for Windows x64
echo ========================================
echo.

REM Check if Rust is installed
echo Checking Rust installation...
rustc --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Rust is not installed!
    echo Please install Rust from: https://rustup.rs/
    echo.
    echo After installing Rust, restart this script.
    pause
    exit /b 1
)
echo ✅ Rust is installed

REM Check if Node.js is installed
echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo After installing Node.js, restart this script.
    pause
    exit /b 1
)
echo ✅ Node.js is installed

REM Install pnpm if not present
echo Checking pnpm...
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
pnpm build-win-x64

echo.
echo ========================================
echo           Build completed!
echo ========================================
echo.
echo Your Windows app is ready in:
echo target\x86_64-pc-windows-msvc\release\
echo.
echo You can now share the entire 'release' folder
echo with your friends to run on their Windows laptops.
echo.
pause
