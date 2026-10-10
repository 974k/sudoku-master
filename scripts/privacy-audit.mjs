// Privacy audit of the production build (runs after every `npm run build`).
//
// Fails if the shipped files contain anything that could send data off the
// device or track the player: external URLs, network APIs, tracking or
// fingerprinting APIs, permission prompts, third-party runtime dependencies,
// source maps, or a missing/weak Content Security Policy.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const problems = [];
const notes = [];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(dist);
} catch {
  console.error('privacy-audit: no dist/ folder — run `npm run build` first.');
  process.exit(1);
}

// 1. No third-party runtime dependencies.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length) problems.push(`runtime dependencies present: ${deps.join(', ')}`);
else notes.push('0 runtime dependencies (only dev tooling: TypeScript, Vite, Vitest)');

// 2. Scan every shipped text file.
const ALLOWED_URLS = new Set(['http://www.w3.org/2000/svg']); // XML namespace, never fetched
const NETWORK_APIS = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/sendBeacon/, 'navigator.sendBeacon'],
  [/RTCPeerConnection/, 'WebRTC'],
  [/importScripts\s*\(/, 'importScripts()'],
  [/\bnew\s+Image\s*\(/, 'image beacon'],
  [/document\.cookie/, 'cookies'],
];
const TRACKING = [
  /google-?analytics|googletagmanager|gtag\(|doubleclick|adsbygoogle|admob/i,
  /facebook\.net|fbq\(|mixpanel|amplitude|segment\.io|hotjar|sentry|bugsnag|datadog|newrelic|plausible|matomo|posthog|firebase|appsflyer|adjust\.com/i,
  /navigator\.(geolocation|getBattery|mediaDevices|contacts|bluetooth|usb|hid|serial)/,
  /Notification\.requestPermission|storage\.persist\(|deviceorientation|devicemotion/,
  /\bnavigator\.userAgent\b|\bnavigator\.platform\b|hardwareConcurrency|deviceMemory|getClientRects\(\).*fingerprint|toDataURL\(|getImageData\(|AudioContext[^]{0,200}createAnalyser/,
  /\bindexedDB\.open\b.*https?:/,
];

let scanned = 0;
for (const file of files) {
  const rel = relative(dist, file).replace(/\\/g, '/');
  if (rel.endsWith('.map')) {
    problems.push(`source map shipped: ${rel}`);
    continue;
  }
  if (!/\.(html|js|css|webmanifest|json|svg|txt)$/.test(rel)) continue;
  const text = readFileSync(file, 'utf8');
  scanned++;
  for (const m of text.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi)) {
    const url = m[0];
    if (!/^(https?:)?\/\//i.test(url)) continue;
    if (ALLOWED_URLS.has(url.replace(/^\/\//, 'http://'))) continue;
    problems.push(`${rel}: external URL ${url}`);
  }
  for (const [re, name] of NETWORK_APIS) {
    if (!re.test(text)) continue;
    // the service worker may fetch the game's own files on a cache miss
    if (rel === 'sw.js' && name === 'fetch()') continue;
    problems.push(`${rel}: uses ${name}`);
  }
  for (const re of TRACKING) {
    const m = re.exec(text);
    if (m) problems.push(`${rel}: tracking/fingerprinting/permission API "${m[0].slice(0, 60)}"`);
  }
}
notes.push(`${scanned} shipped files scanned`);

// 3. The service worker must only handle same-origin GET requests.
try {
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  if (!sw.includes('url.origin !== self.location.origin')) problems.push('sw.js does not restrict itself to same-origin requests');
  else notes.push('service worker only serves same-origin game files');
} catch {
  problems.push('dist/sw.js missing');
}

// 4. A strict CSP must be present.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
if (!csp) problems.push('index.html has no Content-Security-Policy');
else {
  for (const need of ["connect-src 'none'", "default-src 'self'", "script-src 'self'", "object-src 'none'", "form-action 'none'"]) {
    if (!csp.includes(need)) problems.push(`CSP is missing ${need}`);
  }
  if (/unsafe-inline|unsafe-eval|\*/.test(csp)) problems.push('CSP allows unsafe-inline, unsafe-eval or wildcards');
  notes.push(`CSP: ${csp}`);
}
if (!html.includes('name="referrer" content="no-referrer"')) problems.push('missing no-referrer policy');

if (problems.length) {
  console.error('\n✗ Privacy audit FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
  process.exit(1);
}
console.log('\n✓ Privacy audit passed');
for (const n of notes) console.log(`  · ${n}`);
console.log('');
