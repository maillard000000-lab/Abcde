// 앱 아이콘(PNG)을 픽셀 아트로 생성한다. 외부 라이브러리 없음.
// 사용법: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ART = [ // 16x16 물음등(등잔)
  '................',
  '.......oo.......',
  '......o..o......',
  '.....oooooo.....',
  '....bBBBBBBb....',
  '....bYYYYYYb....',
  '....bYWWWWYb....',
  '....bYWQQWYb....',
  '....bYWQQWYb....',
  '....bYWWWWYb....',
  '....bYYYYYYb....',
  '....bBBBBBBb....',
  '.....oooooo.....',
  '....oooooooo....',
  '................',
  '................',
];
const PAL = { o: [201, 163, 90], b: [138, 104, 48], B: [232, 196, 106], Y: [255, 200, 90], W: [255, 236, 160], Q: [255, 255, 255] };
const BG = [42, 36, 64], BG2 = [26, 22, 38];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pad) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const inner = size - pad * 2, cell = inner / 16;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 배경: 바깥이 어두운 방사형 + 등불 빛
      const dx = x / size - 0.5, dy = y / size - 0.48, d = Math.hypot(dx, dy);
      const t = Math.min(1, d * 1.7);
      let col = BG.map((v, i) => Math.round(v + (BG2[i] - v) * t));
      const glow = Math.max(0, 0.42 - d) * 0.9;
      col = col.map((v, i) => Math.min(255, Math.round(v + [255, 210, 120][i] * glow)));
      const ax = Math.floor((x - pad) / cell), ay = Math.floor((y - pad) / cell);
      if (ax >= 0 && ay >= 0 && ax < 16 && ay < 16) {
        const ch = ART[ay][ax];
        if (ch !== '.') col = PAL[ch];
        else {
          // 외곽선
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => ART[ay + b]?.[ax + a] && ART[ay + b][ax + a] !== '.');
          if (near) col = [18, 14, 26];
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/studyverse/icons');
for (const [name, size, pad] of [['icon-192.png', 192, 16], ['icon-512.png', 512, 40], ['maskable-512.png', 512, 112], ['apple-touch-icon.png', 180, 22]]) {
  writeFileSync(path.join(out, name), png(size, pad));
}
console.log('icons written to', out);
