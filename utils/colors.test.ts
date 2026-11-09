import test from 'node:test';
import assert from 'node:assert';
import { hexToRgba } from './colors.ts';

test('hexToRgba converts 6-character hex to rgba', () => {
  assert.strictEqual(hexToRgba('#ff0000', 1), 'rgba(255,0,0,1)');
  assert.strictEqual(hexToRgba('#00ff00', 0.5), 'rgba(0,255,0,0.5)');
  assert.strictEqual(hexToRgba('#0000ff', 0), 'rgba(0,0,255,0)');
});

test('hexToRgba converts 3-character hex to rgba', () => {
  assert.strictEqual(hexToRgba('#f00', 1), 'rgba(255,0,0,1)');
  assert.strictEqual(hexToRgba('#0f0', 0.5), 'rgba(0,255,0,0.5)');
  assert.strictEqual(hexToRgba('#00f', 0), 'rgba(0,0,255,0)');
});

test('hexToRgba handles case insensitivity', () => {
  assert.strictEqual(hexToRgba('#FF0000', 1), 'rgba(255,0,0,1)');
  assert.strictEqual(hexToRgba('#abc', 1), 'rgba(170,187,204,1)');
  assert.strictEqual(hexToRgba('#ABC', 1), 'rgba(170,187,204,1)');
});

test('hexToRgba returns white rgba for invalid hex formats', () => {
  assert.strictEqual(hexToRgba('invalid', 1), 'rgba(255,255,255,1)');
  assert.strictEqual(hexToRgba('#1234', 1), 'rgba(255,255,255,1)');
  assert.strictEqual(hexToRgba('#12345', 1), 'rgba(255,255,255,1)');
  assert.strictEqual(hexToRgba('ff0000', 1), 'rgba(255,255,255,1)'); // Missing #
  assert.strictEqual(hexToRgba('#ggg', 1), 'rgba(255,255,255,1)'); // Invalid hex chars
});

test('hexToRgba handles various alpha values', () => {
  assert.strictEqual(hexToRgba('#000000', 0.123), 'rgba(0,0,0,0.123)');
  assert.strictEqual(hexToRgba('#ffffff', 0.99), 'rgba(255,255,255,0.99)');
});
