import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { newSession } from './helpers.js';

const gameCount = () => {
  try { return execFileSync('pgrep', ['-fc', 'target/debug/bevyappium-example'], { encoding: 'utf8' }).trim() ? Number(execFileSync('pgrep', ['-fc', 'target/debug/bevyappium-example'], { encoding: 'utf8' })) : 0; }
  catch { return 0; }
};
const settle = async (pred: () => boolean) => { for (let i = 0; i < 40 && !pred(); i++) await new Promise(r => setTimeout(r, 250)); };

describe('session lifecycle', () => {
  it('launches the game on create and terminates it on delete', async () => {
    const before = gameCount();
    const browser = await newSession();
    expect(gameCount()).toBe(before + 1);
    await browser.deleteSession();
    await settle(() => gameCount() === before);
    expect(gameCount()).toBe(before);
  });
});
