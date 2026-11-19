// 핵심 문장 및 논리 관계 시각화: 문장 노드를 세로로 배치하고 왼쪽에 화살표 호(arc)로 관계를 그린다.
import { esc } from '../ui.js';

export const RELATION_META = {
  cause_effect: { label: '원인 → 결과', color: '#d9822b' },
  claim_evidence: { label: '주장 → 근거', color: '#2f4bb8' },
  problem_solution: { label: '문제 → 해결', color: '#2c7a4f' },
  general_example: { label: '일반 → 사례', color: '#0e8a9a' },
  old_new: { label: '기존 → 새 관점', color: '#7a3fb0' },
  claim_counter: { label: '주장 → 반론', color: '#b4322f' },
  contrast: { label: '대조', color: '#c2410c' },
  elaboration: { label: '부연·상술', color: '#6b7280' },
  premise_conclusion: { label: '전제 → 결론', color: '#4338ca' },
  restatement: { label: '재진술·요약', color: '#a16207' },
};

export const STAGE_COLORS = ['#2f4bb8', '#0e8a9a', '#7a3fb0', '#d9822b', '#2c7a4f', '#b4322f', '#a16207', '#4338ca'];

export function stageOf(structure, index) {
  const i = (structure || []).findIndex((st) => (st.sentences || []).includes(index));
  return i;
}

export function diagramHtml(p, ov) {
  const roles = new Map((ov.sentence_roles || []).map((r) => [r.index, r]));
  const keys = new Set((ov.key_sentences || []).map((k) => k.index));
  const used = new Set((ov.relations || []).map((r) => r.type));
  const legend = Object.entries(RELATION_META)
    .filter(([k]) => used.has(k))
    .map(([, m]) => `<span><i style="background:${m.color}"></i>${esc(m.label)}</span>`)
    .join('');
  const nodes = p.sentences.map((s) => {
    const r = roles.get(s.index);
    const st = stageOf(ov.structure, s.index);
    const color = STAGE_COLORS[(st < 0 ? 0 : st) % STAGE_COLORS.length];
    return `<div class="dnode ${keys.has(s.index) ? 'key' : ''}" data-node="${s.index}" tabindex="0" role="button" aria-label="S${s.index} 관계 강조">
      <span class="dn-num">S${s.index}</span>
      <div class="dn-gist">${r?.role ? `<span class="dn-role" style="background:${color}">${esc(r.role)}</span>` : ''}${esc(r?.gist || s.text)}${keys.has(s.index) ? '<span class="dn-key">★ 핵심</span>' : ''}</div>
      <div class="dn-en">${esc(s.text)}</div>
    </div>`;
  }).join('');
  return `
    <div class="diagram-legend">${legend || '<span class="muted">표시할 관계가 없습니다.</span>'}<span class="muted">· 노드를 누르면 관련 관계만 강조되고 원문이 펼쳐집니다.</span></div>
    <div class="diagram" id="diagram">
      <svg class="arcs" aria-hidden="true"></svg>
      ${nodes}
    </div>`;
}

/** DOM 에 삽입된 뒤 호를 그린다. 크기가 바뀌면 다시 그린다. */
export function drawArcs(root, relations) {
  const diagram = root.querySelector('#diagram');
  if (!diagram) return;
  const svg = diagram.querySelector('svg.arcs');
  const W = svg.getBoundingClientRect().width || 132;
  const base = diagram.getBoundingClientRect();
  const pos = new Map();
  diagram.querySelectorAll('.dnode').forEach((n) => {
    const r = n.getBoundingClientRect();
    pos.set(Number(n.dataset.node), r.top - base.top + Math.min(r.height / 2, 18));
  });
  const rels = (relations || [])
    .map((r, i) => ({ ...r, i, y1: pos.get(r.from), y2: pos.get(r.to) }))
    .filter((r) => r.y1 != null && r.y2 != null)
    .sort((a, b) => Math.abs(a.from - a.to) - Math.abs(b.from - b.to));
  // 겹치지 않도록 레인 배정
  const lanes = [];
  for (const r of rels) {
    const lo = Math.min(r.y1, r.y2); const hi = Math.max(r.y1, r.y2);
    let lane = 0;
    while ((lanes[lane] || []).some(([a, b]) => !(hi < a - 4 || lo > b + 4))) lane++;
    (lanes[lane] ||= []).push([lo, hi]);
    r.lane = lane;
  }
  const maxLane = Math.max(0, ...rels.map((r) => r.lane));
  const step = Math.min(24, (W - 26) / (maxLane + 1));
  const defs = Object.entries(RELATION_META).map(([k, m]) =>
    `<marker id="arr-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="${m.color}"/></marker>`).join('');
  const placed = [];
  const paths = rels.map((r) => {
    const m = RELATION_META[r.type] || RELATION_META.elaboration;
    const x0 = W - 4;
    const x = Math.max(8, W - 22 - r.lane * step);
    const y1 = r.y1; const y2 = r.y2;
    let midY = (y1 + y2) / 2;
    // 다른 라벨과 겹치면 위아래로 비켜 놓는다
    const lo = Math.min(y1, y2) + 10; const hi = Math.max(y1, y2) - 10;
    for (let tries = 0; tries < 8 && placed.some((q) => Math.abs(q.x - x) < 32 && Math.abs(q.y - midY) < 18); tries++) {
      const alt = (y1 + y2) / 2 + (tries % 2 ? -1 : 1) * 18 * Math.ceil((tries + 1) / 2);
      if (alt > lo && alt < hi) midY = alt;
    }
    placed.push({ x, y: midY });
    const d = `M ${x0} ${y1} C ${x} ${y1}, ${x} ${y1}, ${x} ${y1 + Math.sign(y2 - y1) * 10} L ${x} ${y2 - Math.sign(y2 - y1) * 10} C ${x} ${y2}, ${x} ${y2}, ${x0} ${y2}`;
    const short = m.label.split(' → ')[0].slice(0, 4);
    return `<g data-rel="${r.i}" data-from="${r.from}" data-to="${r.to}">
      <title>S${r.from} → S${r.to}: ${esc(m.label)} — ${esc(r.explanation)}</title>
      <path d="${d}" stroke="${m.color}" marker-end="url(#arr-${r.type})"/>
      <rect x="${x - 15}" y="${midY - 8}" width="30" height="16" rx="4" fill="var(--bg-elev)" stroke="${m.color}"/>
      <text class="arc-label" x="${x}" y="${midY + 3.5}" text-anchor="middle" fill="${m.color}">${esc(short)}</text>
    </g>`;
  }).join('');
  svg.innerHTML = `<defs>${defs}</defs>${paths}`;
}

export function focusDiagram(root, { node, rel }) {
  const diagram = root.querySelector('#diagram');
  if (!diagram) return;
  const gs = [...diagram.querySelectorAll('svg.arcs g')];
  const nodes = [...diagram.querySelectorAll('.dnode')];
  gs.forEach((g) => g.classList.remove('hl'));
  nodes.forEach((n) => n.classList.remove('hl'));
  if (node == null && rel == null) { diagram.classList.remove('focus'); return; }
  diagram.classList.add('focus');
  const hlNodes = new Set();
  for (const g of gs) {
    const f = Number(g.dataset.from); const t = Number(g.dataset.to);
    if ((rel != null && Number(g.dataset.rel) === rel) || (node != null && (f === node || t === node))) {
      g.classList.add('hl');
      hlNodes.add(f); hlNodes.add(t);
    }
  }
  if (node != null) hlNodes.add(node);
  nodes.forEach((n) => { if (hlNodes.has(Number(n.dataset.node))) n.classList.add('hl'); });
}
