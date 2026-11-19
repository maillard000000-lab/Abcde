// 클라우드 동기화 저장소: 동기화 코드(비밀값)의 해시를 파일 이름으로 써서 서버 디스크에 학습 데이터를 보관한다.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){4}$/;

export function newSyncCode() {
  const bytes = randomBytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s.match(/.{4}/g).join('-');
}

export function isValidCode(code) {
  return typeof code === 'string' && CODE_RE.test(code);
}

export class SyncStore {
  constructor(dir) {
    this.dir = dir;
    this.locks = new Map();
  }

  fileFor(code) {
    const h = createHash('sha256').update(code).digest('hex');
    return path.join(this.dir, `${h}.json`);
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  async get(code) {
    try {
      const raw = await readFile(this.fileFor(code), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  // 낙관적 동시성 제어: baseVersion 이 현재 버전과 다르면 충돌로 처리한다.
  async put(code, library, baseVersion) {
    const prev = this.locks.get(code) || Promise.resolve();
    let release;
    const lock = new Promise((r) => { release = r; });
    const chained = prev.then(() => lock);
    this.locks.set(code, chained);
    await prev;
    try {
      const current = await this.get(code);
      const currentVersion = current?.version || 0;
      if (current && baseVersion !== currentVersion) {
        return { conflict: true, version: currentVersion };
      }
      const record = { version: currentVersion + 1, updatedAt: new Date().toISOString(), library };
      const file = this.fileFor(code);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(record));
      await rename(tmp, file);
      return { conflict: false, version: record.version, updatedAt: record.updatedAt };
    } finally {
      release();
      if (this.locks.get(code) === chained) this.locks.delete(code);
    }
  }
}
