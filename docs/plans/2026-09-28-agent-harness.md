# agent-harness 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 세션 자율 루프가 멈추지 않으면서 증명하고 상태를 남기는 골격을, 다른 프로젝트에 이식 가능한 의존성 0 도구 모음으로 만든다.

**Architecture:** 모든 도구는 대상 저장소 루트의 `harness.json` **하나만** 읽어 경로를 얻는다 — 경로를 하드코딩하지 않으므로 대상이 이미 쓰는 파일 위치를 옮기지 않아도 된다. 공용 로직은 `lib/`(설정 로더 · 마크다운 표 파서 · 증거 판정기)에 두고 `tools/*.mjs` 는 얇은 CLI 로 둔다. 검증된 축(⑤증거 → ④상태)부터 만들고 각 단계에서 ICFR 에 실제로 걸어본다.

**Tech Stack:** Node v26.5.0 (ESM `.mjs`) · `node:test` + `node:assert/strict` · **외부 의존성 0** (`package.json` 의 `dependencies` 는 영구히 비어 있다)

**Spec:** `docs/2026-09-28-design.md` (커밋 `0f0e051`)

## Global Constraints

설계서 §6 에서 그대로 옮긴다. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **의존성 0** — Node 내장 모듈만. `npm install <무엇이든>` 은 이 레포에서 금지다
- **Node 20+** — 도구는 `.mjs` ESM 이다
- **자동 로드되는 층을 늘리지 않는다** — 모든 도구는 호출해야 돈다. `AGENTS.md` 외에 세션마다 주입되는 파일을 만들지 않는다
- **값이 아니라 명령을 적는다** — 한 명령으로 재생성되는 값을 파일에 저장하지 않는다
- **검증 안 된 것을 적지 않는다** — 모든 산출물의 문서 머리에 `검증됨` 또는 `설계안` 딱지를 붙인다
- **저장소를 하나로** — 계획서가 정본이고 스키마는 추출본이다. 같은 사실을 두 파일에 두지 않는다
- **자동 추출하지 않는다** — LESSONS·STATE 는 사람 판단을 거쳐 기록한다. 훅으로 긁지 않는다
- **검사는 드물게 울려야 신호다** — 늘 exit 1 이면 사람이 무시한다. 진행도는 보고하고, correctness 만 exit 1
- **게이트는 correctness 에만 건다** — `referenceAudit` 을 `pre-push` 에 안 넣은 ICFR 의 판단을 따른다
- **경로를 하드코딩하지 않는다** — `harness.json` 만 읽는다
- **커밋** — `feat:`/`fix:`/`docs:` + **한글** 본문. 제목은 무엇을, 본문은 **왜**. `Co-Authored-By` 를 넣지 않는다 (`context-graph` 규약)

## 파일 구조

| 경로 | 책임 |
|---|---|
| `harness.schema.json` | `harness.json` 의 규격. 사람이 읽는 문서 겸 로더의 검증 근거 |
| `lib/config.mjs` | `harness.json` 로더. **모든 도구의 유일한 경로 원천** |
| `lib/mdtable.mjs` | 마크다운 표 파서. `state-check` · `decision-check` · `task-extract` 공용 |
| `lib/evidence.mjs` | 증거 판정기. `junit-xml` · `exit-code` · `file-unchanged` |
| `checks/verify.mjs` | ⑤ 완료 관문 러너 — `harness.json` 의 `checks` 를 돌리고 **결과 파일을 읽어** 판정 |
| `checks/regression-cases/` | 재현 케이스 보관 규약 |
| `policy/permissions.json` | ③ 권한 정책 단일 원천 |
| `tools/*.mjs` | 얇은 CLI 10개. 로직은 `lib/` 에 |
| `templates/` | 대상에 복사되는 것 — `harness.json` · `AGENTS.snippet.md` · `plan.skeleton.md` · `state/*` · `skills/*` |
| `test/*.test.mjs` | `node --test` |
| `test/fixtures/` | 실제 ICFR 산출물에서 뜬 고정 표본 |
| `SETUP.md` | ⭐ Claude 에게 주는 설치 지시서 |
| `README.md` | 무엇인가 · 정직한 값 · ⛔도입하지 말아야 할 때 · 실측 |

**단계 경계** — Phase 1 끝에서 ⑤증거가 ICFR 에서 돌고, Phase 2 끝에서 ④상태가 돈다. 각 Phase 끝은 멈춰도 되는 지점이다.

---

# Phase 1 — ⑤ 증거 (가장 검증된 축)

### Task 1: `harness.json` 규격과 설정 로더

**Files:**
- Create: `package.json`
- Create: `harness.schema.json`
- Create: `lib/config.mjs`
- Test: `test/config.test.mjs`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `loadConfig(root: string) → { root, map, plan, state: {current?, decisions?, lessons?}, checks: Array<{id, cmd, kind, evidence?}> }` — 모든 경로는 `root` 기준 **절대경로**로 변환되어 나온다. `EVIDENCE_KINDS: string[]` 도 export 한다.

- [ ] **Step 1: `package.json` 을 만든다**

```json
{
  "name": "agent-harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test test/" },
  "dependencies": {}
}
```

⛔ `dependencies` 는 영구히 비어 있다. 무언가 필요해지면 그것은 Node 내장으로 되는지 먼저 본다.

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`test/config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';

function fixture(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(join(dir, 'harness.json'), JSON.stringify(obj));
  return dir;
}

test('경로를 대상 루트 기준 절대경로로 돌려준다', () => {
  const dir = fixture({
    map: 'AGENTS.md',
    state: { current: 'docs/reference-audit.md', lessons: 'docs/lessons.md' },
    checks: [],
  });
  const cfg = loadConfig(dir);
  assert.equal(cfg.map, join(dir, 'AGENTS.md'));
  assert.equal(cfg.state.current, join(dir, 'docs/reference-audit.md'));
  assert.equal(cfg.state.lessons, join(dir, 'docs/lessons.md'));
});

test('harness.json 이 없으면 경로와 다음 행동을 알려주며 실패한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  assert.throws(() => loadConfig(dir), /harness\.json 이 없다/);
  assert.throws(() => loadConfig(dir), /SETUP\.md/);
});

test('모르는 검사 종류는 거부하고 쓸 수 있는 것을 알려준다', () => {
  const dir = fixture({ map: 'AGENTS.md', state: {}, checks: [{ id: 'x', cmd: 'true', kind: '초능력' }] });
  assert.throws(() => loadConfig(dir), /알 수 없는 검사 종류: 초능력/);
  assert.throws(() => loadConfig(dir), /junit-xml/);
});

test('선언되지 않은 상태 파일은 undefined 로 남는다', () => {
  const dir = fixture({ map: 'AGENTS.md', state: { lessons: 'docs/lessons.md' }, checks: [] });
  const cfg = loadConfig(dir);
  assert.equal(cfg.state.current, undefined);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/config.test.mjs`
Expected: FAIL — `Cannot find module '../lib/config.mjs'`

⛔ **컴파일/모듈 오류가 아닌 단언 실패를 원한다면 다음 단계 이후 다시 본다.** 지금은 모듈 부재가 맞는 실패다.

- [ ] **Step 4: `harness.schema.json` 을 작성한다**

```json
{
  "_note": "대상 저장소 루트의 harness.json 규격. 모든 도구가 이 파일 하나만 읽는다.",
  "map": "규칙 지도 파일. 보통 AGENTS.md",
  "plan": "구현 계획서. 대상 밖이면 상대경로로 (예: ../docs/plans/x.md)",
  "state": {
    "current": "STATE — 진행 상태 대장 (선택)",
    "decisions": "DECISIONS — 묻지 않고 넘어간 가정 (선택)",
    "lessons": "LESSONS — 반복 실패 (선택)"
  },
  "checks": [
    {
      "id": "검사 이름",
      "cmd": "돌릴 명령",
      "kind": "junit-xml | exit-code | file-unchanged",
      "evidence": "판정할 결과 파일 글로브. exit-code 면 생략"
    }
  ]
}
```

- [ ] **Step 5: `lib/config.mjs` 를 작성한다**

```js
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const EVIDENCE_KINDS = ['junit-xml', 'exit-code', 'file-unchanged'];

export function loadConfig(root) {
  const path = join(root, 'harness.json');
  if (!existsSync(path)) {
    throw new Error(`harness.json 이 없다: ${path}\n  SETUP.md 를 먼저 돌린다.`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`harness.json 을 읽지 못했다: ${path}\n  ${e.message}`);
  }
  for (const c of raw.checks ?? []) {
    if (!EVIDENCE_KINDS.includes(c.kind)) {
      throw new Error(
        `알 수 없는 검사 종류: ${c.kind} (검사 '${c.id}')\n  쓸 수 있는 것: ${EVIDENCE_KINDS.join(' · ')}`,
      );
    }
  }
  const abs = (p) => (p ? resolve(root, p) : undefined);
  return {
    root,
    map: abs(raw.map),
    plan: abs(raw.plan),
    state: {
      current: abs(raw.state?.current),
      decisions: abs(raw.state?.decisions),
      lessons: abs(raw.state?.lessons),
    },
    checks: (raw.checks ?? []).map((c) => ({ ...c, evidence: abs(c.evidence) })),
  };
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test test/config.test.mjs`
Expected: PASS — `# pass 4` · `# fail 0`

⛔ **`# pass` 숫자를 눈으로 확인한다.** `node --test` 는 테스트가 0개여도 종료코드 0 이다 — 이 레포가 만들려는 바로 그 함정이다.

- [ ] **Step 7: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add package.json harness.schema.json lib/config.mjs test/config.test.mjs
git commit -m "feat: harness.json 규격과 설정 로더

모든 도구가 경로를 하드코딩하지 않고 이 로더 하나만 거치게 한다. 대상이
이미 쓰는 파일 위치(ICFR 의 docs/reference-audit.md · 루트 Need-Check.md)를
옮기지 않아도 되는 것이 요점이다 — 옮기면 AGENTS.md 의 기존 참조가 깨진다.

모르는 검사 종류를 로더에서 거부한다. verify 가 돌다가 알 수 없는 kind 를
만나 조용히 건너뛰면 '검사가 돌았다'는 거짓 신호가 된다."
```

---

### Task 2: 증거 판정기 — `BUILD SUCCESSFUL` 을 믿지 않는다

**Files:**
- Create: `lib/evidence.mjs`
- Create: `test/fixtures/junit-pass.xml`, `test/fixtures/junit-empty.xml`, `test/fixtures/junit-fail.xml`
- Test: `test/evidence.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `judgeJunitXml(contents: string[]) → { ok: boolean, reason: string }` — `contents` 는 XML 파일 **본문 문자열의 배열**이다 (파일 읽기는 호출자 몫이라 테스트가 파일시스템에 안 묶인다).

- [ ] **Step 1: 고정 표본을 만든다**

`test/fixtures/junit-pass.xml` — ICFR 실제 산출물에서 뜬 형태:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.weaverloft.icfr.domain.admin.api.AdminTest" tests="10" skipped="0" failures="0" errors="0" timestamp="2026-09-28T01:49:47.669Z" hostname="mac" time="4.458">
  <properties/>
</testsuite>
```

`test/fixtures/junit-empty.xml` — ⭐ **이 레포의 존재 이유.** 빌드는 성공인데 테스트가 0개다:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.weaverloft.icfr.EmptySuite" tests="0" skipped="0" failures="0" errors="0" timestamp="2026-09-28T01:49:47.669Z" hostname="mac" time="0.001">
  <properties/>
</testsuite>
```

`test/fixtures/junit-fail.xml` — 속성 순서가 다른 것도 섞는다:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite errors="1" failures="2" name="com.weaverloft.icfr.domain.auth.api.AuthControllerTest" skipped="0" tests="9" time="1.128" timestamp="2026-09-28T01:49:52.128Z" hostname="mac">
  <properties/>
</testsuite>
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`test/evidence.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeJunitXml } from '../lib/evidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

test('테스트가 있고 실패가 없으면 통과다', () => {
  const r = judgeJunitXml([fx('junit-pass.xml')]);
  assert.equal(r.ok, true);
  assert.match(r.reason, /테스트 10/);
});

test('⭐ 테스트 0개는 성공이 아니다', () => {
  const r = judgeJunitXml([fx('junit-empty.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /테스트가 0개/);
});

test('속성 순서가 달라도 실패를 읽는다', () => {
  const r = judgeJunitXml([fx('junit-fail.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실패 2/);
  assert.match(r.reason, /오류 1/);
});

test('여러 XML 을 합산한다 — 하나라도 실패면 실패다', () => {
  const r = judgeJunitXml([fx('junit-pass.xml'), fx('junit-fail.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /테스트 19/);
});

test('⭐ XML 이 한 개도 없으면 실패다 — 테스트가 안 돈 것이다', () => {
  const r = judgeJunitXml([]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /한 개도/);
});

test('XML 은 있는데 testsuite 태그가 없으면 실패다', () => {
  const r = judgeJunitXml(['<?xml version="1.0"?><other/>']);
  assert.equal(r.ok, false);
  assert.match(r.reason, /한 개도/);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/evidence.test.mjs`
Expected: FAIL — `Cannot find module '../lib/evidence.mjs'`

- [ ] **Step 4: `lib/evidence.mjs` 를 작성한다**

```js
// 증거 판정. ⛔ 종료코드를 믿지 않는다 — 결과 파일을 읽어 판정한다.
//
// gradle 의 BUILD SUCCESSFUL 도, node --test 의 종료코드 0 도 테스트가
// 0개일 때 성공이다. ICFR 의 AGENTS.md §3 이 이 함정을 사고 후에 규칙으로
// 올렸고, 여기서는 기계가 판정한다.

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="(\\d+)"`));
  return m ? Number(m[1]) : 0;
}

export function judgeJunitXml(contents) {
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let suites = 0;

  for (const text of contents) {
    const m = text.match(/<testsuite\b[^>]*>/);
    if (!m) continue;
    suites += 1;
    tests += attr(m[0], 'tests');
    failures += attr(m[0], 'failures');
    errors += attr(m[0], 'errors');
  }

  if (suites === 0) {
    return { ok: false, reason: '결과 XML 을 한 개도 찾지 못했다 — 테스트가 돌지 않았다' };
  }
  if (tests === 0) {
    return {
      ok: false,
      reason: `테스트가 0개다 (XML ${suites}개) — 종료코드는 이것을 통과시킨다`,
    };
  }
  if (failures + errors > 0) {
    return { ok: false, reason: `테스트 ${tests} · 실패 ${failures} · 오류 ${errors}` };
  }
  return { ok: true, reason: `테스트 ${tests} · 실패 0 · 오류 0` };
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/evidence.test.mjs`
Expected: PASS — `# pass 6` · `# fail 0`

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add lib/evidence.mjs test/evidence.test.mjs test/fixtures/
git commit -m "feat: 증거 판정기 — 종료코드가 아니라 결과 파일을 읽는다

⭐ 핵심은 tests=0 을 실패로 판정하는 것이다. gradle 의 BUILD SUCCESSFUL 도
node --test 의 종료코드 0 도 테스트가 한 개도 없을 때 성공이다. ICFR 은
이것을 사고로 겪고 AGENTS.md §3 에 '결과 XML 을 읽어 눈으로 확인한다'를
넣었는데, 사람의 규율 대신 기계가 판정하게 한다.

XML 이 한 개도 없는 경우도 실패다 — 테스트가 아예 안 돈 것이고, 이때
종료코드만 보면 통과로 보인다.

속성 순서에 의존하지 않는다. gradle 이 내는 XML 의 속성 순서가 스위트마다
다르다 (실측: tests 가 앞선 것과 errors 가 앞선 것이 섞여 있다)."
```

---

### Task 3: 완료 관문 러너 `verify.mjs`

**Files:**
- Create: `checks/verify.mjs`
- Create: `templates/skills/verify-tests/SKILL.md`
- Test: `test/verify.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1) · `judgeJunitXml` (Task 2)
- Produces: `runChecks(cfg) → Array<{ id, ok, reason }>` · CLI `node checks/verify.mjs [대상경로]` — 전부 통과면 exit 0, 하나라도 실패면 **exit 1**

⛔ 여기는 correctness 게이트다. Global Constraints 의 「검사는 드물게 울려야 신호다」가 적용되지 않는 유일한 자리다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/verify.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { runChecks } from '../checks/verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function project(harness, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(join(dir, 'harness.json'), JSON.stringify(harness));
  for (const [rel, src] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    cpSync(join(here, 'fixtures', src), join(dir, rel));
  }
  return dir;
}

test('exit-code 검사는 명령의 종료코드로 판정한다', async () => {
  const dir = project({ map: 'AGENTS.md', state: {}, checks: [{ id: 'ok', cmd: 'true', kind: 'exit-code' }] });
  const [r] = await runChecks(loadConfig(dir));
  assert.equal(r.ok, true);
  assert.equal(r.id, 'ok');
});

test('exit-code 검사가 실패하면 실패다', async () => {
  const dir = project({ map: 'AGENTS.md', state: {}, checks: [{ id: 'no', cmd: 'false', kind: 'exit-code' }] });
  const [r] = await runChecks(loadConfig(dir));
  assert.equal(r.ok, false);
});

test('⭐ junit-xml 검사는 명령이 성공해도 결과 파일로 판정한다', async () => {
  const dir = project(
    { map: 'AGENTS.md', state: {}, checks: [{ id: 't', cmd: 'true', kind: 'junit-xml', evidence: 'results' }] },
    { 'results/TEST-Empty.xml': 'junit-empty.xml' },
  );
  const [r] = await runChecks(loadConfig(dir));
  assert.equal(r.ok, false, '명령은 exit 0 이지만 테스트가 0개다');
  assert.match(r.reason, /테스트가 0개/);
});

test('junit-xml 검사가 정상 결과면 통과다', async () => {
  const dir = project(
    { map: 'AGENTS.md', state: {}, checks: [{ id: 't', cmd: 'true', kind: 'junit-xml', evidence: 'results' }] },
    { 'results/TEST-Ok.xml': 'junit-pass.xml' },
  );
  const [r] = await runChecks(loadConfig(dir));
  assert.equal(r.ok, true);
});

test('검사가 없으면 빈 배열이다 — 조용히 통과시키지 않는다', async () => {
  const dir = project({ map: 'AGENTS.md', state: {}, checks: [] });
  const rs = await runChecks(loadConfig(dir));
  assert.deepEqual(rs, []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/verify.test.mjs`
Expected: FAIL — `Cannot find module '../checks/verify.mjs'`

- [ ] **Step 3: `checks/verify.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ⑤ 완료 관문. 검증됨 — ICFR 의 junit-verify · specCoverage · openapiSnapshot 에서 나왔다.
//
// ⛔ 이것은 correctness 게이트다. 실패하면 exit 1 이다.

import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '../lib/config.mjs';
import { judgeJunitXml } from '../lib/evidence.mjs';

const run = promisify(execFile);

async function shell(cmd, cwd) {
  try {
    await run('/bin/sh', ['-c', cmd], { cwd, maxBuffer: 32 * 1024 * 1024 });
    return { code: 0 };
  } catch (e) {
    return { code: e.code ?? 1, stderr: String(e.stderr ?? '').slice(-2000) };
  }
}

function xmlsUnder(dir) {
  if (!existsSync(dir)) return [];
  if (statSync(dir).isFile()) return [readFileSync(dir, 'utf8')];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.xml'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
}

export async function runChecks(cfg) {
  const out = [];
  for (const c of cfg.checks) {
    const res = await shell(c.cmd, cfg.root);
    if (c.kind === 'exit-code') {
      out.push({ id: c.id, ok: res.code === 0, reason: `종료코드 ${res.code}` });
    } else if (c.kind === 'junit-xml') {
      const j = judgeJunitXml(xmlsUnder(c.evidence));
      out.push({ id: c.id, ok: j.ok, reason: j.reason });
    } else if (c.kind === 'file-unchanged') {
      const g = await shell(`git diff --quiet -- ${JSON.stringify(c.evidence)}`, cfg.root);
      out.push({
        id: c.id,
        ok: g.code === 0,
        reason: g.code === 0 ? '산출물이 그대로다' : '산출물이 바뀌었다 — 커밋에 포함해야 한다',
      });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const results = await runChecks(loadConfig(root));
  if (results.length === 0) {
    console.error('⛔ 선언된 검사가 없다 — harness.json 의 checks 가 비어 있다');
    process.exit(1);
  }
  for (const r of results) console.log(`${r.ok ? '✅' : '⛔'} ${r.id} — ${r.reason}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
```

⭐ **검사가 0개면 exit 1 이다.** 「검사가 없어서 전부 통과」는 이 레포가 막으려는 바로 그 거짓 신호다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/verify.test.mjs`
Expected: PASS — `# pass 5` · `# fail 0`

- [ ] **Step 5: `verify-tests` 스킬을 작성한다**

`templates/skills/verify-tests/SKILL.md`:

```markdown
---
name: verify-tests
description: 테스트를 쓰거나 통과를 주장하기 전에 쓴다 — 실패를 먼저 확인하고, 종료코드가 아니라 결과 파일을 읽어 판정한다
---

# 테스트 검증

> 상태: **검증됨** — ICFR `icfr-backend` 의 `junit-verify` 에서 나왔다.

## 절차

1. **실패하는 테스트를 먼저 쓴다**
2. ⛔ **실제로 실패하는지 실행해 확인한다** — 컴파일 오류가 아닌 **단언 실패**여야 의미가 있다
3. 구현한다
4. 통과를 실행해 확인한다
5. ⛔ **`node checks/verify.mjs` 로 판정한다.** `BUILD SUCCESSFUL` · 종료코드 0 으로 통과를 주장하지 않는다

## ⛔ 음성 케이스를 반드시 넣는다

「되는 것」만 테스트하지 않는다. **막혀야 하는 것이 막히는지**를 함께 검증한다.

자동설정이 모듈 단위로 갈린 프레임워크(Spring Boot 4 등)에서는 모듈이 빠지면 기능이
**예외도 경고도 없이 조용히 비활성화된다.** ICFR 에서 Flyway 가 실제로 그렇게 안 돌았다.
보안에서 같은 일이 나면 인증이 그냥 뚫린다.

## 왜 종료코드를 믿지 않는가

테스트가 0개여도 성공한다. `checks/verify.mjs` 의 `junit-xml` 판정이 이것을 잡는다.
```

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add checks/verify.mjs templates/skills/verify-tests/SKILL.md test/verify.test.mjs
git commit -m "feat: 완료 관문 러너와 verify-tests 스킬

harness.json 의 checks 를 돌리고 종료코드가 아니라 결과 파일로 판정한다.
junit-xml 검사는 명령이 exit 0 이어도 XML 을 읽어 tests=0 이면 실패로
본다 — 테스트가 이 경로를 직접 지킨다.

⭐ 검사가 0개면 exit 1 이다. '선언된 검사가 없어서 전부 통과'는 이 레포가
막으려는 거짓 신호 그 자체다.

file-unchanged 는 ICFR 의 openapiSnapshot + pre-push 를 일반화한 것이다 —
생성물을 다시 만들었을 때 git 이 깨끗하면 계약이 안 바뀐 것이다."
```

---

### Task 4: 태스크 경계 게이트 `close-task` 스킬

**Files:**
- Create: `templates/skills/close-task/SKILL.md`
- Create: `checks/regression-cases/README.md`

**Interfaces:**
- Consumes: `checks/verify.mjs` (Task 3) · `tools/lesson-append.mjs` (Task 7, 아직 없음 — 스킬 문서가 미리 가리킨다)
- Produces: 대상 저장소에 설치되는 스킬. 승인된 결정 2번(보안 상시 훅 제거)이 여기에 편입된다

⚠️ 이 태스크에는 코드가 없어 자동 테스트가 없다. 검증은 Phase 5 의 ICFR 적용에서 실제로 한 태스크를 닫아보는 것으로 한다.

- [ ] **Step 1: `close-task` 스킬을 작성한다**

`templates/skills/close-task/SKILL.md`:

```markdown
---
name: close-task
description: 계획서의 태스크 하나를 끝낼 때 쓴다 — 검사 전량 · 증거 요약 · 커밋 · 보안 리뷰 1회 · 상태 갱신을 한 경계에서 처리한다
---

# 태스크 닫기

> 상태: **설계안** — 구성요소(검사·커밋·보안리뷰)는 ICFR 에서 검증됐으나 한 게이트로 묶은 것은 처음이다.

## 왜 경계인가

자율 루프는 멈추지 않으므로 **자연스러운 검사 지점이 태스크 경계뿐**이다.
턴마다 도는 상시 훅은 세 가지를 동시에 망친다 — 토큰을 소모하고, 루프를 깨우고,
객관적 기준 없는 리뷰어를 매 턴 추가한다.

## 절차

1. `node checks/verify.mjs` — ⛔ exit 0 이 아니면 여기서 멈춘다
2. 증거를 요약한다 — 검사 이름과 판정 근거를 그대로 옮긴다. 「통과했다」로 줄이지 않는다
3. 커밋한다 — 제목은 무엇을, 본문은 **왜**. 계획서와 다르게 갔으면 그 이유를 남긴다
4. `/security-review` **1회** — 내장 스킬이다. 플러그인이 아니다
5. 상태를 갱신한다 — 계획서 체크박스, `harness.json` 의 `state.current`
6. 막힌 것이 있으면 `state.decisions` 에 가정과 함께 적는다. ⛔ **묻느라 멈추지 않는다**
7. 같은 실패가 반복됐으면 `node tools/lesson-append.mjs` 로 적는다

## ⛔ 하지 않는 것

| ⛔ | 왜 |
|---|---|
| 검사를 건너뛰고 커밋 | 증거 없는 완료 주장이다 |
| `/security-review` 를 매 턴 | 상시 훅으로 되돌아가는 것이다 |
| 답을 못 얻어 멈추기 | 가정을 적고 진행한다 |
```

- [ ] **Step 2: 재현 케이스 규약을 작성한다**

`checks/regression-cases/README.md`:

```markdown
# 재현 케이스

> 상태: **설계안**

실패를 고쳤으면 **같은 환경에서 재실행하지 않는다.** 근본 원인을 고치고 **재현 케이스를 남긴다.**

| | |
|---|---|
| 파일명 | `<lessons 의 id>.md` — LESSONS 항목과 1:1 |
| 내용 | 증상 · 최소 재현 · 근본 원인 · 이제 무엇이 막는가 |

⛔ **「이제 무엇이 막는가」가 비면 이 파일은 일기다.** 막는 것이 테스트면 그 테스트 이름을,
규약이면 `AGENTS.md` 의 절 번호를 적는다.
```

- [ ] **Step 3: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add templates/skills/close-task/SKILL.md checks/regression-cases/README.md
git commit -m "feat: 태스크 경계 게이트 close-task

승인된 결정 2번(보안 상시 훅 제거)이 여기에 앉는다. security-guidance 는
Stop·SubagentStop·commit·push 여섯 곳에 LLM 리뷰를 걸어 자율 루프에서
턴마다·커밋마다 돌았다. 아티클이 안티패턴으로 꼽은 '객관적 기준 없이
리뷰어 에이전트 추가'이고, ICFR 의 주간 토큰 60% 이탈 조건을 스스로
앞당긴다.

⇒ 결정론적 검사(verify.mjs)를 먼저 통과시키고, 주관적 리뷰는 태스크
경계에서 1회만 부른다. /security-review 는 내장 스킬이라 플러그인을
빼도 남는다."
```

---

# Phase 2 — ④ 상태 · 결정 · LESSONS

### Task 5: 상태 대장 검사기 `state-check.mjs`

**Files:**
- Create: `lib/mdtable.mjs`
- Modify: `lib/config.mjs` — `state.currentRoot` 와 `~` 확장을 더한다
- Create: `tools/state-check.mjs`
- Test: `test/mdtable.test.mjs`, `test/state-check.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1)
- Produces:
  - `parseAuditRows(text: string) → Array<{ target: string, status: string, hash: string }>`
  - `hash12(bytes: Buffer) → string` — SHA-256 앞 12자 (ICFR `referenceAudit` 와 같은 폭)
  - CLI `node tools/state-check.mjs [대상경로]`

ICFR 실측 형식 — 한 행은 `| \`경로\` | 상태 | \`해시\` | 회차 | 메모 |` 다.

- [ ] **Step 1: 실패하는 표 파서 테스트를 작성한다**

`test/mdtable.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditRows } from '../lib/mdtable.mjs';

const SAMPLE = [
  '# 레퍼런스 분석 대장',
  '',
  '| | |',
  '|---|---|',
  '| 갱신일 | 2026-09-28 |',
  '',
  '| 값 | 뜻 |',
  '|---|---|',
  '| `분석완료` | 끝까지 읽었다 |',
  '',
  '| 파일 | 상태 | 해시 | 회차 | 메모 |',
  '|---|---|---|---|---|',
  '| `src/engine.ts` | 분석완료 | `a1b2c3d4e5f6` | 1 | 표본 알고리즘 |',
  '| `src/App.tsx` | 미분석 | `` | - | |',
].join('\n');

test('경로·상태·해시 세 칸을 가진 행만 뽑는다', () => {
  const rows = parseAuditRows(SAMPLE);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { target: 'src/engine.ts', status: '분석완료', hash: 'a1b2c3d4e5f6' });
});

test('⛔ 상태 값 설명표를 데이터로 오인하지 않는다', () => {
  const rows = parseAuditRows(SAMPLE);
  assert.ok(!rows.some((r) => r.target === '분석완료'), '설명표 행이 섞였다');
});

test('해시가 비어 있어도 행으로 읽는다', () => {
  const rows = parseAuditRows(SAMPLE);
  assert.equal(rows[1].hash, '');
});

test('표가 하나도 없으면 빈 배열이다', () => {
  assert.deepEqual(parseAuditRows('# 제목뿐'), []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/mdtable.test.mjs`
Expected: FAIL — `Cannot find module '../lib/mdtable.mjs'`

- [ ] **Step 3: `lib/mdtable.mjs` 를 작성한다**

```js
import { createHash } from 'node:crypto';

// ICFR referenceAudit 과 같은 행 형식: | `경로` | 상태 | `해시` | …
// 설명표(| `분석완료` | 뜻 |)는 세 번째 칸이 백틱 해시 자리가 아니므로 걸리지 않는다.
const ROW = /^\|\s*`([^`]+)`\s*\|\s*(\S+)\s*\|\s*`([^`]*)`\s*\|/;

export function parseAuditRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = ROW.exec(line);
    if (m) rows.push({ target: m[1], status: m[2], hash: m[3] });
  }
  return rows;
}

export function hash12(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}
```

- [ ] **Step 4: 표 파서 테스트가 통과하는지 확인한다**

Run: `node --test test/mdtable.test.mjs`
Expected: PASS — `# pass 4` · `# fail 0`

- [ ] **Step 5: `lib/config.mjs` 에 `currentRoot` 와 `~` 확장을 더한다**

`lib/config.mjs` 의 `abs` 를 교체한다:

```js
import { homedir } from 'node:os';

// … 기존 import 아래에 추가

function expand(p) {
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}
```

`abs` 를 이렇게 바꾼다:

```js
  const abs = (p) => (p ? resolve(root, expand(p)) : undefined);
```

그리고 반환 객체의 `state` 에 한 줄 더한다:

```js
      currentRoot: abs(raw.state?.currentRoot),
```

`test/config.test.mjs` 에 테스트를 더한다:

```js
test('~ 로 시작하는 경로를 홈 기준으로 편다', () => {
  const dir = fixture({ map: 'AGENTS.md', state: { currentRoot: '~/Downloads/ref' }, checks: [] });
  const cfg = loadConfig(dir);
  assert.ok(cfg.state.currentRoot.startsWith(homedir()));
  assert.ok(!cfg.state.currentRoot.includes('~'));
});
```

⛔ `import { homedir } from 'node:os';` 를 테스트 파일 상단에도 추가한다.

- [ ] **Step 6: 실패하는 state-check 테스트를 작성한다**

`test/state-check.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { hash12 } from '../lib/mdtable.mjs';
import { auditState } from '../tools/state-check.mjs';

function scene(rows, files) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  const refRoot = join(dir, 'ref');
  mkdirSync(refRoot, { recursive: true });
  for (const [rel, body] of Object.entries(files)) writeFileSync(join(refRoot, rel), body);
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(
    join(dir, 'docs/audit.md'),
    ['| 파일 | 상태 | 해시 |', '|---|---|---|', ...rows].join('\n'),
  );
  writeFileSync(
    join(dir, 'harness.json'),
    JSON.stringify({ map: 'AGENTS.md', state: { current: 'docs/audit.md', currentRoot: 'ref' }, checks: [] }),
  );
  return dir;
}

test('해시가 맞으면 재작업 대상이 아니다', () => {
  const body = 'export const x = 1;\n';
  const dir = scene([`| \`a.ts\` | 분석완료 | \`${hash12(Buffer.from(body))}\` |`], { 'a.ts': body });
  const r = auditState(loadConfig(dir));
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.missing, []);
});

test('⭐ 해시가 다르면 재작업 대상으로 돌아온다', () => {
  const dir = scene(['| `a.ts` | 분석완료 | `000000000000` |'], { 'a.ts': 'export const x = 2;\n' });
  const r = auditState(loadConfig(dir));
  assert.deepEqual(r.stale, ['a.ts']);
});

test('⛔ 대장이 가리키는 파일이 사라지면 무결성 위반이다', () => {
  const dir = scene(['| `gone.ts` | 분석완료 | `abc123abc123` |'], {});
  const r = auditState(loadConfig(dir));
  assert.deepEqual(r.missing, ['gone.ts']);
  assert.equal(r.integrityOk, false);
});

test('미분석은 재작업이 아니라 잔량이다', () => {
  const dir = scene(['| `a.ts` | 미분석 | `` |'], { 'a.ts': 'x\n' });
  const r = auditState(loadConfig(dir));
  assert.deepEqual(r.stale, []);
  assert.equal(r.remaining, 1);
});
```

- [ ] **Step 7: 테스트가 실패하는지 확인한다**

Run: `node --test test/state-check.test.mjs`
Expected: FAIL — `Cannot find module '../tools/state-check.mjs'`

- [ ] **Step 8: `tools/state-check.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ④ STATE — 진행 상태 대장이 거짓말하는지 본다. 검증됨 (ICFR referenceAudit).
//
// ⛔ 이것은 진행도 게이트이지 correctness 게이트가 아니다.
// 무결성 위반(대장이 가리키는 파일 소멸)만 exit 1 이고, 재작업 대상·잔량은 보고만 한다.
// 분석이 안 끝났다고 급한 수정을 막을 이유가 없다 — ICFR AGENTS.md 의 판단이다.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { parseAuditRows, hash12 } from '../lib/mdtable.mjs';

const DONE = new Set(['분석완료', '부분분석']);

export function auditState(cfg) {
  if (!cfg.state.current) throw new Error('harness.json 에 state.current 가 없다');
  if (!cfg.state.currentRoot) throw new Error('harness.json 에 state.currentRoot 가 없다');

  const rows = parseAuditRows(readFileSync(cfg.state.current, 'utf8'));
  if (rows.length === 0) throw new Error(`대장을 읽지 못했다: ${cfg.state.current}`);

  const stale = [];
  const missing = [];
  let remaining = 0;

  for (const r of rows) {
    const path = join(cfg.state.currentRoot, r.target);
    if (!existsSync(path) || !statSync(path).isFile()) {
      missing.push(r.target);
      continue;
    }
    if (!DONE.has(r.status)) {
      remaining += 1;
      continue;
    }
    if (hash12(readFileSync(path)) !== r.hash) stale.push(r.target);
  }

  return { total: rows.length, stale, missing, remaining, integrityOk: missing.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = auditState(loadConfig(process.argv[2] ?? process.cwd()));
  console.log(`대장 ${r.total}행 · 잔량 ${r.remaining} · 재작업 ${r.stale.length} · 소멸 ${r.missing.length}`);
  for (const t of r.stale) console.log(`  ↻ ${t} — 원본이 바뀌었다`);
  for (const t of r.missing) console.log(`  ⛔ ${t} — 대장이 가리키는 파일이 없다`);
  process.exit(r.integrityOk ? 0 : 1);
}
```

- [ ] **Step 9: 테스트가 통과하는지 확인한다**

Run: `node --test test/`
Expected: PASS — 전체 `# fail 0`. `# pass` 가 Task 4 까지의 합보다 커졌는지 확인한다

- [ ] **Step 10: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add lib/mdtable.mjs lib/config.mjs tools/state-check.mjs test/
git commit -m "feat: 상태 대장 검사기 — 진행도를 대화가 아니라 파일이 기억한다

ICFR 의 referenceAudit 을 스택 중립으로 옮긴다. 해시가 달라지면 그 행이
자동으로 재작업 대상으로 돌아오는 것이 핵심이다 — 사람의 기억이 아니라
결정적 검사가 판단한다.

⛔ 무결성 위반(대장이 가리키는 파일 소멸)만 exit 1 이다. 재작업 대상과
잔량은 보고만 한다. 진행도 게이트를 correctness 게이트로 쓰면 분석이 안
끝났다고 급한 수정이 막힌다 — ICFR 이 referenceAudit 을 pre-push 에 안
넣은 것과 같은 판단이다.

표 파서가 상태 값 설명표를 데이터로 오인하지 않는지 테스트가 지킨다.
대장 파일 안에 표가 여러 개 있다."
```

---

### Task 6: 결정 적립 검사기 `decision-check.mjs`

**Files:**
- Create: `tools/decision-check.mjs`
- Create: `templates/state/decisions.md`
- Test: `test/decision-check.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1)
- Produces: `auditDecisions(cfg, today: Date) → { open: Array<{id, title}>, staleDays: number|null, warn: boolean }` — `today` 를 인자로 받는 이유는 테스트가 시계에 묶이지 않게 하기 위함이다

ICFR `Need-Check.md` 실측 형식 — `| 갱신일 | 2026-09-23 |` 머리표 + `## Q1 · <제목>` 절.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/decision-check.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { auditDecisions } from '../tools/decision-check.mjs';

function scene(body) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(join(dir, 'Need-Check.md'), body);
  writeFileSync(
    join(dir, 'harness.json'),
    JSON.stringify({ map: 'AGENTS.md', state: { decisions: 'Need-Check.md' }, checks: [] }),
  );
  return dir;
}

const BODY = [
  '# 확인 필요 사항',
  '| | |',
  '|---|---|',
  '| 갱신일 | 2026-09-23 |',
  '',
  '# 1. 답변이 필요합니다',
  '',
  '## Q1 · 제출본이 증빙 목록을 고정해야 하나요?',
  '내용',
  '## Q2 · 레퍼런스 계약 72개를 구현하지 않은 판단이 맞나요?',
  '내용',
  '',
  '# 3. 해소된 것',
  '',
  '## 표본 알고리즘 레퍼런스 대조 · 2026-09-23',
].join('\n');

test('1절의 Q 항목만 열린 것으로 센다', () => {
  const r = auditDecisions(loadConfig(scene(BODY)), new Date('2026-09-28'));
  assert.equal(r.open.length, 2);
  assert.equal(r.open[0].id, 'Q1');
});

test('⛔ 3절(해소된 것)을 열린 것으로 세지 않는다', () => {
  const r = auditDecisions(loadConfig(scene(BODY)), new Date('2026-09-28'));
  assert.ok(!r.open.some((q) => q.title.includes('표본 알고리즘')));
});

test('갱신일로부터 경과일을 센다', () => {
  const r = auditDecisions(loadConfig(scene(BODY)), new Date('2026-09-28'));
  assert.equal(r.staleDays, 5);
  assert.equal(r.warn, false);
});

test('⭐ 임계(14일)를 넘기면 경고한다', () => {
  const r = auditDecisions(loadConfig(scene(BODY)), new Date('2026-10-20'));
  assert.equal(r.warn, true);
});

test('열린 질문이 없으면 오래돼도 경고하지 않는다', () => {
  const body = ['| 갱신일 | 2026-01-01 |', '# 1. 답변이 필요합니다', '', '# 3. 해소된 것'].join('\n');
  const r = auditDecisions(loadConfig(scene(body)), new Date('2026-10-20'));
  assert.equal(r.warn, false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/decision-check.test.mjs`
Expected: FAIL — `Cannot find module '../tools/decision-check.mjs'`

- [ ] **Step 3: `tools/decision-check.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ④ DECISIONS — 묻지 않고 넘어간 가정이 답 없이 묵고 있는지 본다. 검증됨 (ICFR Need-Check.md).
//
// ⛔ 절대 exit 1 하지 않는다. 답을 기다리는 것은 결함이 아니다.
// 「검사는 드물게 울려야 신호다」 — 경고는 임계를 넘겼을 때만 낸다.

import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';

export const STALE_DAYS = 14;

export function auditDecisions(cfg, today = new Date()) {
  if (!cfg.state.decisions) throw new Error('harness.json 에 state.decisions 가 없다');
  const text = readFileSync(cfg.state.decisions, 'utf8');

  const updated = text.match(/\|\s*갱신일\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
  const open = [];
  let inOpenSection = false;

  for (const line of text.split('\n')) {
    const h1 = line.match(/^#\s+(\d)\./);
    if (h1) {
      inOpenSection = h1[1] === '1';
      continue;
    }
    if (!inOpenSection) continue;
    const q = line.match(/^##\s+(Q\d+)\s*·\s*(.+?)\s*$/);
    if (q) open.push({ id: q[1], title: q[2] });
  }

  const staleDays = updated
    ? Math.round((today - new Date(updated[1])) / 86400000)
    : null;

  return { open, staleDays, warn: open.length > 0 && staleDays !== null && staleDays > STALE_DAYS };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = auditDecisions(loadConfig(process.argv[2] ?? process.cwd()));
  console.log(`열린 결정 ${r.open.length}건 · 갱신 후 ${r.staleDays ?? '?'}일`);
  for (const q of r.open) console.log(`  · ${q.id} ${q.title}`);
  if (r.warn) console.log(`⚠️ ${STALE_DAYS}일을 넘겼다 — 되돌리기 비용이 오르고 있다`);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/decision-check.test.mjs`
Expected: PASS — `# pass 5` · `# fail 0`

- [ ] **Step 5: `templates/state/decisions.md` 를 작성한다**

```markdown
# 확인 필요 사항

에이전트가 루프로 구현하면서 **묻지 않고 가정으로 넘어간 것들.**

| | |
|---|---|
| 갱신일 | YYYY-MM-DD |

**읽는 법** — **1절만 답해주시면 됩니다.** 2절은 알려드리는 것, 3절은 닫힌 것입니다.

---

# 1. 답변이 필요합니다

위에서부터 급합니다. **급하다 = 지금 바꾸면 싸고 미루면 비싸진다**는 뜻입니다.

## Q1 · <질문 한 줄>

> 되돌리기 **<지금 싸다 / 중간 / 없음>** · 관련 <근거 문서>

**무엇이 다른가** · **왜 문제가 되나** · **내가 그렇게 한 이유** · **내 의견**

---

# 2. 알려드립니다 — 답변 없어도 진행됩니다

# 3. 해소된 것
```

⛔ **절 번호 `# 1.` · `# 2.` · `# 3.` 을 바꾸지 않는다.** `decision-check.mjs` 가 이것으로 열린 질문을 가른다.

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/decision-check.mjs templates/state/decisions.md test/decision-check.test.mjs
git commit -m "feat: 결정 적립 검사기 — 가정이 답 없이 묵는 것을 잰다

자율 루프는 묻지 않고 진행하는 대신 가정을 적립한다. 적립만 하고 아무도
안 보면 되돌리기 비용이 조용히 오른다 — ICFR 은 Q1~Q4 가 5일째 열려
있었고 그중 Q3(증빙 저장 위치)은 '파일이 쌓이면 이관 스크립트 필요'로
명시돼 있었다.

⛔ exit 1 하지 않는다. 답을 기다리는 것은 결함이 아니다. 14일 임계를
넘긴 열린 질문이 있을 때만 경고한다.

3절(해소된 것)의 ## 절을 열린 질문으로 오인하지 않는지 테스트가 지킨다."
```

---

### Task 7: LESSONS 입구 `lesson-append.mjs`

**Files:**
- Create: `tools/lesson-append.mjs`
- Create: `templates/state/lessons.md`
- Test: `test/lesson-append.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1)
- Produces: `appendLesson(cfg, entry) → { id: string }` · CLI `node tools/lesson-append.mjs <<< '<JSON>'`
  - `entry: { symptom: string, cause: string, category: string, guard?: string }`
  - `CATEGORIES = ['누락된 컨텍스트', '잘못된 도구', '미흡한 권한', '검증 부족']` (아티클 ⑥의 분류)

⭐ **이 레포가 새로 만드는 유일한 것.** ICFR 에서 승격은 3번 일어났지만 입구가 없었다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/lesson-append.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { appendLesson } from '../tools/lesson-append.mjs';

function scene() {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(join(dir, 'lessons.md'), '# 교훈\n\n| id | 분류 | 증상 | 근본 원인 | 무엇이 막는가 |\n|---|---|---|---|---|\n');
  writeFileSync(
    join(dir, 'harness.json'),
    JSON.stringify({ map: 'AGENTS.md', state: { lessons: 'lessons.md' }, checks: [] }),
  );
  return dir;
}

const OK = {
  symptom: 'sed 치환이 아무것도 안 바꿨는데 커밋됐다',
  cause: '앵커 문자열이 파일에 없었다',
  category: '검증 부족',
  guard: 'AGENTS.md §4',
};

test('교훈 한 건을 표에 덧붙인다', () => {
  const dir = scene();
  const cfg = loadConfig(dir);
  appendLesson(cfg, OK);
  const text = readFileSync(cfg.state.lessons, 'utf8');
  assert.match(text, /sed 치환이 아무것도/);
  assert.match(text, /검증 부족/);
});

test('id 를 부여하고 돌려준다', () => {
  const cfg = loadConfig(scene());
  const { id } = appendLesson(cfg, OK);
  assert.match(id, /^L\d{3}$/);
  assert.match(readFileSync(cfg.state.lessons, 'utf8'), new RegExp(id));
});

test('id 가 증가한다', () => {
  const cfg = loadConfig(scene());
  assert.equal(appendLesson(cfg, OK).id, 'L001');
  assert.equal(appendLesson(cfg, OK).id, 'L002');
});

test('⛔ 분류가 네 가지 밖이면 거부한다', () => {
  const cfg = loadConfig(scene());
  assert.throws(() => appendLesson(cfg, { ...OK, category: '그냥 실수' }), /알 수 없는 분류/);
});

test('⛔ 근본 원인이 비면 거부한다 — 증상만 적는 것은 일기다', () => {
  const cfg = loadConfig(scene());
  assert.throws(() => appendLesson(cfg, { ...OK, cause: '' }), /근본 원인/);
});

test('표 구분자(|)가 값에 들어가도 표가 깨지지 않는다', () => {
  const cfg = loadConfig(scene());
  appendLesson(cfg, { ...OK, symptom: 'a | b' });
  const row = readFileSync(cfg.state.lessons, 'utf8').split('\n').at(-2);
  assert.equal(row.split('|').length - 2, 5, '칸이 5개여야 한다');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/lesson-append.test.mjs`
Expected: FAIL — `Cannot find module '../tools/lesson-append.mjs'`

- [ ] **Step 3: `tools/lesson-append.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ④ LESSONS — ⭐ 이 레포가 새로 만드는 유일한 것. 설계안.
//
// 반복 실패를 규약으로 승격시키려면 입구가 있어야 한다. ICFR 에서 승격은
// 세 번 일어났지만(sed 앵커 → AGENTS.md §4, Boot 4 자동설정 → §3,
// DTO 이름 충돌 → §8) 전부 손으로였고 기록이 남지 않았다.
//
// ⛔ 자동 추출하지 않는다. 검증 관문 없는 자동 기록은 낡은 정보를 더 빨리 쌓는다.

import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';

export const CATEGORIES = ['누락된 컨텍스트', '잘못된 도구', '미흡한 권한', '검증 부족'];

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

export function appendLesson(cfg, entry) {
  if (!cfg.state.lessons) throw new Error('harness.json 에 state.lessons 가 없다');
  if (!CATEGORIES.includes(entry.category)) {
    throw new Error(`알 수 없는 분류: ${entry.category}\n  쓸 수 있는 것: ${CATEGORIES.join(' · ')}`);
  }
  if (!String(entry.symptom ?? '').trim()) throw new Error('증상이 비었다');
  if (!String(entry.cause ?? '').trim()) {
    throw new Error('근본 원인이 비었다 — 증상만 적는 것은 일기이지 교훈이 아니다');
  }

  const text = readFileSync(cfg.state.lessons, 'utf8');
  const used = [...text.matchAll(/^\|\s*(L\d{3})\s*\|/gm)].map((m) => Number(m[1].slice(1)));
  const id = `L${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;

  const row = `| ${id} | ${cell(entry.category)} | ${cell(entry.symptom)} | ${cell(entry.cause)} | ${cell(entry.guard) || '⛔ 아직 없다'} |\n`;
  writeFileSync(cfg.state.lessons, text.endsWith('\n') ? text + row : `${text}\n${row}`);
  return { id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entry = JSON.parse(readFileSync(0, 'utf8'));
  const { id } = appendLesson(loadConfig(process.cwd()), entry);
  console.log(`기록: ${id}`);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/lesson-append.test.mjs`
Expected: PASS — `# pass 6` · `# fail 0`

- [ ] **Step 5: `templates/state/lessons.md` 를 작성한다**

```markdown
# 교훈

반복된 실패를 **규약으로 승격시키기 위한 입구.** 증상만 적는 것은 일기다 — 근본 원인과
「이제 무엇이 막는가」가 있어야 교훈이다.

| | |
|---|---|
| 입력 | `node tools/lesson-append.mjs <<< '<JSON>'` |
| 승격 후보 | `node tools/lesson-promote.mjs` |

## 분류 — 아티클 ⑥의 실패 원인 4종

`누락된 컨텍스트` · `잘못된 도구` · `미흡한 권한` · `검증 부족`

## 기록

| id | 분류 | 증상 | 근본 원인 | 무엇이 막는가 |
|---|---|---|---|---|
```

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/lesson-append.mjs templates/state/lessons.md test/lesson-append.test.mjs
git commit -m "feat: LESSONS 입구 — 반복 실패를 규약으로 올리는 자리

아티클 ④의 네 번째 메모리 유형이자 ICFR 에 유일하게 없던 것이다. 승격
경로 자체는 이미 작동했다 — sed 앵커 사고 2회가 AGENTS.md §4 가 됐고,
Boot 4 자동설정 침묵이 §3 음성 케이스가 됐고, DTO 이름 충돌이 §8 이
됐다. 입구가 없어서 전부 손으로 일어났고 중간 기록이 남지 않았다.

⛔ 근본 원인이 비면 거부한다. 증상만 쌓이면 일기가 되고, 일기는 승격
판정의 근거가 못 된다.

⛔ 자동 추출하지 않는다. 검증 관문 없는 자동 기록은 낡은 정보를 더 빨리
쌓을 뿐이라는 context-graph 의 결론을 따른다."
```

---

### Task 8: 승격 후보 `lesson-promote.mjs`

**Files:**
- Create: `tools/lesson-promote.mjs`
- Test: `test/lesson-promote.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1) · `lessons.md` 표 형식 (Task 7)
- Produces: `promotionCandidates(cfg, threshold = 2) → Array<{ category, count, ids: string[] }>`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/lesson-promote.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { promotionCandidates } from '../tools/lesson-promote.mjs';

function scene(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  writeFileSync(
    join(dir, 'lessons.md'),
    ['| id | 분류 | 증상 | 근본 원인 | 무엇이 막는가 |', '|---|---|---|---|---|', ...rows].join('\n'),
  );
  writeFileSync(
    join(dir, 'harness.json'),
    JSON.stringify({ map: 'AGENTS.md', state: { lessons: 'lessons.md' }, checks: [] }),
  );
  return loadConfig(dir);
}

test('같은 분류가 임계 이상이면 후보다', () => {
  const cfg = scene([
    '| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |',
    '| L002 | 검증 부족 | c | d | ⛔ 아직 없다 |',
  ]);
  const r = promotionCandidates(cfg, 2);
  assert.equal(r.length, 1);
  assert.equal(r[0].category, '검증 부족');
  assert.deepEqual(r[0].ids, ['L001', 'L002']);
});

test('임계 미만은 후보가 아니다', () => {
  const cfg = scene(['| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |']);
  assert.deepEqual(promotionCandidates(cfg, 2), []);
});

test('⭐ 이미 막는 것이 있는 항목은 세지 않는다 — 승격이 끝난 것이다', () => {
  const cfg = scene([
    '| L001 | 검증 부족 | a | b | AGENTS.md §4 |',
    '| L002 | 검증 부족 | c | d | ⛔ 아직 없다 |',
  ]);
  assert.deepEqual(promotionCandidates(cfg, 2), []);
});

test('분류가 섞여 있으면 각각 센다', () => {
  const cfg = scene([
    '| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |',
    '| L002 | 잘못된 도구 | c | d | ⛔ 아직 없다 |',
    '| L003 | 잘못된 도구 | e | f | ⛔ 아직 없다 |',
  ]);
  const r = promotionCandidates(cfg, 2);
  assert.equal(r.length, 1);
  assert.equal(r[0].category, '잘못된 도구');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/lesson-promote.test.mjs`
Expected: FAIL — `Cannot find module '../tools/lesson-promote.mjs'`

- [ ] **Step 3: `tools/lesson-promote.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ④ LESSONS 승격 후보. 설계안.
//
// ⛔ 승격을 자동으로 하지 않는다. 후보만 올리고 규약을 고치는 것은 사람이다.
// ⛔ exit 1 하지 않는다 — 후보가 있는 것은 결함이 아니다.

import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';

const ROW = /^\|\s*(L\d{3})\s*\|\s*([^|]+?)\s*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/;
const NO_GUARD = '⛔ 아직 없다';

export function promotionCandidates(cfg, threshold = 2) {
  if (!cfg.state.lessons) throw new Error('harness.json 에 state.lessons 가 없다');
  const byCategory = new Map();

  for (const line of readFileSync(cfg.state.lessons, 'utf8').split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, id, category, guard] = m;
    if (guard !== NO_GUARD) continue; // 이미 막는 것이 있으면 승격이 끝났다
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(id);
  }

  return [...byCategory.entries()]
    .filter(([, ids]) => ids.length >= threshold)
    .map(([category, ids]) => ({ category, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig(process.argv[2] ?? process.cwd());
  const cands = promotionCandidates(cfg);
  if (cands.length === 0) {
    console.log('승격 후보 없음');
  } else {
    console.log('승격 후보 — 같은 분류가 반복됐고 아직 막는 것이 없다:');
    for (const c of cands) console.log(`  ${c.category} ×${c.count} (${c.ids.join(' ')})`);
    console.log('\n⇒ 규약(AGENTS.md)에 절을 더하고, 각 행의 「무엇이 막는가」에 그 절 번호를 적는다.');
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/`
Expected: PASS — 전체 `# fail 0`

- [ ] **Step 5: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/lesson-promote.mjs test/lesson-promote.test.mjs
git commit -m "feat: LESSONS 승격 후보 검출

같은 분류가 임계(기본 2회) 이상 반복되고 아직 막는 것이 없으면 후보로
올린다. '무엇이 막는가'가 채워진 항목은 승격이 끝난 것이므로 세지 않는다
— 안 그러면 해결된 교훈이 영구히 후보에 남아 경고가 노이즈가 된다.

⛔ 승격 자체는 자동화하지 않는다. 규약에 무엇을 어떻게 적을지는 사람의
판단이고, 자동 승격은 검증 관문이 없다."
```

---

# Phase 3 — ③ 게이트웨이

### Task 9: 권한 정책 단일 원천

**Files:**
- Create: `policy/permissions.json`
- Create: `tools/policy-apply.mjs`
- Create: `tools/policy-diff.mjs`
- Test: `test/policy.test.mjs`

**Interfaces:**
- Consumes: 없음 (`harness.json` 을 거치지 않는다 — 대상의 `.claude/settings.json` 을 직접 읽고 쓴다)
- Produces:
  - `mergePermissions(settings: object, policy: object) → object` — 순수 함수. `permissions.allow/deny/ask` 만 교체하고 **나머지 키는 그대로 보존**한다
  - `diffPermissions(settings, policy) → { missing: string[], extra: string[] }`
  - CLI `node tools/policy-apply.mjs <대상>` · `node tools/policy-diff.mjs <대상>`

⛔ **JSON 이다. YAML 이 아니다.** Node v26.5.0 에 YAML 파서가 없다 (실측). 「의존성 0」이 우선한다.

- [ ] **Step 1: `policy/permissions.json` 을 작성한다**

ICFR 의 현재 정책을 원천으로 옮긴다.

```json
{
  "_note": "권한 정책 단일 원천. tools/policy-apply.mjs 가 대상의 .claude/settings.json 에 반영한다.",
  "_why": {
    "deny-push": "자율 루프는 레포 밖으로 나가지 않는다. push·배포·외부 호출은 사람이 한다",
    "deny-rm": "되돌릴 수 없는 파괴적 작업. mv 는 허용하되 덮어쓰기 위험은 남는다",
    "ask-force": "--force 는 되돌리기가 사라지는 지점이다"
  },
  "allow": [
    "Read", "Write", "Edit", "Glob", "Grep",
    "Bash(cd *)", "Bash(ls *)", "Bash(pwd)",
    "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)", "Bash(git show *)",
    "Bash(grep *)", "Bash(find *)", "Bash(sed *)", "Bash(awk *)",
    "Bash(head *)", "Bash(tail *)", "Bash(wc *)", "Bash(sort *)", "Bash(uniq *)", "Bash(diff *)",
    "Bash(curl http://localhost:*)"
  ],
  "deny": [
    "Bash(rm *)", "Bash(rmdir *)", "Bash(chmod *)", "Bash(chown *)",
    "Bash(git push *)", "Bash(git reset --hard*)", "Bash(git clean *)",
    "Bash(git checkout -- *)", "Bash(git rebase *)",
    "Bash(kill *)", "Bash(pkill *)", "Bash(shutdown *)", "Bash(reboot *)",
    "Bash(mkfs *)", "Bash(dd *)",
    "Bash(curl * | bash*)", "Bash(wget * | bash*)",
    "Bash(npm publish *)", "Bash(npx * deploy*)",
    "Bash(find * -delete*)", "Bash(find * -exec rm*)", "Bash(find * -execdir rm*)"
  ],
  "ask": [
    "Bash(*--force*)", "Bash(git restore *)",
    "Bash(git stash drop*)", "Bash(git stash clear*)", "Bash(truncate *)"
  ]
}
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`test/policy.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePermissions } from '../tools/policy-apply.mjs';
import { diffPermissions } from '../tools/policy-diff.mjs';

const POLICY = { allow: ['Read', 'Write'], deny: ['Bash(rm *)'], ask: ['Bash(*--force*)'] };

test('allow·deny·ask 를 정책으로 교체한다', () => {
  const out = mergePermissions({ permissions: { allow: ['옛것'], deny: [] } }, POLICY);
  assert.deepEqual(out.permissions.allow, ['Read', 'Write']);
  assert.deepEqual(out.permissions.deny, ['Bash(rm *)']);
  assert.deepEqual(out.permissions.ask, ['Bash(*--force*)']);
});

test('⭐ permissions 의 다른 키를 보존한다', () => {
  const out = mergePermissions(
    { permissions: { allow: [], defaultMode: 'auto', additionalDirectories: ['../docs'] } },
    POLICY,
  );
  assert.equal(out.permissions.defaultMode, 'auto');
  assert.deepEqual(out.permissions.additionalDirectories, ['../docs']);
});

test('⭐ settings 의 다른 최상위 키를 보존한다', () => {
  const out = mergePermissions({ hooks: { Stop: [{ x: 1 }] }, theme: 'dark' }, POLICY);
  assert.deepEqual(out.hooks, { Stop: [{ x: 1 }] });
  assert.equal(out.theme, 'dark');
});

test('⛔ 원본을 변형하지 않는다', () => {
  const src = { permissions: { allow: ['옛것'] } };
  mergePermissions(src, POLICY);
  assert.deepEqual(src.permissions.allow, ['옛것']);
});

test('정책에 있는데 설정에 없는 것을 missing 으로 낸다', () => {
  const d = diffPermissions({ permissions: { allow: ['Read'], deny: [], ask: [] } }, POLICY);
  assert.ok(d.missing.includes('allow: Write'));
  assert.ok(d.missing.includes('deny: Bash(rm *)'));
});

test('설정에만 있는 것을 extra 로 낸다', () => {
  const d = diffPermissions({ permissions: { allow: ['Read', 'Write', '몰래추가'], deny: ['Bash(rm *)'], ask: ['Bash(*--force*)'] } }, POLICY);
  assert.deepEqual(d.extra, ['allow: 몰래추가']);
  assert.deepEqual(d.missing, []);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/policy.test.mjs`
Expected: FAIL — `Cannot find module '../tools/policy-apply.mjs'`

- [ ] **Step 4: `tools/policy-apply.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ③ 게이트웨이 — 사람이 읽는 정책 한 곳에서 settings.json 을 만든다. 설계안(내용은 검증됨).
//
// ⛔ 덮어쓰지 않는다. permissions 의 allow·deny·ask 세 키만 교체하고 나머지는 보존한다.
//    defaultMode · additionalDirectories · hooks · statusLine 은 정책의 소관이 아니다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const POLICY_PATH = join(HERE, '..', 'policy', 'permissions.json');

export function mergePermissions(settings, policy) {
  return {
    ...settings,
    permissions: {
      ...(settings.permissions ?? {}),
      allow: [...policy.allow],
      deny: [...policy.deny],
      ask: [...policy.ask],
    },
  };
}

export function loadPolicy(path = POLICY_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function settingsPath(root) {
  return join(root, '.claude', 'settings.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const path = settingsPath(root);
  const before = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const after = mergePermissions(before, loadPolicy());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(after, null, 2)}\n`);
  console.log(`반영: ${path}`);
  console.log('⛔ git diff 로 의도한 것만 바뀌었는지 직접 확인한다');
}
```

- [ ] **Step 5: `tools/policy-diff.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ③ 현재 설정과 정책의 괴리. 설계안.
// ⛔ exit 1 하지 않는다 — 대상마다 정당한 추가가 있다. 보고만 한다.

import { readFileSync, existsSync } from 'node:fs';
import { loadPolicy, settingsPath } from './policy-apply.mjs';

const KEYS = ['allow', 'deny', 'ask'];

export function diffPermissions(settings, policy) {
  const missing = [];
  const extra = [];
  for (const k of KEYS) {
    const have = new Set(settings.permissions?.[k] ?? []);
    const want = new Set(policy[k] ?? []);
    for (const v of want) if (!have.has(v)) missing.push(`${k}: ${v}`);
    for (const v of have) if (!want.has(v)) extra.push(`${k}: ${v}`);
  }
  return { missing, extra };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = settingsPath(process.argv[2] ?? process.cwd());
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const d = diffPermissions(settings, loadPolicy());
  console.log(`정책에 있는데 없는 것 ${d.missing.length} · 설정에만 있는 것 ${d.extra.length}`);
  for (const m of d.missing) console.log(`  + ${m}`);
  for (const e of d.extra) console.log(`  ? ${e}`);
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test test/policy.test.mjs`
Expected: PASS — `# pass 6` · `# fail 0`

- [ ] **Step 7: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add policy/permissions.json tools/policy-apply.mjs tools/policy-diff.mjs test/policy.test.mjs
git commit -m "feat: 권한 정책 단일 원천과 반영·괴리 도구

ICFR 은 allow·deny·ask 가 user 스코프와 두 프로젝트 스코프에 흩어져 있고
backend 와 web 이 제각각이다. 사람이 읽는 정책 한 곳에서 생성한다.

⛔ YAML 이 아니라 JSON 이다. 아티클은 permissions.yaml 을 쓰지만 Node 는
YAML 파서를 내장하지 않는다(실측: v26.5.0 에 node:yaml 없음). 의존성 0 이
우선이라 JSON 으로 가고 주석은 _note·_why 키로 남긴다.

⛔ 세 키만 교체하고 나머지는 보존한다. defaultMode·additionalDirectories·
hooks 는 정책의 소관이 아닌데 덮어쓰면 프로젝트 설정이 조용히 날아간다.
테스트가 보존을 직접 지킨다."
```

---

### Task 10: 노출 면적 보고 `surface-report.mjs`

**Files:**
- Create: `tools/surface-report.mjs`
- Test: `test/surface-report.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `surfaceReport({ settings, installed, repoExtensions }) → { plugins: string[], mcpServers: string[], hints: string[] }` — 순수 함수로 두어 테스트가 실제 `~/.claude` 에 묶이지 않게 한다

아티클의 안티패턴 *"모든 도구를 에이전트에 노출"* 을 수치로 만든다.

⚠️ **런타임 도구 개수는 세지 않는다.** 그러려면 MCP 서버를 띄워야 한다. 대신 **선언된 것**을 세고, 대상 저장소에 근거가 없는 플러그인을 힌트로 낸다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/surface-report.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceReport } from '../tools/surface-report.mjs';

test('활성 플러그인과 MCP 서버를 센다', () => {
  const r = surfaceReport({
    settings: { enabledPlugins: { 'a@m': true, 'b@m': false }, mcpServers: { gitlab: {} } },
    repoExtensions: new Set(['.java']),
  });
  assert.deepEqual(r.plugins, ['a@m']);
  assert.deepEqual(r.mcpServers, ['gitlab']);
});

test('⭐ 확장자 근거가 없는 LSP 플러그인을 힌트로 낸다', () => {
  const r = surfaceReport({
    settings: { enabledPlugins: { 'typescript-lsp@m': true } },
    repoExtensions: new Set(['.java']),
  });
  assert.equal(r.hints.length, 1);
  assert.match(r.hints[0], /typescript-lsp/);
  assert.match(r.hints[0], /\.ts/);
});

test('근거가 있으면 힌트를 내지 않는다', () => {
  const r = surfaceReport({
    settings: { enabledPlugins: { 'jdtls-lsp@m': true } },
    repoExtensions: new Set(['.java']),
  });
  assert.deepEqual(r.hints, []);
});

test('규칙에 없는 플러그인은 판단하지 않는다', () => {
  const r = surfaceReport({
    settings: { enabledPlugins: { 'context7@m': true } },
    repoExtensions: new Set(['.java']),
  });
  assert.deepEqual(r.hints, []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/surface-report.test.mjs`
Expected: FAIL — `Cannot find module '../tools/surface-report.mjs'`

- [ ] **Step 3: `tools/surface-report.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ③ 노출 면적. 설계안.
//
// 아티클의 안티패턴 「모든 도구를 에이전트에 노출」을 수치로 만든다.
// ⚠️ 런타임 도구 개수는 안 센다 — MCP 서버를 띄워야 하고, 그 비용이 값보다 크다.
//    선언된 것을 세고, 대상에 근거가 없는 것만 힌트로 낸다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

// 플러그인 이름 조각 → 그것이 의미 있으려면 저장소에 있어야 할 확장자
const NEEDS = {
  'typescript-lsp': ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
  'jdtls-lsp': ['.java'],
  'pyright-lsp': ['.py'],
};

export function surfaceReport({ settings = {}, repoExtensions = new Set() }) {
  const plugins = Object.entries(settings.enabledPlugins ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name);
  const mcpServers = Object.keys(settings.mcpServers ?? {});

  const hints = [];
  for (const p of plugins) {
    const key = Object.keys(NEEDS).find((k) => p.startsWith(k));
    if (!key) continue;
    if (!NEEDS[key].some((e) => repoExtensions.has(e))) {
      hints.push(`${p} — 저장소에 ${NEEDS[key].join('·')} 파일이 없다. 끄는 것을 검토한다`);
    }
  }
  return { plugins, mcpServers, hints };
}

export function scanExtensions(root, skip = new Set(['node_modules', '.git', 'build', 'dist', 'target'])) {
  const found = new Set();
  const walk = (dir, depth) => {
    if (depth > 6) return;
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else found.add(extname(name));
    }
  };
  walk(root, 0);
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
  const user = read(join(homedir(), '.claude', 'settings.json'));
  const proj = read(join(root, '.claude', 'settings.json'));
  const settings = {
    enabledPlugins: { ...user.enabledPlugins, ...proj.enabledPlugins },
    mcpServers: { ...read(join(homedir(), '.claude.json')).mcpServers, ...read(join(root, '.mcp.json')).mcpServers },
  };
  const r = surfaceReport({ settings, repoExtensions: scanExtensions(root) });
  console.log(`활성 플러그인 ${r.plugins.length} · MCP 서버 ${r.mcpServers.length}`);
  for (const p of r.plugins) console.log(`  플러그인 ${p}`);
  for (const m of r.mcpServers) console.log(`  MCP ${m}`);
  for (const h of r.hints) console.log(`  ⚠️ ${h}`);
  console.log('\n⚠️ claude.ai 계정 커넥터는 여기서 못 센다 — 웹 설정이다. 레포 밖 조치가 필요하다');
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/surface-report.test.mjs`
Expected: PASS — `# pass 4` · `# fail 0`

- [ ] **Step 5: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/surface-report.mjs test/surface-report.test.mjs
git commit -m "feat: 노출 면적 보고

아티클의 안티패턴 '모든 도구를 에이전트에 노출'을 세는 도구. ICFR 실측
(2026-09-28)에서 playwright 27개·Google Drive 11개를 비롯한 커넥터가
상시 노출돼 있었고, icfr-web 은 커밋 0건이라 근거가 없었다.

⚠️ 런타임 도구 개수는 세지 않는다. 그러려면 MCP 서버를 전부 띄워야 하고
비용이 값보다 크다. 선언된 것을 세고 대상에 확장자 근거가 없는 LSP
플러그인만 힌트로 낸다.

⚠️ claude.ai 계정 커넥터는 이 도구가 못 본다. 웹 설정이라 레포 밖
조치가 필요하다는 것을 출력에 명시한다."
```

---

# Phase 4 — ① 계약 · ② 지도 · ⑥ 트레이스

### Task 11: 계약 추출 `task-extract.mjs`

**Files:**
- Create: `tools/task-extract.mjs`
- Create: `templates/plan.skeleton.md`
- Test: `test/task-extract.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1) — `cfg.plan`
- Produces: `extractTasks(text) → Array<{ id, title, doneWhen: string[], escalateWhen: string[] }>`

⛔ **계획서가 정본이고 이것은 추출본이다.** 사람은 계획서만 고친다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/task-extract.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTasks } from '../tools/task-extract.mjs';

const PLAN = [
  '# 계획',
  '',
  '### Task 1: 골격',
  '',
  'done_when: ./gradlew test → failures=0',
  'done_when: curl -s localhost:8080/api/health → 200',
  'escalate_when: 마이그레이션 되돌리기가 필요해진다',
  '',
  '- [x] Step 1: 무언가',
  '',
  '### Task 2: 인증',
  '',
  'done_when: ./gradlew test --tests "*AuthControllerTest" → failures=0',
].join('\n');

test('태스크별로 done_when 을 모은다', () => {
  const ts = extractTasks(PLAN);
  assert.equal(ts.length, 2);
  assert.equal(ts[0].id, '1');
  assert.equal(ts[0].title, '골격');
  assert.equal(ts[0].doneWhen.length, 2);
});

test('escalate_when 을 따로 모은다', () => {
  const [t1] = extractTasks(PLAN);
  assert.deepEqual(t1.escalateWhen, ['마이그레이션 되돌리기가 필요해진다']);
});

test('⛔ 다음 태스크의 done_when 이 앞 태스크로 새지 않는다', () => {
  const ts = extractTasks(PLAN);
  assert.equal(ts[1].doneWhen.length, 1);
  assert.match(ts[1].doneWhen[0], /AuthControllerTest/);
});

test('⭐ done_when 이 없는 태스크를 빈 배열로 드러낸다 — 완료 기준 없는 태스크가 보여야 한다', () => {
  const ts = extractTasks('### Task 9: 기준이 없다\n\n- [ ] Step 1: 무언가');
  assert.deepEqual(ts[0].doneWhen, []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/task-extract.test.mjs`
Expected: FAIL — `Cannot find module '../tools/task-extract.mjs'`

- [ ] **Step 3: `tools/task-extract.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ① 요청 → 계약. 설계안(개념은 검증됨 — ICFR 계획서의 Task 표가 완료 기준을 이미 가진다).
//
// ⛔ 계획서가 정본이고 이것은 추출본이다. 여기서 나온 것을 파일로 저장하지 않는다.
//    저장하면 계획서와 두 곳이 되고, 둘이면 반드시 어긋난다.

import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';

const HEAD = /^###\s+Task\s+([\w.-]+)\s*:\s*(.+?)\s*$/;
const DONE = /^\s*done_when:\s*(.+?)\s*$/;
const ESCALATE = /^\s*escalate_when:\s*(.+?)\s*$/;

export function extractTasks(text) {
  const tasks = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = HEAD.exec(line);
    if (h) {
      cur = { id: h[1], title: h[2], doneWhen: [], escalateWhen: [] };
      tasks.push(cur);
      continue;
    }
    if (!cur) continue;
    const d = DONE.exec(line);
    if (d) { cur.doneWhen.push(d[1]); continue; }
    const e = ESCALATE.exec(line);
    if (e) cur.escalateWhen.push(e[1]);
  }
  return tasks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig(process.argv[2] ?? process.cwd());
  if (!cfg.plan) throw new Error('harness.json 에 plan 이 없다');
  const tasks = extractTasks(readFileSync(cfg.plan, 'utf8'));
  const bare = tasks.filter((t) => t.doneWhen.length === 0);
  console.log(`태스크 ${tasks.length} · 완료 기준 없는 것 ${bare.length}`);
  for (const t of tasks) {
    console.log(`\nTask ${t.id}: ${t.title}`);
    for (const d of t.doneWhen) console.log(`  ✅ ${d}`);
    for (const e of t.escalateWhen) console.log(`  ⚠️ ${e}`);
    if (t.doneWhen.length === 0) console.log('  ⛔ 완료 기준이 없다 — 무엇으로 끝났다고 말할 것인가');
  }
}
```

- [ ] **Step 4: `templates/plan.skeleton.md` 를 작성한다**

```markdown
# <기능> 구현 계획

**Spec:** <설계서 경로>

## Global Constraints

<프로젝트 전역 요구 — 버전 하한, 명명 규약, 플랫폼. 각 한 줄>

---

### Task 1: <이름>

done_when: <명령> → <판정 기준>
escalate_when: <여기서는 멈추고 사람을 부른다>

**Files:** Create/Modify/Test 경로

- [ ] **Step 1: 실패하는 테스트를 작성한다**
- [ ] **Step 2: 실패하는지 실행해 확인한다**
- [ ] **Step 3: 최소 구현**
- [ ] **Step 4: 통과하는지 실행해 확인한다**
- [ ] **Step 5: 커밋**
```

⛔ **`done_when` 은 값이 아니라 명령이다.** 「테스트가 통과한다」가 아니라 실행 가능한 명령과 판정 기준을 적는다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/task-extract.test.mjs`
Expected: PASS — `# pass 4` · `# fail 0`

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/task-extract.mjs templates/plan.skeleton.md test/task-extract.test.mjs
git commit -m "feat: 계획서에서 완료 기준을 뽑는다

아티클 ①(요청→계약)을 계획서 안에서 푼다. contracts/task.schema.json 을
따로 두면 계획서와 두 곳이 되고, '저장소가 둘이면 반드시 어긋난다'.
⇒ 계획서가 정본, 이것은 추출본. 결과를 파일로 저장하지 않는다.

⭐ done_when 이 없는 태스크를 드러내는 것이 이 도구의 값이다. 완료 기준
없는 태스크는 '끝났다'를 주장할 근거가 없다."
```

---

### Task 12: 지도 검사 `context-audit.mjs`

**Files:**
- Create: `tools/context-audit.mjs`
- Test: `test/context-audit.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` (Task 1) — `cfg.map`
- Produces: `auditMap(text, exists: (path) => boolean) → { sections, duplicates, gaps, brokenRefs, lines }` — `exists` 를 주입해 테스트가 파일시스템에 안 묶이게 한다

⭐ ICFR 의 「`## 5.` 가 두 번, `## 6.` 결번」이 여기서 잡힌다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/context-audit.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditMap } from '../tools/context-audit.mjs';

const ALWAYS = () => true;

test('⭐ 절 번호 중복을 잡는다', () => {
  const r = auditMap('## 1. 가\n## 2. 나\n## 2. 다\n', ALWAYS);
  assert.deepEqual(r.duplicates, [2]);
});

test('⭐ 절 번호 결번을 잡는다', () => {
  const r = auditMap('## 1. 가\n## 2. 나\n## 4. 라\n', ALWAYS);
  assert.deepEqual(r.gaps, [3]);
});

test('ICFR 의 실제 증상 — 5가 둘, 6 결번', () => {
  const r = auditMap('## 4. 가\n## 5. 나\n## 5. 다\n## 7. 라\n', ALWAYS);
  assert.deepEqual(r.duplicates, [5]);
  assert.deepEqual(r.gaps, [6]);
});

test('정상이면 둘 다 비어 있다', () => {
  const r = auditMap('## 1. 가\n## 2. 나\n## 3. 다\n', ALWAYS);
  assert.deepEqual(r.duplicates, []);
  assert.deepEqual(r.gaps, []);
});

test('⭐ 백틱 경로가 실재하지 않으면 깨진 참조다', () => {
  const r = auditMap('## 1. 가\n\n절차는 `docs/없는파일.md` 를 따른다\n', (p) => p !== 'docs/없는파일.md');
  assert.deepEqual(r.brokenRefs, ['docs/없는파일.md']);
});

test('⛔ 경로처럼 안 생긴 백틱은 참조로 보지 않는다', () => {
  const r = auditMap('## 1. 가\n\n`git status` 와 `snake_case` 를 쓴다\n', () => false);
  assert.deepEqual(r.brokenRefs, []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/context-audit.test.mjs`
Expected: FAIL — `Cannot find module '../tools/context-audit.mjs'`

- [ ] **Step 3: `tools/context-audit.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ② 컨텍스트 컴파일 — 지도가 지도인지 백과사전인지 잰다. 설계안.
// ⛔ exit 1 하지 않는다. 지도가 길다는 것은 결함이 아니라 신호다.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const SECTION = /^##\s+(\d+)\./;
// 확장자가 있거나 슬래시를 포함하고, 공백이 없는 것만 경로로 본다
const PATHISH = /^[\w./-]+(?:\.\w+|\/)[\w./-]*$/;

export function auditMap(text, exists) {
  const lines = text.split('\n');
  const nums = [];
  for (const line of lines) {
    const m = SECTION.exec(line);
    if (m) nums.push(Number(m[1]));
  }

  const seen = new Set();
  const duplicates = [];
  for (const n of nums) {
    if (seen.has(n) && !duplicates.includes(n)) duplicates.push(n);
    seen.add(n);
  }

  const gaps = [];
  if (nums.length > 0) {
    for (let n = Math.min(...nums); n <= Math.max(...nums); n += 1) {
      if (!seen.has(n)) gaps.push(n);
    }
  }

  const brokenRefs = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const ref = m[1];
    if (!PATHISH.test(ref)) continue;
    if (!exists(ref) && !brokenRefs.includes(ref)) brokenRefs.push(ref);
  }

  return { sections: nums.length, duplicates, gaps, brokenRefs, lines: lines.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig(process.argv[2] ?? process.cwd());
  const r = auditMap(readFileSync(cfg.map, 'utf8'), (p) => existsSync(join(cfg.root, p)));
  console.log(`${cfg.map}\n절 ${r.sections} · ${r.lines}줄`);
  if (r.duplicates.length) console.log(`  ⛔ 절 번호 중복: ${r.duplicates.join(', ')}`);
  if (r.gaps.length) console.log(`  ⛔ 절 번호 결번: ${r.gaps.join(', ')}`);
  for (const b of r.brokenRefs) console.log(`  ⚠️ 깨진 참조: ${b}`);
  if (r.lines > 400) console.log('  ⚠️ 400줄을 넘었다 — 지도가 백과사전이 되고 있는지 본다');
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/context-audit.test.mjs`
Expected: PASS — `# pass 6` · `# fail 0`

- [ ] **Step 5: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/context-audit.mjs test/context-audit.test.mjs
git commit -m "feat: 지도 검사 — 절 번호와 깨진 참조

ICFR 의 AGENTS.md 는 '## 5.' 가 두 번 나오고 '## 6.' 이 없다. 지도 역할을
하는 문서라 '§6 을 보라'가 아무 데도 닿지 않는다. 사람 눈으로는 몇 주간
안 잡혔다.

깨진 참조는 경로처럼 생긴 백틱만 본다. git status 나 snake_case 같은
것을 경로로 오인하면 경고가 노이즈가 되고, 노이즈가 되면 사람이 검사
전체를 무시한다.

⛔ exit 1 하지 않는다. 지도가 길다는 것은 결함이 아니라 신호다."
```

---

### Task 13: 트레이스 복원 `trace-read.mjs`

**Files:**
- Create: `tools/trace-read.mjs`
- Test: `test/trace-read.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `projectSlug(root: string) → string` — `/Users/x/Projects/y` → `-Users-x-Projects-y`
  - `summarizeTranscript(lines: string[]) → { userTurns, toolCalls: Map<string, number>, files: number }`

⛔ **새 로그를 쓰지 않는다.** 세션 트랜스크립트에 이미 전부 있다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/trace-read.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSlug, summarizeTranscript } from '../tools/trace-read.mjs';

test('경로를 트랜스크립트 슬러그로 바꾼다', () => {
  assert.equal(projectSlug('/Users/x/Projects/ICFR/icfr-backend'), '-Users-x-Projects-ICFR-icfr-backend');
});

test('사람이 친 턴만 센다', () => {
  const lines = [
    JSON.stringify({ type: 'user', promptSource: 'typed', message: {} }),
    JSON.stringify({ type: 'user', promptSource: 'sdk', message: {} }),
    JSON.stringify({ type: 'assistant', message: {} }),
  ];
  const s = summarizeTranscript(lines);
  assert.equal(s.userTurns, 1, 'sdk 턴은 벤치마크 세션이라 세지 않는다');
});

test('도구 호출을 이름별로 센다', () => {
  const lines = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }, { type: 'tool_use', name: 'Read' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }),
  ];
  const s = summarizeTranscript(lines);
  assert.equal(s.toolCalls.get('Bash'), 2);
  assert.equal(s.toolCalls.get('Read'), 1);
});

test('⛔ 깨진 줄을 만나도 멈추지 않는다', () => {
  const lines = ['{깨짐', JSON.stringify({ type: 'user', promptSource: 'typed', message: {} })];
  assert.equal(summarizeTranscript(lines).userTurns, 1);
});

test('빈 트랜스크립트는 0 이다', () => {
  const s = summarizeTranscript([]);
  assert.equal(s.userTurns, 0);
  assert.equal(s.toolCalls.size, 0);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/trace-read.test.mjs`
Expected: FAIL — `Cannot find module '../tools/trace-read.mjs'`

- [ ] **Step 3: `tools/trace-read.mjs` 를 작성한다**

```js
#!/usr/bin/env node
// ⑥ 트레이스. 설계안.
//
// ⛔⛔ 아티클과 다르게 간다. runs/traces.jsonl 을 새로 쓰지 않는다.
//
// 세션 트랜스크립트(~/.claude/projects/<슬러그>/*.jsonl)에 프롬프트 원문이
// 그대로 있어 어떤 채점 변형이든 사후 재측정이 된다. 새 로그는 그때의
// 점수만 남아 A/B 를 못 돌린다 — context-graph 가 같은 자리에서 도달한 결론이다.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function projectSlug(root) {
  return root.replace(/\//g, '-');
}

export function summarizeTranscript(lines) {
  let userTurns = 0;
  const toolCalls = new Map();
  const files = new Set();

  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'user' && ev.promptSource === 'typed') userTurns += 1;
    for (const c of ev.message?.content ?? []) {
      if (c.type !== 'tool_use') continue;
      toolCalls.set(c.name, (toolCalls.get(c.name) ?? 0) + 1);
      if (c.input?.file_path) files.add(c.input.file_path);
    }
  }
  return { userTurns, toolCalls, files: files.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const dir = join(homedir(), '.claude', 'projects', projectSlug(root));
  if (!existsSync(dir)) {
    console.log(`트랜스크립트가 없다: ${dir}`);
    process.exit(0);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  let turns = 0;
  const tools = new Map();
  for (const f of files) {
    const s = summarizeTranscript(readFileSync(join(dir, f), 'utf8').split('\n'));
    turns += s.userTurns;
    for (const [k, v] of s.toolCalls) tools.set(k, (tools.get(k) ?? 0) + v);
  }
  console.log(`세션 ${files.length} · 사람이 친 턴 ${turns}`);
  for (const [k, v] of [...tools].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(v).padStart(5)} ${k}`);
  }
  console.log('\n⇒ 실패 원인 분류는 사람이 state.lessons 에 적는다. 이 도구는 세기만 한다');
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/`
Expected: PASS — 전체 `# fail 0`

- [ ] **Step 5: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add tools/trace-read.mjs test/trace-read.test.mjs
git commit -m "feat: 트레이스를 새로 쓰지 않고 트랜스크립트에서 복원한다

⛔ 아티클과 갈라지는 유일한 지점이다. 아티클은 runs/traces.jsonl 을
쓰라고 하지만, ~/.claude/projects/<슬러그>/*.jsonl 에 프롬프트 원문이
이미 있어 어떤 채점 변형이든 사후 재측정이 된다. 새 로그는 그때의 점수만
남아 A/B 를 못 돌린다.

promptSource=='sdk' 는 벤치마크 세션이라 사람이 친 턴에서 뺀다. 섞으면
'일상 대화에서 얼마나 쓰였나'를 잴 때 판정이 뒤집힌다.

깨진 JSON 줄을 만나도 멈추지 않는다 — 트랜스크립트는 세션이 비정상
종료되면 마지막 줄이 잘려 있다."
```

---

# Phase 5 — 이식과 1호 적용

### Task 14: `SETUP.md` 와 `README.md`

**Files:**
- Create: `SETUP.md`
- Create: `README.md`
- Create: `templates/harness.json`
- Create: `templates/AGENTS.snippet.md`
- Create: `templates/state/current.md`

**Interfaces:**
- Consumes: Task 1~13 의 모든 도구
- Produces: 대상 프로젝트에서 `~/Projects/agent-harness/SETUP.md 를 읽고 이 프로젝트에 적용해줘` 로 설치 가능한 상태

⚠️ 코드가 없어 자동 테스트가 없다. 검증은 Task 15 에서 ICFR 에 실제로 돌리는 것이다.

- [ ] **Step 1: `templates/harness.json` 을 작성한다**

```json
{
  "_note": "규격은 ../harness.schema.json. 경로는 이 파일이 있는 저장소 루트 기준.",
  "map": "AGENTS.md",
  "plan": "<계획서 경로 — 대상 밖이면 ../ 로>",
  "state": {
    "current": "<진행 상태 대장 — 없으면 이 키를 지운다>",
    "currentRoot": "<대장의 경로가 가리키는 루트>",
    "decisions": "<가정 적립 파일 — 없으면 templates/state/decisions.md 를 복사>",
    "lessons": "<교훈 파일 — 없으면 templates/state/lessons.md 를 복사>"
  },
  "checks": [
    { "id": "<이름>", "cmd": "<명령>", "kind": "junit-xml", "evidence": "<결과 파일 디렉터리>" }
  ]
}
```

- [ ] **Step 2: `templates/state/current.md` 를 작성한다**

```markdown
# 진행 상태 대장

루프가 어디까지 갔는지가 **대화 컨텍스트가 아니라 이 파일에 있다.** 세션이 끊겨도
`node tools/state-check.mjs` 한 번이면 이어받는다.

| | |
|---|---|
| 대상 루트 | `<harness.json 의 state.currentRoot>` |
| 갱신일 | YYYY-MM-DD |
| 검사 | `node tools/state-check.mjs` |

## 상태 값

| 값 | 뜻 |
|---|---|
| `분석완료` | 끝까지 읽고 대조했다 |
| `부분분석` | 일부만 봤다. **다시 봐야 한다** |
| `미분석` | 아직 열어보지 않았다 |
| `해당없음` | 대상 밖 |

**해시가 바뀌면 상태가 무효가 된다.**

⛔ **읽은 척하지 않는다.** grep 으로 일부만 본 것은 `부분분석` 이다.

## 대장

| 파일 | 상태 | 해시 | 회차 | 메모 |
|---|---|---|---|---|
```

- [ ] **Step 3: `templates/AGENTS.snippet.md` 를 작성한다**

```markdown
<!--
⛔ 그대로 붙이지 않는다. <…> 를 대상 프로젝트를 조사해서 채운다.
   채울 것: 검사 명령 · 계획서 경로 · 상태 파일 경로. SETUP.md §4 참조.
-->

## <N>. 멈추지 않는다

**작업 중 사용자에게 묻지 않는다.** 확인이 필요한 것은 `<decisions 경로>` 에 모으고
**가정을 명시한 채 구현을 계속한다.**

판단이 갈리면 **되돌리기 쉬운 쪽**을 고르고, 그 선택과 이유를 적는다.

### 예외 — 여기서는 멈춘다

- 되돌릴 수 없는 파괴적 작업 (데이터 삭제, 이력 재작성)
- 레포 밖으로 나가는 작업 (push, 배포, 외부 서비스 호출)
- 비밀값을 다루는 작업

## <N+1>. 완료는 증거로 주장한다

⛔ **`BUILD SUCCESSFUL` · 종료코드 0 으로 통과를 주장하지 않는다.** 테스트가 0개여도 성공한다.

```bash
node tools/verify.mjs      # 선언된 검사 전량 — 결과 파일을 읽어 판정한다
```

태스크를 닫을 때는 `close-task` 스킬을 따른다.

## <N+2>. 상태는 파일이 기억한다

어디까지 갔는지를 **대화 컨텍스트에 두지 않는다** — 세션이 끊기면 사라진다.

```bash
node tools/state-check.mjs      # 재작업 대상 · 잔량
node tools/decision-check.mjs   # 답을 기다리는 가정
node tools/lesson-promote.mjs   # 규약으로 올릴 반복 실패
```

## <N+3>. 같은 실패가 두 번이면 규약으로 올린다

```bash
node tools/lesson-append.mjs <<'EOF'
{"symptom":"<무엇이 보였나>","cause":"<근본 원인>","category":"검증 부족","guard":""}
EOF
```

분류: `누락된 컨텍스트` · `잘못된 도구` · `미흡한 권한` · `검증 부족`

⛔ **증상만 적는 것은 일기다.** 근본 원인이 없으면 도구가 거부한다.
```

- [ ] **Step 4: `SETUP.md` 를 작성한다**

`context-graph/SETUP.md` 와 같은 형식 — Claude 가 읽고 실행하는 지시서다.

````markdown
# SETUP — 기존 프로젝트에 하네스를 얹는다

⛔ **이 문서는 사람이 아니라 Claude Code 에게 주는 지시서다.**

## ⛔ 절차 — 순서를 지킨다

### 1. 안전 확인

```bash
git -C <대상> rev-parse --is-inside-work-tree
git -C <대상> status --porcelain
ls <대상>/AGENTS.md
node --version                       # 20+ 인가
```

| 걸리면 | 행동 |
|---|---|
| `AGENTS.md` 가 추적 중이다 | ⚠️ 팀에 나가는 파일이다. **절 추가를 확인받는다** |
| `AGENTS.md` 가 없다 | 새로 만든다 |
| 미커밋 변경이 있다 | ⛔ 멈추고 사용자에게 알린다 |
| Node 20+ 가 없다 | ⛔ 중단 |

⛔ **`AGENTS.md` 를 덮어쓰지 않는다. 절을 뒤에 추가한다.**

⭐ **`CLAUDE.md` 다리를 놓지 않는다.** Claude Code 2.1.283 은 `AGENTS.md` 를 자동 로드한다
(실측 2026-09-28, §6 의 방법으로 확인). 예전 안내와 다르다 — 복사본을 만들면 두 파일이 갈라진다.

### 2. 도구 복사

```bash
mkdir -p <대상>/tools <대상>/lib
cp ~/Projects/agent-harness/lib/*.mjs        <대상>/lib/
cp ~/Projects/agent-harness/tools/*.mjs      <대상>/tools/
cp ~/Projects/agent-harness/checks/verify.mjs <대상>/tools/
cp -r ~/Projects/agent-harness/templates/skills/* <대상>/.claude/skills/
```

### 3. `harness.json` 을 채운다

⛔ **대상이 이미 쓰는 경로를 그대로 적는다. 파일을 옮기지 않는다.**

조사할 것:

```bash
ls <대상>/{AGENTS,Need-Check,CLAUDE}.md 2>/dev/null   # 이미 있는 상태 파일
ls <대상>/docs/                                        # 대장이 있나
grep -rn 'tasks.register\|"scripts"' <대상>            # 검사 명령이 뭔가
```

`checks` 는 **실제로 도는 명령**만 적는다. 결과 파일 경로를 확인한다:

```bash
ls <대상>/build/test-results/test/*.xml    # gradle
ls <대상>/coverage/ <대상>/junit.xml       # node
```

### 4. `AGENTS.md` 에 절 추가

`templates/AGENTS.snippet.md` 의 `<…>` 를 채워 **끝에 추가한다.** 절 번호는 기존 마지막 +1 부터.

```bash
node tools/context-audit.mjs <대상>      # ⛔ 절 번호 중복·결번이 0 이어야 한다
```

### 5. ⭐ 소급 입력 — 가장 중요하다

⛔ **빈 상태 파일은 값이 0이다.** 설치만 하면 사용자는 「효과가 없다」고 판단한다.

최근 이력에서 **교훈 2~3건**을 소급 입력한다. 근거는 git 이다:

```bash
git -C <대상> log --oneline -30 | grep -iE 'fix|버그|수정|잘못|누락'
```

커밋 본문에서 **근본 원인**을 찾아 넣는다. 증상만 있으면 넣지 않는다.

### 6. 검증 — ⛔ 자기 보고도 도구 출력도 믿지 않는다

**6-a. 도구가 도는가**

```bash
cd <대상>
node tools/verify.mjs          # ⛔ exit 0
node tools/state-check.mjs     # 대장이 있으면
node tools/decision-check.mjs
node tools/context-audit.mjs
node tools/lesson-promote.mjs
git status --porcelain         # ⛔ 의도한 것만 바뀌었는가
```

**6-b. ⭐ 새 세션이 실제로 읽는가**

```bash
cd <대상>
claude -p --model haiku "도구를 절대 쓰지 마라. 파일을 읽지도 검색하지도 마라.
질문: <방금 추가한 절에만 있는 사실>. 모르면 정확히 '모름'."
```

| 판정 | 의미 |
|---|---|
| 정확히 답한다 | ✅ 자동 로드가 된다 |
| 「모름」 | ⛔ 절이 안 들어갔다 — `AGENTS.md` 위치와 내용을 다시 본다 |
| 도구를 쓰려 한다 | ⚠️ 금지를 더 강하게 쓴다 |

⭐ **반드시 음성 대조도 한다.** `AGENTS.md` 에 **없는** 것을 물어 「모름」이 나오는지 본다.

**6-c. ⚠️ `/clear` 직후도 본다**

미해결 관측이 있다 — `/clear` 후 세션에 `AGENTS.md` 가 안 들어온 사례 1회. 재현되면 기록한다.

**6-d. `AGENTS.md` diff 를 사용자에게 보여준다.** 기존 내용 보존은 사용자만 판정한다.

### 7. 보고 — 3단

```markdown
## ✅ 얹은 것
- <경로>: <무엇을>

## ⛔ 사용자가 결정해야 하는 것
1. <무엇> — <왜 내가 못 정하는가>

## ⚠️ 이 프로젝트에 새로 생기는 제약
- 태스크를 닫을 때 close-task 를 따라야 한다
- <그 외>
```

## ⛔ 하지 않는 것

| ⛔ | 왜 |
|---|---|
| 대상의 기존 상태 파일을 옮기기 | `AGENTS.md` 의 기존 참조가 깨진다 |
| `CLAUDE.md` 복사본 만들기 | 두 파일이 갈라진다. 자동 로드되므로 불필요하다 |
| 훅으로 상태를 자동 기록 | 검증 관문이 없다 |
| 검사를 pre-push 에 전부 걸기 | 진행도 게이트를 correctness 게이트로 쓰면 급한 수정이 막힌다 |
````

- [ ] **Step 5: `README.md` 를 작성한다**

설계서 §1·§3·§8 을 옮긴다. 반드시 포함할 것:

- 세 레포 분담표 (`context-graph` · `agent-init-template` · `agent-harness`)
- **정직한 값** 표 (설계서 §3 그대로) — 「이미 되나」가 ✅ 인 줄은 고유값이 아니라고 명시
- ⛔ **도입하지 말아야 할 때** (설계서 §8 그대로)
- ⭐ **`AGENTS.md` 는 자동 로드된다** (설계서 §2) — `context-graph` 의 낡은 전제를 바로잡는 문단
- 각 도구 한 줄 설명 + `검증됨`/`설계안` 딱지
- **실측 근거는 Task 15 이후에 채운다** — 지금은 「1호 적용 전, 실측 없음」이라고 적는다

⛔ **없는 실측을 적지 않는다.** `context-graph` 의 README 가 강한 것은 숫자가 진짜이기 때문이다.

- [ ] **Step 6: 커밋한다**

```bash
cd ~/Projects/agent-harness
git add SETUP.md README.md templates/
git commit -m "docs: 설치 지시서와 README

context-graph 의 SETUP 형식을 따른다 — 사람이 손으로 따라 하지 않고
Claude 가 읽고 실행하는 지시서다.

⭐ CLAUDE.md 다리를 놓지 않는다. context-graph 가 '이걸 빠뜨리면 전부
무용지물'이라 한 그 단계인데, 2.1.283 에서 AGENTS.md 가 자동 로드되는
것을 확인했다(양성·음성 대조). 복사본을 만들면 두 파일이 갈라질 뿐이다.

⭐ 소급 입력을 절차에 넣는다. 빈 상태 파일의 값은 0이고, 설치만 하면
사용자는 효과가 없다고 판단한다.

README 의 실측 절은 비워 둔다. 1호 적용 전에 숫자를 적으면 그 순간
이 레포가 스스로의 원칙을 어긴다."
```

---

### Task 15: ICFR 1호 적용 — ⭐ 진짜 검증

**Files:**
- Modify: `~/.claude/settings.json` — 플러그인 비활성
- Delete: `~/.claude/agents/design-review-agent.md` · `~/.claude/docs/design-review-reference/`
- Modify: `~/Projects/ICFR/icfr-backend/AGENTS.md` — 절 번호 수정 + 하네스 절 추가
- Create: `~/Projects/ICFR/icfr-backend/harness.json` · `lib/` · `tools/` · `docs/lessons.md`
- Modify: `~/Projects/agent-harness/README.md` — 실측을 채운다

**Interfaces:**
- Consumes: Task 1~14 전부
- Produces: 실측 숫자. 이것이 없으면 이 레포는 설계안일 뿐이다

⛔ **이 태스크의 산출물은 코드가 아니라 판정이다.** 설계안 딱지가 붙은 것 중 무엇이 실제로 값을 냈는가.

- [ ] **Step 1: 사용자에게 정리 목록을 확인받는다**

설계서 §9 의 목록을 그대로 보여주고 승인받는다. ⛔ **승인 전에 아무것도 지우지 않는다.**

- [ ] **Step 2: 백업하고 정리한다**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.before-harness
cd ~/.claude
# 비활성 — 삭제가 아니라 false 로 둔다. 되돌리기가 싸다
node -e '
const f="settings.json", s=JSON.parse(require("fs").readFileSync(f,"utf8"));
for (const p of ["superpowers","security-guidance","claude-md-management","playwright","frontend-design","typescript-lsp"])
  s.enabledPlugins[p+"@claude-plugins-official"]=false;
require("fs").writeFileSync(f, JSON.stringify(s,null,2)+"\n");
console.log("비활성:", Object.entries(s.enabledPlugins).filter(([,v])=>!v).map(([k])=>k).join(" "));
'
```

⛔ **깨진 에이전트와 잔재는 사용자 승인 후 지운다.** `rm` 은 전역 deny 목록에 있으므로 사용자가 직접 실행하거나 명시적으로 허용해야 한다.

- [ ] **Step 3: AGENTS.md 절 번호를 고친다**

현재: `## 5.` 가 레퍼런스 분석과 커밋 둘, `## 6.` 결번.

```bash
cd ~/Projects/ICFR/icfr-backend
grep -n '^## [0-9]' AGENTS.md          # 먼저 실제 상태를 본다
```

⛔ **`sed` 로 일괄 치환하지 않는다.** `AGENTS.md §4` 가 금지한 바로 그 패턴이다 — 앵커가 안 맞으면 조용히 아무것도 안 한다. 절 제목을 하나씩 확인하고 고친 뒤 다시 `grep` 으로 검증한다.

```bash
node ~/Projects/agent-harness/tools/context-audit.mjs .   # ⛔ 중복·결번 0
```

- [ ] **Step 4: 하네스를 얹는다**

`SETUP.md` 를 따른다. ICFR 의 `harness.json` 은 이렇게 된다:

```json
{
  "map": "AGENTS.md",
  "plan": "../docs/plans/2026-09-22-backend-phase1.md",
  "state": {
    "current": "docs/reference-audit.md",
    "currentRoot": "~/Downloads/icfr-frontend",
    "decisions": "Need-Check.md",
    "lessons": "docs/lessons.md"
  },
  "checks": [
    { "id": "테스트", "cmd": "./gradlew test", "kind": "junit-xml", "evidence": "build/test-results/test" },
    { "id": "규칙커버리지", "cmd": "./gradlew specCoverage", "kind": "exit-code" },
    { "id": "스펙스냅샷", "cmd": "./gradlew openapiSnapshot", "kind": "file-unchanged", "evidence": "docs/api/openapi.json" }
  ]
}
```

- [ ] **Step 5: ⭐ LESSONS 를 소급 입력한다**

ICFR 에서 이미 승격된 세 건을 근거와 함께 넣는다. **`guard` 를 채워서** 넣는다 — 이미 막는 것이 있으므로 승격 후보로 다시 뜨면 안 된다.

```bash
cd ~/Projects/ICFR/icfr-backend
for j in \
'{"symptom":"sed/.replace() 로 여러 파일을 고쳤는데 아무것도 안 바뀌고 커밋됐다. 테스트 수정 두 번이 이렇게 무산됐다","cause":"앵커 문자열이 대상 파일에 없었고, 치환 실패가 오류를 내지 않는다","category":"검증 부족","guard":"AGENTS.md §4"}' \
'{"symptom":"Flyway 마이그레이션이 예외도 경고도 없이 돌지 않았다","cause":"Spring Boot 4 가 자동설정을 기술별 모듈로 쪼갰고 모듈이 빠지면 기능이 조용히 비활성화된다","category":"누락된 컨텍스트","guard":"AGENTS.md §3 음성 케이스"}' \
'{"symptom":"OpenAPI 스펙에서 스키마 3개가 하나로 뭉개져 계약이 거짓말을 했다","cause":"여러 도메인이 CreateBody 같은 같은 DTO 이름을 써서 springdoc 이 스키마를 합쳤다","category":"검증 부족","guard":"AGENTS.md §8"}' ; do
  node tools/lesson-append.mjs <<< "$j"
done
node tools/lesson-promote.mjs    # ⛔ guard 가 있으므로 "승격 후보 없음" 이어야 한다
```

- [ ] **Step 6: 도구 전량을 ICFR 에서 돌린다**

```bash
cd ~/Projects/ICFR/icfr-backend
node tools/verify.mjs          ; echo "verify exit=$?"
node tools/state-check.mjs     ; echo "state exit=$?"
node tools/decision-check.mjs
node tools/context-audit.mjs
node tools/task-extract.mjs
node tools/trace-read.mjs
node tools/surface-report.mjs
node tools/policy-diff.mjs
git status --porcelain
```

⛔ **기대값을 미리 적어둔다:**

| 도구 | 기대 |
|---|---|
| `verify` | exit 0 · **테스트 171 · 실패 0 · 오류 0** (실측 2026-09-28. `Need-Check.md` 의 152 는 09-23 값이라 낡았다) |
| `state-check` | 대장 52행 · 잔량 24 (`부분분석` 13 + `미분석` 11) · 소멸 0 |
| `decision-check` | 열린 결정 4건 (Q1~Q4) · 갱신 후 5일 초과 → **경고 나옴** |
| `context-audit` | Step 3 이후 중복·결번 **0** |
| `lesson-promote` | 승격 후보 **없음** (셋 다 guard 있음) |

⛔ **기대와 다르면 도구가 틀린 것일 수도, ICFR 이 틀린 것일 수도 있다.** 어느 쪽인지 가른 뒤 고친다.

- [ ] **Step 7: ⭐ 새 세션 검증**

```bash
cd ~/Projects/ICFR/icfr-backend
claude -p --model haiku "도구를 절대 쓰지 마라. 파일을 읽지도 검색하지도 마라.
질문: 이 레포에서 완료를 주장하기 전에 무엇을 돌려야 하나? 모르면 '모름'."

claude -p --model haiku "도구를 절대 쓰지 마라. 질문: 이 레포의 배포 승인권자는 누구인가? 모르면 '모름'."
```

양성은 `node tools/verify.mjs` 를 답해야 하고, 음성은 「모름」이어야 한다.

- [ ] **Step 8: README 의 실측을 채운다**

Step 6~7 에서 나온 **실제 숫자**를 적는다. 그리고 **설계안 딱지를 판정한다:**

| 도구 | 1호에서 값을 냈나 | 딱지 |
|---|---|---|
| `verify` | | |
| `state-check` | | |
| `decision-check` | | |
| `lesson-append`/`promote` | | |
| `context-audit` | | |
| `task-extract` | | |
| `trace-read` | | |
| `surface-report` | | |
| `policy-apply`/`diff` | | |

⛔ **값을 못 낸 것은 `설계안` 으로 남긴다. 억지로 승격시키지 않는다.** 값을 못 낸 이유도 적는다 — 그것이 다음 이식의 근거다.

- [ ] **Step 9: 양쪽을 커밋한다**

```bash
cd ~/Projects/ICFR/icfr-backend
git add AGENTS.md harness.json lib/ tools/ docs/lessons.md .claude/skills/
git commit -m "feat: agent-harness 를 얹고 AGENTS.md 절 번호를 고친다

<실제로 무엇이 바뀌었고 무엇이 검증됐는지>"

cd ~/Projects/agent-harness
git add README.md
git commit -m "docs: ICFR 1호 적용 실측

<실제 숫자와 딱지 판정>"
```

⛔ ICFR 레포는 **한글 커밋 · `Co-Authored-By` 없음** 이다 (`AGENTS.md §5`). ⛔ **push 하지 않는다.**

---

# 자체 검토

**1. 스펙 커버리지** — 설계서 §4 의 6역할 전부에 태스크가 있다.

| 설계서 | 태스크 |
|---|---|
| ① 계약 | Task 11 + `templates/plan.skeleton.md` |
| ② 컨텍스트 | Task 12 + `templates/AGENTS.snippet.md` (Task 14) |
| ③ 게이트웨이 | Task 9 (정책) · Task 10 (노출 면적) |
| ④ STATE | Task 5 |
| ④ DECISIONS | Task 6 |
| ④ LESSONS | Task 7 · Task 8 |
| ⑤ 증거 | Task 2 · Task 3 · Task 4 |
| ⑥ 트레이스 | Task 13 |
| §5 디렉터리 | Task 1 (`harness.schema.json`) · Task 14 (`templates/`) |
| §7 검증 방법 | Task 14 `SETUP.md §6` · Task 15 Step 7 |
| §8 도입 금지 | Task 14 `README.md` |
| §9 1호 적용 | Task 15 |

**2. 플레이스홀더** — 모든 코드 단계에 실제 코드가 있다. `<…>` 는 **템플릿 파일 안**에만 있고, 그것은 SETUP 이 대상별로 채우도록 설계된 자리다 (설계서 §5 와 일치).

**3. 타입 일관성**

| 이름 | 정의 | 사용 |
|---|---|---|
| `loadConfig(root)` | Task 1 | Task 3·5·6·7·8·11·12 |
| `cfg.state.currentRoot` | Task 5 (config 확장) | Task 5 |
| `judgeJunitXml(contents)` | Task 2 | Task 3 |
| `parseAuditRows(text)` / `hash12(bytes)` | Task 5 | Task 5 |
| `CATEGORIES` | Task 7 | Task 8 (문자열 대조) · Task 14 스니펫 |
| `'⛔ 아직 없다'` (guard 기본값) | Task 7 | Task 8 `NO_GUARD` · Task 15 Step 5 |
| `mergePermissions` / `diffPermissions` | Task 9 | Task 9 |
| `loadPolicy` / `settingsPath` | Task 9 `policy-apply` | Task 9 `policy-diff` 가 import |

⚠️ **경로 하나가 어긋난다** — `checks/verify.mjs` 는 레포에서 `checks/` 에 있지만 SETUP 은 대상의 `tools/` 로 복사한다. 그래서 대상에서는 `node tools/verify.mjs` 다. `verify.mjs` 의 `import { loadConfig } from '../lib/config.mjs'` 는 양쪽 모두에서 성립한다 (`checks/` 와 `tools/` 둘 다 루트 한 단계 아래). ⛔ **Task 15 Step 6 에서 실제로 확인한다.**

# 남은 미결 — 사용자 답변 대기

계획 실행을 막지 않는다. Task 15 전에 정해지면 반영한다.

1. `icms-control/CLAUDE.md` — `AGENTS.md` 전문 복사본 + 동기화 규칙. 정리 범위에 넣을지
2. 커밋 트레일러 — `agent-harness` 에 `Co-Authored-By` 를 넣을지 (`context-graph` 0건 / `agent-init-template` 10건으로 갈림)
3. `ICFR/docs` 버전 관리 — 설계서 §10 에 발견 사항으로만 남아 있다
