/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, it, expect } from 'vitest';
import { requireAccessToken, parseMoney, parseNumber, formatCurrency } from '../utils';

describe('utils', () => {
  describe('requireAccessToken', () => {
    it('returns token when provided', () => {
      expect(requireAccessToken('abc')).toBe('abc');
    });

    it('throws when token is null or undefined', () => {
      // pass null/undefined at runtime; TS casting is not necessary in test runtime
      // @ts-ignore an explicit test for runtime behavior when token is missing, even though types disallow it
      expect(() => requireAccessToken(null)).toThrow();
      // @ts-ignore an explicit test for runtime behavior when token is missing, even though types disallow it
      expect(() => requireAccessToken(undefined)).toThrow();
    });
  });

  describe('parseMoney', () => {
    it('parses currency strings with symbol and commas', () => {
      expect(parseMoney('£1,234.56')).toBeCloseTo(1234.56);
      expect(parseMoney('1,000')).toBeCloseTo(1000);
      expect(parseMoney(' 2 345 ')).toBeCloseTo(2345);
    });

    it('returns undefined for empty or invalid strings', () => {
      expect(parseMoney('')).toBeUndefined();
      expect(parseMoney('abc')).toBeUndefined();
    });
  });

  describe('parseNumber', () => {
    it('parses numbers with commas', () => {
      expect(parseNumber('1,234.50')).toBeCloseTo(1234.5);
      expect(parseNumber('1000')).toBe(1000);
    });

    it('returns 0 for empty or invalid strings', () => {
      expect(parseNumber('')).toBe(0);
      expect(parseNumber('foo')).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('formats numbers as GBP with two decimals and thousand separators', () => {
      const formatted = formatCurrency(1234567.8);
      // Should be like "£1,234,567.80"
      expect(formatted).toMatch(/^£[0-9,]+\.\d{2}$/);
      expect(formatted).toContain('1,234,567');
      expect(formatted.endsWith('.80')).toBe(true);
    });

    it('returns N/A for null/undefined', () => {
      expect(formatCurrency(null)).toBe('N/A');
      expect(formatCurrency(undefined)).toBe('N/A');
    });
  });
});
