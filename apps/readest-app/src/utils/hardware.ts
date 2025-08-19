// Utility to compute a stable hardware fingerprint for the current device.
// Strategy (best-effort, cross-platform):
// - Try platform-specific serials/IDs via shell commands using Tauri invoke command
// - Fallback to OS plugin info (version, arch, locale, screen size)
// - Hash the combined info to produce a stable opaque ID

// Lightweight SHA-256 using Web Crypto when available, else a trivial hash fallback
async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && 'crypto' in window && 'subtle' in window.crypto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback trivial hash (less secure, but keeps determinism in non-browser contexts)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

async function tryExec(command: string, args: string[]): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<string>('execute_command', { command, args });
    return result?.trim() || null;
  } catch {
    return null;
  }
}

export async function getHardwareFingerprint(): Promise<string> {
  let rawParts: string[] = [];

  // Platform detection via userAgentData or navigator
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-ua';
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const screenInfo = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}x${screen.colorDepth}` : 'screen-unknown';

  // Try platform-specific unique IDs
  // macOS: system_profiler (Serial Number)
  let id = await tryExec('sh', ['-lc', 'system_profiler SPHardwareDataType | grep "Serial Number" | awk -F": " \'{print $2}\'' ]);
  if (id) rawParts.push(`mac-serial:${id}`);

  // Linux: /etc/machine-id
  if (!id) {
    id = await tryExec('sh', ['-lc', 'cat /etc/machine-id 2>/dev/null || true']);
    if (id) rawParts.push(`linux-mid:${id}`);
  }

  // Windows: wmic csproduct get uuid
  if (!id) {
    id = await tryExec('cmd', ['/C', 'wmic csproduct get uuid']);
    if (id) {
      const uuid = id.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
      if (uuid && uuid.toLowerCase() !== 'uuid') rawParts.push(`win-uuid:${uuid}`);
    }
  }

  // Fallback to OS info via plugin-os
  try {
    const { platform, version, arch } = await import('@tauri-apps/plugin-os');
    const plat = await platform();
    const ver = await version();
    const a = await arch();
    rawParts.push(`os:${plat || 'unknown'}-${ver || '0'}-${a || 'arch'}`);
  } catch {
    // ignore
  }

  rawParts.push(`ua:${ua}`);
  rawParts.push(`lang:${lang}`);
  rawParts.push(`screen:${screenInfo}`);

  const combined = rawParts.join('|');
  const digest = await sha256Hex(combined);
  return `hw_${digest}`;
}


