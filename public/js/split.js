// 영어 지문 문장 분리기 (브라우저와 서버가 같은 코드를 사용한다)
// 서버는 이 결과를 기준으로 문장 번호를 매기므로, 문장 누락 없이 모든 문장을 분석할 수 있다.

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'cf', 'e.g', 'i.e',
  'u.s', 'u.k', 'u.n', 'a.m', 'p.m', 'no', 'nos', 'vol', 'fig', 'figs', 'inc', 'ltd',
  'co', 'corp', 'approx', 'dept', 'est', 'gen', 'gov', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'ph.d', 'b.c', 'a.d', 'ed', 'eds', 'pp',
]);

const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}', '»']);
const OPENERS = new Set(['"', "'", '“', '‘', '(', '[', '«']);

function isUpperStart(ch) {
  return /[A-Z0-9À-Þ]/.test(ch);
}

function wordBefore(text, idx) {
  // idx 는 마침표 위치. 마침표 앞의 토큰(점 포함 약어 고려)을 돌려준다.
  let j = idx - 1;
  while (j >= 0 && /[A-Za-z.]/.test(text[j])) j--;
  return text.slice(j + 1, idx).toLowerCase();
}

function splitParagraphIntoSentences(para) {
  const out = [];
  let start = 0;
  const n = para.length;
  for (let i = 0; i < n; i++) {
    const ch = para[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    // 연속된 종결 부호(...?!) 묶기
    let end = i;
    while (end + 1 < n && /[.!?…]/.test(para[end + 1])) end++;
    // 닫는 따옴표/괄호 포함
    while (end + 1 < n && CLOSERS.has(para[end + 1])) end++;
    // 다음은 공백이어야 함
    if (end + 1 < n && !/\s/.test(para[end + 1])) { i = end; continue; }
    // 공백 뒤 다음 글자
    let k = end + 1;
    while (k < n && /\s/.test(para[k])) k++;
    if (k >= n) { i = end; continue; } // 문단 끝은 아래에서 처리
    let next = para[k];
    let kk = k;
    while (kk < n && OPENERS.has(para[kk])) kk++;
    if (kk < n) next = para[kk];
    if (!isUpperStart(next)) { i = end; continue; }
    if (ch === '.' && end === i) {
      const w = wordBefore(para, i);
      if (ABBREVIATIONS.has(w)) { i = end; continue; }
      if (/^[a-z]$/i.test(w) && /[A-Z]/.test(para[i - 1] || '')) { i = end; continue; } // 이니셜 J. K.
    }
    const s = para.slice(start, end + 1).trim();
    if (s) out.push(s);
    start = end + 1;
    i = end;
  }
  const rest = para.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** 입력 텍스트를 문단 정보를 가진 문장 목록으로 나눈다. */
export function splitPassage(raw) {
  const text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
  if (!text) return [];
  // 문단 구분 규칙
  // 1) 빈 줄이 있으면 빈 줄만 문단 구분으로 본다(줄바꿈은 공백).
  // 2) 빈 줄이 없고 모든 줄이 종결 부호로 끝나면 각 줄을 문단으로 본다.
  // 3) 그 외(복사 과정에서 생긴 줄바꿈)는 하나의 문단으로 합친다.
  const lines = text.split('\n').map((l) => l.trim());
  let paragraphs;
  if (/\n\s*\n/.test(text)) {
    paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  } else if (lines.length > 1 && lines.every((l) => /[.!?…]["'”’)\]]*$/.test(l))) {
    paragraphs = lines.filter(Boolean);
  } else {
    paragraphs = [lines.filter(Boolean).join(' ')];
  }

  const result = [];
  paragraphs.forEach((p, pi) => {
    for (const s of splitParagraphIntoSentences(p)) {
      result.push({ index: result.length + 1, text: s, paragraph: pi + 1 });
    }
  });
  return result;
}

export function countWords(raw) {
  const m = String(raw || '').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return m ? m.length : 0;
}
