import { describe, it, expect } from 'vitest';
import { logger } from './logger.js';

describe('logger', () => {
  it('should be initialized', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
