// 장면 렌더러: 학교 타일맵(걸어 다니기), 세계 지도, 지역 탐험/전투 장면
import { canvas, drawChar, charOpts, npcOpts, drawMonster, drawFx, CHAR_W, CHAR_H } from './pixel.js';
import { FACILITIES, NPCS, OUTFITS, REGIONS } from './content.js';
import { rng, shade, mix, clamp, lerp, dayKey, hashStr } from './util.js';

export const T = 16;
export const MAP_W = 44, MAP_H = 31;

// ───────────────────────── 시간 · 날씨 ─────────────────────────
export function season(d = new Date()) {
  const m = d.getMonth() + 1;
  return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}
// ?hour=12 처럼 시간대를 고정해 볼 수 있다 (미리보기·테스트용)
const HOUR_OVERRIDE = (() => { try { const v = new URLSearchParams(location.search).get('hour'); return v == null ? null : Number(v); } catch { return null; } })();
export function nightLevel(d = new Date()) {
  const h = HOUR_OVERRIDE ?? d.getHours() + d.getMinutes() / 60;
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 20) return (h - 17) / 3 * 0.62;
  if (h >= 5 && h < 7) return (7 - h) / 2 * 0.62;
  return 0.62;
}
export function weather(d = new Date()) {
  const r = rng(`wx:${dayKey(d.getTime())}`);
  const s = season(d), x = r();
  if (s === 'winter') return x < 0.55 ? 'snow' : 'clear';
  if (s === 'summer') return x < 0.25 ? 'rain' : 'clear';
  if (s === 'spring') return x < 0.4 ? 'petals' : x < 0.55 ? 'rain' : 'clear';
  return x < 0.45 ? 'leaves' : x < 0.6 ? 'rain' : 'clear';
}
export const WEATHER_NAME = { clear: '맑음', rain: '비', snow: '눈', petals: '꽃잎 바람', leaves: '낙엽 바람' };

class Particles {
  constructor() { this.list = []; }
  update(kind, w, h, dt, density = 1) {
    const want = { rain: 90, snow: 70, petals: 30, leaves: 30, fireflies: 24, dust: 30 }[kind] || 0;
    while (this.list.length < want * density) this.list.push(this.spawn(kind, w, h, true));
    if (this.list.length > want * density) this.list.length = Math.floor(want * density);
    for (const p of this.list) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.t += dt;
      if (kind === 'fireflies' || kind === 'dust') { p.vx += (Math.random() - 0.5) * 20 * dt; p.vy += (Math.random() - 0.5) * 20 * dt; p.vx = clamp(p.vx, -12, 12); p.vy = clamp(p.vy, -12, 12); }
      if (p.y > h + 4 || p.x < -10 || p.x > w + 10 || p.y < -20) Object.assign(p, this.spawn(kind, w, h, false));
    }
  }
  spawn(kind, w, h, anywhere) {
    const y = anywhere ? Math.random() * h : -5;
    switch (kind) {
      case 'rain': return { kind, x: Math.random() * w, y, vx: -20, vy: 220, t: 0 };
      case 'snow': return { kind, x: Math.random() * w, y, vx: Math.random() * 10 - 5, vy: 18 + Math.random() * 14, t: Math.random() * 9 };
      case 'petals': case 'leaves': return { kind, x: Math.random() * w, y, vx: 14 + Math.random() * 10, vy: 16 + Math.random() * 10, t: Math.random() * 9 };
      default: return { kind, x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, t: Math.random() * 9 };
    }
  }
  draw(ctx, ox = 0, oy = 0, s = 1) {
    for (const p of this.list) {
      const x = Math.round((p.x - ox) * s), y = Math.round((p.y - oy) * s);
      if (p.kind === 'rain') { ctx.fillStyle = 'rgba(170,200,255,0.55)'; ctx.fillRect(x, y, s, 4 * s); }
      else if (p.kind === 'snow') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.round(Math.sin(p.t * 2) * s), y, s, s); }
      else if (p.kind === 'petals') { ctx.fillStyle = Math.sin(p.t * 5) > 0 ? '#ffb7d5' : '#ffd6e8'; ctx.fillRect(x, y, s * 2, s); }
      else if (p.kind === 'leaves') { ctx.fillStyle = Math.sin(p.t * 4) > 0 ? '#d0802a' : '#e8b04a'; ctx.fillRect(x, y, s * 2, s); }
      else if (p.kind === 'fireflies') { const a = 0.4 + 0.6 * Math.abs(Math.sin(p.t * 2)); ctx.fillStyle = `rgba(230,255,140,${a})`; ctx.fillRect(x, y, s, s); }
      else if (p.kind === 'dust') { ctx.fillStyle = 'rgba(200,200,200,0.35)'; ctx.fillRect(x, y, s, s); }
    }
  }
}

// ───────────────────────── 학교 맵 ─────────────────────────
// 타일: 0 풀, 1 길, 2 물, 3 나무, 4 꽃, 5 담장, 6 광장 돌바닥, 7 덤불
function buildGrid() {
  const g = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(0));
  const r = rng('hesperine-map');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) g[y][x] = 5;
    else if (x < 3 || y < 3 || x > MAP_W - 4 || y > MAP_H - 4) g[y][x] = r() < 0.75 ? 3 : 7;
    else if (r() < 0.05) g[y][x] = 4;
  }
  // 정문
  for (let x = 20; x <= 23; x++) { g[MAP_H - 1][x] = 1; for (let y = MAP_H - 4; y < MAP_H; y++) g[y][x] = 1; }
  // 광장
  for (let y = 12; y <= 19; y++) for (let x = 18; x <= 26; x++) g[y][x] = 6;
  // 연못
  for (let y = 23; y <= 27; y++) for (let x = 29; x <= 35; x++) if (!((y === 23 || y === 27) && (x === 29 || x === 35))) g[y][x] = 2;
  // 주요 길
  const path = (x0, y0, x1, y1) => {
    let x = x0, y = y0;
    while (x !== x1) { if (g[y][x] !== 6) g[y][x] = 1; if (g[y + 1]) g[y + 1][x] = g[y + 1][x] === 6 ? 6 : 1; x += Math.sign(x1 - x); }
    while (y !== y1) { if (g[y][x] !== 6) g[y][x] = 1; if (g[y][x + 1] !== undefined) g[y][x + 1] = g[y][x + 1] === 6 ? 6 : 1; y += Math.sign(y1 - y); }
  };
  path(21, MAP_H - 4, 21, 19);
  for (const f of FACILITIES) {
    const dx = f.x + Math.floor(f.w / 2) - 1, dy = f.y + f.h;
    path(dx, dy, dx, dy + 1);
    path(dx, dy + 1, 21, dy + 1 > 19 ? dy + 1 : Math.max(12, Math.min(dy + 1, 19)));
  }
  path(5, 12, 38, 12); path(5, 20, 38, 20);
  // 건물 자리 비우기
  for (const f of FACILITIES) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) g[y][x] = 0;
  return g;
}

function grassCol(seasonName, stage) {
  const base = { spring: '#6ab04a', summer: '#4a9a3a', autumn: '#9a9a3a', winter: '#d8e4ec' }[seasonName];
  return stage <= 1 ? mix(base, '#7a7a5a', 0.35) : base;
}

function drawTile(ctx, g, x, y, sea, stage) {
  const t = g[y][x], px = x * T, py = y * T;
  const r = rng(x * 7919 + y * 104729);
  const gc = grassCol(sea, stage);
  const P = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + a, py + b, w, h); };
  // 풀
  P(0, 0, T, T, gc);
  for (let i = 0; i < 10; i++) P(r.int(0, 15), r.int(0, 15), 1, 1, shade(gc, r() < 0.5 ? -0.12 : 0.1));
  if (stage <= 1 && r() < 0.35) P(r.int(2, 10), r.int(2, 10), 4, 3, '#8a7a5a');
  if (t === 1) { // 자갈길
    const pc = sea === 'winter' ? '#b8b0a8' : '#c8b088';
    P(0, 0, T, T, pc);
    for (let i = 0; i < 6; i++) { const sx = r.int(0, 12), sy = r.int(0, 12); P(sx, sy, 4, 3, shade(pc, r() < 0.5 ? -0.08 : 0.08)); P(sx, sy + 3, 4, 1, shade(pc, -0.18)); }
  } else if (t === 6) { // 광장
    const sc = stage <= 1 ? '#8a8480' : '#b8b0a8';
    P(0, 0, T, T, sc);
    P(0, 0, T, 1, shade(sc, -0.15)); P(0, 0, 1, T, shade(sc, -0.15)); P(8, 0, 1, 8, shade(sc, -0.1)); P(0, 8, T, 1, shade(sc, -0.15));
    if (stage <= 1 && r() < 0.3) P(r.int(2, 12), r.int(2, 12), 3, 1, '#5a5450');
  } else if (t === 2) {
    P(0, 0, T, T, sea === 'winter' ? '#9ac0d8' : '#3a7ac0');
  } else if (t === 4) {
    const fc = sea === 'winter' ? '#ffffff' : r.pick(['#ff7ab0', '#ffe08a', '#a0c8ff', '#ffffff']);
    for (let i = 0; i < 3; i++) { const fx = r.int(2, 12), fy = r.int(2, 12); P(fx, fy, 2, 2, fc); P(fx, fy + 2, 1, 2, shade(gc, -0.3)); }
  } else if (t === 5) {
    P(0, 6, T, 8, '#7a6a5a'); P(0, 6, T, 2, '#9a8a7a'); P(0, 13, T, 1, '#4a3a2a');
    for (let i = 0; i < T; i += 8) P(i, 8, 1, 5, '#5a4a3a');
  } else if (t === 7) {
    P(2, 4, 12, 10, shade(gc, -0.25)); P(3, 3, 10, 3, shade(gc, -0.1)); P(5, 6, 2, 2, shade(gc, 0.1));
  }
}

const WALL = ['#6a625a', '#7a7068', '#a89a88', '#c8b8a0', '#e0d4c0', '#ece4d4'];
function drawBuilding(ctx, f, lv, stage, emit) {
  const x0 = f.x * T, y0 = f.y * T, W = f.w * T, H = f.h * T;
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x0 + x, y0 + y, w, h); };
  const r = rng(f.id);
  const roof = lv <= 1 ? mix(f.roof, '#6a6060', 0.45) : f.roof;
  const roofD = shade(roof, -0.3), roofL = shade(roof, 0.18);
  const wall = WALL[lv], wallD = shade(wall, -0.22);
  if (lv === 0) {
    // 빈 공터: 흙바닥, 말뚝, 표지판
    P(4, 8, W - 8, H - 12, '#9a7a52');
    for (let i = 0; i < 6; i++) P(r.int(6, W - 10), r.int(10, H - 10), 3, 2, '#7a6a5a');
    for (const [sx, sy] of [[4, 8], [W - 6, 8], [4, H - 6], [W - 6, H - 6]]) { P(sx, sy - 6, 2, 8, '#6a4a2a'); }
    P(4, 4, W - 8, 1, '#c8a060');
    P(W / 2 - 6, H - 14, 12, 8, '#a07a4a'); P(W / 2 - 1, H - 6, 2, 6, '#6a4a2a'); P(W / 2 - 4, H - 12, 8, 1, '#4a3a2a'); P(W / 2 - 3, H - 10, 6, 1, '#4a3a2a');
    emit.lots.push({ x: x0 + W / 2, y: y0 + H / 2 });
    return;
  }
  const style = f.style;
  if (style === 'yard') {
    P(2, 4, W - 4, H - 6, '#d8c090'); for (let i = 0; i < 20; i++) P(r.int(4, W - 6), r.int(6, H - 6), 2, 1, '#c0a878');
    for (let x = 2; x < W - 2; x += 6) P(x, 2, 2, 6, '#7a5a3a'); P(2, 4, W - 4, 1, '#9a7a4a');
    for (let i = 0; i < Math.min(5, lv + 1); i++) { const dx = 10 + i * 14; P(dx, H - 26, 2, 14, '#6a4a2a'); P(dx - 4, H - 24, 10, 3, '#a07a4a'); P(dx - 2, H - 32, 6, 7, '#c8a878'); P(dx, H - 30, 2, 2, '#c03a3a'); }
    if (lv >= 3) { P(W - 26, 10, 18, 18, '#e8e0d0'); P(W - 22, 14, 10, 10, '#c03a3a'); P(W - 19, 17, 4, 4, '#ffffff'); }
    if (lv >= 4) { P(4, 8, 10, 6, '#5a5a6a'); P(5, 6, 8, 2, '#8a8a9a'); }
    return;
  }
  if (style === 'garden') {
    P(2, 2, W - 4, H - 4, shade('#4a9a4a', -0.1));
    for (let x = 2; x < W - 2; x += 4) { P(x, 2, 4, 4, '#2f7a3a'); P(x, H - 6, 4, 4, '#2f7a3a'); }
    for (let i = 0; i < lv * 3; i++) { const fx = 8 + (i * 13) % (W - 18), fy = 10 + ((i * 7) % (H - 22)); P(fx, fy, 6, 4, '#3a8a3a'); P(fx + 1, fy, 2, 2, r.pick(['#ff7ab0', '#ffe08a', '#a0c8ff', '#ff9a5a'])); P(fx + 3, fy + 1, 2, 2, '#ffffff'); }
    if (lv >= 3) { P(W / 2 - 8, H / 2 - 6, 16, 12, '#a8a098'); P(W / 2 - 6, H / 2 - 4, 12, 8, '#3a7ac0'); emit.water.push({ x: x0 + W / 2 - 6, y: y0 + H / 2 - 4, w: 12, h: 8 }); }
    if (lv >= 4) { P(W - 22, 6, 16, 3, '#c8a878'); P(W - 21, 9, 2, 12, '#e0d0b0'); P(W - 9, 9, 2, 12, '#e0d0b0'); P(W - 23, 4, 18, 3, f.roof); }
    if (lv >= 5) emit.sparkles.push({ x: x0 + W / 2, y: y0 + H / 2, r: 30 });
    return;
  }
  // 일반 건물
  const tall = style === 'tower';
  const roofH = tall ? Math.round(H * 0.45) : Math.round(H * 0.45);
  const wallTop = roofH;
  const extra = lv >= 4 ? (tall ? 20 : 12) : 0; // 4단계 이상: 위로 증축
  // 벽
  P(2, wallTop, W - 4, H - wallTop - 2, wall);
  for (let y = wallTop + 3; y < H - 4; y += 4) for (let x = 2 + ((y / 4) % 2) * 3; x < W - 4; x += 7) P(x, y, 5, 1, wallD);
  P(2, H - 3, W - 4, 1, shade(wall, -0.4));
  if (lv === 1) { for (let i = 0; i < 3; i++) { const cx = r.int(6, W - 10), cy = r.int(wallTop + 4, H - 8); P(cx, cy, 1, 4, '#3a3430'); P(cx + 1, cy + 3, 2, 1, '#3a3430'); } }
  if (lv >= 4) { P(2, wallTop, W - 4, 2, '#e8c46a'); P(2, H - 5, W - 4, 1, '#e8c46a'); }
  // 지붕
  if (style === 'library') {
    for (let y = 0; y < roofH; y++) { const half = Math.round(Math.sqrt(1 - Math.pow(1 - y / roofH, 2)) * (W / 2 - 2)); P(W / 2 - half, y + 2, half * 2, 1, y % 3 ? roof : roofD); }
    P(W / 2 - 1, -4, 2, 6, '#e8c46a');
    P(W / 2 - 7, roofH - 6, 14, 6, '#f0e0c0'); P(W / 2 - 1, roofH - 6, 2, 6, '#8a6a4a');
  } else if (style === 'glass') {
    P(2, 4, W - 4, H - 6, 'rgba(160,216,255,0.55)');
    for (let x = 2; x < W - 2; x += 8) P(x, 4, 1, H - 6, '#e0f0ff');
    for (let y = 4; y < H - 2; y += 8) P(2, y, W - 4, 1, '#e0f0ff');
    for (let i = 0; i < lv * 4; i++) { const px = 6 + (i * 11) % (W - 12), py = H - 14 - (i % 3) * 6; P(px, py, 4, 6, '#3a9a4a'); P(px + 1, py - 2, 2, 2, r.pick(['#ff7ab0', '#ffe08a', '#9fd8ff'])); }
    emit.windows.push({ x: x0 + W / 2, y: y0 + H / 2, w: W - 8, h: H - 10, glass: true });
    if (lv >= 5) emit.sparkles.push({ x: x0 + W / 2, y: y0 + H / 2, r: 28 });
    P(W / 2 - 4, H - 12, 8, 10, '#6a4a2a');
    return;
  } else {
    const peak = tall ? -10 - extra : 0;
    for (let y = 0; y < roofH - peak; y++) {
      const k = y / (roofH - peak);
      const half = Math.round((tall ? 0.15 + k * 0.85 : 0.35 + k * 0.65) * (W / 2));
      P(W / 2 - half, y + peak, half * 2, 1, y % 3 === 2 ? roofD : roof);
      P(W / 2 - half, y + peak, 1, 1, roofL);
    }
    P(0, roofH - 2, W, 2, roofD);
    if (lv === 1) { P(r.int(8, W - 14), r.int(4, roofH - 6), 5, 3, '#2a2420'); }
    if (lv >= 3 && !tall) { P(W - 14, -6, 6, 10, '#7a5a4a'); P(W - 15, -7, 8, 2, '#5a4a3a'); emit.smoke.push({ x: x0 + W - 11, y: y0 - 8 }); }
    if (style === 'workshop') { emit.smoke.push({ x: x0 + 9, y: y0 - 6 }); P(6, -4, 6, 10, '#5a4a4a'); }
  }
  // 대강당 기둥
  if (style === 'hall') for (let x = 8; x < W - 8; x += 12) { P(x, wallTop + 2, 4, H - wallTop - 6, shade(wall, 0.2)); P(x - 1, wallTop + 1, 6, 2, '#e8dcc8'); }
  if (style === 'vault') { P(W / 2 - 9, H - 22, 18, 20, '#5a5a6a'); P(W / 2 - 7, H - 20, 14, 18, '#7a7a8a'); P(W / 2 - 2, H - 13, 4, 4, '#e8c46a'); }
  // 창문
  const winCount = Math.min(8, 1 + lv + Math.floor(f.w / 3));
  const wy = wallTop + 5;
  const step = (W - 12) / winCount;
  for (let i = 0; i < winCount; i++) {
    const wx = Math.round(6 + i * step + step / 2 - 3);
    if (Math.abs(wx + 3 - W / 2) < 7) continue;
    P(wx, wy, 6, 7, '#2a2a3a'); P(wx + 1, wy + 1, 4, 5, '#4a5a7a'); P(wx + 1, wy + 1, 2, 2, '#8aa0c0'); P(wx, wy + 3, 6, 1, wall); P(wx + 2, wy, 1, 7, wall);
    if (lv >= 3) P(wx - 1, wy + 7, 8, 2, '#3a8a3a'), P(wx, wy + 7, 1, 1, '#ff7ab0'), P(wx + 4, wy + 7, 1, 1, '#ffe08a');
    emit.windows.push({ x: x0 + wx, y: y0 + wy, w: 6, h: 7 });
    if (H - wallTop > 34 && lv >= 2) { P(wx, wy + 14, 6, 7, '#2a2a3a'); P(wx + 1, wy + 15, 4, 5, '#4a5a7a'); emit.windows.push({ x: x0 + wx, y: y0 + wy + 14, w: 6, h: 7 }); }
  }
  // 문
  const dw = lv >= 3 ? 10 : 8, dh = 12;
  P(W / 2 - dw / 2, H - dh - 2, dw, dh, '#5a3a22'); P(W / 2 - dw / 2 + 1, H - dh - 1, dw - 2, dh - 1, '#7a4a2a'); P(W / 2 + dw / 2 - 3, H - 8, 1, 2, '#e8c46a');
  if (lv >= 3) P(W / 2 - dw / 2 - 1, H - dh - 3, dw + 2, 1, '#e8c46a');
  // 깃발 · 문장
  if (lv >= 3) for (const bx of [W / 2 - dw / 2 - 6, W / 2 + dw / 2 + 3]) { P(bx, wallTop + 2, 3, 12, f.roof); P(bx, wallTop + 2, 3, 1, '#e8c46a'); P(bx + 1, wallTop + 6, 1, 2, '#e8c46a'); emit.banners.push({ x: x0 + bx, y: y0 + wallTop + 2, c: f.roof }); }
  if (lv >= 5) { P(W / 2 - 3, (tall ? -6 - extra : 3), 6, 6, '#fff3b0'); P(W / 2 - 1, (tall ? -8 - extra : 1), 2, 10, '#fff3b0'); P(W / 2 - 5, (tall ? -4 - extra : 5), 10, 2, '#fff3b0'); emit.sparkles.push({ x: x0 + W / 2, y: y0 + (tall ? -3 - extra : 6), r: 14 }); }
}

function drawTree(ctx, x, y, t, sea, stage, big = false) {
  const sw = Math.round(Math.sin(t * 1.6 + x * 0.13) * 1);
  const leaf = { spring: '#3a8a3a', summer: '#2a7a32', autumn: '#c0702a', winter: '#e8f0f8' }[sea];
  const lc = stage <= 1 ? mix(leaf, '#5a5a4a', 0.35) : leaf;
  const P = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + a, y + b, w, h); };
  P(6, 10, 4, 7, '#5a3a22'); P(7, 10, 1, 7, '#7a4a2a');
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 2, y + 15, 12, 2);
  P(2 + sw, 2, 12, 9, shade(lc, -0.25)); P(3 + sw, 0, 10, 10, lc); P(1 + sw, 4, 14, 5, lc); P(4 + sw, 1, 4, 3, shade(lc, 0.2));
  if (sea === 'winter') P(3 + sw, 0, 10, 2, '#ffffff');
  if (sea === 'spring' && stage >= 2) { P(5 + sw, 3, 1, 1, '#ffb7d5'); P(10 + sw, 5, 1, 1, '#ffb7d5'); }
}

export class SchoolScene {
  constructor() {
    this.grid = buildGrid();
    this.static = null; this.staticKey = '';
    this.emit = null;
    this.player = { x: 21 * T + 4, y: 25 * T, dir: 'up', moving: false, run: false, target: null, anim: 'idle', interactT: 0 };
    this.walkers = [];
    this.particles = new Particles();
    this.fire = new Particles();
    this.keys = new Set();
    this.cam = { x: 0, y: 0 };
    this.hover = null;
    this.npcs = [];
  }
  blockedAt(px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    const t = this.grid[ty][tx];
    if (t === 2 || t === 3 || t === 5 || t === 7) return true;
    for (const f of FACILITIES) if (px >= f.x * T + 2 && px < (f.x + f.w) * T - 2 && py >= f.y * T - 4 && py < (f.y + f.h) * T - 2) return true;
    if (px >= 20 * T && px < 25 * T && py >= 14 * T && py < 18 * T) return true; // 분수
    return false;
  }
  door(f) { return { x: (f.x + f.w / 2) * T, y: (f.y + f.h) * T + 6 }; }
  rebuild(G) {
    const sea = season(), stage = G.stage;
    const key = JSON.stringify([G.fac, sea, stage]);
    if (key === this.staticKey) return;
    this.staticKey = key;
    const [c, ctx] = canvas(MAP_W * T, MAP_H * T);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawTile(ctx, this.grid, x, y, sea, stage);
    // 분수
    const P = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    P(20 * T, 14 * T, 5 * T, 4 * T, '#a8a098'); P(20 * T + 3, 14 * T + 3, 5 * T - 6, 4 * T - 6, stage <= 1 ? '#5a6a6a' : '#3a7ac0');
    P(22 * T, 15 * T, T, 2 * T - 4, '#c8c0b8'); P(22 * T + 4, 14 * T + 10, 8, 6, '#e0d8d0');
    const emit = { windows: [], smoke: [], sparkles: [], banners: [], lots: [], water: [{ x: 20 * T + 3, y: 14 * T + 3, w: 5 * T - 6, h: 4 * T - 6, fountain: stage >= 2 }], lamps: [] };
    for (let y = 23; y <= 27; y++) for (let x = 29; x <= 35; x++) if (this.grid[y][x] === 2) emit.water.push({ x: x * T, y: y * T, w: T, h: T });
    for (const f of FACILITIES) drawBuilding(ctx, f, G.fac[f.id] || 0, stage, emit);
    // 가로등 (단계가 오를수록 더 많이)
    const lampSpots = [[17, 12], [27, 12], [17, 19], [27, 19], [20, 24], [24, 24], [8, 12], [34, 12], [8, 20], [34, 20], [20, 28], [24, 28]];
    lampSpots.slice(0, 4 + stage * 2).forEach(([lx, ly]) => { P(lx * T + 7, ly * T - 10, 2, 14, '#3a3a4a'); P(lx * T + 5, ly * T - 14, 6, 5, '#2a2a3a'); emit.lamps.push({ x: lx * T + 8, y: ly * T - 12, on: stage >= 2 || lx % 2 === 0 }); });
    this.static = c; this.emit = emit;
    // 나무 목록
    this.trees = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (this.grid[y][x] === 3) this.trees.push({ x: x * T, y: y * T - 4 });
  }
  setWalkers(G) {
    const n = Math.min(12, G.students.length);
    while (this.walkers.length < n) {
      const s = G.students[this.walkers.length];
      let x, y, k = 0;
      do { x = (17 + Math.random() * 11) * T; y = (11 + Math.random() * 10) * T; } while (this.blockedAt(x, y) && ++k < 50);
      this.walkers.push({ id: s.id, x, y, tx: null, ty: null, wait: Math.random() * 3, dir: 'down', look: s.look });
    }
    this.walkers.length = n;
  }
  pickTarget(w) {
    const doors = FACILITIES.map((f) => this.door(f));
    const p = Math.random() < 0.5 ? doors[Math.floor(Math.random() * doors.length)] : { x: (18 + Math.random() * 9) * T, y: (12 + Math.random() * 8) * T };
    w.tx = p.x + (Math.random() - 0.5) * 10; w.ty = p.y + (Math.random() - 0.5) * 6;
  }
  update(dt, G) {
    const p = this.player;
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('a')) vx -= 1;
    if (k.has('ArrowRight') || k.has('d')) vx += 1;
    if (k.has('ArrowUp') || k.has('w')) vy -= 1;
    if (k.has('ArrowDown') || k.has('s')) vy += 1;
    if (vx || vy) p.target = null;
    if (p.target) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      if (d < 3) { const cb = p.target.onArrive; p.target = null; if (cb) cb(); }
      else { vx = dx / d; vy = dy / d; }
    }
    p.run = k.has('Shift') || (p.target && p.target.run);
    const speed = p.run ? 95 : 55;
    const len = Math.hypot(vx, vy) || 1;
    p.moving = Boolean(vx || vy);
    if (p.moving) {
      const nx = p.x + (vx / len) * speed * dt, ny = p.y + (vy / len) * speed * dt;
      let moved = false;
      if (!this.blockedAt(nx, ny)) { p.x = nx; p.y = ny; moved = true; }
      else if (!this.blockedAt(nx, p.y)) { p.x = nx; moved = true; }
      else if (!this.blockedAt(p.x, ny)) { p.y = ny; moved = true; }
      if (!moved && p.target) { p.stuck = (p.stuck || 0) + dt; if (p.stuck > 0.6) { const cb = p.target.onArrive; p.target = null; p.stuck = 0; if (cb && p.target === null) cb(); } } else p.stuck = 0;
      p.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    }
    if (p.interactT > 0) p.interactT -= dt;
    p.anim = p.interactT > 0 ? 'interact' : p.moving ? (p.run ? 'run' : 'walk') : 'idle';
    // 학생들
    for (const w of this.walkers) {
      if (w.wait > 0) { w.wait -= dt; w.moving = false; continue; }
      if (w.tx == null) this.pickTarget(w);
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 2) { w.tx = null; w.wait = 1 + Math.random() * 4; w.moving = false; continue; }
      const nx = w.x + dx / d * 30 * dt, ny = w.y + dy / d * 30 * dt;
      if (this.blockedAt(nx, ny)) { w.tx = null; w.wait = 0.5; continue; }
      w.x = nx; w.y = ny; w.moving = true;
      w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
  }
  nearest() {
    const p = this.player;
    let best = null, bd = 26;
    for (const n of this.npcs) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = { type: 'npc', id: n.id, x: n.x, y: n.y }; } }
    for (const f of FACILITIES) { const dd = this.door(f); const d = Math.hypot(dd.x - p.x, dd.y - p.y); if (d < bd) { bd = d; best = { type: 'fac', id: f.id, x: dd.x, y: dd.y }; } }
    return best;
  }
  /** 화면 좌표 → 월드 좌표 클릭 처리 */
  hitTest(wx, wy) {
    for (const n of this.npcs) if (Math.abs(n.x - wx) < 10 && wy > n.y - 26 && wy < n.y + 4) return { type: 'npc', id: n.id };
    for (const f of FACILITIES) if (wx >= f.x * T && wx < (f.x + f.w) * T && wy >= f.y * T - 8 && wy < (f.y + f.h) * T) return { type: 'fac', id: f.id };
    return null;
  }
  render(ctx, W, H, t, dt, G) {
    this.rebuild(G);
    this.setWalkers(G);
    this.npcs = G.npcs;
    this.update(dt, G);
    const z = G.zoom;
    const vw = W / z, vh = H / z;
    const p = this.player;
    this.cam.x = clamp(p.x - vw / 2, 0, Math.max(0, MAP_W * T - vw));
    this.cam.y = clamp(p.y - vh / 2, 0, Math.max(0, MAP_H * T - vh));
    if (vw > MAP_W * T) this.cam.x = -(vw - MAP_W * T) / 2;
    if (vh > MAP_H * T) this.cam.y = -(vh - MAP_H * T) / 2;
    const cx = Math.round(this.cam.x * z) / z, cy = Math.round(this.cam.y * z) / z;
    ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    ctx.drawImage(this.static, 0, 0);
    const E = this.emit;
    // 물결
    for (const w of E.water) {
      for (let i = 0; i < 4; i++) {
        const sx = w.x + ((t * 6 + i * 11 + w.x) % Math.max(4, w.w - 4)), sy = w.y + 2 + ((i * 5 + Math.floor(t * 2)) % Math.max(3, w.h - 3));
        ctx.fillStyle = 'rgba(220,240,255,0.55)'; ctx.fillRect(Math.round(sx), Math.round(sy), 3, 1);
      }
      if (w.fountain) { for (let i = 0; i < 6; i++) { const a = (t * 2 + i) % 1; ctx.fillStyle = 'rgba(200,230,255,0.8)'; ctx.fillRect(22 * T + 8 + Math.round(Math.sin(i * 2) * a * 10), 14 * T + 8 - Math.round(Math.sin(a * Math.PI) * 10), 1, 2); } }
    }
    // 연기
    for (const s of E.smoke) for (let i = 0; i < 4; i++) { const a = (t * 0.5 + i / 4) % 1; ctx.fillStyle = `rgba(220,220,220,${0.5 * (1 - a)})`; ctx.fillRect(Math.round(s.x + Math.sin(a * 6 + i) * 3), Math.round(s.y - a * 18), 3 + Math.round(a * 3), 3); }
    // 깃발 펄럭임
    for (const b of E.banners) { ctx.fillStyle = shade(b.c, -0.2); ctx.fillRect(Math.round(b.x + 3), Math.round(b.y + 3 + Math.sin(t * 3 + b.x) * 1), 1, 7); }
    // 깊이 정렬: 나무 · 인물
    const draw = [];
    for (const tr of this.trees) draw.push({ y: tr.y + 16, f: () => drawTree(ctx, tr.x, tr.y, t, G.season, G.stage) });
    for (const w of this.walkers) draw.push({ y: w.y, f: () => drawChar(ctx, w.x - 10, w.y - 26, G.studentOpts(w.look), w.moving ? 'walk' : 'idle', t + w.x, w.dir) });
    for (const n of this.npcs) draw.push({ y: n.y, f: () => {
      drawChar(ctx, n.x - 10, n.y - 26, n.opts, 'idle', t + n.x * 0.1, n.dir || 'down');
      if (n.mark) {
        const bob = Math.round(Math.sin(t * 4) * 1);
        ctx.fillStyle = '#1a1420'; ctx.fillRect(n.x - 3, n.y - 37 + bob, 7, 9);
        ctx.fillStyle = n.mark === '!' ? '#ffd86b' : '#d0d0e0'; ctx.fillRect(n.x - 2, n.y - 36 + bob, 5, 7);
        ctx.fillStyle = '#1a1420';
        if (n.mark === '!') { ctx.fillRect(n.x, n.y - 35 + bob, 1, 3); ctx.fillRect(n.x, n.y - 31 + bob, 1, 1); }
        else { ctx.fillRect(n.x - 1, n.y - 32 + bob, 1, 1); ctx.fillRect(n.x + 1, n.y - 32 + bob, 1, 1); }
      }
    } });
    draw.push({ y: p.y, f: () => drawChar(ctx, p.x - 10, p.y - 26, G.playerOpts, p.anim, t, p.dir) });
    draw.sort((a, b) => a.y - b.y).forEach((d) => d.f());
    // 상호작용 대상 표시
    const near = this.nearest();
    this.near = near;
    if (near) { ctx.strokeStyle = `rgba(255,230,140,${0.5 + 0.5 * Math.sin(t * 6)})`; ctx.lineWidth = 1; ctx.strokeRect(Math.round(near.x) - 6.5, Math.round(near.y) - 2.5, 13, 5); }
    // 반짝임 (5단계 시설)
    for (const s of E.sparkles) for (let i = 0; i < 5; i++) { const a = t * 0.8 + i * 1.3; ctx.fillStyle = `rgba(255,243,176,${0.4 + 0.6 * Math.abs(Math.sin(a * 2))})`; ctx.fillRect(Math.round(s.x + Math.cos(a) * s.r), Math.round(s.y + Math.sin(a * 1.3) * s.r * 0.5), 1, 1); }
    ctx.restore();

    // 밤 · 조명
    const night = G.night;
    if (night > 0.02) {
      const [lc, lctx] = this.lightCanvas(W, H);
      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(0, 0, W, H);
      lctx.fillStyle = `rgba(10,12,40,${night})`; lctx.fillRect(0, 0, W, H);
      lctx.globalCompositeOperation = 'destination-out';
      const glow = (x, y, r, a) => {
        const sx = (x - cx) * z, sy = (y - cy) * z, sr = r * z;
        if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) return;
        const gr = lctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = gr; lctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      };
      for (const l of E.lamps) if (l.on) glow(l.x, l.y, 30 + Math.sin(t * 9 + l.x) * 1.5, 0.95);
      for (const w of E.windows) glow(w.x + 3, w.y + 3, w.glass ? 34 : 14, 0.8);
      glow(p.x, p.y - 10, G.lanternRadius, 0.9);
      for (const s of E.sparkles) glow(s.x, s.y, s.r + 10, 0.6);
      ctx.drawImage(lc, 0, 0);
      // 창문 불빛 · 등불 색
      ctx.save(); ctx.scale(z, z); ctx.translate(-cx, -cy);
      ctx.globalAlpha = Math.min(1, night * 1.4);
      for (const w of E.windows) if (!w.glass) { ctx.fillStyle = '#ffd88a'; ctx.fillRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2); }
      for (const l of E.lamps) if (l.on) { ctx.fillStyle = Math.sin(t * 13 + l.x) > -0.8 ? '#ffe08a' : '#ffb04a'; ctx.fillRect(l.x - 2, l.y - 1, 4, 3); }
      ctx.restore();
      // 반딧불
      if (G.season !== 'winter' && G.stage >= 2) {
        this.fire.update('fireflies', MAP_W * T, MAP_H * T, dt, 0.8);
        ctx.save(); ctx.globalAlpha = night; this.fire.draw(ctx, cx, cy, z); ctx.restore();
      }
    }
    // 날씨
    if (G.weather !== 'clear' && !G.reduceMotion) {
      const kind = G.weather;
      this.particles.update(kind, W / z, H / z, dt);
      this.particles.draw(ctx, 0, 0, z);
      if (kind === 'rain') { ctx.fillStyle = 'rgba(30,40,70,0.15)'; ctx.fillRect(0, 0, W, H); }
    }
  }
  lightCanvas(W, H) {
    if (!this._lc || this._lc[0].width !== W || this._lc[0].height !== H) this._lc = canvas(W, H);
    return this._lc;
  }
  screenToWorld(sx, sy, z) { return { x: sx / z + this.cam.x, y: sy / z + this.cam.y }; }
}

// ───────────────────────── 세계 지도 ─────────────────────────
export class WorldScene {
  constructor() { this.base = null; this.clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: 0.1 + i * 0.12, s: 0.004 + Math.random() * 0.006, w: 30 + Math.random() * 40 })); this.hit = []; }
  buildBase(w, h) {
    const [c, ctx] = canvas(w, h);
    const r = rng('world');
    ctx.fillStyle = '#1d3a5a'; ctx.fillRect(0, 0, w, h);
    // 대륙: 노이즈 블롭
    const blobs = [];
    for (const reg of REGIONS) blobs.push({ x: reg.map.x / 100 * w, y: reg.map.y / 100 * h, r: Math.min(w, h) * (0.13 + r() * 0.04) });
    for (let i = 0; i < 14; i++) blobs.push({ x: (0.12 + r() * 0.76) * w, y: (0.12 + r() * 0.76) * h, r: Math.min(w, h) * (0.06 + r() * 0.07) });
    const px = 3;
    for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) {
      let v = 0;
      for (const b of blobs) { const d = Math.hypot(x - b.x, y - b.y) / b.r; if (d < 1.4) v += (1.4 - d); }
      v += (Math.sin(x * 0.09) + Math.cos(y * 0.11)) * 0.06;
      if (v > 0.55) { ctx.fillStyle = v > 1.6 ? '#6a7a5a' : v > 1.0 ? '#5a8a4a' : v > 0.7 ? '#6a9a4a' : '#c8b07a'; ctx.fillRect(x, y, px, px); }
      else if (v > 0.45) { ctx.fillStyle = '#2a5a7a'; ctx.fillRect(x, y, px, px); }
    }
    this.base = c; this.bw = w; this.bh = h;
  }
  render(ctx, W, H, t, dt, G) {
    const z = Math.max(1, Math.floor(Math.min(W, H) / 220));
    const w = Math.floor(W / z), h = Math.floor(H / z);
    if (!this.base || this.bw !== w || this.bh !== h) this.buildBase(w, h);
    ctx.save(); ctx.scale(z, z);
    ctx.drawImage(this.base, 0, 0);
    // 물결
    for (let i = 0; i < 40; i++) { const x = (i * 73 + t * 4) % w, y = (i * 131) % h; ctx.fillStyle = 'rgba(160,200,240,0.25)'; ctx.fillRect(Math.round(x), y, 3, 1); }
    this.hit = [];
    const visible = REGIONS.filter((rg) => !rg.hidden || G.vault);
    // 길
    const home = REGIONS[0];
    for (const rg of visible) {
      if (rg.home) continue;
      const un = G.unlocked.includes(rg.id) || (rg.id === 'vault' && G.vault);
      const x0 = home.map.x / 100 * w, y0 = home.map.y / 100 * h, x1 = rg.map.x / 100 * w, y1 = rg.map.y / 100 * h;
      const n = Math.hypot(x1 - x0, y1 - y0) / 4;
      for (let i = 0; i < n; i += 1) { if (i % 2) continue; ctx.fillStyle = un ? '#e8d090' : 'rgba(80,80,90,0.6)'; ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); }
    }
    for (const rg of visible) {
      const x = Math.round(rg.map.x / 100 * w), y = Math.round(rg.map.y / 100 * h);
      const un = rg.home || G.unlocked.includes(rg.id) || (rg.id === 'vault' && G.vault);
      const rs = rg.home ? 100 : (G.regions[rg.id]?.restore || 0) / 100;
      const R = 22;
      if (!rg.home) {
        // 어둠 / 복원 원
        const col = un ? mix(rg.dark[1], rg.bright[1], rs) : '#2a2a32';
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R * 0.75, 0, 6.28); ctx.fill();
        // 안개 (어두울수록 진하게)
        const fog = un ? (1 - rs) * 0.7 : 0.85;
        for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28 + t * 0.2; ctx.fillStyle = `rgba(20,20,30,${fog * 0.6})`; ctx.fillRect(Math.round(x + Math.cos(a) * R * 0.7) - 3, Math.round(y + Math.sin(a) * R * 0.6) - 2, 7, 5); }
        if (un && rs > 0) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * 0.85, -Math.PI / 2, -Math.PI / 2 + rs * 6.283); ctx.stroke(); }
        if (un && rs >= 0.5) for (let i = 0; i < 4; i++) { const a = t + i * 1.6; ctx.fillStyle = '#fff3b0'; ctx.fillRect(Math.round(x + Math.cos(a) * 10), Math.round(y + Math.sin(a) * 8), 1, 1); }
      }
      this.drawPOI(ctx, rg, x, y, t, un, rs);
      ctx.font = '8px Galmuri9, monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(un ? rg.name : '???', x + 1, y + R + 2);
      ctx.fillStyle = un ? '#fff' : '#888'; ctx.fillText(un ? rg.name : '???', x, y + R + 1);
      this.hit.push({ id: rg.id, x: x * z, y: y * z, r: R * z, un });
    }
    // 구름
    for (const c of this.clouds) { c.x = (c.x + c.s * dt) % 1.2; const cx = Math.round((c.x - 0.1) * w), cy = Math.round(c.y * h); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx, cy, c.w, 6); ctx.fillRect(cx + 6, cy - 4, c.w - 14, 4); }
    ctx.restore();
    if (G.night > 0.02) { ctx.fillStyle = `rgba(10,12,40,${G.night * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }
  drawPOI(ctx, rg, x, y, t, un, rs) {
    const P = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + a, y + b, w, h); };
    if (!un) { P(-4, -6, 8, 2, '#888'); P(2, -4, 2, 3, '#888'); P(-1, -1, 3, 2, '#888'); P(-1, 3, 2, 2, '#888'); return; }
    const c = rg.home ? '#e8c46a' : mix(rg.dark[2], rg.bright[2], rs);
    switch (rg.bg || 'home') {
      case 'home': P(-8, -4, 16, 9, '#c8b8a0'); P(-9, -8, 18, 4, '#3a4a8a'); P(-2, -14, 4, 7, '#c8b8a0'); P(-3, -16, 6, 2, '#3a4a8a'); P(-1, -19, 2, 3, '#ffe08a'); P(-1, 1, 2, 4, '#5a3a22'); break;
      case 'forest': for (let i = -1; i <= 1; i++) { P(i * 6 - 3, -8 + Math.abs(i) * 2, 7, 8, shade(c, -0.2)); P(i * 6 - 1, 0, 2, 4, '#5a3a22'); } break;
      case 'village': P(-8, -3, 7, 6, c); P(-9, -6, 9, 3, '#7a4a3a'); P(2, -2, 6, 5, c); P(1, -5, 8, 3, '#7a4a3a'); break;
      case 'lake': P(-9, 0, 18, 5, '#3a7ac0'); P(-4, -6 + Math.round((1 - rs) * 5), 8, 6, c); P(-2, -8 + Math.round((1 - rs) * 5), 4, 2, c); break;
      case 'desert': P(-9, 1, 18, 4, c); P(-6, -6, 3, 7, shade(c, -0.2)); P(1, -9, 4, 10, shade(c, -0.25)); P(2 + Math.round(Math.sin(t * 3)), -10, 1, 1, '#fff'); break;
      case 'canyon': P(-10, -6, 7, 11, shade(c, -0.3)); P(3, -6, 7, 11, shade(c, -0.3)); P(-1, -4, 2, 3, '#e0c0ff'); break;
      case 'city': P(-9, -4, 18, 9, c); for (let i = -8; i < 9; i += 4) P(i, -7, 2, 3, shade(c, -0.2)); P(-2, -12, 4, 8, shade(c, 0.1)); break;
      case 'vault': P(-6, -6, 12, 12, '#3a2a1a'); P(-4, -4, 8, 8, `rgba(255,243,176,${0.5 + 0.5 * Math.sin(t * 2)})`); break;
      default: P(-3, -3, 6, 6, c);
    }
  }
  pick(sx, sy) { return this.hit.find((h) => Math.hypot(h.x - sx, h.y - sy) < h.r) || null; }
}

// ───────────────────────── 지역 장면 (탐험 · 전투) ─────────────────────────
export class RegionScene {
  constructor() { this.parts = new Particles(); this.fx = []; this.floaters = []; this.shake = 0; this.playerAnim = { anim: 'idle', until: 0 }; this.enemyHurt = 0; this.walkIn = 0; }
  setRegion(id) { if (this.id !== id) { this.id = id; this.parts = new Particles(); } }
  castFx(spell, t) { this.fx.push({ fx: spell.fx || 'bolt', col: spell.col || '#fff', t0: t, dur: 0.7 }); }
  float(text, who, col, t) { this.floaters.push({ text, who, col, t0: t }); }
  playerDo(anim, t, dur = 0.5) { this.playerAnim = { anim, until: t + dur }; }
  render(ctx, W, H, t, dt, G) {
    const reg = REGIONS.find((r) => r.id === G.region);
    if (!reg) return;
    const rs = clamp((G.restore || 0) / 100, 0, 1);
    const z = Math.max(1, Math.floor(Math.min(W / 240, H / 150)));
    const w = Math.ceil(W / z), h = Math.ceil(H / z);
    ctx.save(); ctx.scale(z, z);
    if (this.shake > 0) { ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3)); this.shake -= dt; }
    const pal = reg.dark.map((d, i) => mix(d, reg.bright[i], rs));
    const sky0 = mix(reg.sky[0], reg.sky[1], rs);
    // 하늘
    for (let y = 0; y < h * 0.65; y += 2) { ctx.fillStyle = mix(shade(sky0, -0.25), shade(sky0, 0.25), y / (h * 0.65)); ctx.fillRect(0, y, w, 2); }
    if (rs > 0.3 && reg.bg !== 'vault') { ctx.fillStyle = `rgba(255,240,180,${(rs - 0.3)})`; ctx.fillRect(Math.round(w * 0.8), Math.round(h * 0.12), 10, 10); ctx.fillRect(Math.round(w * 0.8) - 2, Math.round(h * 0.12) + 2, 14, 6); }
    const ground = Math.round(h * 0.72);
    const P = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(ww), Math.ceil(hh)); };
    const far = pal[0], mid = pal[1], near = pal[2];
    // 먼 배경
    for (let x = 0; x < w; x += 4) { const hh = 18 + Math.sin(x * 0.03 + 1) * 8 + Math.sin(x * 0.11) * 3; P(x, ground - hh - 18, 4, hh + 20, shade(far, -0.1)); }
    switch (reg.bg) {
      case 'forest':
        for (let i = 0; i < 9; i++) { const x = (i * 37) % w, sw = Math.round(Math.sin(t * 1.5 + i) * 1.2), th = 30 + (i % 3) * 10; P(x + 4, ground - th, 4, th, shade(mid, -0.4)); P(x - 4 + sw, ground - th - 14, 20, 18, mid); P(x - 2 + sw, ground - th - 20, 16, 8, shade(mid, 0.12)); }
        for (let x = 0; x < w; x += 3) { const sw = Math.round(Math.sin(t * 2.4 + x * 0.3) * 2 * (0.3 + rs)); P(x + sw, ground - 10 - (x % 7), 1, 12 + (x % 7), x % 2 ? near : shade(near, -0.2)); }
        break;
      case 'village':
        for (let i = 0; i < 5; i++) { const x = 10 + i * 50, hh = 22 + (i % 2) * 6; P(x, ground - hh, 30, hh, shade(mid, -0.1)); P(x - 3, ground - hh - 10, 36, 10, shade(mid, -0.35)); P(x + 12, ground - 12, 6, 12, '#3a2a1a'); if (rs > 0.4) P(x + 4, ground - hh + 5, 5, 5, '#ffd88a'); }
        { const mx = w * 0.82; P(mx, ground - 40, 4, 40, shade(mid, -0.3)); const a = t * (rs > 0.3 ? 2 : 0.05); for (let k = 0; k < 4; k++) { const an = a + k * Math.PI / 2; for (let r2 = 0; r2 < 14; r2++) P(mx + 2 + Math.cos(an) * r2, ground - 40 + Math.sin(an) * r2, 2, 2, near); } }
        P(w * 0.45, ground - 10, 16, 10, '#6a6a72'); P(w * 0.45 + 2, ground - 8, 12, 4, rs > 0.5 ? '#3a7ac0' : '#2a3a4a');
        break;
      case 'lake': {
        const lw = ground - 8;
        P(0, lw, w, h - lw, shade(mid, -0.2));
        for (let i = 0; i < 30; i++) P((i * 29 + t * 8) % w, lw + 3 + (i * 7) % (h - lw - 4), 4, 1, shade(mid, 0.25));
        const domeY = lw - 6 - rs * 26;
        for (let y = 0; y < 22; y++) { const half = Math.sqrt(1 - Math.pow(1 - y / 22, 2)) * 26; P(w * 0.55 - half, domeY + y, half * 2, 1, y % 4 ? near : shade(near, -0.2)); }
        P(w * 0.55 - 2, domeY - 8, 4, 8, near);
        if (rs > 0.4) for (let i = 0; i < 12; i++) { const a = 0.5 + 0.5 * Math.sin(t * 2 + i); P((i * 53) % w, (i * 17) % (h * 0.4), 1, 1, `rgba(255,255,255,${a})`); }
        break;
      }
      case 'desert':
        for (let x = 0; x < w; x += 2) { const hh = 10 + Math.sin(x * 0.05 + 2) * 6; P(x, ground - hh, 2, hh, mid); }
        for (let i = 0; i < 6; i++) { const x = 20 + i * 40, hh = 20 + (i * 13) % 25; P(x, ground - hh - 8, 10, hh, shade(far, -0.3)); P(x + 3, ground - hh - 14, 4, 6, shade(far, -0.3)); }
        for (let i = 0; i < 10; i++) { const g = Math.sin(t * 3 + i * 2); if (g > 0.85) P((i * 41) % w, ground - 4 - (i * 5) % 12, 2, 2, '#ffffff'); }
        break;
      case 'canyon':
        P(0, 0, w * 0.28, ground + 10, shade(mid, -0.35)); P(w * 0.72, 0, w * 0.28, ground + 10, shade(mid, -0.35));
        for (let y = 10; y < ground; y += 9) { P(w * 0.28 - (y % 5), y, 5, 3, shade(mid, -0.15)); P(w * 0.72, y + 4, 5, 3, shade(mid, -0.15)); }
        for (let i = 0; i < 8; i++) { const gl = 0.4 + 0.6 * Math.abs(Math.sin(t + i)); P(i % 2 ? w * 0.25 : w * 0.73, 20 + i * 12, 4, 6, `rgba(224,192,255,${gl * (0.3 + rs * 0.7)})`); }
        { const r2 = (t * 20) % 60; ctx.strokeStyle = `rgba(200,170,255,${0.3 * (1 - r2 / 60)})`; ctx.beginPath(); ctx.ellipse(w / 2, ground - 20, r2, r2 * 0.4, 0, 0, 6.28); ctx.stroke(); }
        break;
      case 'city':
        for (let i = 0; i < 7; i++) { const x = i * 38 - 5, hh = 40 + (i % 3) * 14; P(x, ground - hh, 30, hh, shade(mid, -0.2)); for (let y = ground - hh + 6; y < ground - 4; y += 8) for (let k = 0; k < 4; k++) P(x + 3 + k * 7, y, 4, 5, rs > 0.5 ? '#ffe8a0' : shade(mid, -0.45)); P(x + 12, ground - hh - 8, 6, 8, shade(mid, -0.1)); }
        for (let i = 0; i < 3; i++) { const x = 40 + i * 80; P(x, ground - 18, 6, 18, near); P(x - 1, ground - 22, 8, 5, near); }
        break;
      case 'vault':
        for (let x = 0; x < w; x += 22) { P(x, 0, 20, ground, shade(mid, -0.3)); for (let y = 6; y < ground; y += 10) for (let k = 0; k < 5; k++) P(x + 2 + k * 3.5, y, 3, 8, k % 2 ? shade(near, -0.2) : shade(mid, 0.1)); }
        for (let i = 0; i < 10; i++) { const a = t * 0.5 + i; P(w / 2 + Math.cos(a) * 60, h * 0.35 + Math.sin(a * 1.3) * 25, 4, 3, '#f8f0d0'); }
        { const gr = ctx.createRadialGradient(w / 2, h * 0.35, 4, w / 2, h * 0.35, 70); gr.addColorStop(0, 'rgba(255,243,176,0.35)'); gr.addColorStop(1, 'rgba(255,243,176,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }
        break;
    }
    // 땅
    P(0, ground, w, h - ground, near);
    P(0, ground, w, 2, shade(near, 0.15));
    for (let x = 0; x < w; x += 5) P(x, ground + 4 + (x * 7) % 9, 2, 1, shade(near, -0.2));
    // 입자 (복원 전: 먼지, 후: 반딧불)
    if (!G.reduceMotion) { this.parts.update(rs > 0.5 ? 'fireflies' : 'dust', w, ground, dt, rs > 0.5 ? rs : 1 - rs); this.parts.draw(ctx); }

    // 인물 배치
    const px = Math.round(w * 0.22), py = ground - CHAR_H * 2 + 4;
    const ex = Math.round(w * 0.66), ey = ground - 48;
    this.pos = { px: px + CHAR_W, py: py + CHAR_H, ex: ex + 22, ey: ey + 22, z };
    let anim = G.battle ? 'idle' : 'walk';
    if (this.playerAnim.until > t) anim = this.playerAnim.anim;
    if (G.lost) anim = 'hit';
    const walkOff = G.battle ? 0 : 0;
    drawChar(ctx, px + walkOff, py, G.playerOpts, anim, t, 'right', 2);
    if (G.battle && G.enemy && G.enemy.hp > 0) {
      const big = G.enemy.big ? 1.8 : 1;
      drawMonster(ctx, G.enemy, ex - (big > 1 ? 18 : 0), ey - (big > 1 ? 34 : 0), t, 2, this.enemyHurt);
      if (this.enemyHurt > 0) this.enemyHurt -= dt;
      // 체력바
      const bw = 50, bx = ex - 4, by2 = ey - (big > 1 ? 44 : 12);
      P(bx - 1, by2 - 1, bw + 2, 5, '#120e18'); P(bx, by2, bw, 3, '#5a1a2a'); P(bx, by2, bw * clamp(G.enemy.hp / G.enemy.maxHp, 0, 1), 3, '#ff5a6a');
    } else if (G.battle && G.enemy && G.enemy.hp <= 0) {
      // 정화 연출: 빛 입자로 흩어짐
      for (let i = 0; i < 16; i++) { const a = i * 0.4 + t; P(ex + 20 + Math.cos(a) * (10 + (t * 30) % 30), ey + 20 - ((t * 25 + i * 3) % 40), 2, 2, '#fff3b0'); }
    }
    // 이펙트
    this.fx = this.fx.filter((f) => t - f.t0 < f.dur);
    for (const f of this.fx) drawFx(ctx, f.fx, f.col, (t - f.t0) / f.dur, px + 30, py + 26, ex + 20, ey + 22, 1);
    // 떠오르는 숫자
    ctx.font = '8px Galmuri9, monospace'; ctx.textAlign = 'center';
    this.floaters = this.floaters.filter((f) => t - f.t0 < 1.1);
    for (const f of this.floaters) {
      const k = (t - f.t0) / 1.1, fx = f.who === 'enemy' ? ex + 22 : px + 20, fy = (f.who === 'enemy' ? ey : py) - 4 - k * 18;
      ctx.fillStyle = '#120e18'; ctx.fillText(f.text, fx + 1, fy + 1); ctx.fillStyle = f.col; ctx.fillText(f.text, fx, fy);
    }
    ctx.restore();
    if (G.night > 0.02 && reg.bg !== 'vault') { ctx.fillStyle = `rgba(10,12,40,${G.night * 0.45})`; ctx.fillRect(0, 0, W, H); }
  }
}

// ───────────────────────── 공부방 장면 (타이머 화면) ─────────────────────────
export class StudyScene {
  constructor() { this.parts = new Particles(); }
  render(ctx, W, H, t, dt, G) {
    const z = Math.max(1, Math.floor(Math.min(W / 120, H / 80)));
    const w = Math.ceil(W / z), h = Math.ceil(H / z);
    ctx.save(); ctx.scale(z, z);
    const P = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(ww), Math.ceil(hh)); };
    // 벽 · 바닥
    P(0, 0, w, h, '#3a2e44'); for (let x = 0; x < w; x += 12) P(x, 0, 1, h * 0.7, '#33283d');
    P(0, h * 0.7, w, h * 0.3, '#5a4030'); for (let x = 0; x < w; x += 10) P(x, h * 0.7, 1, h * 0.3, '#4a3426');
    // 창문 (실제 시간대)
    const wx = w * 0.62, wy = h * 0.1, ww = w * 0.28, wh = h * 0.36;
    const skyC = G.night > 0.4 ? '#1a1f4a' : G.night > 0.05 ? '#d08a5a' : '#8fd0ff';
    P(wx - 2, wy - 2, ww + 4, wh + 4, '#2a1e18'); P(wx, wy, ww, wh, skyC);
    if (G.night > 0.4) for (let i = 0; i < 8; i++) P(wx + (i * 13) % ww, wy + (i * 7) % wh, 1, 1, `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 2 + i)})`);
    else P(wx + ww * 0.7, wy + wh * 0.2, 5, 5, '#fff3b0');
    P(wx + ww / 2 - 1, wy, 2, wh, '#2a1e18'); P(wx, wy + wh / 2 - 1, ww, 2, '#2a1e18');
    if (G.weather === 'rain') for (let i = 0; i < 10; i++) P(wx + ((i * 9 + t * 40) % ww), wy + ((i * 11 + t * 120) % wh), 1, 3, 'rgba(200,220,255,0.7)');
    if (G.weather === 'snow') for (let i = 0; i < 10; i++) P(wx + ((i * 9 + Math.sin(t + i) * 4) % ww), wy + ((i * 11 + t * 15) % wh), 1, 1, '#fff');
    // 책장
    P(w * 0.06, h * 0.12, w * 0.22, h * 0.58, '#4a3020');
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) P(w * 0.07 + k * w * 0.029, h * 0.14 + r * h * 0.14, w * 0.024, h * 0.11, ['#8a3a3a', '#3a5a8a', '#4a7a3a', '#c9a35a', '#6a3a8a'][(r * 3 + k) % 5]);
    // 책상 · 캐릭터
    const cx = w * 0.42, base = h * 0.72;
    const running = G.running;
    drawChar(ctx, cx - CHAR_W, base - CHAR_H * 2 + 6, G.playerOpts, running ? 'study' : 'idle', t, 'down', 2);
    P(cx - 34, base - 12, 68, 6, '#7a4a2a'); P(cx - 34, base - 12, 68, 1, '#9a6a3a'); P(cx - 30, base - 6, 4, 14, '#5a3420'); P(cx + 26, base - 6, 4, 14, '#5a3420');
    // 펼친 책 (넘기는 애니메이션)
    P(cx - 14, base - 16, 28, 5, '#f0e8d0'); P(cx - 1, base - 16, 2, 5, '#c8b890');
    if (running) { const k = (t * 0.5) % 1; if (k < 0.3) P(cx + 1 - k * 40, base - 18 - Math.sin(k / 0.3 * Math.PI) * 4, 12, 3, '#fff8e0'); for (let i = 0; i < 3; i++) P(cx - 12, base - 15 + i * 1.3, 8 - i, 0.6, '#8a7a6a'); }
    // 등잔 (책상 위)
    const fl = 0.6 + 0.4 * Math.sin(t * 7);
    P(cx + 18, base - 20, 8, 8, '#c9a35a'); P(cx + 20, base - 19, 4, 6, `rgba(255,${200 + fl * 40},120,1)`);
    const gr = ctx.createRadialGradient(cx + 22, base - 17, 2, cx + 22, base - 17, 40 + (running ? G.progress * 30 : 0));
    gr.addColorStop(0, `rgba(255,220,130,${0.35 * fl})`); gr.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    // 공부 중: 빛 입자가 올라간다
    if (running && !G.reduceMotion) {
      for (let i = 0; i < 10; i++) { const k = ((t * 0.3 + i / 10) % 1); P(cx - 10 + ((i * 7) % 20), base - 18 - k * 40, 1, 1, `rgba(255,243,176,${1 - k})`); }
    }
    ctx.restore();
    if (G.night > 0.02) { ctx.fillStyle = `rgba(10,12,40,${G.night * 0.35})`; ctx.fillRect(0, 0, W, H); }
  }
}
export { hashStr };
