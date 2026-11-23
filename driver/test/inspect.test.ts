import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newSession } from './helpers.js';

describe('screenshot and page source', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });

  it('screenshot is a base64 PNG of the game window', async () => {
    const png = Buffer.from(await browser.takeScreenshot(), 'base64');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(400); // IHDR width
    expect(png.readUInt32BE(20)).toBe(300); // IHDR height
    expect(png.length).toBeGreaterThan(1000); // something was actually drawn
  });

  it('screenshot reflects what the game currently shows', async () => {
    const before = Buffer.from(await browser.takeScreenshot(), 'base64');
    await browser.$('~ClickBtn').click();
    const after = Buffer.from(await browser.takeScreenshot(), 'base64');
    expect(after.equals(before)).toBe(false); // the counter text changed
  });

  it('page source is well-formed XML of the entity hierarchy', async () => {
    const xml = await browser.getPageSource();
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml.match(/name="Enemy"/g)).toHaveLength(3);
    // balanced tags
    const stack: string[] = [];
    for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w-]*)[^>]*?(\/?)>/g)) {
      if (m[3]) continue; if (m[1]) expect(stack.pop()).toBe(m[2]); else stack.push(m[2]);
    }
    expect(stack).toHaveLength(0);
    // hierarchy: the button sits inside a parent, and carries component types
    const button = xml.match(/<Entity[^>]*name="ClickBtn"[^>]*>/)![0];
    expect(button).toMatch(/components="[^"]*Button/);
    expect(xml.indexOf('name="ClickBtn"')).toBeGreaterThan(xml.indexOf('<Entity')); // nested after its root
  });
});
