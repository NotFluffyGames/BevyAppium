import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { elementId, newSession } from './helpers.js';

describe('element model', () => {
  let browser: WebdriverIO.Browser;
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });

  it('id locator matches Name exactly', async () => {
    expect(await browser.$('id=Counter').getText()).toBe('count: 0');
  });

  it('find-all returns every entity with the same Name', async () => {
    const found = await browser.findElements('accessibility id', 'Enemy');
    expect(found).toHaveLength(3);
  });

  it('class name matches a component type by short and full path', async () => {
    expect(await browser.findElements('class name', 'Enemy')).toHaveLength(3);
    expect(await browser.findElements('class name', 'bevyappium_example::Enemy')).toHaveLength(3);
    // component locators need no Name: Marker has no Name
    expect(await browser.findElements('class name', 'Marker')).toHaveLength(1);
  });

  it('unknown name or component gives no elements / no such element', async () => {
    expect(await browser.findElements('class name', 'NoSuchComponent')).toHaveLength(0);
    // the raw find-element command returns the protocol error object
    expect(await browser.findElement('accessibility id', 'Nope')).toMatchObject({ error: 'no such element' });
  });

  it('unsupported strategies fail with invalid selector', async () => {
    await expect(browser.findElement('xpath', '//Enemy')).rejects.toThrow(/invalid selector|not supported/i);
  });

  it('a despawned entity gives stale element reference', async () => {
    // raw commands: a `$()` element would silently re-find itself
    const fleeting = elementId(await browser.findElement('accessibility id', 'Fleeting') as any);
    expect(await browser.getElementText(fleeting)).toBe('fleeting');
    await new Promise(r => setTimeout(r, 3500)); // despawns after ~2s
    const res = await fetch(`http://127.0.0.1:${inject('appiumPort')}/session/${browser.sessionId}/element/${fleeting}/text`);
    expect(res.status).toBe(404);
    expect((await res.json() as any).value.error).toBe('stale element reference');
  });
});
