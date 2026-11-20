// 스토리 데이터 해독. 원고는 스포일러 보호를 위해 인코딩된 팩으로만 배포된다.
// 게임은 현재 진행 중인 장까지의 내용만 화면에 보여 준다.
import { STORY_PACK, STORY_KEY } from './story.pack.js';

let cache = null;
export function story() {
  if (cache) return cache;
  const bin = atob(STORY_PACK);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ STORY_KEY.charCodeAt(i % STORY_KEY.length) ^ (i * 7 & 255);
  cache = JSON.parse(new TextDecoder().decode(bytes));
  return cache;
}
export const chapter = (n) => story().chapters.find((c) => c.id === n) || null;
export const lastChapterId = () => story().chapters[story().chapters.length - 1].id;
