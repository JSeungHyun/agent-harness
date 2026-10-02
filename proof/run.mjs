#!/usr/bin/env node
// 효과 입증 — 합성 대상에 하네스를 얹고 「하네스 없이」와 「있을 때」를 같은 조건에서 잰다. 설계안.
// README §실측 의 원천이다. 값이 아니라 이 명령을 남긴다.
//   node proof/run.mjs            결정론 실측 — LLM 호출 없음
//   node proof/run.mjs --claude   + 새 세션 실측 (claude -p --model haiku, 토큰을 쓴다)
// 예상과 다른 행이 하나라도 있으면 exit 1.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judgeJunitXml } from '../lib/evidence.mjs';
import { hash12 } from '../lib/mdtable.mjs';

const HARNESS = fileURLToPath(new URL('..', import.meta.url));
// tmpdir() 는 Windows 에서 8.3 단축 경로(IDEAPA~1)일 수 있다 — 대상은 긴 경로로 만들고, 단축 경로는 따로 잰다
const LONG_TMP = realpathSync.native(tmpdir());
const SHORT_TMP = tmpdir() !== LONG_TMP ? tmpdir() : null;
const WITH_CLAUDE = process.argv.includes('--claude');
const STATE = { decisions: 'docs/harness/decisions.md', lessons: 'docs/harness/lessons.md' };
const BUILD = [{ id: '빌드', cmd: 'node -e "0"', kind: 'exit-code' }];
const rows = [];
const row = (exp, condition, observed, expected) => rows.push({ exp, condition, observed, expected });

function sh(cmd, cwd, input = '') {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', input, maxBuffer: 1 << 26 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
function put(dir, rel, body) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
}
const first = (out, re) => (out.match(re) ?? [''])[0].trim();
const line1 = (out) => out.trim().split(/\r?\n/)[0].slice(0, 60);
const tool = (name) => `node .harness/tools/${name}.mjs`;
const scratch = (name, base = LONG_TMP) => mkdtempSync(join(base, `proof-${name}-`));
const name = (id) => id.split('@')[0];

// 이 PC 의 플러그인 설치 기록 전체 — 같은 id 가 범위·프로젝트마다 한 줄씩 나온다
function plugins(dir) {
  const out = sh('claude plugin list --json', dir).out;
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
}

// SETUP 2~4단계와 같은 배치. rulesAt 으로 규칙 위치를 바꿔 09-28 방식과 견준다
function install(dir, checks, rulesAt = '.claude/rules/harness.md') {
  sh('git init -q', dir);
  mkdirSync(join(dir, '.harness'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
  for (const d of ['lib', 'tools', 'policy']) cpSync(join(HARNESS, d), join(dir, '.harness', d), { recursive: true });
  cpSync(join(HARNESS, 'templates', 'skills', 'final-gate'), join(dir, '.claude', 'skills', 'final-gate'), { recursive: true });
  for (const f of ['decisions.md', 'lessons.md']) put(dir, `docs/harness/${f}`, readFileSync(join(HARNESS, 'templates', 'state', f), 'utf8'));
  const rules = readFileSync(join(HARNESS, 'templates', 'rules', 'harness.md'), 'utf8')
    .replaceAll('<decisions>', STATE.decisions)
    .replaceAll('<lessons>', STATE.lessons);
  put(dir, rulesAt, rulesAt === 'AGENTS.md' ? `# 에이전트 지시\n\n${rules}` : rules);
  put(dir, '.harness/harness.json', { state: STATE, checks });
  return dir;
}

// P1 — 거짓 완료: 같은 대상에서 npm test 의 종료코드와 verify 를 견준다
function p1() {
  const dir = scratch('node');
  const junit = 'node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results/junit.xml "test/*.test.mjs"';
  const pkg = (test) => ({
    name: 'proof-node',
    private: true,
    type: 'module',
    scripts: { pretest: "node -e \"require('fs').mkdirSync('test-results',{recursive:true})\"", test },
  });
  put(dir, 'package.json', pkg(junit));
  put(dir, 'src/sum.mjs', 'export const sum = (a, b) => a + b;\n');
  install(dir, [{ id: '테스트', cmd: 'npm test', kind: 'junit-xml', evidence: 'test-results' }]);

  const head = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from '../src/sum.mjs';\n";
  const stage = (condition, body, npmCode, verifyCode) => {
    put(dir, 'test/sum.test.mjs', body);
    const npm = sh('npm test', dir);
    const v = sh(tool('verify'), dir);
    row('P1 거짓 완료', condition,
      `npm test exit ${npm.code} (${first(npm.out, /ℹ pass \d+/) || '요약 없음'}) → verify exit ${v.code} · ${first(v.out, /(?<=— ).*/)}`,
      npm.code === npmCode && v.code === verifyCode);
  };
  stage('테스트 파일에 test() 가 없다', "import { sum } from '../src/sum.mjs';\n// 테스트를 쓰다 말았다\n", 0, 1);
  stage('실패하는 테스트', `${head}test('더한다', () => assert.equal(sum(1, 2), 4));\n`, 1, 1);
  stage('고쳤다', `${head}test('더한다', () => assert.equal(sum(1, 2), 3));\n`, 0, 0);

  // 테스트 명령이 아무것도 안 돌게 바뀌었다 — 직전의 통과 XML 은 남아 있다
  put(dir, 'package.json', pkg('node -e "0"'));
  const npm = sh('npm test', dir);
  const naive = judgeJunitXml([readFileSync(join(dir, 'test-results', 'junit.xml'), 'utf8')]);
  const v = sh(tool('verify'), dir);
  row('P1 거짓 완료', '테스트 명령이 아무것도 안 돌게 바뀜 (직전 통과 XML 이 남음)',
    `npm test exit ${npm.code} · 남은 XML 만 읽으면 ${naive.ok ? '통과' : '실패'} → verify exit ${v.code} · ${first(v.out, /(?<=— ).*/)}`,
    npm.code === 0 && naive.ok && v.code === 1);
}

// P1b — CLI 판별: 판별이 틀리면 verify 가 아무것도 안 돌고 exit 0 이다
function p1b() {
  const dir = scratch('cli');
  const lib = JSON.stringify(new URL('../lib/config.mjs', import.meta.url).href);
  put(dir, 'old.mjs', "if (import.meta.url === `file://${process.argv[1]}`) { console.log('검사를 돌렸다'); process.exit(1); }\n");
  put(dir, 'new.mjs', `import { cli } from ${lib};\ncli(import.meta.url, () => { console.log('검사를 돌렸다'); process.exit(1); });\n`);
  const old = sh('node old.mjs', dir);
  const now = sh('node new.mjs', dir);
  const silent = old.code === 0 && !old.out.trim();
  row('P1b CLI 판별', `09-28 계획의 판별식 (${process.platform})`, `exit ${old.code} · ${silent ? '아무것도 안 돌았다' : '돌았다'}`,
    process.platform === 'win32' ? silent : true);
  row('P1b CLI 판별', 'lib/config.mjs 의 cli()', `exit ${now.code} · ${now.out.includes('돌렸다') ? '돌았다' : '아무것도 안 돌았다'}`, now.code === 1);
}

// P5 — ④ 도구를 설치된 배치에서 CLI 로 돌린다
function p5() {
  const dir = install(scratch('state'), BUILD);
  const ago = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  const decisions = readFileSync(join(dir, STATE.decisions), 'utf8')
    .replace('YYYY-MM-DD', ago)
    .replace('# 1. 답변이 필요합니다', '# 1. 답변이 필요합니다\n\n## Q1 · 결제 실패 시 재시도를 3회로 가정했다\n');
  put(dir, STATE.decisions, decisions);
  const dc = sh(tool('decision-check'), dir);
  row('P5 가정', '20일 묵은 열린 질문 1건', `${first(dc.out, /열린 결정[^\n]*/)} · ${dc.out.includes('⚠️') ? '경고' : '경고 없음'} · exit ${dc.code}`,
    dc.code === 0 && dc.out.includes('⚠️'));

  const diary = sh(tool('lesson-append'), dir, JSON.stringify({ symptom: '배포가 실패했다', cause: '', category: '검증 부족' }));
  row('P5 교훈', '근본 원인 없이 적기', `exit ${diary.code} · ${line1(diary.out)}`, diary.code === 1);
  for (const symptom of ['치환이 조용히 아무것도 안 바꿨다', '생성 스크립트가 빈 파일을 썼는데 통과했다']) {
    sh(tool('lesson-append'), dir, JSON.stringify({ symptom, cause: '실패를 알리지 않는 명령의 결과를 확인하지 않았다', category: '검증 부족' }));
  }
  const pr = sh(tool('lesson-promote'), dir);
  row('P5 교훈', '같은 분류 2회 · 막는 것 없음', first(pr.out, /검증 부족 ×\d+[^\n]*/) || line1(pr.out), pr.out.includes('검증 부족 ×2'));

  put(dir, 'src/engine.mjs', 'export const v = 1;\n');
  const h = hash12(Buffer.from('export const v = 1;\n'));
  put(dir, 'docs/harness/current.md', `| 파일 | 상태 | 해시 |\n|---|---|---|\n| \`src/engine.mjs\` | 분석완료 | \`${h}\` |\n| \`src/gone.mjs\` | 분석완료 | \`abc123abc123\` |\n`);
  put(dir, '.harness/harness.json', { state: { ...STATE, current: 'docs/harness/current.md' }, checks: BUILD });
  put(dir, 'src/engine.mjs', 'export const v = 2;\n');
  const st = sh(tool('state-check'), dir);
  row('P5 대장', '분석 뒤 원본이 바뀜 + 가리키는 파일 소멸', `${first(st.out, /대장 [^\n]*/)} · exit ${st.code}`,
    st.code === 1 && st.out.includes('↻ src/engine.mjs'));
}

// P4 — 설정 병합과 플러그인 중복 (SETUP 5단계)
function p4(dir) {
  put(dir, '.claude/settings.json', { permissions: { allow: ['Bash(npm test)'] }, hooks: { Stop: [] } });
  sh(tool('policy-apply'), dir);
  const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  const applied = s.env?.PONYTAIL_DEFAULT_MODE === 'off' && s.enabledPlugins?.['ponytail@ponytail'] === true
    && s.permissions.allow.includes('Bash(node .harness/tools/verify.mjs)');
  const kept = s.permissions.allow.includes('Bash(npm test)') && Array.isArray(s.hooks?.Stop);
  row('P4 설정 병합', '기존 settings(권한 1 · 훅) 위에 정책 반영',
    `정책 ${applied ? '반영' : '빠짐'} · 기존 권한·훅 ${kept ? '보존' : '사라짐'}`, applied && kept);
  if (!WITH_CLAUDE) return;

  const before = plugins(dir);
  const local = {};
  for (const id of Object.keys(s.enabledPlugins)) {
    if (before.some((p) => p.enabled && name(p.id) === name(id) && p.id !== id)) local[id] = false;
  }
  if (Object.keys(local).length) put(dir, '.claude/settings.local.json', { enabledPlugins: local });
  const after = plugins(dir);
  // 같은 id 가 여러 줄인 것은 설치 기록일 뿐이다 — 중복 로드는 같은 이름의 id 가 둘 이상일 때다
  const ids = (n) => new Set(after.filter((p) => p.enabled && name(p.id) === n).map((p) => p.id)).size;
  row('P4 플러그인', `중복 처리 뒤 (로컬에서 끈 정책 id: ${Object.keys(local).join(', ') || '없음'})`,
    `활성 id — superpowers ${ids('superpowers')}개 · ponytail ${ids('ponytail')}개`, ids('superpowers') === 1 && ids('ponytail') === 1);
}

// 도구를 전부 끈 새 세션 — 지시 파일만 보고 답한다
const ask = (dir, q) =>
  sh(`claude -p --model haiku --tools "" --no-session-persistence ${JSON.stringify(`도구를 쓰지 마라. ${q} 주어진 지시에 없으면 정확히 '모름'이라고만 답하라.`)}`, dir).out.trim();

// P2 — 규칙 로드: CLAUDE.md 유무 × 규칙 위치
function p2() {
  const claudeMd = { 'CLAUDE.md': '# 프로젝트\n\n빌드는 `npm run build`.\n' };
  const cases = [
    ['CLAUDE.md 있음 · 규칙을 AGENTS.md 에 (09-28 방식)', install(scratch('a'), BUILD, 'AGENTS.md'), claudeMd, false],
    ['CLAUDE.md 없음 · 규칙을 AGENTS.md 에 (09-28 방식)', install(scratch('d'), BUILD, 'AGENTS.md'), {}, true],
    ['CLAUDE.md 있음 · 규칙을 .claude/rules/ 에 (A안)', install(scratch('b'), BUILD), claudeMd, true],
    ['AGENTS.md 만 있음 · 규칙을 .claude/rules/ 에 (A안)', install(scratch('c'), BUILD), { 'AGENTS.md': '# 에이전트 지시\n\n테스트는 `npm test`.\n' }, true],
  ];
  // 실측(2.1.287, Windows): 8.3 단축 경로로 연 세션은 AGENTS.md 를 읽지 않는다. .claude/rules/ 는 읽힌다
  if (SHORT_TMP) {
    cases.push(
      ['CLAUDE.md 없음 · 규칙을 AGENTS.md 에 · 8.3 단축 경로로 연 세션', install(scratch('e', SHORT_TMP), BUILD, 'AGENTS.md'), {}, false],
      ['CLAUDE.md 있음 · 규칙을 .claude/rules/ 에 · 8.3 단축 경로로 연 세션', install(scratch('f', SHORT_TMP), BUILD), claudeMd, true],
    );
  }
  for (const [condition, dir, files, expectLoaded] of cases) {
    for (const [rel, body] of Object.entries(files)) put(dir, rel, body);
    const answer = ask(dir, '이 저장소에서 작업 완료를 주장하기 전에 반드시 돌려야 하는 명령은 정확히 무엇인가?');
    const loaded = answer.includes('verify.mjs');
    row('P2 규칙 로드', condition, loaded ? '완료 명령 → verify.mjs 를 답함' : `완료 명령 → 「${line1(answer)}」`, loaded === expectLoaded);
  }
  const b = cases[2][1];
  const neg = ask(b, '이 저장소의 배포 승인권자는 누구인가?');
  row('P2 규칙 로드', 'A안 대상 · 음성 대조 (지시에 없는 사실)', `「${line1(neg)}」`, neg.includes('모름'));
  return { withRules: b, control: cases[3][1] };
}

// P3 — ponytail 끄기: 훅 출력은 stream-json 에 그대로 나온다
function p3(withPolicy, control) {
  const active = (dir) =>
    (sh('claude -p --model haiku --tools "" --no-session-persistence --output-format stream-json --verbose "ok"', dir).out.match(/PONYTAIL MODE ACTIVE/g) ?? []).length;
  const records = () => plugins(withPolicy).filter((p) => p.scope === 'project' && p.id === 'ponytail@ponytail').length;
  const before = records();
  const off = active(withPolicy); // 먼저 — off 세션은 사용자 전역 모드 플래그를 지운다
  const after = records();
  const on = active(control); // 대조군이 다시 켠다
  row('P3 ponytail', '정책 반영 (env PONYTAIL_DEFAULT_MODE=off)', `훅의 PONYTAIL MODE ACTIVE ${off}회`, off === 0);
  row('P3 ponytail', '정책 미반영 (대조군)', `훅의 PONYTAIL MODE ACTIVE ${on}회`, on > 0);

  // 사용자 범위로 이미 설치된 플러그인을 프로젝트가 선언하면 세션을 열 때 프로젝트 범위 기록이 생긴다 — 실측이 남긴 것은 되돌린다
  sh('claude plugin uninstall ponytail@ponytail --scope project --keep-data', withPolicy);
  const cleaned = records();
  row('P4 플러그인', '프로젝트가 선언 + 이 PC 에 사용자 범위로 이미 설치 → 세션을 연다',
    `프로젝트 범위 설치 기록 ${before} → ${after} (실측 뒤 정리 ${cleaned})`, after === before + 1 && cleaned === before);
}

p1();
p1b();
p5();
if (WITH_CLAUDE) {
  const { withRules, control } = p2();
  p4(withRules);
  p3(withRules, control);
} else {
  p4(install(scratch('policy'), BUILD));
}

const version = (cmd) => line1(sh(cmd, HARNESS).out);
console.log('| | |\n|---|---|');
console.log(`| 일시 | ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC |`);
console.log(`| 환경 | ${process.platform} · Node ${process.version}${WITH_CLAUDE ? ` · Claude Code ${version('claude --version').split(' ')[0]}` : ''} |`);
console.log(`| 명령 | \`node proof/run.mjs${WITH_CLAUDE ? ' --claude' : ''}\` |`);
console.log(`| 예상과 다른 행 | ${rows.filter((r) => !r.expected).length}개 / ${rows.length}행 |\n`);
console.log('| 실험 | 조건 | 관측 | 예상대로 |\n|---|---|---|---|');
for (const r of rows) console.log(`| ${r.exp} | ${r.condition} | ${r.observed.replace(/\|/g, '\\|')} | ${r.expected ? '✅' : '⛔'} |`);
process.exit(rows.every((r) => r.expected) ? 0 : 1);
