// Starts an Appium server with this driver installed, for `bevyappium run`.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './game-process.js';

export async function startAppium(driverDir: string): Promise<{ port: number; stop: () => void }> {
  // Appium is a peer dependency: resolve it from the project the command runs in.
  const require = createRequire(path.join(process.cwd(), 'noop.js'));
  const appiumBin = path.join(path.dirname(require.resolve('appium/package.json')), 'index.js');
  const env = { ...process.env, APPIUM_HOME: mkdtempSync(path.join(tmpdir(), 'bevyappium-home-')) };
  const install = spawnSync('node', [appiumBin, 'driver', 'install', '--source=local', driverDir], { env, stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Could not install the driver into Appium');
  const port = await freePort();
  const server = spawn('node', [appiumBin, 'server', '--port', String(port), '--log-level', 'warn'], { env, stdio: 'inherit' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/status`)).ok) break; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return { port, stop: () => server.kill('SIGTERM') };
}
