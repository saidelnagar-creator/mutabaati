#!/usr/bin/env node
// يولّد أيقونات PNG من SVG (يحتاج Playwright/Chromium المثبت). الناتج في app/icons ويُضاف للمستودع.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../app/icons');

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f5f8b"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
    <rect x="136" y="96" width="240" height="320" rx="28" fill="#f4f8fb"/>
    <rect x="206" y="72" width="100" height="52" rx="14" fill="#cfe0ee"/>
    <path d="M176 270h46l22-52 34 104 22-52h36" fill="none" stroke="#1f5f8b" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M256 360c-18-14-30-26-30-40a16 16 0 0 1 30-8 16 16 0 0 1 30 8c0 14-12 26-30 40z" fill="#e0525a"/>
  </g>
</svg>`;

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
  ['apple-touch-icon.png', 180, 0.92],
];
const browser = await chromium.launch();
for (const [name, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`);
  await page.screenshot({ path: resolve(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
