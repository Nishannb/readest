# Building Readest for Windows x64

Due to the complexity of cross-compiling from macOS to Windows (which requires Windows headers and toolchains), there are several approaches to build the Windows x64 version of Readest.

## Option 1: Build on a Windows Machine (Recommended)

This is the most reliable method and will produce a proper Windows executable.

### Prerequisites
- Windows 10/11 machine
- Rust (install from https://rustup.rs/)
- Node.js 18+ (install from https://nodejs.org/)
- pnpm (will be auto-installed if missing)

### Build Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd readest
   ```

2. **Run the build script:**
   - **Batch file:** Double-click `build-windows.bat`
   - **PowerShell:** Right-click `build-windows.ps1` → "Run with PowerShell"

3. **Or build manually:**
   ```bash
   cd apps/readest-app
   rustup target add x86_64-pc-windows-msvc
   pnpm install
   pnpm build
   cargo tauri build --target x86_64-pc-windows-msvc
   ```

4. **Output:** The Windows executable will be in `apps/readest-app/src-tauri/target/x86_64-pc-windows-msvc/release/`

## Option 2: GitHub Actions (CI/CD)

Use the provided GitHub Actions workflow to build automatically:

1. Push your code to GitHub
2. Go to Actions → "Build Windows x64"
3. Click "Run workflow"
4. Download the artifacts when complete

## Option 3: Docker (Advanced)

You can use Docker with a Windows container, but this requires:
- Docker Desktop with Windows containers enabled
- Windows 10/11 Pro or Enterprise
- Significant disk space

## Why Cross-Compilation Fails on macOS

The build fails on macOS because:
- The `ring` crate (cryptographic library) requires Windows headers
- Cross-compilation from macOS to Windows is complex and error-prone
- Many native dependencies need Windows-specific toolchains

## Troubleshooting

### Common Issues

1. **"assert.h not found"** - This is the cross-compilation issue described above
2. **Missing Windows target** - Run `rustup target add x86_64-pc-windows-msvc`
3. **Build script permissions** - Right-click PowerShell script → Properties → Unblock

### Getting Help

If you encounter issues:
1. Check that all prerequisites are installed
2. Ensure you're running on a Windows machine
3. Try running the build commands manually to see specific error messages

## Output Files

After a successful build, you'll find:
- `readest.exe` - The main Windows executable
- Various DLL files and resources
- The app will be ready to run on Windows x64 systems



