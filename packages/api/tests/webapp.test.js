import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';

const webDir = mkdtempSync(path.join(tmpdir(), 'bookworm-web-'));
mkdirSync(path.join(webDir, 'assets'));
writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><div id="root"></div>');
writeFileSync(path.join(webDir, 'assets', 'index-abc123.js'), 'console.log("app")');

const app = createApp({ webDir });

afterAll(() => rmSync(webDir, { recursive: true, force: true }));

describe('single-service mode (API serves the web app)', () => {
  test('serves index.html at / and for client-side routes', async () => {
    for (const url of ['/', '/orders/123', '/admin/books']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('<div id="root">');
    }
  });

  test('serves hashed assets with long-lived caching', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('API routes and API 404s are unchanged', async () => {
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
    const missing = await request(app).get('/api/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  test('CSP allows HTTPS cover images but keeps scripts same-origin', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("script-src 'self'");
  });
});
