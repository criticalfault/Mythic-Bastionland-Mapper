import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Mock firebase admin so Firestore never actually connects
vi.mock('../firebaseAdmin.js', () => ({ default: null }));

const crypto = require('crypto');
const { generateInviteCode } = require('../firestoreDb');

describe('generateInviteCode', () => {
  it('returns a 6-character string', () => {
    expect(generateInviteCode()).toHaveLength(6);
  });

  it('only contains allowed characters (no 0, O, 1, I, L)', () => {
    const FORBIDDEN = /[0O1IL]/;
    for (let i = 0; i < 100; i++) {
      expect(generateInviteCode()).not.toMatch(FORBIDDEN);
    }
  });

  it('returns uppercase only', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('generates different codes across multiple calls', () => {
    const codes = new Set(Array.from({ length: 20 }, generateInviteCode));
    expect(codes.size).toBeGreaterThan(5);
  });
});

describe('password hashing (sha256)', () => {
  const hash = (pw) => crypto.createHash('sha256').update(String(pw)).digest('hex');

  it('is deterministic', () => {
    expect(hash('secret')).toBe(hash('secret'));
  });

  it('different passwords produce different hashes', () => {
    expect(hash('secret')).not.toBe(hash('other'));
  });

  it('hash is 64 hex characters', () => {
    expect(hash('test')).toHaveLength(64);
    expect(hash('test')).toMatch(/^[0-9a-f]+$/);
  });

  it('empty string hashes consistently', () => {
    expect(hash('')).toHaveLength(64);
    expect(hash('')).toBe(hash(''));
  });

  it('password check logic: correct password matches stored hash', () => {
    const stored = hash('my-password');
    const provided = hash('my-password');
    expect(provided).toBe(stored);
  });

  it('password check logic: wrong password does not match', () => {
    const stored = hash('correct');
    const provided = hash('wrong');
    expect(provided).not.toBe(stored);
  });
});
