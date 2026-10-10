// Guards the two offline bugs found while testing the service worker in a
// real browser: stale files leaking into the precache, and "Vary: Origin"
// responses missing the cache for crossorigin bundles.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sw = readFileSync(new URL('../scripts/sw-template.js', import.meta.url), 'utf8');

describe('service worker template', () => {
  it('precaches with cache: reload so a new version never mixes in stale files', () => {
    expect(sw).toMatch(/new Request\(url, \{ cache: 'reload' \}\)/);
  });

  it('ignores Vary when matching, so crossorigin bundles are served offline', () => {
    expect(sw).toMatch(/ignoreVary: true/);
  });

  it('only handles same-origin GET requests', () => {
    expect(sw).toContain("req.method !== 'GET'");
    expect(sw).toContain('url.origin !== self.location.origin');
  });
});
