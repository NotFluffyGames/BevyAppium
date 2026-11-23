import { remote } from 'webdriverio';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

describe('walking skeleton', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => {
    browser = await remote({
      hostname: '127.0.0.1', port: inject('appiumPort'), logLevel: 'error',
      capabilities: {
        platformName: 'Linux',
        'appium:automationName': 'Bevy',
        'appium:app': inject('gameBinary'),
      } as WebdriverIO.Capabilities,
    });
  });
  afterAll(async () => { await browser?.deleteSession(); });

  it('finds an element by accessibility id and reads its text', async () => {
    const counter = await browser.$('~Counter');
    expect(await counter.getText()).toBe('count: 0');
  });

  it('reports no such element for an unknown name', async () => {
    const missing = await browser.$('~DoesNotExist');
    expect(await missing.isExisting()).toBe(false);
  });
});
