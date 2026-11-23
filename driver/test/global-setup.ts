// Seam 1 harness: build the example game, start an Appium server (under a virtual display,
// software Vulkan) with the Driver installed into an isolated APPIUM_HOME.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const driverDir = path.resolve(here, '..');
const repoDir = path.resolve(driverDir, '..');
const appiumBin = path.join(driverDir, 'node_modules/appium/index.js');
const PORT = 4723 + Math.floor(Math.random() * 500);
let server: ChildProcess | undefined;

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env, cwd = repoDir) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

export async function setup(project: { provide: (k: string, v: unknown) => void }) {
  run('npm', ['run', 'build'], process.env, driverDir);
  run('cargo', ['build', '-p', 'bevyappium-example', '--features', 'bevyappium']);
  const home = mkdtempSync(path.join(tmpdir(), 'bevyappium-home-'));
  const env = { ...process.env, APPIUM_HOME: home };
  run('node', [appiumBin, 'driver', 'install', '--source=local', driverDir], env);
  server = spawn('xvfb-run', ['-a', '-s', '-screen 0 800x600x24', 'node', appiumBin, 'server', '--port', String(PORT), '--log-level', 'warn'], {
    cwd: repoDir, stdio: 'inherit',
    env: { ...env, VK_ICD_FILENAMES: process.env.VK_ICD_FILENAMES ?? '/usr/share/vulkan/icd.d/lvp_icd.json', WGPU_BACKEND: 'vulkan' },
  });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/status`)).ok) break; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  project.provide('appiumPort', PORT);
  project.provide('gameBinary', path.join(repoDir, 'target/debug/bevyappium-example'));
}

export async function teardown() {
  server?.kill('SIGTERM');
  spawnSync('pkill', ['-f', 'bevyappium-example']);
}

declare module 'vitest' {
  export interface ProvidedContext { appiumPort: number; gameBinary: string }
}
