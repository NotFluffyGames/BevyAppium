import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { elementId, newSession } from './helpers.js';

describe('click on world entities', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });
  const clickRaw = async (name: string) => {
    const id = elementId(await browser.findElement('accessibility id', name) as any);
    return fetch(`http://127.0.0.1:${(browser.options as any).port}/session/${browser.sessionId}/element/${id}/click`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  };

  it('a world entity is clicked at its camera-projected position', async () => {
    expect((await clickRaw('Coin')).status).toBe(200);
    expect(await browser.$('~CoinCount').getText()).toBe('coins: 1');
    expect((await clickRaw('Coin')).status).toBe(200);
    expect(await browser.$('~CoinCount').getText()).toBe('coins: 2');
  });

  it('a world entity outside the camera view is not interactable', async () => {
    const res = await clickRaw('FarAway');
    expect(res.status).toBe(400);
    expect((await res.json() as any).value.error).toBe('element not interactable');
  });

  it('an entity without any screen position is not interactable', async () => {
    const res = await clickRaw('Enemy');
    expect(res.status).toBe(400);
    expect((await res.json() as any).value.error).toBe('element not interactable');
  });
});
