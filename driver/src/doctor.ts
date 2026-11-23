// `bevyappium doctor`: check that this machine can build and run Bevy games under Appium.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

export type Check = { name: string; ok: boolean; detail: string; fix?: string };

const parse = (v: string) => v.split('.').map(Number) as [number, number, number];

/** a - b, comparing major, minor, patch. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** Appium 4's supported Node range: ^22.22.2 || ^24.15.0 || >=26.0.0 */
export function nodeSupported(version: string): boolean {
  const [major] = parse(version);
  if (major === 22) return compareVersions(version, '22.22.2') >= 0;
  if (major === 24) return compareVersions(version, '24.15.0') >= 0;
  return major >= 26;
}

const MIN_RUST = '1.97.1'; // required by Bevy 0.20.1
const VULKAN_ICD_DIRS = ['/usr/share/vulkan/icd.d', '/etc/vulkan/icd.d'];
const LINUX_LIBS = ['alsa', 'libudev', 'wayland-client', 'xkbcommon', 'x11'];

const output = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.error || r.status !== 0 ? undefined : (r.stdout || r.stderr).trim();
};

export function doctor(): Check[] {
  const checks: Check[] = [];

  checks.push({ name: 'node', ok: nodeSupported(process.versions.node), detail: `Node ${process.versions.node}`, fix: 'Install Node 22.22.2+ (or 24.15+) — required by Appium 4' });

  const rustc = output('rustc', ['--version']);
  const rustVersion = rustc?.match(/rustc (\d+\.\d+\.\d+)/)?.[1];
  checks.push({ name: 'rust', ok: !!rustVersion && compareVersions(rustVersion, MIN_RUST) >= 0, detail: rustc ?? 'rustc not found', fix: `Install Rust ${MIN_RUST}+ (Bevy 0.20.1 requires it): rustup update stable` });

  const hasDisplay = !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
  const hasXvfb = !!output('which', ['Xvfb']) || !!output('which', ['xvfb-run']);
  checks.push({
    name: 'display', ok: hasDisplay || hasXvfb,
    detail: hasDisplay ? `display ${process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY}` : hasXvfb ? 'no display set, Xvfb available' : 'no display and no Xvfb',
    fix: 'Set DISPLAY, or install Xvfb to run headless (xvfb-run <command>)',
  });

  const icds = VULKAN_ICD_DIRS.flatMap(d => existsSync(d) ? readdirSync(d) : []);
  const hasVulkan = !!process.env.VK_ICD_FILENAMES || icds.length > 0;
  checks.push({ name: 'vulkan', ok: hasVulkan, detail: hasVulkan ? (process.env.VK_ICD_FILENAMES ?? icds.join(', ')) : 'no Vulkan driver found', fix: 'Install a Vulkan driver; for software rendering: apt install mesa-vulkan-drivers' });

  if (process.platform === 'linux') {
    const missing = LINUX_LIBS.filter(lib => spawnSync('pkg-config', ['--exists', lib]).status !== 0);
    checks.push({ name: 'system-libraries', ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : 'all present', fix: 'apt install libasound2-dev libudev-dev libwayland-dev libxkbcommon-dev libx11-dev pkg-config (and libxkbcommon-x11-0 at runtime)' });
  }
  return checks;
}
