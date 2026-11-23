import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findId, newSession, raw } from './helpers.js';

describe('send keys', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });
  const keyLog = () => findId(browser, 'KeyLog');

  it('typed characters reach the game, visible to the very next command', async () => {
    await browser.elementSendKeys(await keyLog(), 'hi 7');
    expect(await browser.$('~KeyLog').getText()).toBe('keys: hi 7');
  });

  it('special keys use WebDriver key codes', async () => {
    await browser.elementSendKeys(await keyLog(), ''); // Enter
    expect(await browser.$('~KeyLog').getText()).toBe('keys: hi 7\n');
  });

  it('an unsupported character fails clearly', async () => {
    const res = await raw(browser, 'POST', `/element/${await keyLog()}/value`, { text: '€', value: ['€'] });
    expect(res.status).toBe(400);
    expect(res.value.error).toBe('invalid argument');
  });
});
