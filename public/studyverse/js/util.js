// 공용 유틸리티
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 요소 생성 헬퍼: h('div.cls#id', {attrs}, ...children) */
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
export function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? `${hh}:` : '') + `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
export function fmtMin(min) {
  min = Math.floor(min);
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}
export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekKey(t = Date.now()) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일 시작
  return dayKey(d.getTime());
}
export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

/** 시드 고정 난수 (mulberry32) */
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function uid(prefix = 'u') {
  const r = crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Math.random() * 2 ** 32];
  return `${prefix}_${Date.now().toString(36)}${(r[0] >>> 0).toString(36)}${(r[1] >>> 0).toString(36).slice(0, 4)}`;
}

// 색상
export function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb2hex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export const shade = (c, amt) => (amt < 0 ? mix(c, '#000000', -amt) : mix(c, '#ffffff', amt));
export function grey(c, t = 1) {
  const [r, g, b] = hex2rgb(c);
  const y = r * 0.3 + g * 0.59 + b * 0.11;
  return rgb2hex(lerp(r, y, t), lerp(g, y, t), lerp(b, y, t));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 간단한 효과음 (WebAudio, 외부 파일 없음) */
let audioCtx = null;
export function beep(kind = 'click', enabled = true) {
  if (!enabled) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const tones = {
      click: [[660, 0.04]], ok: [[523, 0.07], [784, 0.1]], level: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.18]],
      hit: [[180, 0.06]], cast: [[880, 0.05], [1320, 0.08]], bell: [[988, 0.25], [1319, 0.35]], error: [[220, 0.12]],
    }[kind] || [[440, 0.05]];
    let t = audioCtx.currentTime;
    for (const [f, d] of tones) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'hit' ? 'square' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d * 0.9;
    }
  } catch { /* 소리 없음 */ }
}
