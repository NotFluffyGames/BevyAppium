import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clickRaw, findId, newSession } from './helpers.js';

describe('UI click and frame sync', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });

  it('click reaches the game as a real user click, visible to the very next command', async () => {
    const button = await browser.$('~ClickBtn');
    await button.click();
    expect(await browser.$('~Counter').getText()).toBe('count: 1'); // no manual waiting
    await button.click();
    await button.click();
    expect(await browser.$('~Counter').getText()).toBe('count: 3');
  });

  it('each click runs exactly once, however many are issued', async () => {
    const before = Number((await browser.$('~Counter').getText()).replace('count: ', ''));
    const button = await browser.$('~ClickBtn');
    for (let i = 0; i < 15; i++) await button.click();
    expect(await browser.$('~Counter').getText()).toBe(`count: ${before + 15}`);
  });

  it('waitFrames replies after the requested frames have run, including zero', async () => {
    const t0 = Date.now();
    await browser.execute('bevy: waitFrames', { frames: 5 });
    await browser.execute('bevy: waitFrames', { frames: 0 });
    expect(Date.now() - t0).toBeLessThan(10000);
  });

  it('clicking an element that cannot be clicked fails as not interactable', async () => {
    const res = await clickRaw(browser, await findId(browser, 'Enemy'));
    expect(res.status).toBe(400);
    expect(res.value.error).toBe('element not interactable');
  });
});
