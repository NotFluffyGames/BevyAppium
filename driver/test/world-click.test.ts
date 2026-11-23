import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clickRaw, findId, newSession } from './helpers.js';

describe('click on world entities', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });
  const click = async (name: string) => clickRaw(browser, await findId(browser, name));

  it('a world entity is clicked at its camera-projected position', async () => {
    expect((await click('Coin')).status).toBe(200);
    expect(await browser.$('~CoinCount').getText()).toBe('coins: 1');
    expect((await click('Coin')).status).toBe(200);
    expect(await browser.$('~CoinCount').getText()).toBe('coins: 2');
  });

  it('a world entity outside the camera view is not interactable', async () => {
    const res = await click('FarAway');
    expect(res.status).toBe(400);
    expect(res.value.error).toBe('element not interactable');
  });

  it('an entity without any screen position is not interactable', async () => {
    const res = await click('Enemy');
    expect(res.status).toBe(400);
    expect(res.value.error).toBe('element not interactable');
  });
});
