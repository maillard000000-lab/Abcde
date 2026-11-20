// 픽셀 아트 렌더러 — 모든 그래픽은 코드로 한 픽셀씩 그린다 (외부 이미지 없음).
// 캐릭터는 의상/머리/모자/장비를 레이어로 조합한 뒤 자동 외곽선을 입혀 캐시한다.
import { shade, mix, grey, hex2rgb } from './util.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
const OUTLINE = '#1a1420';

function outline(c, col = OUTLINE) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const [r, g, b] = hex2rgb(col);
  const out = ctx.createImageData(w, h);
  out.data.set(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
      const i = (y * w + x) * 4;
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// ───────────────────────── 캐릭터 ─────────────────────────
// opts: { pal:{robe,trim,under,leg}, hair, skin, style, hat, cape, weapon:{kind,col,gem}, eyes, beard, ring, arm, grey }
const cache = new Map();
export const CHAR_W = 20, CHAR_H = 30;
export function charSprite(opts, anim = 'idle', frame = 0, dir = 'down') {
  const key = JSON.stringify([opts, anim, frame, dir]);
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(CHAR_W, CHAR_H);
  const OX = 2, OY = 4;
  const P = (x, y, w, h, col) => { if (!col) return; ctx.fillStyle = col; ctx.fillRect(OX + x, OY + y, w, h); };
  const g = opts.grey ? (col) => col && grey(col, 0.85) : (col) => col;
  const pal = opts.pal;
  const robe = g(pal.robe), robeD = shade(robe, -0.25), robeL = shade(robe, 0.15), trim = g(pal.trim), under = g(pal.under), leg = g(pal.leg);
  const skin = g(opts.skin || '#f0c8a0'), skinD = shade(skin, -0.15), hair = g(opts.hair || '#3a2a1a'), hairD = shade(hair, -0.3), hairL = shade(hair, 0.2);
  const side = dir === 'left' || dir === 'right';
  const up = dir === 'up';
  // 포즈
  let bob = 0, lL = 0, lR = 0, aL = 0, aR = 0, armUp = false, armFwd = false, dx = 0, sit = false, blink = false;
  if (anim === 'idle') { bob = frame % 4 === 2 ? 1 : 0; blink = frame === 3; }
  if (anim === 'walk' || anim === 'run') {
    const k = frame % 4;
    bob = k % 2;
    lL = k === 1 ? -1 : k === 3 ? 1 : 0; lR = -lL;
    aL = k === 1 ? 1 : k === 3 ? -1 : 0; aR = -aL;
    if (anim === 'run') { lL *= 2; lR *= 2; }
  }
  if (anim === 'cast') { armUp = true; bob = frame % 2 ? -1 : 0; }
  if (anim === 'attack') { armFwd = frame >= 1; dx = frame === 1 ? 1 : frame === 2 ? 2 : 0; }
  if (anim === 'hit') { dx = -2; blink = true; }
  if (anim === 'interact') { armFwd = frame % 2 === 0; }
  if (anim === 'study') { sit = true; bob = frame === 2 ? 1 : 0; blink = frame === 3; }
  const by = bob + (sit ? 2 : 0);

  // 망토 (뒤)
  if (opts.cape && !side) { P(2 + dx, 11 + by, 12, 9, robeD); P(2 + dx, 19 + by, 12, 1, trim); }
  if (opts.cape && side) { P((dir === 'right' ? 2 : 8) + dx, 11 + by, 6, 9, robeD); }
  // 긴 머리(뒤)
  if (!up && (opts.style === 'long')) P(3 + dx, 6 + by, 10, 9, hairD);
  if (side && opts.style === 'pony') P((dir === 'right' ? 2 : 12) + dx, 5 + by, 2, 7, hairD);

  // 다리
  if (!sit) {
    if (side) {
      P(6 + dx + lL, 19 + bob, 2, 3, leg); P(8 + dx + lR, 19 + bob, 2, 3, shade(leg, -0.2));
      P(5 + dx + lL + (dir === 'right' ? 1 : 0), 22 + bob, 3, 1, '#2a1a12'); P(7 + dx + lR + (dir === 'right' ? 1 : 0), 22 + bob, 3, 1, '#2a1a12');
    } else {
      P(5 + dx, 19 + bob + Math.min(0, lL), 2, 3 - Math.abs(Math.min(0, lL)) + (lL < 0 ? 0 : 0), leg);
      P(9 + dx, 19 + bob + Math.min(0, lR), 2, 3, shade(leg, -0.15));
      P(4 + dx, 22 + bob + Math.min(0, lL), 3, 1, '#2a1a12'); P(9 + dx, 22 + bob + Math.min(0, lR), 3, 1, '#2a1a12');
    }
  }
  // 몸통 (로브)
  const bx = side ? 5 : 4, bw = side ? 6 : 8;
  P(bx + dx, 11 + by, bw, 7, robe);
  P(bx - 1 + dx, 16 + by, bw + 2, 3, robe); // 밑단 퍼짐
  P(bx + bw - 1 + dx, 11 + by, 1, 8, robeD); // 그림자
  P(bx + dx, 11 + by, 1, 5, robeL);
  P(bx - 1 + dx, 18 + by, bw + 2, 1, trim); // 밑단 장식
  if (!up && !side) {
    P(6 + dx, 11 + by, 4, 1, trim); P(7 + dx, 12 + by, 2, 4, under); P(4 + dx, 15 + by, 8, 1, trim); // 칼라 · 셔츠 · 허리띠
    P(10 + dx, 13 + by, 1, 1, trim); // 별 자수
  }
  if (side) P((dir === 'right' ? 9 : 5) + dx, 12 + by, 1, 3, under);
  if (up) P(5 + dx, 11 + by, 6, 1, robeD);

  // 팔
  const handC = skin;
  if (side) {
    const ax = (dir === 'right' ? 7 : 7) + dx;
    if (armFwd || armUp) {
      const fx = dir === 'right' ? 1 : -1;
      if (armUp) { P(ax, 7 + by, 2, 5, robe); P(ax, 6 + by, 2, 1, handC); }
      else { P(ax + fx * 2, 13 + by, 3, 2, robe); P(ax + fx * 4 + (fx < 0 ? 1 : 0), 13 + by, 1, 2, handC); }
    } else { P(ax + aL, 12 + by, 2, 4, robeD); P(ax + aL, 16 + by, 2, 1, handC); }
  } else if (!sit) {
    P(3 + dx, 12 + by + aL, 1, 4, robeD); P(3 + dx, 16 + by + aL, 1, 1, handC);
    if (armUp) { P(12 + dx, 6 + by, 1, 6, robe); P(12 + dx, 5 + by, 1, 1, handC); }
    else if (armFwd) { P(12 + dx, 12 + by, 2, 3, robe); P(14 + dx, 13 + by, 1, 1, handC); }
    else { P(12 + dx, 12 + by + aR, 1, 4, robeD); P(12 + dx, 16 + by + aR, 1, 1, handC); }
  } else {
    // 앉아서 책 위에 손
    P(3 + dx, 13 + by, 2, 3, robeD); P(11 + dx, 13 + by, 2, 3, robeD);
    P(5 + dx, 16 + by, 1, 1, handC); P(10 + dx, 16 + by, 1, 1, handC);
  }
  // 의수 (엘다 교수)
  if (opts.arm && !side) { P(12 + dx, 12 + by, 1, 5, '#9aa4b0'); P(12 + dx, 14 + by, 1, 1, '#d0d8e0'); }

  // 목 · 머리
  P(7 + dx, 10 + by, 2, 1, skinD);
  const hx = side ? 4 : 4;
  P(hx + 1 + dx, 3 + by, 6, 1, skin); P(hx + dx, 4 + by, 8, 5, skin); P(hx + 1 + dx, 9 + by, 6, 1, skin);
  P(hx + dx, 8 + by, 8, 1, skinD);
  // 머리카락
  if (up) {
    P(hx + dx, 2 + by, 8, 7, hair); P(hx + 1 + dx, 2 + by, 6, 1, hairL); P(hx + dx, 8 + by, 8, 1, hairD);
    if (opts.style === 'pony') P(7 + dx, 9 + by, 2, 4, hairD);
    if (opts.style === 'long') P(hx + dx, 9 + by, 8, 5, hair);
  } else if (side) {
    const back = dir === 'right' ? hx : hx + 4;
    P(hx + dx, 2 + by, 8, 2, hair); P(back + dx, 2 + by, 4, 5, hair); P(hx + 1 + dx, 2 + by, 5, 1, hairL);
    if (opts.style === 'bob' || opts.style === 'long') P(back + dx, 6 + by, 4, 3, hairD);
  } else {
    P(hx + dx, 2 + by, 8, 2, hair); P(hx + 1 + dx, 2 + by, 6, 1, hairL);
    P(hx - 1 + dx, 3 + by, 1, 4, hair); P(hx + 8 + dx, 3 + by, 1, 4, hair);
    P(hx + dx, 4 + by, 2, 1, hair); P(hx + 5 + dx, 4 + by, 3, 1, hair); // 앞머리
    if (opts.style === 'bob') { P(hx - 1 + dx, 6 + by, 1, 3, hairD); P(hx + 8 + dx, 6 + by, 1, 3, hairD); }
    if (opts.style === 'long') { P(hx - 1 + dx, 6 + by, 1, 8, hairD); P(hx + 8 + dx, 6 + by, 1, 8, hairD); }
    if (opts.style === 'pony') { P(hx + 8 + dx, 2 + by, 2, 2, hairD); }
  }
  // 얼굴
  if (!up) {
    const eyeC = opts.eyes === 'glow' ? '#fff3b0' : '#2a1a2a';
    if (side) {
      const ex = dir === 'right' ? 9 : 6;
      if (opts.eyes === 'closed' || blink) P(ex + dx, 6 + by, 1, 1, shade(skin, -0.4));
      else P(ex + dx, 5 + by, 1, 2, eyeC);
      P((dir === 'right' ? 8 : 7) + dx, 7 + by, 1, 1, '#ff9a9a');
    } else {
      if (opts.eyes === 'closed' || blink) { P(6 + dx, 6 + by, 1, 1, shade(skin, -0.4)); P(9 + dx, 6 + by, 1, 1, shade(skin, -0.4)); }
      else { P(6 + dx, 5 + by, 1, 2, eyeC); P(9 + dx, 5 + by, 1, 2, eyeC); if (opts.eyes !== 'glow') { P(6 + dx, 5 + by, 1, 1, '#5a4a6a'); P(9 + dx, 5 + by, 1, 1, '#5a4a6a'); } }
      P(5 + dx, 7 + by, 1, 1, '#ffa8a8'); P(10 + dx, 7 + by, 1, 1, '#ffa8a8');
      P(7 + dx, 8 + by, 2, 1, shade(skin, -0.3));
    }
    if (opts.beard && !side) { P(5 + dx, 8 + by, 6, 2, '#e8e8e8'); P(6 + dx, 10 + by, 4, 1, '#d0d0d0'); }
  }
  // 모자
  const hat = opts.hat; const ht = 2 + by;
  const hatC = g(pal.hatCol || robe);
  if (hat === 'witch') { P(2 + dx, ht, 12, 1, hatC); P(3 + dx, ht - 1, 10, 1, shade(hatC, -0.2)); P(5 + dx, ht - 3, 6, 2, hatC); P(6 + dx, ht - 5, 4, 2, hatC); P(7 + dx, ht - 7, 3, 2, hatC); P(9 + dx, ht - 8, 2, 1, hatC); P(5 + dx, ht - 2, 6, 1, trim); }
  if (hat === 'hood') { P(3 + dx, ht - 1, 10, 3, hatC); P(2 + dx, ht + 1, 2, 7, hatC); P(12 + dx, ht + 1, 2, 7, hatC); P(4 + dx, ht - 1, 8, 1, shade(hatC, 0.15)); if (up) P(3 + dx, ht, 10, 7, hatC); }
  if (hat === 'cap') { P(4 + dx, ht - 1, 8, 2, hatC); P(dir === 'left' ? 1 + dx : 10 + dx, ht + 1, 4, 1, shade(hatC, -0.2)); P(7 + dx, ht - 1, 2, 1, trim); }
  if (hat === 'crown') { P(4 + dx, ht - 1, 8, 2, '#ffd86b'); P(4 + dx, ht - 2, 1, 1, '#ffd86b'); P(7 + dx, ht - 3, 2, 2, '#ffd86b'); P(11 + dx, ht - 2, 1, 1, '#ffd86b'); P(7 + dx, ht - 1, 2, 1, '#ff4a6a'); }
  if (hat === 'halo') { P(5 + dx, ht - 4, 6, 1, '#fff3b0'); P(4 + dx, ht - 3, 1, 1, '#fff3b0'); P(11 + dx, ht - 3, 1, 1, '#fff3b0'); P(5 + dx, ht - 2, 6, 1, '#ffd86b'); }
  if (hat === 'flower') { P(4 + dx, ht, 2, 2, '#ff7ab0'); P(10 + dx, ht - 1, 2, 2, '#ffe08a'); P(5 + dx, ht + 1, 1, 1, '#fff'); }
  if (hat === 'straw') { P(1 + dx, ht + 1, 14, 1, '#e8c46a'); P(4 + dx, ht - 2, 8, 3, '#f0d080'); P(4 + dx, ht, 8, 1, '#c03a3a'); }
  if (hat === 'beret') { P(3 + dx, ht - 1, 9, 2, hatC); P(4 + dx, ht - 2, 6, 1, hatC); P(7 + dx, ht - 3, 1, 1, shade(hatC, -0.3)); }
  if (hat === 'beanie' || hat === 'owl') { P(4 + dx, ht - 2, 8, 3, hatC); P(4 + dx, ht + 1, 8, 1, trim); if (hat === 'beanie') P(7 + dx, ht - 4, 2, 2, '#ffffff'); else { P(4 + dx, ht - 4, 2, 2, hatC); P(10 + dx, ht - 4, 2, 2, hatC); P(6 + dx, ht - 1, 1, 1, '#ffe08a'); P(9 + dx, ht - 1, 1, 1, '#ffe08a'); } }
  if (hat === 'mortar') { P(1 + dx, ht - 2, 14, 1, '#1a1a1a'); P(4 + dx, ht - 1, 8, 2, '#2a2a2a'); P(13 + dx, ht - 2, 1, 4, '#ffd86b'); }
  if (hat === 'goggles' && !up) { P(3 + dx, ht + 2, 10, 1, '#5a3a2a'); P(5 + dx, ht + 1, 2, 2, '#9fd8ff'); P(9 + dx, ht + 1, 2, 2, '#9fd8ff'); }
  // 반지 (렌하르트)
  if (opts.ring && !side && !up) P(3 + dx, 16 + by + aL, 1, 1, '#ff6a4a');

  // 들고 있는 무기 · 도구
  const w = opts.weapon;
  if (w && !sit && !up) {
    const wc = w.col || '#8a5a2b', gem = w.gem || '#ffe08a';
    let wx, wy;
    if (side) { wx = (dir === 'right' ? 11 : 4) + dx; wy = armUp ? 1 : 9; if (armFwd) wx += dir === 'right' ? 3 : -3; }
    else { wx = 13 + dx; wy = armUp ? 0 : 7 + aR; if (armFwd) wx += 1; }
    wy += by;
    if (w.kind === 'staff') { P(wx, wy, 1, 12, wc); P(wx - 1, wy - 2, 3, 2, gem); P(wx, wy - 3, 1, 1, shade(gem, 0.4)); }
    else if (w.kind === 'wand') { P(wx, wy + 3, 1, 7, wc); P(wx, wy + 2, 1, 1, gem); }
    else if (w.kind === 'sword') { P(wx, wy, 1, 9, '#e0e8f0'); P(wx - 1, wy + 8, 3, 1, wc); P(wx, wy + 9, 1, 2, '#5a3a2a'); P(wx, wy, 1, 1, '#ffffff'); }
    else if (w.kind === 'book') { P(wx - 1, wy + 7, 3, 4, wc); P(wx, wy + 8, 1, 2, '#fff8e0'); }
  }
  if (anim === 'cast') { P(12 + dx + (side ? -3 : 0), 0 + by, 1, 1, '#ffffff'); }
  outline(c);
  // 피격 시 흰색 번쩍임
  if (anim === 'hit' && frame % 2 === 0) {
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(0, 0, CHAR_W, CHAR_H); ctx.globalCompositeOperation = 'source-over';
  }
  cache.set(key, c);
  if (cache.size > 1500) cache.delete(cache.keys().next().value);
  return c;
}
export const ANIM = { idle: { frames: 4, fps: 3 }, walk: { frames: 4, fps: 8 }, run: { frames: 4, fps: 13 }, cast: { frames: 2, fps: 6 }, attack: { frames: 3, fps: 10 }, hit: { frames: 2, fps: 10 }, interact: { frames: 2, fps: 4 }, study: { frames: 4, fps: 2 } };
export function drawChar(ctx, x, y, opts, anim, t, dir = 'down', scale = 1) {
  const a = ANIM[anim] || ANIM.idle;
  const f = Math.floor(t * a.fps) % a.frames;
  const spr = charSprite(opts, anim, f, dir === 'left' ? 'right' : dir);
  ctx.save();
  if (dir === 'left') { ctx.translate(Math.round(x + CHAR_W * scale), Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0, CHAR_W * scale, CHAR_H * scale); }
  else ctx.drawImage(spr, Math.round(x), Math.round(y), CHAR_W * scale, CHAR_H * scale);
  ctx.restore();
}
// 오른쪽을 보는 측면 스프라이트는 'right' 를 그리고 좌측은 뒤집는다 — 'left' 는 위에서 처리
export function charOpts(outfit, look, weaponLook) {
  return {
    pal: outfit.pal, hat: outfit.hat, cape: outfit.cape, hair: look.hair, skin: look.skin, style: look.style || 'short',
    weapon: weaponLook || null,
  };
}
export function npcOpts(look) {
  return {
    pal: { robe: look.robe, trim: look.trim, under: '#e9e4d8', leg: shade(look.robe, -0.3) }, hat: look.hat, cape: !!look.cape,
    hair: look.hair, skin: look.skin, style: look.style || 'short', eyes: look.eyes, beard: look.beard, ring: look.ring, arm: look.arm, grey: look.grey,
  };
}

/** 대화창 초상화: 앞모습 스프라이트의 상반신을 2배로 */
export function portrait(opts, bg = '#2a2440') {
  const [c, ctx] = canvas(48, 48);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = shade(bg, 0.12); for (let y = 0; y < 48; y += 4) ctx.fillRect(0, y, 48, 1);
  const spr = charSprite({ ...opts, weapon: null }, 'idle', 0, 'down');
  ctx.drawImage(spr, 0, 0, CHAR_W, 22, 4, 4, CHAR_W * 2, 44);
  return c;
}
export function lanternPortrait(t = 0) {
  const [c, ctx] = canvas(48, 48);
  ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, 48, 48);
  const glow = 0.5 + 0.5 * Math.sin(t * 3);
  const gr = ctx.createRadialGradient(24, 26, 2, 24, 26, 22);
  gr.addColorStop(0, `rgba(255,220,120,${0.55 + glow * 0.3})`); gr.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 48, 48);
  drawItemShape(ctx, { kind: 'lantern', col: '#c9a35a' }, 8, 8, 2, t);
  return c;
}
export function pagePortrait() {
  const [c, ctx] = canvas(48, 48);
  ctx.fillStyle = '#2a2218'; ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = '#e8d8b0'; ctx.fillRect(10, 6, 28, 36);
  ctx.fillStyle = '#c8b890'; ctx.fillRect(34, 6, 4, 36);
  ctx.fillStyle = '#6a5a4a'; for (let y = 12; y < 38; y += 4) ctx.fillRect(14, y, 16 - (y % 8), 1);
  return c;
}

// ───────────────────────── 아이템 아이콘 ─────────────────────────
export function drawItemShape(ctx, look, ox, oy, s = 1, t = 0) {
  const P = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, w * s, h * s); };
  const c = look.col || '#aaa', d = shade(c, -0.35), l = shade(c, 0.35), gem = look.gem || '#ffe08a';
  switch (look.kind) {
    case 'staff': P(7, 4, 2, 11, d); P(7, 4, 1, 11, c); P(5, 1, 6, 3, d); P(6, 1, 4, 3, gem); P(7, 1, 1, 1, '#fff'); break;
    case 'wand': for (let i = 0; i < 9; i++) P(4 + i, 12 - i, 2, 2, i < 7 ? c : gem); P(4, 13, 2, 1, d); break;
    case 'sword': for (let i = 0; i < 8; i++) P(5 + i, 9 - i, 2, 2, i === 7 ? '#fff' : '#d8e0e8'); P(3, 10, 5, 2, c); P(2, 12, 3, 3, d); break;
    case 'book': P(3, 3, 10, 11, d); P(4, 3, 9, 10, c); P(4, 12, 9, 1, '#f0e8d0'); P(7, 6, 3, 3, l); P(8, 7, 1, 1, gem); break;
    case 'ring': P(5, 6, 6, 1, c); P(4, 7, 1, 5, c); P(11, 7, 1, 5, c); P(5, 12, 6, 1, d); P(6, 3, 4, 3, gem); P(7, 3, 1, 1, '#fff'); break;
    case 'neck': for (let i = 0; i < 5; i++) { P(3 + i, 2 + i, 1, 1, l); P(12 - i, 2 + i, 1, 1, l); } P(6, 7, 4, 5, c); P(7, 8, 2, 3, gem); P(6, 12, 4, 1, d); break;
    case 'charm': P(5, 3, 6, 9, c); P(6, 4, 4, 7, l); P(7, 12, 2, 3, d); P(7, 6, 2, 2, gem); break;
    case 'tool': P(4, 4, 8, 8, d); P(5, 5, 6, 6, c); P(7, 6, 2, 4, '#fff'); P(6, 7, 4, 1, l); P(11, 11, 3, 3, d); break;
    case 'orb': P(5, 3, 6, 1, l); P(4, 4, 8, 7, c); P(5, 11, 6, 1, d); P(5, 5, 2, 2, '#fff'); P(4, 12, 8, 2, '#8a6a3a'); break;
    case 'page': P(4, 2, 8, 12, '#f8f0d0'); P(11, 2, 1, 12, '#d8c890'); P(5, 5, 5, 1, c); P(5, 8, 4, 1, c); P(5, 11, 5, 1, c); break;
    case 'lantern': {
      const fl = 0.5 + 0.5 * Math.sin(t * 6);
      P(7, 1, 2, 2, d); P(5, 3, 6, 1, c); P(4, 4, 1, 8, c); P(11, 4, 1, 8, c); P(5, 4, 6, 8, `rgba(255,${200 + fl * 40},${90 + fl * 50},0.9)`);
      P(7, 6, 2, 4, '#fff8d0'); P(5, 12, 6, 2, c); P(8, 4, 1, 3, '#3a2a1a'); break;
    }
    default: P(4, 4, 8, 8, c);
  }
}
const iconCache = new Map();
export function itemIcon(look, rarityCol = null, size = 32) {
  const key = JSON.stringify([look, rarityCol, size]);
  if (iconCache.has(key)) return iconCache.get(key);
  const [c, ctx] = canvas(16, 16);
  drawItemShape(ctx, look, 0, 0, 1);
  outline(c, '#120e18');
  const [o, octx] = canvas(size, size);
  if (rarityCol) { octx.fillStyle = mix(rarityCol, '#16121f', 0.78); octx.fillRect(0, 0, size, size); octx.strokeStyle = rarityCol; octx.lineWidth = 2; octx.strokeRect(1, 1, size - 2, size - 2); }
  octx.drawImage(c, 0, 0, 16, 16, 0, 0, size, size);
  const url = o.toDataURL();
  iconCache.set(key, url);
  return url;
}

// 자원 아이콘 (8x8)
const RES_ICON = {
  coin: ['..yyyy..', '.yYYYYy.', 'yYyyyyYy', 'yYyYYyYy', 'yYyYYyYy', 'yYyyyyYy', '.yYYYYy.', '..yyyy..'],
  mana: ['...bb...', '..bBBb..', '.bBWBBb.', '.bBBBBb.', 'bBBBBBBb', 'bBBBBBBb', '.bBBBBb.', '..bbbb..'],
  light: ['...y....', '..yWy...', '.yWWWy..', 'yWWWWWy.', '.yWWWy..', '..yWy..y', '...y..yW', '.......y'],
  wood: ['........', '.oooooo.', 'oOoOoOOo', 'oOOOOOOo', 'oOoOoOOo', '.oooooo.', '........', '........'],
  stone: ['........', '..gggg..', '.gGGGGg.', 'gGGgGGGg', 'gGGGGgGg', '.gGGGGg.', '..gggg..', '........'],
  crystal: ['...p....', '..pPp...', '.pPWPp..', '.pPPPp..', '.pPPPp..', '..pPp...', '...p....', '........'],
  research: ['.rrrrrr.', 'rRRRRRRr', 'rRrrrrRr', 'rRRRRRRr', 'rRrrrRRr', 'rRRRRRRr', '.rrrrrr.', '........'],
  stamina: ['..g..g..', '.gGggGg.', 'gGGGGGGg', 'gGGGGGGg', '.gGGGGg.', '..gGGg..', '...gg...', '........'],
  xp: ['...c....', '..cCc...', 'ccCWCcc.', '.cCCCc..', '.cCcCc..', 'cC...Cc.', '........', '........'],
};
const RES_PAL = { y: '#c08a2a', Y: '#ffd86b', W: '#ffffff', b: '#2a5aa0', B: '#5fa8ff', o: '#6a4020', O: '#a8743a', g: '#6a6a72', G: '#a0a0aa', p: '#6a3a9a', P: '#c09aff', r: '#5a3a6a', R: '#e0d0b0', c: '#3a8a5a', C: '#8fe388' };
export function resIcon(name, size = 16) {
  const key = `res:${name}:${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const rows = RES_ICON[name] || RES_ICON.coin;
  const [c, ctx] = canvas(size, size);
  const s = size / 8;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = RES_PAL[ch]; ctx.fillRect(x * s, y * s, s, s); } }));
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// ───────────────────────── 몬스터 ─────────────────────────
export function drawMonster(ctx, m, x, y, t, scale = 2, hurt = 0) {
  const [c0, c1] = m.c;
  const S = scale * (m.big ? 1.8 : 1);
  const wob = Math.sin(t * 3) * 1.2;
  const P = (px, py, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x + px * S), Math.round(y + (py + wob) * S), Math.ceil(w * S), Math.ceil(h * S)); };
  const d = shade(c0, -0.35), l = c1, eye = '#f8f0ff';
  ctx.save();
  if (hurt > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 40);
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(x + 2 * S), Math.round(y + 23 * S), Math.round(16 * S), Math.round(2 * S));
  switch (m.shape) {
    case 'reed': for (let i = 0; i < 5; i++) { const sw = Math.round(Math.sin(t * 2 + i) * 1); P(4 + i * 3 + sw, 4 + (i % 2) * 2, 2, 18, i % 2 ? c0 : d); P(4 + i * 3 + sw, 2 + (i % 2) * 2, 2, 3, l); } P(7, 11, 7, 6, c0); P(8, 12, 2, 2, eye); P(11, 12, 2, 2, eye); break;
    case 'blob': P(3, 10, 16, 12, c0); P(5, 8, 12, 2, c0); P(4, 21, 14, 1, d); P(5, 10, 4, 2, l); P(7, 13, 2, 3, eye); P(13, 13, 2, 3, eye); P(9, 17, 4, 1, d); break;
    case 'wisp': P(6, 4, 10, 12, c0); P(4, 8, 14, 8, c0); P(7, 16, 3, 4, d); P(12, 16, 3, 5, d); P(8, 2, 6, 3, l); P(8, 9, 2, 2, eye); P(12, 9, 2, 2, eye); break;
    case 'clock': P(4, 3, 14, 14, d); P(5, 4, 12, 12, c0); P(10, 6, 1, 5, eye); P(10, 10, 4, 1, eye); { const sw = Math.round(Math.sin(t * 2) * 3); P(10 + sw, 17, 1, 4, l); P(9 + sw, 21, 3, 2, l); } P(7, 6, 1, 1, eye); P(14, 6, 1, 1, eye); break;
    case 'star': P(9, 2, 4, 6, c0); P(2, 8, 18, 4, c0); P(5, 12, 12, 4, c0); P(4, 16, 4, 5, c0); P(14, 16, 4, 5, c0); P(10, 3, 2, 2, l); P(8, 9, 2, 2, eye); P(12, 9, 2, 2, eye); break;
    case 'eye': P(3, 6, 16, 10, c0); P(5, 4, 12, 2, c0); P(5, 16, 12, 2, c0); P(7, 7, 8, 8, eye); P(9 + Math.round(Math.sin(t) * 1.5), 9, 4, 4, d); P(10 + Math.round(Math.sin(t) * 1.5), 10, 1, 1, '#fff'); P(3, 18, 2, 4, d); P(17, 18, 2, 4, d); break;
    case 'wave': for (let i = 0; i < 18; i++) P(2 + i, 10 + Math.round(Math.sin(t * 3 + i * 0.6) * 3), 1, 10, i % 3 ? c0 : l); P(7, 11, 2, 2, eye); P(13, 11, 2, 2, eye); break;
    case 'shard': P(9, 1, 4, 4, l); P(7, 5, 8, 6, c0); P(5, 11, 12, 6, c0); P(7, 17, 8, 4, d); P(14, 5, 1, 12, l); P(8, 9, 2, 2, eye); P(12, 9, 2, 2, eye); break;
    case 'page': { const fl = Math.round(Math.sin(t * 4) * 1); P(4, 3 + fl, 14, 17, l); P(16, 3 + fl, 2, 17, c0); for (let r = 6; r < 18; r += 3) P(6, r + fl, 8, 1, c0); P(7, 8 + fl, 2, 2, d); P(12, 8 + fl, 2, 2, d); break; }
    case 'ring': for (let k = 0; k < 3; k++) { const r = 4 + k * 3 + Math.sin(t * 2 + k) * 0.6; for (let a = 0; a < 24; a++) P(11 + Math.cos(a / 24 * 6.28) * r, 11 + Math.sin(a / 24 * 6.28) * r, 1, 1, k === 1 ? l : c0); } P(9, 10, 2, 2, eye); P(12, 10, 2, 2, eye); break;
    case 'statue': P(7, 1, 8, 7, c0); P(5, 8, 12, 10, c0); P(3, 9, 2, 8, d); P(17, 9, 2, 8, d); P(7, 18, 3, 4, d); P(12, 18, 3, 4, d); P(9, 4, 1, 1, eye); P(12, 4, 1, 1, eye); P(9, 6, 4, 1, d); P(6, 9, 10, 1, l); break;
    case 'book': { const op = Math.round((Math.sin(t * 3) + 1) * 1.5); P(2, 8 - op, 9, 11, c0); P(11, 8 - op, 9, 11, c0); P(3, 9 - op, 7, 9, l); P(12, 9 - op, 7, 9, l); P(10, 8, 2, 12, d); for (let i = 0; i < 4; i++) P(4 + i * 4, 19, 2, 2, eye); P(6, 11, 2, 2, d); P(14, 11, 2, 2, d); break; }
    case 'codex': {
      const op = Math.round((Math.sin(t * 2) + 1) * 2);
      P(0, 6 - op, 11, 14, c0); P(11, 6 - op, 11, 14, c0); P(1, 7 - op, 9, 12, l); P(12, 7 - op, 9, 12, l); P(10, 6, 2, 16, d);
      for (let r = 9; r < 18; r += 2) { P(2, r - op, 7, 1, shade(l, -0.3)); P(13, r - op, 7, 1, shade(l, -0.3)); }
      P(8, 1, 6, 4, '#fff3b0'); P(10, 2, 2, 2, d);
      for (let i = 0; i < 6; i++) { const a = t * 0.8 + i; P(11 + Math.cos(a) * 13, 11 + Math.sin(a) * 9, 2, 3, '#f8f0d0'); }
      break;
    }
    default: P(4, 4, 14, 14, c0);
  }
  // 물음표 표식
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const qx = x + 18 * S, qy = y + (1 + wob) * S;
  [[1, 0], [2, 0], [0, 1], [3, 1], [3, 2], [2, 3], [2, 5]].forEach(([a, b]) => ctx.fillRect(Math.round(qx + a * S * 0.6), Math.round(qy + b * S * 0.6), Math.ceil(S * 0.6), Math.ceil(S * 0.6)));
  ctx.restore();
}

// ───────────────────────── 마법 이펙트 ─────────────────────────
// p: 0~1 진행도. (sx,sy) 시전자 → (tx,ty) 대상
export function drawFx(ctx, fx, col, p, sx, sy, tx, ty, s = 2) {
  const P = (x, y, w = 1, h = 1, c = col) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w * s), Math.ceil(h * s)); };
  const light = shade(col, 0.5);
  ctx.save();
  switch (fx) {
    case 'bolt': {
      const x = sx + (tx - sx) * Math.min(1, p * 1.4), y = sy + (ty - sy) * Math.min(1, p * 1.4) - Math.sin(p * Math.PI) * 20;
      for (let i = 0; i < 6; i++) P(x - i * 5 * s / 2, y + Math.sin(i + p * 20) * 2, 2 - i * 0.25, 2 - i * 0.25, i ? col : '#fff');
      if (p > 0.7) for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; P(tx + Math.cos(a) * (p - 0.7) * 60, ty + Math.sin(a) * (p - 0.7) * 60, 1.5, 1.5, light); }
      break;
    }
    case 'beam': {
      const a = p < 0.8 ? 1 : (1 - p) * 5;
      ctx.globalAlpha = a;
      const n = 30;
      for (let i = 0; i < n; i++) { const k = i / n; if (k > p * 1.3) break; P(sx + (tx - sx) * k, sy + (ty - sy) * k - 2, 3, 2 + (i % 2), i % 3 ? col : '#fff'); }
      if (p > 0.5) for (let i = 0; i < 8; i++) P(tx + (Math.random() - 0.5) * 30, ty + (Math.random() - 0.5) * 30, 1.5, 1.5, light);
      break;
    }
    case 'burst': case 'rain': {
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + i;
        if (fx === 'rain') P(tx - 40 + (i * 37) % 80, ty - 60 + ((p * 140 + i * 13) % 100), 1, 3, i % 2 ? col : light);
        else P(tx + Math.cos(a) * p * 50, ty + Math.sin(a) * p * 40, 2 * (1 - p) + 0.5, 2 * (1 - p) + 0.5, i % 3 ? col : '#fff');
      }
      break;
    }
    case 'ring': {
      const r = p * 46;
      ctx.globalAlpha = 1 - p * 0.8;
      const cx = fx === 'ring' && col === '#ffd36b' ? sx : tx, cy = fx === 'ring' && col === '#ffd36b' ? sy : ty;
      for (let a = 0; a < 40; a++) P(cx + Math.cos(a / 40 * 6.28) * r, cy + Math.sin(a / 40 * 6.28) * r * 0.8, 1.5, 1.5, a % 4 ? col : '#fff');
      break;
    }
    case 'wave': {
      for (let i = 0; i < 40; i++) { const k = i / 40; const x = sx + (tx - sx) * Math.min(1, p * 1.2) * k; P(x, sy + Math.sin(k * 12 + p * 10) * 10, 2, 2, i % 3 ? col : light); }
      break;
    }
    case 'leaf': case 'sparkle': case 'firefly': {
      const cx = fx === 'leaf' && col !== '#8fe388' ? tx : sx, cy = fx === 'leaf' && col !== '#8fe388' ? ty : sy;
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4 + p * 4;
        const r = 10 + (i % 4) * 8 + p * 10;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.7 - p * 20;
        if (fx === 'sparkle') { P(x, y, 1, 1, '#fff'); P(x - s, y, 1, 1, col); P(x + s, y, 1, 1, col); P(x, y - s, 1, 1, col); P(x, y + s, 1, 1, col); }
        else P(x, y, 1.5, 1, i % 2 ? col : light);
      }
      break;
    }
    case 'wind': for (let i = 0; i < 10; i++) P(sx + ((p * 200 + i * 30) % 200) - 20, sy - 20 + i * 5, 6, 0.5, col); break;
    case 'book': for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + p * 6; P(sx + Math.cos(a) * 26, sy + Math.sin(a) * 18, 3, 2, i % 2 ? col : '#fff'); } break;
    default: P(tx, ty, 4, 4);
  }
  ctx.restore();
}
