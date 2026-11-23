import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, inject, it } from 'vitest';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build/src/cli.js');
const run = (args: string[], opts: { input?: string; env?: Record<string, string> } = {}) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input: opts.input, env: { ...process.env, ...inject('gameEnv'), ...opts.env }, timeout: 120000 });

describe('bevyappium CLI', () => {
  it('doctor reports each check as JSON and succeeds on a healthy environment', () => {
    const r = run(['doctor', '--json']);
    const checks = JSON.parse(r.stdout) as { name: string; ok: boolean }[];
    expect(checks.map(c => c.name)).toEqual(expect.arrayContaining(['node', 'rust', 'display', 'vulkan']));
    expect(checks.every(c => c.ok)).toBe(true);
    expect(r.status).toBe(0);
  });

  it('doctor fails with a fix hint when something is missing', () => {
    const r = run(['doctor'], { env: { PATH: '', DISPLAY: '', WAYLAND_DISPLAY: '' } });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/✖ rust/);
    expect(r.stdout).toMatch(/fix: /);
  });

  it('inspect launches a game and explores its element tree interactively', () => {
    const r = run(['inspect', '--app', inject('gameBinary')], { input: 'tree\nfind Counter\nclick nonsense\nquit\n' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ClickBtn\s+id=\d+/);          // tree shows names and ids
    expect(r.stdout).toMatch(/"elements":\["\d+"\]/);        // find
    expect(r.stdout).toMatch(/"error"/);                     // a bad id reports an error instead of crashing
  });

  it('run starts Appium with the driver and runs the command against it', () => {
    const script = `
      const r = await fetch('http://' + process.env.APPIUM_HOST + ':' + process.env.APPIUM_PORT + '/status');
      const ok = (await r.json()).value.ready === true && !!process.env.BEVYAPPIUM_APP;
      process.exit(ok ? 0 : 1);`;
    const r = run(['run', '--app', inject('gameBinary'), '--', process.execPath, '--input-type=module', '-e', script]);
    expect(r.status).toBe(0);
  });

  it("run returns the command's exit code", () => {
    const r = run(['run', '--app', inject('gameBinary'), '--', process.execPath, '-e', 'process.exit(3)']);
    expect(r.status).toBe(3);
  });
});
