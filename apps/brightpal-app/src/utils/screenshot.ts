import { Command } from '@tauri-apps/plugin-shell';
import { tempDir, join } from '@tauri-apps/api/path';
import { readFile, writeFile, BaseDirectory, exists } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
  }
  return btoa(binary);
}

export type ScreenshotResult = { filePath: string; imageUrl: string };

export async function captureMacOSInteractiveScreenshot(): Promise<ScreenshotResult | null> {
  // Build a timestamped filename in temp; do not persist to Downloads
  const filename = `readest-screenshot-${formatTimestamp(Date.now())}.png`;
  const tmp = await tempDir();
  const outPath = await join(tmp, filename);

  // Use the macOS system screencapture tool with interactive selection
  // -i: interactive selection UI; -x: no sound
  // Note: use absolute path to avoid PATH resolution issues inside the sandboxed app
  const binary = '/usr/sbin/screencapture';
  const args = ['-i', '-x', outPath];

  // If /usr/sbin/screencapture does not exist (some systems), fall back to just 'screencapture'
  try {
    const res = await new Command(binary, args).execute();
    if (res.code !== 0) {
      // user may have cancelled selection or command failed
      return null;
    }
  } catch {
    try {
      const res2 = await new Command('screencapture', args).execute();
      if (res2.code !== 0) return null;
    } catch {
      return null;
    }
  }

  try {
    if (!(await exists(outPath))) return null;
    const bytes = await readFile(outPath);
    const b64 = await bytesToBase64(bytes);
    return { filePath: filename, imageUrl: `data:image/png;base64,${b64}` };
  } catch {
    return null;
  }
}

export type MacCaptureController = { cancel: () => Promise<void> };

export async function startMacScreenCapture(
  onComplete: (res: ScreenshotResult | null) => void
): Promise<MacCaptureController | null> {
  const filename = `readest-screenshot-${formatTimestamp(Date.now())}.png`;
  const tmp = await tempDir();
  const outPath = await join(tmp, filename);
  const args = ['-i', '-x', outPath];

  let child: any | null = null;
  async function spawnWith(program: string): Promise<boolean> {
    try {
      const cmd: any = new Command(program, args);
      cmd.on('close', async (event: any) => {
        try {
          if (event?.code === 0 && (await exists(outPath))) {
            try {
              const bytes = await readFile(outPath);
              try {
                await writeFile({ path: filename, contents: bytes, baseDir: BaseDirectory.Downloads });
              } catch {}
              const b64 = await bytesToBase64(bytes);
              onComplete({ filePath: filename, imageUrl: `data:image/png;base64,${b64}` });
            } catch {
              onComplete(null);
            }
          } else {
            onComplete(null);
          }
        } catch {
          onComplete(null);
        }
      });
      child = await cmd.spawn();
      return true;
    } catch {
      return false;
    }
  }

  // Try full path first, then fallback to PATH lookup
  if (!(await spawnWith('/usr/sbin/screencapture'))) {
    if (!(await spawnWith('screencapture'))) {
      onComplete(null);
      return null;
    }
  }

  return {
    cancel: async () => {
      try {
        if (child && typeof child.kill === 'function') {
          await child.kill();
        }
      } catch {}
    },
  };
}


