# Build Readest for Windows x64
Write-Host "Building Readest for Windows x64..." -ForegroundColor Green

# Check if Rust is installed
try {
    $rustVersion = rustc --version
    Write-Host "Rust version: $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "Rust is not installed. Please install Rust from https://rustup.rs/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if pnpm is installed
try {
    $pnpmVersion = pnpm --version
    Write-Host "pnpm version: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "Installing pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
}

# Add Windows x64 target
Write-Host "Adding Windows x64 target..." -ForegroundColor Yellow
rustup target add x86_64-pc-windows-msvc

# Navigate to the app directory
Set-Location "apps\readest-app"

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pnpm install

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Yellow
pnpm build

# Build Windows x64 app
Write-Host "Building Windows x64 app..." -ForegroundColor Yellow
cargo tauri build --target x86_64-pc-windows-msvc

Write-Host "Build completed!" -ForegroundColor Green
Write-Host "Check the target\x86_64-pc-windows-msvc\release\ directory for the output files." -ForegroundColor Green
Read-Host "Press Enter to exit"



