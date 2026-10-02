#!/usr/bin/env node
// ⑤ 완료 관문 — 선언된 검사를 돌리고 이번 실행이 쓴 결과 파일로 판정한다. 설계안.
// ⛔ correctness 게이트: 하나라도 실패하거나 검사가 0개면 exit 1.

import { exec, execFile } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadConfig, cli } from '../lib/config.mjs';
import { judgeJunitXml } from '../lib/evidence.mjs';

const status = (err) => (err ? (Number.isInteger(err.code) ? err.code : 1) : 0);

function shell(cmd, cwd) {
  return new Promise((done) =>
    exec(cmd, { cwd, maxBuffer: 1 << 28 }, (err, stdout, stderr) =>
      done({ code: status(err), tail: `${stdout}${stderr}`.slice(-1500) })));
}

function git(args, cwd) {
  return new Promise((done) => execFile('git', args, { cwd }, (err, stdout) => done({ code: status(err), out: String(stdout) })));
}

// 결과 XML → mtime. 실행 전후를 비교해 이번 실행이 쓴 파일만 증거로 친다
function xmlTimes(path) {
  if (!existsSync(path)) return new Map();
  if (statSync(path).isFile()) return new Map([[path, statSync(path).mtimeMs]]);
  return new Map(
    readdirSync(path, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.xml'))
      .map((f) => [join(path, f), statSync(join(path, f)).mtimeMs]),
  );
}

async function check(c, root) {
  if (c.kind === 'exit-code') {
    const r = await shell(c.cmd, root);
    return { ok: r.code === 0, reason: `종료코드 ${r.code}`, tail: r.tail };
  }
  if (c.kind === 'junit-xml') {
    const before = xmlTimes(c.evidence);
    const r = await shell(c.cmd, root);
    const after = xmlTimes(c.evidence);
    const fresh = [...after].filter(([f, t]) => before.get(f) !== t).map(([f]) => readFileSync(f, 'utf8'));
    if (fresh.length === 0 && after.size > 0) {
      return { ok: false, reason: `결과 XML 이 이번 실행에서 갱신되지 않았다 (종료코드 ${r.code}) — 이전 결과를 증거로 쓰지 않는다`, tail: r.tail };
    }
    const j = judgeJunitXml(fresh);
    return r.code === 0 ? { ...j, tail: r.tail } : { ok: false, reason: `종료코드 ${r.code} · ${j.reason}`, tail: r.tail };
  }
  // file-unchanged — 산출물을 다시 만들었을 때 git 이 깨끗하면 계약이 안 바뀐 것이다
  const r = await shell(c.cmd, root);
  if (r.code !== 0) return { ok: false, reason: `생성 명령 종료코드 ${r.code}`, tail: r.tail };
  const g = await git(['status', '--porcelain', '--', relative(root, c.evidence)], root);
  if (g.code !== 0) return { ok: false, reason: `git status 실패 (종료코드 ${g.code}) — git 저장소인가` };
  if (g.out.trim() === '') return { ok: true, reason: '산출물이 그대로다' };
  return { ok: false, reason: '산출물이 바뀌었다 — 바뀐 계약을 커밋에 포함해야 한다' };
}

export async function runChecks(cfg) {
  const out = [];
  for (const c of cfg.checks) out.push({ id: c.id, ...(await check(c, cfg.root)) });
  return out;
}

cli(import.meta.url, async () => {
  const results = await runChecks(loadConfig(process.argv[2] ?? process.cwd()));
  if (results.length === 0) throw new Error('선언된 검사가 없다 — .harness/harness.json 의 checks 가 비어 있다');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '⛔'} ${r.id} — ${r.reason}`);
    if (!r.ok && r.tail?.trim()) {
      console.log(r.tail.trim().split(/\r?\n/).slice(-15).map((l) => `    ${l}`).join('\n'));
    }
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
});
