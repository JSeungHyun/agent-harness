import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// 테스트용 임시 대상 저장소. harness 객체를 주면 .harness/harness.json 을 쓴다.
export function target(harness, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  if (harness) put(dir, '.harness/harness.json', JSON.stringify(harness));
  for (const [rel, body] of Object.entries(files)) put(dir, rel, body);
  return dir;
}

export function put(dir, rel, body) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

export const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const repoFile = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
