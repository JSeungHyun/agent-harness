import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';
import { target, repoFile } from './scene.mjs';

const at = (rel) => new URL(`../${rel}`, import.meta.url);
const SHIPPED = [
  'SETUP.md',
  'README.md',
  'templates/rules/harness.md',
  'templates/skills/final-gate/SKILL.md',
  'templates/state/decisions.md',
  'templates/state/lessons.md',
  'templates/state/current.md',
];

test('⛔ 배포 문서가 가리키는 도구가 실재한다 — 깨진 참조는 설치된 규칙을 거짓말로 만든다', () => {
  for (const rel of SHIPPED) {
    for (const [, name] of repoFile(rel).matchAll(/\.harness\/tools\/([\w-]+\.mjs)/g)) {
      assert.ok(existsSync(at(`tools/${name}`)), `${rel} → tools/${name}`);
    }
  }
});

test('⛔ SETUP 이 복사하라는 것이 실재한다', () => {
  for (const [, rel] of repoFile('SETUP.md').matchAll(/<하네스>\/((?:templates|lib|tools|policy)[\w./-]*)/g)) {
    assert.ok(existsSync(at(rel)), `SETUP.md → ${rel}`);
  }
});

test('규칙 파일이 완료 명령과 마지막 관문을 지시하고, SETUP 이 채울 자리를 둔다', () => {
  const rules = repoFile('templates/rules/harness.md');
  assert.match(rules, /node \.harness\/tools\/verify\.mjs/);
  assert.match(rules, /마지막 태스크는 `final-gate`/);
  assert.match(rules, /<decisions>/);
  assert.match(rules, /<lessons>/);
});

test('final-gate 스킬의 이름이 디렉터리 이름과 같다 — 다르면 스킬이 안 잡힌다', () => {
  assert.match(repoFile('templates/skills/final-gate/SKILL.md'), /^---\r?\nname: final-gate\r?\n/);
});

test('설치 템플릿 harness.json 이 로더를 통과한다', () => {
  const cfg = loadConfig(target(null, { '.harness/harness.json': repoFile('templates/harness.json') }));
  assert.equal(cfg.checks.length, 1);
  assert.ok(cfg.state.decisions && cfg.state.lessons);
});
