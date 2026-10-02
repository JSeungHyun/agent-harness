import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { runChecks } from '../tools/verify.mjs';
import { target, put, fixture } from './scene.mjs';

const VERIFY = fileURLToPath(new URL('../tools/verify.mjs', import.meta.url));

// src 를 dest 로 새로 쓰고 code 로 끝나는 명령 — 셸을 가리지 않게 node 로 쓴다
const write = (src, dest, code = 0) =>
  `node -e "const f=require('fs'),p=require('path');f.mkdirSync(p.dirname('${dest}'),{recursive:true});f.writeFileSync('${dest}',f.readFileSync('${src}'));process.exit(${code})"`;
const exit = (code) => `node -e "process.exit(${code})"`;
const one = async (dir) => (await runChecks(loadConfig(dir)))[0];

test('exit-code 검사는 종료코드로 판정한다', async () => {
  const ok = await one(target({ checks: [{ id: 'ok', cmd: exit(0), kind: 'exit-code' }] }));
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, '종료코드 0');
  const no = await one(target({ checks: [{ id: 'no', cmd: exit(3), kind: 'exit-code' }] }));
  assert.equal(no.ok, false);
  assert.equal(no.reason, '종료코드 3');
});

test('⭐ 명령이 exit 0 이어도 결과 XML 에 실행된 테스트가 없으면 실패다', async () => {
  const dir = target(
    { checks: [{ id: 't', cmd: write('src/stub.xml', 'results/junit.xml'), kind: 'junit-xml', evidence: 'results' }] },
    { 'src/stub.xml': fixture('junit-node-stub.xml') },
  );
  const r = await one(dir);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실행된 테스트가 0개/);
});

test('결과 XML 이 정상이면 통과다', async () => {
  const dir = target(
    { checks: [{ id: 't', cmd: write('src/pass.xml', 'results/junit.xml'), kind: 'junit-xml', evidence: 'results' }] },
    { 'src/pass.xml': fixture('junit-gradle-pass.xml') },
  );
  const r = await one(dir);
  assert.equal(r.ok, true);
  assert.equal(r.reason, '테스트 3 · 실패 0');
});

test('⭐ 이번 실행이 쓰지 않은 결과 XML 은 증거가 아니다', async () => {
  const dir = target(
    { checks: [{ id: 't', cmd: exit(0), kind: 'junit-xml', evidence: 'results' }] },
    { 'results/old.xml': fixture('junit-gradle-pass.xml') },
  );
  const r = await one(dir);
  assert.equal(r.ok, false);
  assert.match(r.reason, /갱신되지 않았다/);
});

test('결과 XML 이 정상이어도 명령이 실패했으면 실패다', async () => {
  const dir = target(
    { checks: [{ id: 't', cmd: write('src/pass.xml', 'results/junit.xml', 1), kind: 'junit-xml', evidence: 'results' }] },
    { 'src/pass.xml': fixture('junit-gradle-pass.xml') },
  );
  const r = await one(dir);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '종료코드 1 · 테스트 3 · 실패 0');
});

test('evidence 가 파일 하나여도 읽는다', async () => {
  const dir = target(
    { checks: [{ id: 't', cmd: write('src/pass.xml', 'junit.xml'), kind: 'junit-xml', evidence: 'junit.xml' }] },
    { 'src/pass.xml': fixture('junit-gradle-pass.xml') },
  );
  assert.equal((await one(dir)).ok, true);
});

// 산출물을 커밋한 git 저장소. harness.json 은 커밋 뒤에 쓴다
function repo(files) {
  const dir = target(null, files);
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-qm', 'init');
  put(dir, '.harness/harness.json', JSON.stringify({
    checks: [{ id: 'api', cmd: write('gen/api.json', 'api.json'), kind: 'file-unchanged', evidence: 'api.json' }],
  }));
  return dir;
}

test('file-unchanged: 다시 만든 산출물이 그대로면 통과, 바뀌면 실패다', async () => {
  const same = await one(repo({ 'api.json': '{"v":1}\n', 'gen/api.json': '{"v":1}\n' }));
  assert.equal(same.ok, true);
  const changed = await one(repo({ 'api.json': '{"v":1}\n', 'gen/api.json': '{"v":2}\n' }));
  assert.equal(changed.ok, false);
  assert.match(changed.reason, /바뀌었다/);
});

test('⛔ file-unchanged: 커밋된 적 없는 산출물은 그대로가 아니다', async () => {
  const r = await one(repo({ 'readme.md': 'x\n', 'gen/api.json': '{"v":1}\n' }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /바뀌었다/);
});

test('⛔ CLI: 검사가 0개면 exit 1 이다 — 「검사가 없어 전부 통과」는 거짓 신호다', () => {
  const r = spawnSync(process.execPath, [VERIFY, target({ checks: [] })], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /선언된 검사가 없다/);
});

test('CLI: 실패한 검사를 이유와 함께 보이고 exit 1 이다', () => {
  const dir = target({ checks: [{ id: '빌드', cmd: exit(0), kind: 'exit-code' }, { id: '테스트', cmd: exit(2), kind: 'exit-code' }] });
  const r = spawnSync(process.execPath, [VERIFY, dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✅ 빌드 — 종료코드 0/);
  assert.match(r.stdout, /⛔ 테스트 — 종료코드 2/);
});

test('CLI: 전부 통과면 exit 0 이다', () => {
  const r = spawnSync(process.execPath, [VERIFY, target({ checks: [{ id: 'ok', cmd: exit(0), kind: 'exit-code' }] })], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});
