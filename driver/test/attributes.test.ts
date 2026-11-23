import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { elementId, newSession } from './helpers.js';

describe('attributes, displayed, enabled', () => {
  let browser: WebdriverIO.Browser;
  const find = async (name: string) => elementId(await browser.findElement('accessibility id', name) as any);
  beforeAll(async () => { browser = await newSession(); });
  afterAll(async () => { await browser?.deleteSession(); });

  it('reads a reflected component field by path', async () => {
    const player = await find('Player');
    expect(await browser.getElementAttribute(player, 'Transform.translation.x')).toBe('10');
    expect(await browser.getElementAttribute(player, 'Transform.translation.y')).toBe('20');
    expect(await browser.getElementAttribute(await find('ClickBtn'), 'Node.width')).toMatch(/160/);
  });

  it('special attributes: text, visible, enabled', async () => {
    expect(await browser.getElementAttribute(await find('Counter'), 'text')).toBe('count: 0');
    expect(await browser.getElementAttribute(await find('Player'), 'visible')).toBe('true');
    expect(await browser.getElementAttribute(await find('Hidden'), 'visible')).toBe('false');
    expect(await browser.getElementAttribute(await find('ClickBtn'), 'enabled')).toBe('true');
    expect(await browser.getElementAttribute(await find('DisabledBtn'), 'enabled')).toBe('false');
  });

  it('an attribute on an unregistered component or unknown path is null', async () => {
    const player = await find('Player');
    expect(await browser.getElementAttribute(player, 'Secret.0')).toBeNull();
    expect(await browser.getElementAttribute(player, 'Transform.nope')).toBeNull();
    expect(await browser.getElementAttribute(player, 'NoSuchComponent.x')).toBeNull();
  });

  it('displayed: visible, and for UI non-zero size', async () => {
    expect(await browser.isElementDisplayed(await find('Player'))).toBe(true);
    expect(await browser.isElementDisplayed(await find('ClickBtn'))).toBe(true);
    expect(await browser.isElementDisplayed(await find('Hidden'))).toBe(false);
    expect(await browser.isElementDisplayed(await find('Collapsed'))).toBe(false);
  });

  it('enabled: no interaction-disabled marker', async () => {
    expect(await browser.isElementEnabled(await find('ClickBtn'))).toBe(true);
    expect(await browser.isElementEnabled(await find('DisabledBtn'))).toBe(false);
  });
});
