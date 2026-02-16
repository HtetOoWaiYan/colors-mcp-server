import { describe, expect, it } from 'vitest';
import { checkContrast } from './engine.js';

describe('checkContrast', () => {
  it('returns maximum contrast for black on white', () => {
    const result = checkContrast('#000000', '#ffffff');
    expect(result.ratio).toBe(21);
    expect(result.aa.regular).toBe(true);
    expect(result.aa.large).toBe(true);
    expect(result.aaa.regular).toBe(true);
    expect(result.aaa.large).toBe(true);
    expect(result.nonText).toBe(true);
  });

  it('returns minimum contrast for white on white', () => {
    const result = checkContrast('#ffffff', '#ffffff');
    expect(result.ratio).toBe(1);
    expect(result.aa.regular).toBe(false);
    expect(result.aa.large).toBe(false);
    expect(result.aaa.regular).toBe(false);
    expect(result.aaa.large).toBe(false);
    expect(result.nonText).toBe(false);
  });

  it('passes AA but fails AAA for a mid-contrast pair', () => {
    // #767676 on white has a ratio of ~4.54:1
    const result = checkContrast('#767676', '#ffffff');
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    expect(result.ratio).toBeLessThan(7);
    expect(result.aa.regular).toBe(true);
    expect(result.aa.large).toBe(true);
    expect(result.aaa.regular).toBe(false);
    expect(result.aaa.large).toBe(true);
    expect(result.nonText).toBe(true);
  });

  it('fails AA regular but passes AA large for a low-contrast pair', () => {
    // #909090 on white has a ratio of ~3.19:1
    const result = checkContrast('#909090', '#ffffff');
    expect(result.ratio).toBeGreaterThanOrEqual(3);
    expect(result.ratio).toBeLessThan(4.5);
    expect(result.aa.regular).toBe(false);
    expect(result.aa.large).toBe(true);
    expect(result.aaa.regular).toBe(false);
    expect(result.aaa.large).toBe(false);
    expect(result.nonText).toBe(true);
  });

  it('handles named colors', () => {
    const result = checkContrast('black', 'white');
    expect(result.ratio).toBe(21);
  });
});
