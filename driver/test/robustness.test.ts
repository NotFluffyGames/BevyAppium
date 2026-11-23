import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { remote } from 'webdriverio';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { newSession } from './helpers.js';

const caps = (extra: Record<string, unknown>) => ({ platformName: 'Linux', 'appium:automationName': 'Bevy', ...extra }) as WebdriverIO.Capabilities;
const session = (extra: Record<string, unknown>) =>
  remote({ hostname: '127.0.0.1', port: inject('appiumPort'), logLevel: 'error', capabilities: caps(extra) });

/** TCP listeners as "addrHex:port" read from the kernel table. */
const listeners = () => readFileSync('/proc/net/tcp', 'utf8').split('\n').slice(1)
  .map(l => l.trim().split(/\s+/)).filter(c => c[3] === '0A').map(c => { const [a, p] = c[1].split(':'); return { addr: a, port: parseInt(p, 16) }; });
const gamePids = () => { try { return execFileSync('pgrep', ['-f', 'target/debug/bevyappium-example'], { encoding: 'utf8' }).trim().split('\n').map(Number); } catch { return []; } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (pred: () => boolean, ms = 10000) => { for (let i = 0; i < ms / 100 && !pred(); i++) await sleep(100); };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe('session lifecycle robustness', () => {
  const started: ChildProcess[] = [];
  afterEach(() => { started.splice(0).forEach(c => c.kill('SIGKILL')); });

  it('attach mode connects to a running game and leaves it running', async () => {
    const port = 15900 + Math.floor(Math.random() * 90);
    const game = spawn(inject('gameBinary'), [], { env: { ...process.env, ...inject('gameEnv'), BEVYAPPIUM_PORT: String(port) }, stdio: 'ignore' });
    started.push(game);
    const browser = await session({ 'appium:agentPort': port });
    expect(await browser.$('~Counter').getText()).toBe('count: 0');
    await browser.deleteSession();
    await sleep(500);
    expect(alive(game.pid!)).toBe(true);
  });

  it('launch mode uses a configured Agent port, bound to localhost only, and no second server', async () => {
    const port = 15800 + Math.floor(Math.random() * 90);
    const browser = await session({ 'appium:app': inject('gameBinary'), 'appium:agentPort': port });
    try {
      expect((await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: '{}' })).status).toBeGreaterThan(0);
      const mine = listeners().filter(l => l.port === port);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every(l => l.addr === '0100007F')).toBe(true); // 127.0.0.1 only
      expect(listeners().some(l => l.port === 15703)).toBe(false); // render-world server is off
    } finally { await browser.deleteSession(); }
  });

  it('a game crash mid-session fails the command with a clear error', async () => {
    const browser = await newSession();
    const [pid] = gamePids();
    process.kill(pid, 'SIGKILL');
    await until(() => !alive(pid));
    const res = await fetch(`http://127.0.0.1:${inject('appiumPort')}/session/${browser.sessionId}/element`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ using: 'accessibility id', value: 'Counter' }) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toMatch(/The game exited/);
    await browser.deleteSession();
  });

  it('a missing binary fails session creation clearly', async () => {
    await expect(session({ 'appium:app': '/no/such/game' })).rejects.toThrow(/Could not launch the game binary/);
  });

  it('a game that exits immediately fails session creation clearly', async () => {
    await expect(session({ 'appium:app': '/bin/false' })).rejects.toThrow(/The game exited with code 1/);
  });

  it('an Agent port that never opens times out and the game is terminated', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'never-opens-'));
    const script = path.join(dir, 'never-opens-game');
    writeFileSync(script, '#!/bin/sh\nexec sleep 60\n'); chmodSync(script, 0o755);
    await expect(session({ 'appium:app': script, 'appium:agentStartupTimeout': 1500 })).rejects.toThrow(/did not open port/);
    await sleep(500);
    let leaked = ''; try { leaked = execFileSync('pgrep', ['-f', 'sleep 60'], { encoding: 'utf8' }); } catch { /* none */ }
    expect(leaked.trim()).toBe('');
  });

  it('a session without app or agentPort is rejected', async () => {
    await expect(session({})).rejects.toThrow(/appium:app/);
  });
});
