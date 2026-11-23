import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { elementId, newSession } from './helpers.js';

describe('send keys', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });
  const keyLog = async () => elementId(await browser.findElement('accessibility id', 'KeyLog') as any);

  it('typed characters reach the game, visible to the very next command', async () => {
    await browser.elementSendKeys(await keyLog(), 'hi 7');
    expect(await browser.$('~KeyLog').getText()).toBe('keys: hi 7');
  });

  it('special keys use WebDriver key codes', async () => {
    await browser.elementSendKeys(await keyLog(), ''); // Enter
    expect(await browser.$('~KeyLog').getText()).toBe('keys: hi 7\n');
  });

  it('an unsupported character fails clearly', async () => {
    const res = await fetch(`http://127.0.0.1:${(browser.options as any).port}/session/${browser.sessionId}/element/${await keyLog()}/value`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '€', value: ['€'] }) });
    expect(res.status).toBe(400);
    expect((await res.json() as any).value.error).toBe('invalid argument');
  });
});
