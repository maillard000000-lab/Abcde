// 여러 화면에서 함께 쓰는 상수와 계산 함수

export const LEVEL_LABELS = {
  middle: '중학생',
  high1: '고1',
  high2: '고2',
  high3: '고3·수능',
};

export const QUESTION_TYPES = ['객관식', '빈칸 추론', '어법 선택', '어휘 선택', '순서 배열', '문장 삽입', '서술형', '영작'];

export function wordKey(w) {
  return String(w || '').trim().toLowerCase();
}

// 간격 반복 복습: 복습할 때마다 1 → 3 → 7 → 14 → 30일 뒤를 다음 복습일로 권장한다.
const INTERVALS = [1, 3, 7, 14, 30];

export function reviewInfo(p) {
  const log = p.review?.log || [];
  const last = log[log.length - 1] || '';
  let next = '';
  if (last) {
    const d = new Date(last);
    d.setDate(d.getDate() + INTERVALS[Math.min(log.length - 1, INTERVALS.length - 1)]);
    next = d.toISOString();
  }
  const scheduledDue = next ? Date.now() >= new Date(next).getTime() : false;
  return { count: log.length, last, next, due: !!p.review?.flagged || scheduledDue, flagged: !!p.review?.flagged };
}

export function studyState(p) {
  if (p.completed) return 'done';
  if (p.analysis) return 'learning';
  return 'new';
}
