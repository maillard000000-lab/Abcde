// 경고: 이 스크립트는 스토리 전체(결말 포함)를 출력합니다. 개발용입니다.
// 사용법: node tools/unpack-story.mjs > story.json
import { STORY_PACK, STORY_KEY } from '../public/studyverse/js/story.pack.js';
const buf = Buffer.from(STORY_PACK, 'base64');
for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ STORY_KEY.charCodeAt(i % STORY_KEY.length) ^ (i * 7 & 255);
process.stdout.write(JSON.stringify(JSON.parse(buf.toString('utf8')), null, 2));
