import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeSettings, POLICY, readJson } from '../tools/policy-apply.mjs';
import { target } from './scene.mjs';

const APPLY = fileURLToPath(new URL('../tools/policy-apply.mjs', import.meta.url));
const P = {
  _note: '주석',
  permissions: { allow: ['Read', 'Bash(node .harness/tools/verify.mjs)'], deny: ['Bash(git push *)'], ask: ['Bash(*--force*)'] },
  env: { PONYTAIL_DEFAULT_MODE: 'off' },
  enabledPlugins: { 'superpowers@claude-plugins-official': true, 'ponytail@ponytail': true },
  extraKnownMarketplaces: { ponytail: { source: { source: 'github', repo: 'DietrichGebert/ponytail' } } },
};

test('⭐ 권한은 합집합이다 — 대상의 기존 규칙을 지우지 않는다', () => {
  const out = mergeSettings({ permissions: { allow: ['Bash(npm test)', 'Read'] } }, P);
  assert.deepEqual(out.permissions.allow, ['Bash(npm test)', 'Read', 'Bash(node .harness/tools/verify.mjs)']);
  assert.deepEqual(out.permissions.deny, ['Bash(git push *)']);
});

test('⭐ 정책 밖의 키를 보존한다', () => {
  const out = mergeSettings(
    { permissions: { defaultMode: 'acceptEdits' }, hooks: { Stop: [{ x: 1 }] }, env: { FOO: '1' }, enabledPlugins: { 'other@m': true } },
    P,
  );
  assert.equal(out.permissions.defaultMode, 'acceptEdits');
  assert.deepEqual(out.hooks, { Stop: [{ x: 1 }] });
  assert.deepEqual(out.env, { FOO: '1', PONYTAIL_DEFAULT_MODE: 'off' });
  assert.equal(out.enabledPlugins['other@m'], true);
  assert.equal(out.enabledPlugins['ponytail@ponytail'], true);
});

test('정책의 env 값이 대상의 같은 키를 이긴다', () => {
  assert.equal(mergeSettings({ env: { PONYTAIL_DEFAULT_MODE: 'full' } }, P).env.PONYTAIL_DEFAULT_MODE, 'off');
});

test('⛔ 원본을 변형하지 않고, _ 로 시작하는 주석 키를 옮기지 않는다', () => {
  const src = { permissions: { allow: ['Read'] } };
  const out = mergeSettings(src, P);
  assert.deepEqual(src, { permissions: { allow: ['Read'] } });
  assert.equal(out._note, undefined);
});

test('⭐ 배포 정책이 superpowers·ponytail 을 켜고 ponytail 모드를 끈다', () => {
  const p = readJson(POLICY);
  assert.equal(p.env.PONYTAIL_DEFAULT_MODE, 'off');
  assert.equal(p.enabledPlugins['superpowers@claude-plugins-official'], true);
  assert.equal(p.enabledPlugins['ponytail@ponytail'], true);
  assert.equal(p.extraKnownMarketplaces.ponytail.source.repo, 'DietrichGebert/ponytail');
  assert.ok(p.permissions.allow.includes('Bash(node .harness/tools/verify.mjs)'));
});

test('⛔ 배포 정책의 allow 에는 인자로 쓰기·실행에 닿는 명령이 없다 — 자동 승인이 거부 목록을 우회한다', () => {
  // find -exec · sort -o/--compress-program · git diff/log/show --output · node .harness/tools/* 의 ../ 경로
  const escapes = readJson(POLICY).permissions.allow.filter(
    (r) => /^Bash\((find|sort|git (diff|log|show))\b/.test(r) || /^Bash\(node [^)]*\*\)$/.test(r),
  );
  assert.deepEqual(escapes, []);
});

test('⭐ CLI: 기존 설정을 보존하며 반영하고, 다시 돌려도 같다 — 이탈은 재실행으로 복구한다', () => {
  const dir = target(null, { '.claude/settings.json': JSON.stringify({ hooks: { Stop: [] }, permissions: { allow: ['Bash(npm test)'] } }) });
  const path = join(dir, '.claude', 'settings.json');
  assert.equal(spawnSync(process.execPath, [APPLY, dir]).status, 0);
  const once = readFileSync(path, 'utf8');
  const s = JSON.parse(once);
  assert.deepEqual(s.hooks, { Stop: [] });
  assert.ok(s.permissions.allow.includes('Bash(npm test)'));
  assert.equal(s.env.PONYTAIL_DEFAULT_MODE, 'off');
  assert.equal(spawnSync(process.execPath, [APPLY, dir]).status, 0);
  assert.equal(readFileSync(path, 'utf8'), once);
});

test('⛔ CLI: 대상 설정이 깨진 JSON 이면 덮어쓰지 않고 실패한다', () => {
  const dir = target(null, { '.claude/settings.json': '{ 깨짐' });
  const r = spawnSync(process.execPath, [APPLY, dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /읽지 못했다/);
  assert.equal(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'), '{ 깨짐');
});
