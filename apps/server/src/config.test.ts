import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://simmery:secret-db-password@localhost:5432/simmery',
  WORKOS_API_KEY: 'sk_test_secret',
  WORKOS_CLIENT_ID: 'client_123',
  WORKOS_COOKIE_PASSWORD: 'p'.repeat(32),
  WORKOS_AUTHKIT_DOMAIN: 'https://simmery.authkit.app',
  PUBLIC_BASE_URL: 'https://simmery.example',
};

describe('loadConfig', () => {
  it('reads a valid environment with defaults', () => {
    expect(loadConfig(valid)).toMatchObject({ PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('names every missing variable', () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL: missing.*WORKOS_API_KEY: missing.*WORKOS_CLIENT_ID: missing.*WORKOS_COOKIE_PASSWORD: missing.*WORKOS_AUTHKIT_DOMAIN: missing.*PUBLIC_BASE_URL: missing/,
    );
  });

  it('rejects a short cookie password and a trailing slash without echoing values', () => {
    let message = '';
    try {
      loadConfig({
        ...valid,
        WORKOS_COOKIE_PASSWORD: 'short-secret',
        PUBLIC_BASE_URL: 'https://simmery.example/',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('WORKOS_COOKIE_PASSWORD: invalid');
    expect(message).toContain('PUBLIC_BASE_URL: invalid');
    expect(message).not.toContain('short-secret');
  });

  it('accepts only an https AuthKit domain without a trailing slash', () => {
    for (const domain of [
      'simmery.authkit.app',
      'http://simmery.authkit.app',
      'https://simmery.authkit.app/',
    ]) {
      expect(() => loadConfig({ ...valid, WORKOS_AUTHKIT_DOMAIN: domain })).toThrow(
        'WORKOS_AUTHKIT_DOMAIN: invalid',
      );
    }
  });
});
