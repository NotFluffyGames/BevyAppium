import { execFileSync } from 'node:child_process';
import { remote } from 'webdriverio';
import { describe, expect, inject, it } from 'vitest';

const gameCount = () => {
  try { return execFileSync('pgrep', ['-fc', 'target/debug/bevyappium-example'], { encoding: 'utf8' }).trim() ? Number(execFileSync('pgrep', ['-fc', 'target/debug/bevyappium-example'], { encoding: 'utf8' })) : 0; }
  catch { return 0; }
};
const settle = async (pred: () => boolean) => { for (let i = 0; i < 40 && !pred(); i++) await new Promise(r => setTimeout(r, 250)); };

describe('session lifecycle', () => {
  it('launches the game on create and terminates it on delete', async () => {
    const before = gameCount();
    const browser = await remote({
      hostname: '127.0.0.1', port: inject('appiumPort'), logLevel: 'error',
      capabilities: { platformName: 'Linux', 'appium:automationName': 'Bevy', 'appium:app': inject('gameBinary') } as WebdriverIO.Capabilities,
    });
    expect(gameCount()).toBe(before + 1);
    await browser.deleteSession();
    await settle(() => gameCount() === before);
    expect(gameCount()).toBe(before);
  });
});
