import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSession } from './helpers.js';

describe('walking skeleton', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
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
