# agent-harness 구현 계획 (A안)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** superpowers 흐름 위에 「완료의 결정론적 증거」와 「가정·교훈의 적립」만 얹는, 어느 프로젝트에나 설치되는 의존성 0 하네스를 만들고 합성 대상에서 효과를 잰다.

**Architecture:** 대상에는 `.harness/`(도구·설정) · `.claude/rules/harness.md`(규칙) · `.claude/skills/final-gate/`(마지막 관문)가 놓인다. 모든 도구는 대상의 `.harness/harness.json` 하나만 읽고, 공용 로직은 `lib/`(설정 로더·증거 판정기·표 파서)에, `tools/*.mjs` 는 얇은 CLI 로 둔다. 효과는 `proof/run.mjs` 가 「하네스 없이 vs 있을 때」를 같은 조건에서 재어 README 에 남긴다.

**Tech Stack:** Node 22+ (ESM `.mjs`) · `node:test` + `node:assert/strict` · **외부 의존성 0**

**Spec:** `docs/2026-09-28-design.md` (개정 2026-10-02)

**실행 상태 (2026-10-02):** Task 1~11 완료 — `node tools/verify.mjs` → `테스트 79 · 실패 0`, `node proof/run.mjs --claude` → 예상과 다른 행 0개 / 22행.
⛔ 커밋 단계 10개는 사용자 요청 전이라 **보류** — 변경은 `feat/superpowers-base` 작업 트리에 있다. 태스크별 파일이 겹치지 않으므로 각 태스크의 `git add` 목록대로 나눠 커밋할 수 있다.

## Global Constraints

설계서 §7 에서 옮긴다. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **의존성 0** — Node 내장만. `package.json` 의 `dependencies` 는 비어 있다
- **Node 22+** — 20 은 2026-04 에 EOL 이다. `node --test` 의 glob 인자와 `readdirSync({recursive})` 를 쓴다
- **OS 를 가리지 않는다** — 셸은 `exec` 의 플랫폼 기본(`sh`/`cmd`), 경로는 `node:path`, 줄바꿈은 `\r?\n`, CLI 판별은 `lib/config.mjs` 의 `cli()`
- **자동 로드되는 층은 `.claude/rules/harness.md` 하나만** 더한다
- **경로를 하드코딩하지 않는다** — 대상 경로는 `.harness/harness.json` 만 읽는다
- **대상의 기존 파일을 옮기거나 덮어쓰지 않는다** — 규칙은 새 파일, 설정은 병합, 상태는 기존 경로
- **검사는 드물게 울려야 신호다** — correctness(verify · 대장 무결성 · 입력 거부)만 exit 1
- **자동 추출하지 않는다** — 교훈·가정은 판단을 거쳐 기록한다
- **딱지** — 모든 산출물 머리에 `설계안`. 실제 프로젝트에서 값을 내기 전까지 `검증됨` 은 없다
- **특정 프로젝트 이름을 넣지 않는다** — 픽스처는 `com.example.*` · `C:\work\app`
- **커밋** — `feat:`/`fix:`/`docs:`/`test:` + 한글. 제목은 무엇을, 본문은 **왜**. `Co-Authored-By` 를 넣지 않는다. ⛔ push 하지 않는다
- **계획의 마지막 태스크는 final-gate** (Task 11)

## 파일 구조

| 경로 | 책임 |
|---|---|
| `package.json` · `.gitignore` | 테스트 명령(결과 XML 을 `test-results/` 에 쓴다) |
| `lib/config.mjs` | `.harness/harness.json` 로더 · `cli()` — 모든 도구의 유일한 경로 원천 |
| `lib/evidence.mjs` | junit XML 판정기 — `<testcase>` 를 센다 |
| `lib/mdtable.mjs` | 마크다운 표 칸 분리 · 대장 행 파서 · 줄바꿈 무관 해시 |
| `tools/verify.mjs` | 선언된 검사를 돌리고 이번 실행이 쓴 결과 파일로 판정 |
| `tools/state-check.mjs` · `decision-check.mjs` · `lesson-append.mjs` · `lesson-promote.mjs` | ④ 상태·가정·교훈 |
| `tools/policy-apply.mjs` · `policy/settings.json` | 설치 — 설정 병합 (멱등) |
| `templates/` | 대상에 놓이는 것 — `harness.json` · `rules/harness.md` · `skills/final-gate/` · `state/*` |
| `SETUP.md` · `README.md` | 설치 지시서(Claude 용) · 소개와 실측 |
| `proof/run.mjs` | 효과 입증 — README §실측 의 원천 |
| `test/scene.mjs` · `test/*.test.mjs` · `test/fixtures/` | 임시 대상 생성기 · 테스트 · 고정 표본 |

**단계 경계** — Task 3 끝에서 verify 가, Task 7 끝에서 ④ 도구가, Task 9 끝에서 설치물이 완결된다. 각 경계는 멈춰도 되는 지점이다.

---

### Task 1: 설정 로더와 CLI 판별

**Files:**
- Create: `package.json` · `test/scene.mjs` · `lib/config.mjs`
- Modify: `.gitignore`
- Test: `test/config.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `loadConfig(root: string) → { root, state: { current?, currentRoot?, decisions?, lessons? }, checks: Array<{ id, cmd, kind, evidence? }> }` — 경로는 `root` 기준 절대경로, `~/` 는 홈
  - `EVIDENCE_KINDS = ['junit-xml', 'exit-code', 'file-unchanged']`
  - `cli(url: string, main: () => any) → Promise<void>` — 직접 실행됐을 때만 `main`, 오류는 `⛔ <메시지>` 한 줄 + exit 1
  - 테스트 도우미 `target(harness?, files?) → dir` · `put(dir, rel, body)` · `fixture(name)` · `repoFile(rel)`

- [x] **Step 1: 패키지와 무시 목록을 만든다**

`package.json`:

```json
{
  "name": "agent-harness",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "pretest": "node -e \"require('fs').mkdirSync('test-results',{recursive:true})\"",
    "test": "node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results/junit.xml \"test/*.test.mjs\""
  },
  "dependencies": {}
}
```

⛔ `node --test test/` 처럼 디렉터리를 주지 않는다 — Node 22+ 는 인자를 파일·glob 으로 읽어 디렉터리를 실패한 테스트로 센다(실측). `pretest` 는 Node 가 junit 결과 디렉터리를 만들지 않아서 있다(실측: 없으면 ENOENT).

`.gitignore`:

```
node_modules/
.DS_Store
test-results/
```

- [x] **Step 2: 테스트 도우미를 만든다**

`test/scene.mjs`:

```js
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
```

- [x] **Step 3: 실패하는 테스트를 작성한다**

`test/config.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, cli } from '../lib/config.mjs';
import { target, put } from './scene.mjs';

test('경로를 대상 루트 기준 절대경로로 돌려준다', () => {
  const dir = target({ state: { decisions: 'docs/harness/decisions.md', lessons: 'docs/harness/lessons.md' }, checks: [] });
  const cfg = loadConfig(dir);
  assert.equal(cfg.state.decisions, join(dir, 'docs', 'harness', 'decisions.md'));
  assert.equal(cfg.state.lessons, join(dir, 'docs', 'harness', 'lessons.md'));
});

test('~ 로 시작하는 경로를 홈 기준으로 편다', () => {
  const cfg = loadConfig(target({ state: { currentRoot: '~/ref' }, checks: [] }));
  assert.equal(cfg.state.currentRoot, join(homedir(), 'ref'));
});

test('선언되지 않은 상태 파일은 undefined, 검사가 없으면 빈 배열이다', () => {
  const cfg = loadConfig(target({ state: { lessons: 'l.md' } }));
  assert.equal(cfg.state.current, undefined);
  assert.equal(cfg.state.decisions, undefined);
  assert.deepEqual(cfg.checks, []);
});

test('설정 파일이 없으면 경로와 다음 행동을 알려주며 실패한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  assert.throws(() => loadConfig(dir), /harness\.json 이 없다/);
  assert.throws(() => loadConfig(dir), /SETUP\.md/);
});

test('JSON 이 깨졌으면 경로와 함께 실패한다', () => {
  const dir = target(null, { '.harness/harness.json': '{ 깨짐' });
  assert.throws(() => loadConfig(dir), /읽지 못했다/);
});

test('모르는 검사 종류는 거부하고 쓸 수 있는 것을 알려준다', () => {
  const dir = target({ checks: [{ id: 'x', cmd: 'node -v', kind: '초능력' }] });
  assert.throws(() => loadConfig(dir), /알 수 없는 검사 종류: 초능력/);
  assert.throws(() => loadConfig(dir), /junit-xml/);
});

test('⛔ 결과 파일로 판정하는 검사에 evidence 가 없으면 거부한다', () => {
  const dir = target({ checks: [{ id: 't', cmd: 'npm test', kind: 'junit-xml' }] });
  assert.throws(() => loadConfig(dir), /evidence 가 없다/);
});

// probe 스크립트를 공백·한글이 든 경로에 두고 실제로 실행한다
function probe(body) {
  const dir = target(null);
  const lib = JSON.stringify(new URL('../lib/config.mjs', import.meta.url).href);
  put(dir, '공백 있는 폴더/probe.mjs', `import { cli } from ${lib};\n${body}\n`);
  return spawnSync(process.execPath, [join(dir, '공백 있는 폴더', 'probe.mjs')], { encoding: 'utf8' });
}

test('⭐ 직접 실행하면 main 이 돈다 — 판별이 틀리면 도구가 아무것도 안 하고 exit 0 으로 끝난다', () => {
  const r = probe("cli(import.meta.url, () => console.log('돌았다'));");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /돌았다/);
});

test('main 의 오류는 한 줄로 알리고 exit 1 이다', () => {
  const r = probe("cli(import.meta.url, () => { throw new Error('일부러'); });");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /⛔ 일부러/);
});

test('import 만 하면 main 이 돌지 않는다', async () => {
  let ran = false;
  await cli(new URL('../tools/x.mjs', import.meta.url).href, () => {
    ran = true;
  });
  assert.equal(ran, false);
});
```

- [x] **Step 4: 테스트가 실패하는지 확인한다**

Run: `node --test test/config.test.mjs`
Expected: FAIL — `Cannot find module '…/lib/config.mjs'`

- [x] **Step 5: `lib/config.mjs` 를 작성한다**

`lib/config.mjs`:

```js
// 대상 저장소의 .harness/harness.json 로더 — 모든 도구의 유일한 경로 원천. 설계안.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const CONFIG = join('.harness', 'harness.json');
export const EVIDENCE_KINDS = ['junit-xml', 'exit-code', 'file-unchanged'];

const expand = (p) => (p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

export function loadConfig(root) {
  const path = join(root, CONFIG);
  if (!existsSync(path)) {
    throw new Error(`harness.json 이 없다: ${path}\n  SETUP.md 를 먼저 따른다.`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`harness.json 을 읽지 못했다: ${path}\n  ${e.message}`);
  }
  for (const c of raw.checks ?? []) {
    if (!EVIDENCE_KINDS.includes(c.kind)) {
      throw new Error(`알 수 없는 검사 종류: ${c.kind} (검사 '${c.id}')\n  쓸 수 있는 것: ${EVIDENCE_KINDS.join(' · ')}`);
    }
    if (c.kind !== 'exit-code' && !c.evidence) {
      throw new Error(`검사 '${c.id}' 에 evidence 가 없다 — ${c.kind} 는 판정할 결과 파일이 있어야 한다`);
    }
  }
  const abs = (p) => (p ? resolve(root, expand(p)) : undefined);
  return {
    root: resolve(root),
    state: {
      current: abs(raw.state?.current),
      currentRoot: abs(raw.state?.currentRoot),
      decisions: abs(raw.state?.decisions),
      lessons: abs(raw.state?.lessons),
    },
    checks: (raw.checks ?? []).map((c) => ({ ...c, evidence: abs(c.evidence) })),
  };
}

// 직접 실행됐을 때만 main 을 돈다. 오류는 한 줄로 알리고 exit 1.
// ⛔ `file://${argv[1]}` 비교는 Windows·심링크 경로에서 늘 거짓이라 도구가 조용히 아무것도 안 하고 exit 0 이 된다.
export async function cli(url, main) {
  if (!process.argv[1] || url !== pathToFileURL(realpathSync(process.argv[1])).href) return;
  try {
    await main();
  } catch (e) {
    console.error(`⛔ ${e.message}`);
    process.exit(1);
  }
}
```

- [x] **Step 6: 테스트가 통과하는지 확인한다**

Run: `node --test test/config.test.mjs`
Expected: PASS — `ℹ tests 10` · `ℹ pass 10` · `ℹ fail 0`

⛔ **숫자를 눈으로 확인한다.** 러너 요약은 테스트 없는 파일도 `pass` 로 센다 — 이 레포가 막으려는 바로 그 함정이다.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json .gitignore test/scene.mjs lib/config.mjs test/config.test.mjs
git commit -m "feat: 설정 로더와 CLI 판별

모든 도구가 대상의 .harness/harness.json 하나만 거치게 한다. 도구를
대상 루트의 lib/·tools/ 가 아니라 .harness/ 아래에 두는 것은 흔한
디렉터리 이름이 기존 코드와 부딪히기 때문이다.

⛔ 직접 실행 판별을 realpath + pathToFileURL 로 한다. 09-28 계획의
\`file://\${argv[1]}\` 비교는 Windows 와 심링크 경로에서 늘 거짓이라
verify 가 아무것도 안 돌고 exit 0 으로 끝난다 — 이 레포가 막으려는
거짓 통과를 도구 스스로 만든다. 공백·한글 경로에서 실제로 실행해 지킨다."
```

---

### Task 2: 증거 판정기 — `<testcase>` 를 센다

**Files:**
- Create: `lib/evidence.mjs`
- Create: `test/fixtures/junit-gradle-pass.xml` · `junit-gradle-fail.xml` · `junit-gradle-empty.xml` · `junit-node-stub.xml` · `junit-node-mixed.xml`
- Test: `test/evidence.test.mjs`

**Interfaces:**
- Consumes: `fixture(name)` (Task 1)
- Produces: `judgeJunitXml(contents: string[]) → { ok: boolean, reason: string }` — 파일 읽기는 호출자 몫이다

⭐ **실측 (Node 24.18):** `test()` 가 없는 파일을 `node --test` 는 `tests 1 · pass 1` · exit 0 으로 보고하고, junit 에는 파일 경로를 이름으로 한 통과 `<testcase>` 를 쓴다. `<testsuite tests="…">` 요약 속성도 이 파일을 센다. 그래서 요약이 아니라 `<testcase>` 를 하나씩 보고, 파일 경로 이름의 「빈 파일」 testcase 는 테스트로 치지 않는다.

- [x] **Step 1: 고정 표본을 만든다**

`test/fixtures/junit-gradle-pass.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.order.OrderServiceTest" tests="3" skipped="0" failures="0" errors="0" timestamp="2026-10-02T01:00:00" hostname="ci" time="0.412">
  <properties/>
  <testcase name="주문을 만든다()" classname="com.example.order.OrderServiceTest" time="0.120"/>
  <testcase name="재고가 없으면 거절한다()" classname="com.example.order.OrderServiceTest" time="0.090"/>
  <testcase name="취소하면 재고를 돌려놓는다()" classname="com.example.order.OrderServiceTest" time="0.200"/>
  <system-out><![CDATA[]]></system-out>
  <system-err><![CDATA[]]></system-err>
</testsuite>
```

`test/fixtures/junit-gradle-fail.xml` — 속성 순서가 다르고 failure 와 error 가 섞였다:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite errors="1" failures="2" name="com.example.auth.LoginControllerTest" skipped="0" tests="4" time="1.128" timestamp="2026-10-02T01:00:05" hostname="ci">
  <testcase classname="com.example.auth.LoginControllerTest" name="정상 로그인()" time="0.1"/>
  <testcase classname="com.example.auth.LoginControllerTest" name="비밀번호가 틀리면 401()" time="0.2">
    <failure message="expected: &lt;401&gt; but was: &lt;200&gt;" type="org.opentest4j.AssertionFailedError">AssertionFailedError</failure>
  </testcase>
  <testcase classname="com.example.auth.LoginControllerTest" name="잠긴 계정은 423()" time="0.2">
    <failure message="expected: &lt;423&gt; but was: &lt;401&gt;" type="org.opentest4j.AssertionFailedError">AssertionFailedError</failure>
  </testcase>
  <testcase classname="com.example.auth.LoginControllerTest" name="토큰을 발급한다()" time="0.3">
    <error message="NullPointerException" type="java.lang.NullPointerException">NullPointerException</error>
  </testcase>
</testsuite>
```

`test/fixtures/junit-gradle-empty.xml` — 빌드는 성공인데 테스트가 0개다:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.EmptyTest" tests="0" skipped="0" failures="0" errors="0" timestamp="2026-10-02T01:00:00" hostname="ci" time="0.001">
  <properties/>
  <system-out><![CDATA[]]></system-out>
  <system-err><![CDATA[]]></system-err>
</testsuite>
```

`test/fixtures/junit-node-stub.xml` — `test()` 가 없는 파일 하나를 돌린 Node 24 의 실제 출력 형태:

```xml
<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="test\empty.test.mjs" time="0.463704" classname="test" file="C:\work\app\test\empty.test.mjs"/>
	<!-- tests 1 -->
	<!-- suites 0 -->
	<!-- pass 1 -->
	<!-- fail 0 -->
	<!-- cancelled 0 -->
	<!-- skipped 0 -->
	<!-- todo 0 -->
	<!-- duration_ms 490.8141 -->
</testsuites>
```

`test/fixtures/junit-node-mixed.xml` — 빈 파일 · 통과 · 건너뜀 · describe 안의 실패:

```xml
<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="test\empty.test.mjs" time="0.500505" classname="test" file="C:\work\app\test\empty.test.mjs"/>
	<testcase name="adds" time="0.001423" classname="test" file="C:\work\app\test\real.test.mjs"/>
	<testcase name="skipped one" time="0.000153" classname="test" file="C:\work\app\test\real.test.mjs">
		<skipped type="skipped" message="true"/>
	</testcase>
	<testsuite name="group" time="0.002177" disabled="0" errors="0" tests="1" failures="1" skipped="0" hostname="ci">
		<testcase name="inner fails" time="0.001791" classname="test" file="C:\work\app\test\real.test.mjs" failure="Expected values to be strictly equal:&#10;&#10;1 !== 2&#10;">
			<failure type="testCodeFailure" message="Expected values to be strictly equal:&#10;&#10;1 !== 2">
Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

1 !== 2

    at TestContext.&lt;anonymous> (file:///C:/work/app/test/real.test.mjs:5:60)
			</failure>
		</testcase>
	</testsuite>
	<!-- tests 4 -->
	<!-- suites 1 -->
	<!-- pass 2 -->
	<!-- fail 1 -->
	<!-- cancelled 0 -->
	<!-- skipped 1 -->
	<!-- todo 0 -->
	<!-- duration_ms 588.7329 -->
</testsuites>
```

- [x] **Step 2: 실패하는 테스트를 작성한다**

`test/evidence.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeJunitXml } from '../lib/evidence.mjs';
import { fixture } from './scene.mjs';

test('테스트가 있고 실패가 없으면 통과다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-pass.xml')]);
  assert.equal(r.ok, true);
  assert.equal(r.reason, '테스트 3 · 실패 0');
});

test('⭐ tests="0" 스위트는 성공이 아니다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-empty.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실행된 테스트가 0개/);
});

test('⭐ node --test 가 통과로 센 「테스트 없는 파일」은 테스트가 아니다', () => {
  const r = judgeJunitXml([fixture('junit-node-stub.xml')]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /실행된 테스트가 0개/);
  assert.match(r.reason, /테스트 없는 파일 1개/);
});

test('POSIX 경로의 테스트 없는 파일도 알아본다', () => {
  const xml = '<testsuites><testcase name="test/empty.test.mjs" classname="test" file="/work/app/test/empty.test.mjs"/></testsuites>';
  assert.match(judgeJunitXml([xml]).reason, /테스트 없는 파일 1개/);
});

test('속성 순서와 무관하게 failure·error 를 실패로 센다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-fail.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 4 · 실패 3');
});

test('node 출력에서 건너뜀과 테스트 없는 파일을 빼고 센다', () => {
  const r = judgeJunitXml([fixture('junit-node-mixed.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 2 · 실패 1 · 건너뜀 1 · 테스트 없는 파일 1개는 세지 않았다');
});

test('여러 XML 을 합산한다 — 하나라도 실패면 실패다', () => {
  const r = judgeJunitXml([fixture('junit-gradle-pass.xml'), fixture('junit-gradle-fail.xml')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, '테스트 7 · 실패 3');
});

test('⛔ 전부 건너뛰었으면 실행된 테스트가 0개다', () => {
  const xml = '<testsuite tests="2"><testcase name="a"><skipped/></testcase><testcase name="b"><skipped/></testcase></testsuite>';
  const r = judgeJunitXml([xml]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /0개.*건너뜀 2/);
});

test('이름에 > 가 들어가도 testcase 를 놓치지 않는다', () => {
  const r = judgeJunitXml(['<testsuite><testcase name="a > b" classname="x"/></testsuite>']);
  assert.equal(r.ok, true);
  assert.equal(r.reason, '테스트 1 · 실패 0');
});

test('⭐ XML 이 한 개도 없으면 실패다 — 테스트가 안 돈 것이다', () => {
  assert.match(judgeJunitXml([]).reason, /한 개도/);
  assert.match(judgeJunitXml(['<?xml version="1.0"?><other/>']).reason, /한 개도/);
});
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/evidence.test.mjs`
Expected: FAIL — `Cannot find module '…/lib/evidence.mjs'`

- [x] **Step 4: `lib/evidence.mjs` 를 작성한다**

`lib/evidence.mjs`:

```js
// ⑤ 증거 판정 — 종료코드도 러너 요약도 믿지 않고 결과 XML 의 <testcase> 를 하나씩 센다. 설계안.
// 실측(Node 24): node --test 는 test() 가 없는 파일을 파일 경로 이름의 통과 testcase 로 보고한다.

const ATTRS = String.raw`(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*`;
const CASE = new RegExp(String.raw`<testcase\b(${ATTRS})\s*(?:\/>|>([\s\S]*?)<\/testcase>)`, 'g');

function attr(attrs, name) {
  const m = attrs.match(new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
}

const slash = (p) => p.replace(/\\/g, '/');

function isFileStub(attrs) {
  const name = attr(attrs, 'name');
  const file = attr(attrs, 'file');
  return Boolean(name && file && /\.[cm]?[jt]sx?$/.test(name) && slash(file).endsWith(slash(name)));
}

export function judgeJunitXml(contents) {
  let xmls = 0;
  let run = 0;
  let failed = 0;
  let skipped = 0;
  let stubs = 0;

  for (const text of contents) {
    if (!/<testsuites?\b|<testcase\b/.test(text)) continue;
    xmls += 1;
    for (const [, attrs, body = ''] of text.matchAll(CASE)) {
      const bad = /<(failure|error)\b/.test(body);
      if (!bad && isFileStub(attrs)) stubs += 1;
      else if (!bad && /<skipped\b/.test(body)) skipped += 1;
      else {
        run += 1;
        if (bad) failed += 1;
      }
    }
  }

  const notes = [skipped && `건너뜀 ${skipped}`, stubs && `테스트 없는 파일 ${stubs}개는 세지 않았다`].filter(Boolean);
  const tail = notes.map((n) => ` · ${n}`).join('');

  if (xmls === 0) return { ok: false, reason: '결과 XML 을 한 개도 찾지 못했다 — 테스트가 돌지 않았다' };
  if (run === 0) {
    return { ok: false, reason: `실행된 테스트가 0개다 (XML ${xmls}개${tail}) — 종료코드와 러너 요약은 이것을 통과시킨다` };
  }
  if (failed > 0) return { ok: false, reason: `테스트 ${run} · 실패 ${failed}${tail}` };
  return { ok: true, reason: `테스트 ${run} · 실패 0${tail}` };
}
```

- [x] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/evidence.test.mjs`
Expected: PASS — `ℹ tests 10` · `ℹ pass 10` · `ℹ fail 0`

- [ ] **Step 6: 커밋한다**

```bash
git add lib/evidence.mjs test/evidence.test.mjs test/fixtures/
git commit -m "feat: 증거 판정기 — 요약이 아니라 testcase 를 센다

Node 24 실측: test() 가 없는 파일을 node --test 는 tests 1 · pass 1,
exit 0 으로 보고하고 junit 에도 통과한 testcase 로 쓴다. 종료코드도
러너 요약도 testsuite 의 tests 속성도 이 빈 파일을 테스트로 센다.

그래서 <testcase> 를 하나씩 보고, 파일 경로를 이름으로 한 빈 파일
testcase 와 건너뛴 것은 실행된 테스트로 치지 않는다. 실행된 테스트가
0개면 실패다. 09-28 계획의 판정기는 <testsuite> 속성만 읽어 Node 출력은
아예 읽지 못했다."
```

---

### Task 3: 완료 관문 러너 `verify.mjs`

**Files:**
- Create: `tools/verify.mjs`
- Test: `test/verify.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` · `cli` (Task 1) · `judgeJunitXml` (Task 2)
- Produces: `runChecks(cfg) → Promise<Array<{ id, ok, reason, tail? }>>` · CLI `node .harness/tools/verify.mjs [대상]` — 전부 통과면 exit 0, 하나라도 실패하거나 **검사가 0개면 exit 1**

⛔ 여기는 correctness 게이트다. 「검사는 드물게 울려야 신호다」가 적용되지 않는 자리다.

판정 규칙:
- `exit-code` — 종료코드 0 이면 통과
- `junit-xml` — **명령이 exit 0 이고, 이번 실행이 쓰거나 바꾼 XML 이 판정을 통과**해야 통과. 직전 실행의 XML 은 증거가 아니다
- `file-unchanged` — 생성 명령이 exit 0 이고 `git status --porcelain -- <evidence>` 가 비어야 통과 (커밋된 적 없는 산출물도 「바뀐 것」)

- [x] **Step 1: 실패하는 테스트를 작성한다**

`test/verify.test.mjs`:

```js
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
```

- [x] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/verify.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/verify.mjs'`

- [x] **Step 3: `tools/verify.mjs` 를 작성한다**

`tools/verify.mjs`:

```js
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
```

- [x] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/verify.test.mjs`
Expected: PASS — `ℹ tests 11` · `ℹ pass 11` · `ℹ fail 0`

- [ ] **Step 5: 커밋한다**

```bash
git add tools/verify.mjs test/verify.test.mjs
git commit -m "feat: 완료 관문 러너 verify

선언된 검사를 돌리고 종료코드가 아니라 결과 파일로 판정한다.

⭐ 이번 실행이 쓰거나 바꾼 XML 만 증거로 친다. 테스트 명령이 바뀌어
아무것도 안 돌았는데 직전 실행의 통과 XML 이 남아 있으면, 결과 파일만
읽는 판정은 그것을 통과시킨다. 실행 전후 mtime 을 비교해 막는다.
결과 XML 이 정상이어도 명령이 실패했으면 실패다.

검사가 0개면 exit 1 이다. file-unchanged 는 git status 로 보아 커밋된 적
없는 산출물도 바뀐 것으로 친다. 명령은 exec 의 플랫폼 기본 셸로 돌려
sh 가 없는 Windows 에서도 돈다."
```

---

### Task 4: 상태 대장 검사기 `state-check.mjs`

**Files:**
- Create: `lib/mdtable.mjs` · `tools/state-check.mjs` · `templates/state/current.md`
- Test: `test/mdtable.test.mjs` · `test/state-check.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` · `cli` (Task 1) · `target` · `repoFile` (Task 1)
- Produces:
  - `cells(line: string) → string[] | null` — 표 한 줄의 칸. 값 안의 `\|` 는 구분자가 아니다
  - `parseAuditRows(text) → Array<{ target, status, hash }>` — `` | `경로` | 상태 | `해시` | `` 형식의 행만
  - `hash12(bytes) → string` — 줄바꿈을 LF 로 맞춘 SHA-256 앞 12자
  - `auditState(cfg) → { total, stale: Array<{ target, hash }>, missing: string[], remaining, integrityOk }`

상태 값: `분석완료` · `부분분석` 은 해시를 대조하고, `미분석` 은 잔량, `해당없음` 은 어디에도 세지 않는다. `state.currentRoot` 가 없으면 대상 루트 기준이다.

- [x] **Step 1: 대장 템플릿을 만든다**

`templates/state/current.md`:

```markdown
# 진행 상태 대장

> 상태: **설계안**

어디까지 갔는지가 **대화가 아니라 이 파일에 있다.** 세션이 끊겨도 `node .harness/tools/state-check.mjs` 한 번이면 이어받는다.

| 값 | 뜻 |
|---|---|
| `분석완료` | 끝까지 읽고 대조했다 |
| `부분분석` | 일부만 봤다 — 다시 봐야 한다 |
| `미분석` | 아직 열어보지 않았다 |
| `해당없음` | 대상 밖 |

**해시가 바뀌면 상태가 무효가 된다.** `state-check` 가 그 행을 재작업 대상으로 돌려보내며 현재 해시를 알려준다.

⛔ **읽은 척하지 않는다.** 일부만 본 것은 `부분분석` 이다.

## 대장

| 파일 | 상태 | 해시 | 메모 |
|---|---|---|---|
```

- [x] **Step 2: 실패하는 표 파서 테스트를 작성한다**

`test/mdtable.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditRows, cells, hash12 } from '../lib/mdtable.mjs';
import { repoFile } from './scene.mjs';

const LEDGER = [
  '| 값 | 뜻 |',
  '|---|---|',
  '| `분석완료` | 끝까지 읽었다 |',
  '',
  '| 파일 | 상태 | 해시 | 메모 |',
  '|---|---|---|---|',
  '| `src/engine.ts` | 분석완료 | `a1b2c3d4e5f6` | 표본 |',
  '| `src/App.tsx` | 미분석 | `` | |',
].join('\n');

test('경로·상태·해시 세 칸을 가진 행만 뽑는다', () => {
  assert.deepEqual(parseAuditRows(LEDGER), [
    { target: 'src/engine.ts', status: '분석완료', hash: 'a1b2c3d4e5f6' },
    { target: 'src/App.tsx', status: '미분석', hash: '' },
  ]);
});

test('CRLF 파일도 같게 읽는다', () => {
  assert.deepEqual(parseAuditRows(LEDGER.replace(/\n/g, '\r\n')), parseAuditRows(LEDGER));
});

test('⛔ 대장 템플릿의 설명표를 데이터로 오인하지 않는다', () => {
  assert.deepEqual(parseAuditRows(repoFile('templates/state/current.md')), []);
});

test('값 안의 \\| 는 칸 구분자가 아니다', () => {
  assert.deepEqual(cells('| a \\| b | c |'), ['a \\| b', 'c']);
  assert.equal(cells('표가 아닌 줄'), null);
});

test('해시는 12자이고 줄바꿈 방식에 흔들리지 않는다', () => {
  assert.match(hash12(Buffer.from('a\nb')), /^[0-9a-f]{12}$/);
  assert.equal(hash12(Buffer.from('a\r\nb')), hash12(Buffer.from('a\nb')));
});
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/mdtable.test.mjs`
Expected: FAIL — `Cannot find module '…/lib/mdtable.mjs'`

- [x] **Step 4: `lib/mdtable.mjs` 를 작성한다**

`lib/mdtable.mjs`:

```js
// 마크다운 표 — 칸 분리, 대장 행 파서, 줄바꿈에 흔들리지 않는 해시. 설계안.
import { createHash } from 'node:crypto';

// 표 한 줄의 칸. 값 안의 \| 는 구분자가 아니다
export function cells(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  return t
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((s) => s.trim());
}

// | `경로` | 상태 | `해시` | … — 상태 설명표(| `분석완료` | 뜻 |)는 셋째 칸이 백틱 해시가 아니라 걸리지 않는다
export function parseAuditRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const c = cells(line);
    if (!c || c.length < 3) continue;
    const target = c[0].match(/^`([^`]+)`$/);
    const hash = c[2].match(/^`([^`]*)`$/);
    if (target && hash) rows.push({ target: target[1], status: c[1], hash: hash[1] });
  }
  return rows;
}

// CRLF 를 LF 로 맞춰 해시한다 — OS 마다 체크아웃 줄바꿈이 달라도 같은 파일은 같은 해시
export const hash12 = (bytes) =>
  createHash('sha256')
    .update(Buffer.from(Buffer.from(bytes).toString('latin1').replace(/\r\n/g, '\n'), 'latin1'))
    .digest('hex')
    .slice(0, 12);
```

- [x] **Step 5: 표 파서 테스트가 통과하는지 확인한다**

Run: `node --test test/mdtable.test.mjs`
Expected: PASS — `ℹ tests 5` · `ℹ pass 5` · `ℹ fail 0`

- [x] **Step 6: 실패하는 state-check 테스트를 작성한다**

`test/state-check.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { hash12 } from '../lib/mdtable.mjs';
import { auditState } from '../tools/state-check.mjs';
import { target } from './scene.mjs';

const STATE_CHECK = fileURLToPath(new URL('../tools/state-check.mjs', import.meta.url));
const HEAD = '| 파일 | 상태 | 해시 |\n|---|---|---|\n';

// 대장은 docs/ledger.md, 대장이 가리키는 원본은 ref/ 아래
function scene(rows, files) {
  const refs = Object.fromEntries(Object.entries(files).map(([k, v]) => [`ref/${k}`, v]));
  return target({ state: { current: 'docs/ledger.md', currentRoot: 'ref' } }, { 'docs/ledger.md': HEAD + rows.join('\n'), ...refs });
}
const audit = (dir) => auditState(loadConfig(dir));

test('해시가 맞으면 재작업 대상이 아니다', () => {
  const body = 'export const x = 1;\n';
  const r = audit(scene([`| \`a.ts\` | 분석완료 | \`${hash12(Buffer.from(body))}\` |`], { 'a.ts': body }));
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.missing, []);
  assert.equal(r.integrityOk, true);
});

test('⭐ 원본이 바뀌면 재작업 대상으로 돌아오고 현재 해시를 알려준다', () => {
  const r = audit(scene(['| `a.ts` | 분석완료 | `000000000000` |'], { 'a.ts': 'x\n' }));
  assert.deepEqual(r.stale, [{ target: 'a.ts', hash: hash12(Buffer.from('x\n')) }]);
});

test('⛔ 대장이 가리키는 파일이 사라지면 무결성 위반이다', () => {
  const r = audit(scene(['| `gone.ts` | 분석완료 | `abc123abc123` |'], {}));
  assert.deepEqual(r.missing, ['gone.ts']);
  assert.equal(r.integrityOk, false);
});

test('미분석은 잔량이고, 해당없음은 파일이 없어도 어디에도 세지 않는다', () => {
  const r = audit(scene(['| `a.ts` | 미분석 | `` |', '| `old.ts` | 해당없음 | `` |'], { 'a.ts': 'x\n' }));
  assert.deepEqual(r.stale, []);
  assert.deepEqual(r.missing, []);
  assert.equal(r.remaining, 1);
});

test('currentRoot 가 없으면 대상 루트 기준이다', () => {
  const dir = target({ state: { current: 'docs/ledger.md' } }, { 'docs/ledger.md': `${HEAD}| \`src/a.ts\` | 미분석 | \`\` |`, 'src/a.ts': 'x\n' });
  assert.equal(audit(dir).remaining, 1);
});

test('CLI: 대장이 설정되지 않았으면 건너뛴다 (exit 0)', () => {
  const r = spawnSync(process.execPath, [STATE_CHECK, target({})], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /건너뛴다/);
});

test('⛔ CLI: 무결성 위반은 exit 1 이다', () => {
  const r = spawnSync(process.execPath, [STATE_CHECK, scene(['| `gone.ts` | 분석완료 | `abc123abc123` |'], {})], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /gone\.ts — 대장이 가리키는 파일이 없다/);
});
```

- [x] **Step 7: 테스트가 실패하는지 확인한다**

Run: `node --test test/state-check.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/state-check.mjs'`

- [x] **Step 8: `tools/state-check.mjs` 를 작성한다**

`tools/state-check.mjs`:

```js
#!/usr/bin/env node
// ④ STATE — 진행 상태 대장이 거짓말하는지 본다. 설계안.
// ⛔ 진행도 게이트가 아니다: 무결성 위반(대장이 가리키는 파일 소멸)만 exit 1, 재작업·잔량은 보고만 한다.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, cli } from '../lib/config.mjs';
import { parseAuditRows, hash12 } from '../lib/mdtable.mjs';

const CLAIMED = new Set(['분석완료', '부분분석']);

export function auditState(cfg) {
  if (!cfg.state.current) throw new Error('.harness/harness.json 에 state.current 가 없다');
  const base = cfg.state.currentRoot ?? cfg.root;
  const rows = parseAuditRows(readFileSync(cfg.state.current, 'utf8'));
  if (rows.length === 0) throw new Error(`대장에서 행을 읽지 못했다: ${cfg.state.current}`);

  const stale = [];
  const missing = [];
  let remaining = 0;
  for (const r of rows) {
    if (r.status === '해당없음') continue;
    const path = join(base, r.target);
    if (!existsSync(path) || !statSync(path).isFile()) {
      missing.push(r.target);
      continue;
    }
    if (!CLAIMED.has(r.status)) {
      remaining += 1;
      continue;
    }
    const now = hash12(readFileSync(path));
    if (now !== r.hash) stale.push({ target: r.target, hash: now });
  }
  return { total: rows.length, stale, missing, remaining, integrityOk: missing.length === 0 };
}

cli(import.meta.url, () => {
  const cfg = loadConfig(process.argv[2] ?? process.cwd());
  if (!cfg.state.current) {
    console.log('대장이 없다 (.harness/harness.json 의 state.current) — 건너뛴다');
    return;
  }
  const r = auditState(cfg);
  console.log(`대장 ${r.total}행 · 잔량 ${r.remaining} · 재작업 ${r.stale.length} · 소멸 ${r.missing.length}`);
  for (const s of r.stale) console.log(`  ↻ ${s.target} — 원본이 바뀌었다 (현재 해시 ${s.hash})`);
  for (const t of r.missing) console.log(`  ⛔ ${t} — 대장이 가리키는 파일이 없다`);
  if (!r.integrityOk) process.exit(1);
});
```

- [x] **Step 9: 테스트가 통과하는지 확인한다**

Run: `node --test test/mdtable.test.mjs test/state-check.test.mjs`
Expected: PASS — `ℹ tests 12` · `ℹ pass 12` · `ℹ fail 0`

- [ ] **Step 10: 커밋한다**

```bash
git add lib/mdtable.mjs tools/state-check.mjs templates/state/current.md test/mdtable.test.mjs test/state-check.test.mjs
git commit -m "feat: 상태 대장 검사기 — 진행도를 대화가 아니라 파일이 기억한다

해시가 달라지면 그 행이 재작업 대상으로 돌아온다. 사람의 기억이 아니라
결정적 검사가 판단하고, 대장을 고칠 수 있게 현재 해시를 알려준다.

⛔ 무결성 위반(대장이 가리키는 파일 소멸)만 exit 1 이다. 재작업과 잔량은
보고만 한다 — 진행도 게이트로 쓰면 분석이 안 끝났다고 급한 수정이 막힌다.

해시는 CRLF 를 LF 로 맞춰 잰다. 같은 파일이 OS 마다 다른 줄바꿈으로
체크아웃되면 그것만으로 전 행이 재작업 대상이 된다. 해당없음 행은
파일이 사라져도 세지 않는다."
```

---

### Task 5: 결정 적립 검사기 `decision-check.mjs`

**Files:**
- Create: `tools/decision-check.mjs` · `templates/state/decisions.md`
- Test: `test/decision-check.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` · `cli` (Task 1)
- Produces: `auditDecisions(cfg, today: Date) → { open: Array<{ id, title }>, staleDays: number | null, warn: boolean }` · `STALE_DAYS = 14`

형식: `| 갱신일 | YYYY-MM-DD |` 머리표 + `# 1.` 절 아래의 `## Q<번호> · <제목>` 이 열린 질문이다. `# 2.` · `# 3.` 아래는 세지 않는다.

- [x] **Step 1: 장부 템플릿을 만든다**

`templates/state/decisions.md`:

```markdown
# 확인 필요 사항

> 상태: **설계안**

에이전트가 승인된 계획을 실행하면서 **묻지 않고 가정으로 넘어간 것들.**

| | |
|---|---|
| 갱신일 | YYYY-MM-DD |

**읽는 법** — **1절만 답해주시면 됩니다.** 2절은 알려드리는 것, 3절은 닫힌 것입니다.

⛔ 절 번호 `# 1.` · `# 2.` · `# 3.` 과 `## Q<번호> · <제목>` 형식을 바꾸지 않는다 — `decision-check` 가 이것으로 연다.
항목을 더하거나 옮길 때마다 갱신일을 바꾼다.

> 1절에 이렇게 적는다:
>
> `## Q1 · 결제 실패 시 재시도 횟수를 3회로 가정했다 — 맞나요?`
>
> 되돌리기 **지금 싸다 / 중간 / 없음** · **무엇이 다른가** · **왜 문제가 되나** · **내가 그렇게 한 이유** · **내 의견**

---

# 1. 답변이 필요합니다

# 2. 알려드립니다 — 답변 없어도 진행됩니다

# 3. 해소된 것
```

- [x] **Step 2: 실패하는 테스트를 작성한다**

`test/decision-check.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { auditDecisions } from '../tools/decision-check.mjs';
import { target, repoFile } from './scene.mjs';

const DECISION_CHECK = fileURLToPath(new URL('../tools/decision-check.mjs', import.meta.url));

const BODY = [
  '# 확인 필요 사항',
  '| | |',
  '|---|---|',
  '| 갱신일 | 2026-09-23 |',
  '',
  '# 1. 답변이 필요합니다',
  '',
  '## Q1 · 결제 실패 시 재시도를 3회로 가정했다',
  '내용',
  '## Q2 · 관리자 화면을 이번 범위에서 뺐다',
  '내용',
  '',
  '# 3. 해소된 것',
  '',
  '## Q0 · 로그 보관 기간 · 2026-09-20',
].join('\n');

const scene = (body) => target({ state: { decisions: 'docs/decisions.md' } }, { 'docs/decisions.md': body });
const audit = (body, today) => auditDecisions(loadConfig(scene(body)), new Date(today));

test('1절의 Q 항목만 열린 것으로 센다 — 3절(해소된 것)은 세지 않는다', () => {
  assert.deepEqual(audit(BODY, '2026-09-28').open, [
    { id: 'Q1', title: '결제 실패 시 재시도를 3회로 가정했다' },
    { id: 'Q2', title: '관리자 화면을 이번 범위에서 뺐다' },
  ]);
});

test('갱신일로부터 경과일을 센다', () => {
  const r = audit(BODY, '2026-09-28');
  assert.equal(r.staleDays, 5);
  assert.equal(r.warn, false);
});

test('⭐ 열린 질문이 있고 14일을 넘기면 경고한다', () => {
  assert.equal(audit(BODY, '2026-10-20').warn, true);
});

test('열린 질문이 없으면 오래돼도 경고하지 않는다', () => {
  const body = ['| 갱신일 | 2026-01-01 |', '# 1. 답변이 필요합니다', '', '# 3. 해소된 것'].join('\n');
  assert.equal(audit(body, '2026-10-20').warn, false);
});

test('CRLF 파일도 같게 읽는다', () => {
  assert.deepEqual(audit(BODY.replace(/\n/g, '\r\n'), '2026-09-28'), audit(BODY, '2026-09-28'));
});

test('⛔ 설치 템플릿에는 열린 질문이 없다 — 예시가 질문으로 세지면 설치 직후부터 거짓 경고다', () => {
  const r = audit(repoFile('templates/state/decisions.md'), '2026-10-02');
  assert.deepEqual(r.open, []);
  assert.equal(r.staleDays, null);
});

test('CLI: 경고가 있어도 exit 0 이다 — 답을 기다리는 것은 결함이 아니다', () => {
  // CLI 는 실제 오늘 날짜를 쓴다 — 갱신일을 오늘 기준으로 묵힌다
  const old = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const r = spawnSync(process.execPath, [DECISION_CHECK, scene(BODY.replace('2026-09-23', old))], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /열린 결정 2건/);
  assert.match(r.stdout, /⚠️/);
});

test('CLI: 장부가 설정되지 않았으면 건너뛴다', () => {
  const r = spawnSync(process.execPath, [DECISION_CHECK, target({})], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /건너뛴다/);
});
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/decision-check.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/decision-check.mjs'`

- [x] **Step 4: `tools/decision-check.mjs` 를 작성한다**

`tools/decision-check.mjs`:

```js
#!/usr/bin/env node
// ④ DECISIONS — 묻지 않고 넘어간 가정이 답 없이 묵고 있는지 본다. 설계안.
// ⛔ exit 1 하지 않는다 — 답을 기다리는 것은 결함이 아니다. 경고는 임계를 넘겼을 때만 낸다.

import { readFileSync } from 'node:fs';
import { loadConfig, cli } from '../lib/config.mjs';

export const STALE_DAYS = 14;

export function auditDecisions(cfg, today = new Date()) {
  if (!cfg.state.decisions) throw new Error('.harness/harness.json 에 state.decisions 가 없다');
  const text = readFileSync(cfg.state.decisions, 'utf8');
  const updated = text.match(/\|\s*갱신일\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
  const open = [];
  let inOpen = false;
  for (const line of text.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(\d+)\./);
    if (h1) {
      inOpen = h1[1] === '1';
      continue;
    }
    const q = inOpen && line.match(/^##\s+(Q\d+)\s*·\s*(.+?)\s*$/);
    if (q) open.push({ id: q[1], title: q[2] });
  }
  const staleDays = updated ? Math.round((today - new Date(updated[1])) / 86400000) : null;
  return { open, staleDays, warn: open.length > 0 && staleDays !== null && staleDays > STALE_DAYS };
}

cli(import.meta.url, () => {
  const cfg = loadConfig(process.argv[2] ?? process.cwd());
  if (!cfg.state.decisions) {
    console.log('가정 장부가 없다 (.harness/harness.json 의 state.decisions) — 건너뛴다');
    return;
  }
  const r = auditDecisions(cfg);
  console.log(`열린 결정 ${r.open.length}건 · 갱신 후 ${r.staleDays ?? '?'}일`);
  for (const q of r.open) console.log(`  · ${q.id} ${q.title}`);
  if (r.warn) console.log(`⚠️ ${STALE_DAYS}일을 넘겼다 — 되돌리기 비용이 오르고 있다. 사용자에게 1절을 보여준다`);
});
```

- [x] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/decision-check.test.mjs`
Expected: PASS — `ℹ tests 8` · `ℹ pass 8` · `ℹ fail 0`

- [ ] **Step 6: 커밋한다**

```bash
git add tools/decision-check.mjs templates/state/decisions.md test/decision-check.test.mjs
git commit -m "feat: 결정 적립 검사기 — 가정이 답 없이 묵는 것을 잰다

승인된 계획을 실행하는 동안에는 묻지 않고 가정을 적립한다. 적립만 하고
아무도 안 보면 되돌리기 비용이 조용히 오른다.

⛔ exit 1 하지 않는다. 답을 기다리는 것은 결함이 아니다. 14일 임계를
넘긴 열린 질문이 있을 때만 경고한다.

설치 템플릿의 형식 예시는 인용문 안에 둔다. 예시가 1절의 질문으로
세지면 설치 직후부터 거짓 경고가 뜬다 — 테스트가 템플릿을 직접 읽어
지킨다."
```

---

### Task 6: LESSONS 입구 `lesson-append.mjs`

**Files:**
- Create: `tools/lesson-append.mjs` · `templates/state/lessons.md`
- Test: `test/lesson-append.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` · `cli` (Task 1) · `cells` (Task 4)
- Produces:
  - `appendLesson(cfg, entry: { symptom, cause, category, guard? }) → { id: string }` — id 는 `L001` 부터
  - `CATEGORIES = ['누락된 컨텍스트', '잘못된 도구', '미흡한 권한', '검증 부족']` · `NO_GUARD = '⛔ 아직 없다'`
  - CLI `node .harness/tools/lesson-append.mjs [대상] <<< '<JSON>'`

- [x] **Step 1: 교훈 템플릿을 만든다**

`templates/state/lessons.md`:

```markdown
# 교훈

> 상태: **설계안**

반복된 실패를 **규약으로 올리기 위한 입구.** 증상만 적는 것은 일기다 — 근본 원인과 「무엇이 막는가」가 있어야 교훈이다.

| | |
|---|---|
| 입력 | `node .harness/tools/lesson-append.mjs <<< '<JSON>'` |
| 승격 후보 | `node .harness/tools/lesson-promote.mjs` |

분류: `누락된 컨텍스트` · `잘못된 도구` · `미흡한 권한` · `검증 부족`

⛔ 이 표가 파일의 마지막이다 — 도구가 끝에 행을 덧붙인다.

| id | 분류 | 증상 | 근본 원인 | 무엇이 막는가 |
|---|---|---|---|---|
```

- [x] **Step 2: 실패하는 테스트를 작성한다**

`test/lesson-append.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { cells } from '../lib/mdtable.mjs';
import { appendLesson, NO_GUARD } from '../tools/lesson-append.mjs';
import { target, repoFile } from './scene.mjs';

const APPEND = fileURLToPath(new URL('../tools/lesson-append.mjs', import.meta.url));
const scene = () => target({ state: { lessons: 'docs/lessons.md' } }, { 'docs/lessons.md': repoFile('templates/state/lessons.md') });
const OK = {
  symptom: '치환 명령이 아무것도 안 바꿨는데 커밋됐다',
  cause: '찾는 문자열이 파일에 없었고 치환은 실패를 알리지 않는다',
  category: '검증 부족',
  guard: '',
};
const lastRow = (cfg) => readFileSync(cfg.state.lessons, 'utf8').trimEnd().split(/\r?\n/).at(-1);

test('설치 템플릿의 표에 교훈 한 건을 덧붙이고 id 를 돌려준다', () => {
  const cfg = loadConfig(scene());
  assert.deepEqual(appendLesson(cfg, OK), { id: 'L001' });
  assert.deepEqual(cells(lastRow(cfg)), ['L001', '검증 부족', OK.symptom, OK.cause, NO_GUARD]);
});

test('id 가 증가한다', () => {
  const cfg = loadConfig(scene());
  appendLesson(cfg, OK);
  assert.equal(appendLesson(cfg, OK).id, 'L002');
});

test('막는 것을 적으면 그대로 남는다', () => {
  const cfg = loadConfig(scene());
  appendLesson(cfg, { ...OK, guard: '.claude/rules/edits.md' });
  assert.equal(cells(lastRow(cfg))[4], '.claude/rules/edits.md');
});

test('⛔ 분류가 네 가지 밖이면 거부한다', () => {
  assert.throws(() => appendLesson(loadConfig(scene()), { ...OK, category: '그냥 실수' }), /알 수 없는 분류/);
});

test('⛔ 근본 원인이 비면 거부한다 — 증상만 적는 것은 일기다', () => {
  assert.throws(() => appendLesson(loadConfig(scene()), { ...OK, cause: '  ' }), /근본 원인/);
});

test('값에 | 와 줄바꿈이 들어가도 표가 깨지지 않는다', () => {
  const cfg = loadConfig(scene());
  appendLesson(cfg, { ...OK, symptom: 'a | b\nc' });
  assert.equal(cells(lastRow(cfg)).length, 5);
});

test('CLI: 표준입력의 JSON 을 기록한다', () => {
  const r = spawnSync(process.execPath, [APPEND, scene()], { input: JSON.stringify(OK), encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /기록: L001/);
});

test('⛔ CLI: 거부하면 이유와 함께 exit 1 이다', () => {
  const r = spawnSync(process.execPath, [APPEND, scene()], { input: JSON.stringify({ ...OK, cause: '' }), encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /근본 원인/);
});
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/lesson-append.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/lesson-append.mjs'`

- [x] **Step 4: `tools/lesson-append.mjs` 를 작성한다**

`tools/lesson-append.mjs`:

```js
#!/usr/bin/env node
// ④ LESSONS 입구 — 반복 실패를 규약으로 올리려면 입구가 있어야 한다. 설계안.
// ⛔ 자동 추출하지 않는다. 판단을 거친 한 건을 근본 원인과 함께 적는다.

import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig, cli } from '../lib/config.mjs';

export const CATEGORIES = ['누락된 컨텍스트', '잘못된 도구', '미흡한 권한', '검증 부족'];
export const NO_GUARD = '⛔ 아직 없다';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

export function appendLesson(cfg, entry) {
  if (!cfg.state.lessons) throw new Error('.harness/harness.json 에 state.lessons 가 없다');
  if (!CATEGORIES.includes(entry.category)) {
    throw new Error(`알 수 없는 분류: ${entry.category}\n  쓸 수 있는 것: ${CATEGORIES.join(' · ')}`);
  }
  if (!cell(entry.symptom)) throw new Error('증상이 비었다');
  if (!cell(entry.cause)) throw new Error('근본 원인이 비었다 — 증상만 적는 것은 일기이지 교훈이 아니다');

  const text = readFileSync(cfg.state.lessons, 'utf8');
  const used = [...text.matchAll(/^\|\s*L(\d+)\s*\|/gm)].map((m) => Number(m[1]));
  const id = `L${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
  const row = `| ${id} | ${entry.category} | ${cell(entry.symptom)} | ${cell(entry.cause)} | ${cell(entry.guard) || NO_GUARD} |`;
  writeFileSync(cfg.state.lessons, `${text.trimEnd()}\n${row}\n`);
  return { id };
}

cli(import.meta.url, () => {
  const { id } = appendLesson(loadConfig(process.argv[2] ?? process.cwd()), JSON.parse(readFileSync(0, 'utf8')));
  console.log(`기록: ${id}`);
});
```

- [x] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/lesson-append.test.mjs`
Expected: PASS — `ℹ tests 8` · `ℹ pass 8` · `ℹ fail 0`

- [ ] **Step 6: 커밋한다**

```bash
git add tools/lesson-append.mjs templates/state/lessons.md test/lesson-append.test.mjs
git commit -m "feat: LESSONS 입구 — 반복 실패를 규약으로 올리는 자리

superpowers 에도 Claude Code 에도 없는 것이다. 같은 실패가 반복되면
규약이 돼야 하는데 입구가 없으면 승격은 손으로만, 기록 없이 일어난다.

⛔ 근본 원인이 비면 거부한다. 증상만 쌓이면 일기가 되고 일기는 승격
판정의 근거가 못 된다. 분류는 넷으로 닫는다.

테스트가 설치 템플릿 위에 직접 덧붙여 템플릿과 도구의 표 형식이
어긋나지 않게 지킨다."
```

---

### Task 7: 승격 후보 `lesson-promote.mjs`

**Files:**
- Create: `tools/lesson-promote.mjs`
- Test: `test/lesson-promote.test.mjs`

**Interfaces:**
- Consumes: `loadConfig` · `cli` (Task 1) · `cells` (Task 4) · `appendLesson` · `NO_GUARD` (Task 6)
- Produces: `promotionCandidates(cfg, threshold = 2) → Array<{ category, count, ids: string[] }>` — 많은 순

- [x] **Step 1: 실패하는 테스트를 작성한다**

`test/lesson-promote.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { appendLesson } from '../tools/lesson-append.mjs';
import { promotionCandidates } from '../tools/lesson-promote.mjs';
import { target, repoFile } from './scene.mjs';

const PROMOTE = fileURLToPath(new URL('../tools/lesson-promote.mjs', import.meta.url));
const HEAD = '| id | 분류 | 증상 | 근본 원인 | 무엇이 막는가 |\n|---|---|---|---|---|\n';
const scene = (rows) => target({ state: { lessons: 'l.md' } }, { 'l.md': HEAD + rows.join('\n') });
const cands = (rows) => promotionCandidates(loadConfig(scene(rows)), 2);

test('같은 분류가 임계 이상이고 막는 것이 없으면 후보다', () => {
  assert.deepEqual(cands(['| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |', '| L002 | 검증 부족 | c | d | ⛔ 아직 없다 |']), [
    { category: '검증 부족', count: 2, ids: ['L001', 'L002'] },
  ]);
});

test('임계 미만은 후보가 아니다', () => {
  assert.deepEqual(cands(['| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |']), []);
});

test('⭐ 이미 막는 것이 있는 항목은 세지 않는다 — 승격이 끝난 것이다', () => {
  assert.deepEqual(cands(['| L001 | 검증 부족 | a | b | .claude/rules/edits.md |', '| L002 | 검증 부족 | c | d | ⛔ 아직 없다 |']), []);
});

test('분류가 섞여 있으면 각각 센다', () => {
  const r = cands([
    '| L001 | 검증 부족 | a | b | ⛔ 아직 없다 |',
    '| L002 | 잘못된 도구 | c | d | ⛔ 아직 없다 |',
    '| L003 | 잘못된 도구 | e | f | ⛔ 아직 없다 |',
  ]);
  assert.deepEqual(r.map((c) => c.category), ['잘못된 도구']);
});

test('값 안의 \\| 가 있어도 「무엇이 막는가」 칸을 읽는다', () => {
  assert.deepEqual(cands(['| L001 | 검증 부족 | a \\| b | c | ⛔ 아직 없다 |', '| L002 | 검증 부족 | d | e | ⛔ 아직 없다 |'])[0].count, 2);
});

test('⭐ lesson-append 가 쓴 행을 그대로 읽는다', () => {
  const cfg = loadConfig(target({ state: { lessons: 'l.md' } }, { 'l.md': repoFile('templates/state/lessons.md') }));
  for (const symptom of ['치환이 아무것도 안 바꿨다', '생성 스크립트가 빈 파일을 썼다']) {
    appendLesson(cfg, { symptom, cause: '실패를 알리지 않는 명령의 결과를 확인하지 않았다', category: '검증 부족' });
  }
  assert.deepEqual(promotionCandidates(cfg), [{ category: '검증 부족', count: 2, ids: ['L001', 'L002'] }]);
});

test('CLI: 후보가 없으면 그렇게 말하고 exit 0 이다', () => {
  const r = spawnSync(process.execPath, [PROMOTE, scene([])], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /승격 후보 없음/);
});
```

- [x] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test test/lesson-promote.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/lesson-promote.mjs'`

- [x] **Step 3: `tools/lesson-promote.mjs` 를 작성한다**

`tools/lesson-promote.mjs`:

```js
#!/usr/bin/env node
// ④ LESSONS 승격 후보 — 같은 분류가 반복됐고 아직 막는 것이 없으면 올린다. 설계안.
// ⛔ 승격은 자동으로 하지 않는다 — 규약을 고치는 것은 사람의 판단이다. exit 0 고정.

import { readFileSync } from 'node:fs';
import { loadConfig, cli } from '../lib/config.mjs';
import { cells } from '../lib/mdtable.mjs';
import { NO_GUARD } from './lesson-append.mjs';

export function promotionCandidates(cfg, threshold = 2) {
  if (!cfg.state.lessons) throw new Error('.harness/harness.json 에 state.lessons 가 없다');
  const byCategory = new Map();
  for (const line of readFileSync(cfg.state.lessons, 'utf8').split(/\r?\n/)) {
    const c = cells(line);
    if (!c || c.length < 5 || !/^L\d+$/.test(c[0])) continue;
    const [id, category, , , guard] = c;
    if (guard !== NO_GUARD) continue; // 막는 것이 생겼으면 승격이 끝났다
    byCategory.set(category, [...(byCategory.get(category) ?? []), id]);
  }
  return [...byCategory]
    .filter(([, ids]) => ids.length >= threshold)
    .map(([category, ids]) => ({ category, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count);
}

cli(import.meta.url, () => {
  const found = promotionCandidates(loadConfig(process.argv[2] ?? process.cwd()));
  if (found.length === 0) {
    console.log('승격 후보 없음');
    return;
  }
  console.log('승격 후보 — 같은 분류가 반복됐고 아직 막는 것이 없다:');
  for (const c of found) console.log(`  ${c.category} ×${c.count} (${c.ids.join(' ')})`);
  console.log('\n⇒ 규칙(.claude/rules/ 등)이나 테스트로 막고, 각 행의 「무엇이 막는가」에 그 위치를 적는다.');
});
```

- [x] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test test/lesson-promote.test.mjs`
Expected: PASS — `ℹ tests 7` · `ℹ pass 7` · `ℹ fail 0`

- [ ] **Step 5: 커밋한다**

```bash
git add tools/lesson-promote.mjs test/lesson-promote.test.mjs
git commit -m "feat: LESSONS 승격 후보 검출

같은 분류가 임계(기본 2회) 이상 반복되고 아직 막는 것이 없으면 후보로
올린다. 「무엇이 막는가」가 채워진 행은 승격이 끝난 것이므로 세지 않는다
— 안 그러면 해결된 교훈이 영구히 후보에 남아 경고가 노이즈가 된다.

칸은 lesson-append 가 쓰는 이스케이프(\\|)를 아는 공용 분리기로 나눈다.
09-28 계획의 정규식은 증상에 | 가 들어가면 「무엇이 막는가」 칸을 잘못
읽었다.

⛔ 승격 자체는 자동화하지 않는다."
```

---

### Task 8: 설정 병합 `policy-apply`

**Files:**
- Create: `policy/settings.json` · `tools/policy-apply.mjs`
- Test: `test/policy.test.mjs`

**Interfaces:**
- Consumes: `cli` (Task 1)
- Produces:
  - `mergeSettings(settings, policy) → object` — 순수 함수. 권한은 **합집합**, `env` · `enabledPlugins` · `extraKnownMarketplaces` 는 정책의 키만 정하고 나머지 보존, `_` 로 시작하는 정책 키는 옮기지 않는다. 다시 돌려도 같다(멱등)
  - `POLICY` (`../policy/settings.json` 의 절대경로) · `settingsPath(root)` · `readJson(path)`
  - CLI `node .harness/tools/policy-apply.mjs [대상]`

⛔ **JSON 이다.** Node 는 YAML 파서를 내장하지 않는다. 주석은 `_note` · `_why` 키로 단다.

⛔ 이탈 보고기(`policy-diff`)는 두지 않는다 — final-gate 의 ponytail-review 가 걷어냈다(Task 11). 복구는 멱등인 `policy-apply` 재실행, 변경 확인은 `git diff .claude/settings.json`.

- [x] **Step 1: 정책을 작성한다**

`policy/settings.json`:

```json
{
  "_note": "대상 .claude/settings.json 에 병합할 정책 단일 원천. tools/policy-apply.mjs 가 기존 키를 보존하며 반영한다.",
  "_why": {
    "deny-push": "레포 밖으로 나가는 작업은 사람이 한다",
    "deny-rm": "되돌릴 수 없는 삭제. mv 는 허용하되 덮어쓰기 위험은 남는다",
    "ask-force": "--force 는 되돌리기가 사라지는 지점이다",
    "ponytail-off": "흐름의 베이스는 superpowers 다. ponytail 은 final-gate 에서 /ponytail-review 로만 부른다",
    "allow-narrow": "allow 는 사람의 확인을 건너뛴다. 인자로 쓰기·실행에 닿는 명령(find -exec, sort -o, git diff/log/show --output)과 와일드카드 경로(node .harness/tools/* 는 ../ 로 아무 스크립트나 연다)는 두지 않는다 — 10-02 보안 리뷰"
  },
  "permissions": {
    "allow": [
      "Read", "Glob", "Grep",
      "Bash(node .harness/tools/verify.mjs)",
      "Bash(node .harness/tools/decision-check.mjs)",
      "Bash(node .harness/tools/lesson-promote.mjs)",
      "Bash(node .harness/tools/state-check.mjs)",
      "Bash(git status *)", "Bash(ls *)", "Bash(pwd)", "Bash(grep *)",
      "Bash(head *)", "Bash(tail *)", "Bash(wc *)", "Bash(diff *)"
    ],
    "deny": [
      "Bash(rm *)", "Bash(rmdir *)",
      "Bash(git push *)", "Bash(git reset --hard*)", "Bash(git clean *)",
      "Bash(git checkout -- *)", "Bash(git rebase *)",
      "Bash(curl * | bash*)", "Bash(wget * | bash*)",
      "Bash(npm publish *)",
      "Bash(find * -delete*)", "Bash(find * -exec rm*)"
    ],
    "ask": [
      "Bash(*--force*)", "Bash(git restore *)", "Bash(git stash drop*)", "Bash(git stash clear*)"
    ]
  },
  "env": { "PONYTAIL_DEFAULT_MODE": "off" },
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "ponytail@ponytail": true
  },
  "extraKnownMarketplaces": {
    "ponytail": { "source": { "source": "github", "repo": "DietrichGebert/ponytail" } }
  }
}
```

- [x] **Step 2: 실패하는 테스트를 작성한다**

`test/policy.test.mjs`:

```js
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
```

- [x] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test test/policy.test.mjs`
Expected: FAIL — `Cannot find module '…/tools/policy-apply.mjs'`

- [x] **Step 4: `tools/policy-apply.mjs` 를 작성한다**

`tools/policy-apply.mjs`:

```js
#!/usr/bin/env node
// 설치 — 정책 한 곳(.harness/policy/settings.json)을 대상 .claude/settings.json 에 병합한다. 설계안.
// ⛔ 덮어쓰지 않는다: 권한은 합집합, env·플러그인·마켓은 정책의 키만 정하고 나머지는 보존한다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/config.mjs';

export const POLICY = fileURLToPath(new URL('../policy/settings.json', import.meta.url));
const MAPS = ['env', 'enabledPlugins', 'extraKnownMarketplaces'];
const PERMS = ['allow', 'deny', 'ask'];

export function mergeSettings(settings, policy) {
  const out = { ...settings };
  if (policy.permissions) {
    out.permissions = { ...settings.permissions };
    for (const k of PERMS) {
      if (policy.permissions[k]) out.permissions[k] = [...new Set([...(settings.permissions?.[k] ?? []), ...policy.permissions[k]])];
    }
  }
  for (const k of MAPS) if (policy[k]) out[k] = { ...settings[k], ...policy[k] };
  return out;
}

export const settingsPath = (root) => join(root, '.claude', 'settings.json');

export function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`JSON 을 읽지 못했다: ${path}\n  ${e.message}`);
  }
}

cli(import.meta.url, () => {
  const path = settingsPath(process.argv[2] ?? process.cwd());
  const merged = mergeSettings(readJson(path), readJson(POLICY));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`반영: ${path}\n⛔ git diff 로 의도한 것만 바뀌었는지 직접 확인한다`);
});
```

- [x] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test test/policy.test.mjs`
Expected: PASS — `ℹ tests 8` · `ℹ pass 8` · `ℹ fail 0`

- [ ] **Step 6: 커밋한다**

```bash
git add policy/settings.json tools/policy-apply.mjs test/policy.test.mjs
git commit -m "feat: 설정 병합 — 권한·env·플러그인 선언을 기존 설정 위에 얹는다

설치 대상은 이미 자기 settings.json 을 가진 프로젝트일 수 있다. 정책을
교체하면 그 프로젝트의 허용 규칙과 훅이 조용히 날아간다. 권한은
합집합으로, env·enabledPlugins·extraKnownMarketplaces 는 정책의 키만
정하고 나머지는 보존한다. 깨진 JSON 은 덮어쓰지 않고 멈춘다.

정책이 PONYTAIL_DEFAULT_MODE=off 를 넣는다. 흐름의 베이스는
superpowers 이고 ponytail 상시 모드의 「설명 금지」가 설계·질문 단계와
충돌한다 — ponytail 은 final-gate 에서 리뷰로만 부른다.

다시 돌려도 같다(멱등). 이탈 보고기를 따로 두지 않고 재실행으로
복구한다 — 변경은 git diff 가 보여준다.

⛔ allow 는 사람의 확인을 건너뛴다. 인자로 쓰기·실행에 닿는 명령
(find -exec · sort -o · git diff/log/show --output)과 ../ 로 아무 스크립트나
여는 와일드카드 경로는 두지 않는다 — 거부 목록을 우회한다(보안 리뷰).
테스트가 배포 정책을 직접 읽어 지킨다."
```

---

### Task 9: 규칙 · 마지막 관문 · 설치 지시서

**Files:**
- Create: `templates/rules/harness.md` · `templates/skills/final-gate/SKILL.md` · `templates/harness.json` · `SETUP.md` · `README.md`
- Test: `test/templates.test.mjs`

**Interfaces:**
- Consumes: Task 1~8 의 모든 도구 이름 · `loadConfig` · `repoFile` · `target`
- Produces: 대상 프로젝트에서 `<이 레포>/SETUP.md 를 읽고 이 프로젝트에 적용해줘` 로 설치되는 상태. 규칙 파일의 `<decisions>` · `<lessons>` 는 SETUP 4단계가 채우는 자리다

- [x] **Step 1: 규칙 파일을 작성한다**

`templates/rules/harness.md`:

````markdown
# 하네스 — 증거와 기록

> 상태: **설계안** · agent-harness 가 설치했다. 도구는 `.harness/tools/`, 경로 설정은 `.harness/harness.json`

## 흐름 — superpowers 가 베이스다

brainstorming → writing-plans → 실행 → finishing-a-development-branch. 설계와 계획은 사람이 승인한다.

- ⭐ **writing-plans 로 만든 계획의 마지막 태스크는 `final-gate` 스킬이다.** 그 태스크가 없는 계획은 끝난 계획이 아니다
- 승인된 계획을 실행하는 동안에는 **묻지 않는다.** 확인이 필요한 것은 `<decisions>` 1절에 가정과 함께 적고 진행한다. 판단이 갈리면 되돌리기 쉬운 쪽을 고르고 그 이유를 적는다
- 예외 — 여기서는 멈추고 묻는다: 되돌릴 수 없는 작업(데이터 삭제·이력 재작성) · 레포 밖으로 나가는 작업(push·배포·외부 서비스) · 비밀값

## 완료는 증거로 주장한다

⛔ 종료코드 0 · `BUILD SUCCESSFUL` · 러너의 `pass` 요약으로 통과를 주장하지 않는다. 테스트가 0개여도 그렇게 나온다.

```bash
node .harness/tools/verify.mjs      # verification-before-completion 에서 돌릴 명령 — 이번 실행이 쓴 결과 파일로 판정한다
```

## 상태는 파일이 기억한다

```bash
node .harness/tools/decision-check.mjs   # 답을 기다리는 가정 · 경과일
node .harness/tools/lesson-promote.mjs   # 규약으로 올릴 반복 실패
node .harness/tools/state-check.mjs      # 진행 상태 대장 (있을 때만)
```

## 같은 실패가 두 번이면 규약으로 올린다

실패를 고쳤으면 근본 원인과 함께 `<lessons>` 에 적는다:

```bash
node .harness/tools/lesson-append.mjs <<'EOF'
{"symptom":"<무엇이 보였나>","cause":"<근본 원인>","category":"검증 부족","guard":""}
EOF
```

분류: `누락된 컨텍스트` · `잘못된 도구` · `미흡한 권한` · `검증 부족`. ⛔ 근본 원인이 없으면 도구가 거부한다.

## 플러그인

superpowers 와 ponytail 을 쓴다. 이 PC 에 없으면 설치한다:

```bash
claude plugin install superpowers@claude-plugins-official --scope project
claude plugin marketplace add DietrichGebert/ponytail --scope project
claude plugin install ponytail@ponytail --scope project
```

다른 마켓의 같은 플러그인을 이미 쓰고 있으면 설치하지 말고 `.claude/settings.local.json` 의 `enabledPlugins` 에서 위 id 를 `false` 로 끈다.
ponytail 모드는 꺼져 있다(`PONYTAIL_DEFAULT_MODE=off`) — `final-gate` 에서 `/ponytail-review` 로만 부른다.
````

- [x] **Step 2: 마지막 관문 스킬을 작성한다**

`templates/skills/final-gate/SKILL.md`:

````markdown
---
name: final-gate
description: 승인된 계획의 구현 태스크를 모두 끝낸 뒤 finishing-a-development-branch 전에 한 번 쓴다 — 결과 파일로 검증하고, ponytail-review 로 과설계를 걷어내고, 다시 검증하고, security-review 를 한 번 돌리고, 가정·교훈을 기록한다
---

# 마지막 관문

> 상태: **설계안**

계획 전체가 끝났을 때 **한 번만** 돈다. 태스크마다 돌지 않는다 — 태스크별 리뷰는 superpowers 실행 단계가 이미 한다.

## 절차

1. `node .harness/tools/verify.mjs` — ⛔ exit 0 이 아니면 여기서 멈추고 고친다
2. `/ponytail-review` — 이 브랜치의 diff 전체가 대상이다. 지적마다 **걷어내거나**, 남기는 이유를 한 줄 적는다
3. 걷어낸 것이 있으면 `node .harness/tools/verify.mjs` 를 **다시** 돌린다 — ⛔ exit 0
4. `/security-review` **1회**
5. 기록한다
   - 실행 중 묻지 않고 넘어간 가정 → decisions 1절, 그리고 `node .harness/tools/decision-check.mjs`
   - 반복된 실패 → `node .harness/tools/lesson-append.mjs`, 그리고 `node .harness/tools/lesson-promote.mjs`
   - 계획서 체크박스
6. 증거를 요약한다 — 검사 이름과 판정 근거를 verify 출력 그대로 옮긴다. 「통과했다」로 줄이지 않는다
7. → `finishing-a-development-branch`

## ⛔ 하지 않는 것

| ⛔ | 왜 |
|---|---|
| verify 없이 finishing | 증거 없는 완료 주장이다 |
| ponytail 모드를 켜고 작업 | superpowers 의 설계·질문 단계와 충돌한다. 리뷰만 부른다 |
| `/security-review` 를 태스크마다 | 상시 훅으로 되돌아가는 것이다 |
| 걷어낸 뒤 재검증 생략 | 걷어내기도 변경이다 |
````

- [x] **Step 3: 경로 설정 템플릿을 작성한다**

`templates/harness.json`:

```json
{
  "_note": "agent-harness 경로 설정. 모든 경로는 대상 저장소 루트 기준. 없는 상태 파일은 키를 지운다. 형식은 SETUP.md 3단계.",
  "state": {
    "decisions": "docs/harness/decisions.md",
    "lessons": "docs/harness/lessons.md"
  },
  "checks": [
    {
      "id": "테스트",
      "cmd": "<결과 XML 을 매번 새로 쓰는 테스트 명령>",
      "kind": "junit-xml",
      "evidence": "<결과 XML 파일 또는 디렉터리>"
    }
  ]
}
```

- [x] **Step 4: 설치 지시서를 작성한다**

`SETUP.md`:

````markdown
# SETUP — 프로젝트에 하네스를 얹는다

> 상태: **설계안**

⛔ **이 문서는 사람이 아니라 Claude Code 에게 주는 지시서다.** 대상 프로젝트에서
`<이 레포 경로>/SETUP.md 를 읽고 이 프로젝트에 적용해줘` 로 시작한다.
아래에서 `<하네스>` 는 이 문서가 있는 디렉터리, `<대상>` 은 적용할 프로젝트 루트다.

## ⛔ 절차 — 순서를 지킨다

### 1. 안전 확인

```bash
git -C <대상> rev-parse --is-inside-work-tree
git -C <대상> status --porcelain
node --version        # v22 이상
claude --version      # 2.1.277 이상
```

| 걸리면 | 행동 |
|---|---|
| git 저장소가 아니다 | ⛔ 멈추고 알린다 — 설치 전후를 비교할 수 없다 |
| 미커밋 변경이 있다 | ⛔ 멈추고 알린다 |
| Node 22 미만 | ⛔ 중단 |
| `.harness/` · `.claude/rules/harness.md` · `.claude/skills/final-gate/` 가 이미 있다 | ⛔ 덮어쓰지 않는다 — 재설치인지 사용자에게 묻는다 |

### 2. 도구와 템플릿을 복사한다

```bash
mkdir -p <대상>/.harness <대상>/.claude/rules <대상>/.claude/skills <대상>/docs/harness
cp -r <하네스>/lib <하네스>/tools <하네스>/policy <대상>/.harness/
cp <하네스>/templates/rules/harness.md <대상>/.claude/rules/harness.md
cp -r <하네스>/templates/skills/final-gate <대상>/.claude/skills/
cp <하네스>/templates/harness.json <대상>/.harness/harness.json
```

### 3. `.harness/harness.json` 을 채운다

⛔ **대상이 이미 쓰는 경로를 그대로 적는다. 파일을 옮기지 않는다.**

**상태 파일** — 대상에 이미 가정 장부·교훈 파일이 있으면 그 경로를 적는다. 없으면 템플릿을 복사한다:

```bash
cp <하네스>/templates/state/decisions.md <대상>/docs/harness/decisions.md
cp <하네스>/templates/state/lessons.md <대상>/docs/harness/lessons.md
```

파일 단위 분석 진행을 추적해야 하는 일(레거시 이해, 레퍼런스 대조)이면 `<하네스>/templates/state/current.md` 를
복사하고 `state.current` 에 적는다. 대장의 경로가 다른 저장소를 가리키면 `state.currentRoot` 도 적는다.

**검사** — `checks` 에는 **실제로 도는 명령**만, 그리고 **결과 XML 을 매번 새로 쓰는** 명령만 적는다.
`verify` 는 이번 실행이 쓰지 않은 XML 을 증거로 쓰지 않는다.

| 스택 | `cmd` | `evidence` |
|---|---|---|
| Node (`node:test`) | `node -e "require('fs').mkdirSync('test-results',{recursive:true})" && node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=test-results/junit.xml` | `test-results` |
| Gradle | `./gradlew cleanTest test` (Windows `cmd`: `gradlew cleanTest test`) | `build/test-results/test` |
| Maven | `mvn test` | `target/surefire-reports` |
| pytest | `pytest --junitxml=test-results/junit.xml` | `test-results` |

- Node 는 junit 결과 디렉터리를 만들지 않는다 — 없으면 ENOENT 로 죽는다(실측). 위처럼 먼저 만든다
- Gradle 의 `test` 는 UP-TO-DATE 면 결과를 다시 쓰지 않는다 — `cleanTest` 를 붙인다
- 명령은 플랫폼 기본 셸(`sh` / Windows `cmd`)로 돈다. 팀이 OS 를 섞어 쓰면 `npm test` 처럼 양쪽에서 같은 명령을 고른다
- 결과 XML 을 낼 수 없는 스택은 `kind: "exit-code"` 로 두고, **테스트 0개를 못 잡는다**고 사용자에게 알린다
- 생성물이 계약인 경우(OpenAPI 스냅샷 등)는 `kind: "file-unchanged"` — 다시 만들었을 때 git 이 깨끗해야 통과다

### 4. 규칙 파일의 자리를 채운다

`<대상>/.claude/rules/harness.md` 의 `<decisions>` · `<lessons>` 를 harness.json 의 실제 경로로 바꾼다. 바꾼 뒤 확인한다:

```bash
grep -n '<decisions>\|<lessons>' <대상>/.claude/rules/harness.md   # ⛔ 아무것도 나오지 않아야 한다
```

⛔ **대상의 `CLAUDE.md` · `AGENTS.md` 를 건드리지 않는다.** `.claude/rules/` 는 둘 중 무엇이 있든 로드된다.
`AGENTS.md` 에 절을 더하면 `CLAUDE.md` 가 있는 대상에서는 조용히 빠진다.

### 5. 설정과 플러그인

```bash
cd <대상>
node .harness/tools/policy-apply.mjs      # 권한 · env · 플러그인 선언을 .claude/settings.json 에 병합
claude plugin list --json                 # 이 PC 에 설치된 플러그인 — {id, scope, enabled} 배열
```

superpowers 와 ponytail 각각에 대해:

| `list` 결과 | 행동 |
|---|---|
| 정책의 id (`superpowers@claude-plugins-official` · `ponytail@ponytail`) 가 `enabled` | 아무것도 하지 않는다 |
| 같은 이름이 **다른 마켓 id** 로 `enabled` (예: `superpowers@superpowers-marketplace`) | 설치하지 않는다. `.claude/settings.local.json` 의 `enabledPlugins` 에 정책 id 를 `false` 로 넣는다 — local 이 project 보다 우선한다 |
| 없다 | `claude plugin install <정책 id> --scope project` — ponytail 은 먼저 `claude plugin marketplace add DietrichGebert/ponytail --scope project` |

프로젝트가 선언한 플러그인이 그 PC 에 이미 사용자 범위로 설치돼 있으면, 그 프로젝트에서 세션을 열 때 프로젝트 범위 설치 기록이
자동으로 생긴다(실측) — 팀원은 따로 할 일이 없다. 설치되지 않은 PC 는 `/plugin` 오류 탭에
`enabled in project settings but isn't installed here` 가 뜬다 — 그때 위 표대로 설치한다.

`.claude/settings.local.json` 을 만들었으면 git 이 무시하는지 확인한다:

```bash
git check-ignore -q .claude/settings.local.json || echo '.claude/settings.local.json' >> .gitignore
```

### 6. ⭐ 소급 입력 — git 이력이 있는 프로젝트만

⛔ **빈 교훈 파일은 값이 0이다.** 이력이 있으면 최근 이력에서 교훈을 2~3건 넣는다:

```bash
git log --oneline -50 | grep -iE 'fix|bug|revert|버그|수정|잘못|누락'
```

커밋 본문에서 **근본 원인**이 드러난 것만 `node .harness/tools/lesson-append.mjs` 로 넣는다. 이미 규칙·테스트로
막혀 있으면 `guard` 에 그 위치를 적는다 — 승격 후보로 다시 뜨지 않는다. 이력이 없는 신규 프로젝트는 건너뛴다.

### 7. 검증 — ⛔ 자기 보고도 도구 출력도 믿지 않는다

**7-a. 도구가 도는가**

```bash
node .harness/tools/verify.mjs; echo "exit=$?"    # ⛔ exit 0 — 아니면 checks 를 고친다. 테스트가 실제로 실패 중이면 사용자에게 알린다
node .harness/tools/decision-check.mjs
node .harness/tools/lesson-promote.mjs
node .harness/tools/state-check.mjs
git status --porcelain                             # 의도한 파일만 바뀌었는가
```

**7-b. 규칙이 새 세션에 로드되는가** — 도구를 끈 새 세션으로 양성·음성을 대조한다

```bash
claude -p --model haiku --tools "" --no-session-persistence "도구를 쓰지 마라. 이 저장소에서 작업 완료를 주장하기 전에 반드시 돌려야 하는 명령은 정확히 무엇인가? 주어진 지시에 없으면 정확히 '모름'이라고만 답하라." < /dev/null
claude -p --model haiku --tools "" --no-session-persistence "도구를 쓰지 마라. 이 저장소의 배포 승인권자는 누구인가? 주어진 지시에 없으면 정확히 '모름'이라고만 답하라." < /dev/null
```

양성은 `node .harness/tools/verify.mjs` 를, 음성은 「모름」을 답해야 한다. 양성이 「모름」이면 규칙 파일 위치와 `/config` 의 Project instructions 를 본다.

**7-c. ponytail 이 꺼졌는가** — 훅 출력은 stream-json 에 그대로 나온다

```bash
claude -p --model haiku --tools "" --no-session-persistence --output-format stream-json --verbose "ok" < /dev/null | grep -c "PONYTAIL MODE ACTIVE"    # ⛔ 0
```

**7-d. 플러그인이 하나씩인가** — `claude plugin list --json` 에서 이름이 superpowers · ponytail 인 `enabled` 항목의 **id** 가 각각 하나다.
같은 id 가 여러 줄인 것은 정상이다 — 목록은 이 PC 의 모든 프로젝트 설치 기록을 보여준다.

**7-e.** `git diff` 를 사용자에게 보여준다. 기존 설정 보존은 사용자만 판정한다.

### 8. 보고 — 3단

```markdown
## ✅ 얹은 것
- <경로>: <무엇을>

## ⛔ 사용자가 결정해야 하는 것
1. <무엇> — <왜 내가 못 정하는가>

## ⚠️ 이 프로젝트에 새로 생기는 제약
- 계획의 마지막 태스크가 final-gate 다
- 완료를 주장하기 전에 node .harness/tools/verify.mjs
```

## ⛔ 하지 않는 것

| ⛔ | 왜 |
|---|---|
| 대상의 기존 상태 파일을 옮기기 | 기존 참조가 깨진다 |
| `CLAUDE.md` · `AGENTS.md` 에 절 추가 | `CLAUDE.md` 가 있으면 `AGENTS.md` 는 로드되지 않는다. 규칙은 `.claude/rules/` 에 |
| 훅으로 상태를 자동 기록 | 검증 관문이 없다 |
| 검사를 pre-push 에 전부 걸기 | 진행도 게이트를 correctness 게이트로 쓰면 급한 수정이 막힌다 |
| ponytail 모드를 켜 두기 | superpowers 의 설계·질문 단계와 충돌한다. final-gate 에서 `/ponytail-review` 로만 |
````

- [x] **Step 5: README 를 작성한다**

`README.md`:

````markdown
# agent-harness

> 상태: ⛔ **설계안** — 실제 프로젝트에 적용해 값을 낸 것은 아직 없다. 합성 대상 실측은 [§실측](#실측)

어느 프로젝트에나 얹는 Claude Code 하네스. **흐름은 superpowers, 마지막 과설계 점검은 ponytail** 이 맡고,
둘이 못 하는 두 가지를 이 레포가 맡는다:

1. **완료의 결정론적 증거** — 종료코드도 러너 요약도 테스트 0개를 통과시킨다. `verify` 는 이번 실행이 쓴 결과 XML 의 `<testcase>` 를 센다
2. **묻지 않고 넘어간 가정 · 반복 실패의 적립** — 실행 중 남긴 가정이 답 없이 묵지 않게, 같은 실패가 규약이 되게

## 설치

대상 프로젝트에서 Claude Code 에게:

```
<이 레포 경로>/SETUP.md 를 읽고 이 프로젝트에 적용해줘
```

Node 22+ · Claude Code 2.1.277+ · git 저장소. 대상에는 `.harness/` · `.claude/rules/harness.md` ·
`.claude/skills/final-gate/` · `docs/harness/` 가 생기고 `.claude/settings.json` 이 병합된다.
대상의 `CLAUDE.md` · `AGENTS.md` 는 건드리지 않는다 — `.claude/rules/` 는 둘 중 무엇이 있든 로드된다.

## 흐름

```
brainstorming ─(사람 승인)→ writing-plans ─(사람 승인)→ 실행 (TDD)
   ├ 실행 중 — 묻지 않는다: 가정은 decisions 에, 반복 실패는 lessons 에
   └ 완료를 주장하기 전 — node .harness/tools/verify.mjs
→ 계획의 마지막 태스크 = final-gate → finishing-a-development-branch

final-gate: verify → /ponytail-review → 걷어낸 뒤 verify 재실행 → /security-review 1회 → 기록
```

## 정직한 값 — 이미 되는 것은 넣지 않는다

| 차원 | 이미 되나 | 여기서 |
|---|---|---|
| 계획 · TDD · 검증 규율 | ✅ superpowers | 안 만든다 |
| 과설계 리뷰 | ✅ ponytail | final-gate 에서 부른다 |
| 지시 파일 검사 · 노출 도구 | ✅ `/doctor prompt-audit` · `claude plugin details` | 안 만든다 |
| **완료의 결정론적 증거** | ❌ 종료코드·러너 요약은 테스트 0개를 통과시킨다 | ⭐ `verify` |
| **묻지 않은 가정의 적립** | ❌ | ⭐ `decision-check` |
| **반복 실패 → 규약 승격** | ❌ | ⭐ `lesson-append` · `lesson-promote` |
| **상태 대장이 거짓말하는지** | ❌ | ⭐ `state-check` (대장이 있을 때) |

## 구성 요소

| 도구 | 하는 일 | 종료 | 딱지 |
|---|---|---|---|
| `verify` | 선언된 검사를 돌리고 이번 실행이 쓴 결과 파일로 판정 | 실패·검사 0개면 1 | 설계안 |
| `state-check` | 대장의 해시가 원본과 맞는지 | 파일 소멸만 1 | 설계안 |
| `decision-check` | 답 없이 묵는 가정 · 경과일 | 0 고정, 14일 넘으면 경고 | 설계안 |
| `lesson-append` | 실패 1건 기록 — 근본 원인 없으면 거부 | 거부 시 1 | 설계안 |
| `lesson-promote` | 같은 분류 2회 + 막는 것 없음 → 후보 | 0 고정 | 설계안 |
| `policy-apply` | 권한 · env · 플러그인 선언을 기존 설정 위에 병합 — 다시 돌려도 같다 | 깨진 JSON 이면 1 | 설계안 |
| `final-gate` 스킬 | 마지막 관문 | — | 설계안 |

## ⛔ 도입하지 말아야 할 때

| 이럴 땐 하지 않는다 | 왜 |
|---|---|
| 결정론적 검사를 만들 수 없는 스택이다 | verify 가 비면 나머지가 장부질에 그친다 |
| 계획 없이 한두 번 묻고 끝나는 작업뿐이다 | 가정·교훈이 쌓일 반복이 없다 |
| 프로젝트 수명이 몇 주다 | LESSONS 는 반복이 있어야 승격된다 |
| superpowers 를 쓰지 않기로 한 팀이다 | 흐름의 베이스가 superpowers 다 |

## 실측

_적용 전 — 실측 없음._ `node proof/run.mjs --claude` 가 이 절을 채운다 (Task 10).

## 개발

```bash
npm test      # 결과 XML 은 test-results/
```

설계: `docs/2026-09-28-design.md` · 계획: `docs/plans/2026-09-28-agent-harness.md`
````

- [x] **Step 6: 실패하는 템플릿 테스트를 작성한다**

`test/templates.test.mjs`:

```js
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
```

- [x] **Step 7: 템플릿 테스트가 통과하는지 확인한다**

템플릿과 문서를 먼저 썼으므로 이 테스트는 바로 통과해야 한다. ⛔ 대신 **음성 대조**를 한 번 한다 — 규칙 파일의 `verify.mjs` 를 `verifyy.mjs` 로 잠깐 바꿔 첫 테스트가 실패하는지 본 뒤 되돌린다.

Run: `node --test test/templates.test.mjs`
Expected: PASS — `ℹ tests 5` · `ℹ pass 5` · `ℹ fail 0` (음성 대조 중에는 `ℹ fail 2` — 참조 테스트와 규칙 내용 테스트가 함께 잡는다)

- [x] **Step 8: 전체 테스트를 돌린다**

Run: `npm test`
Expected: PASS — `ℹ tests 79` · `ℹ pass 79` · `ℹ fail 0`, `test-results/junit.xml` 생성

- [ ] **Step 9: 커밋한다**

```bash
git add templates/rules/harness.md templates/skills/final-gate/SKILL.md templates/harness.json SETUP.md README.md test/templates.test.mjs
git commit -m "feat: 규칙·마지막 관문·설치 지시서

규칙은 .claude/rules/harness.md 한 파일로 심는다. AGENTS.md 는 CLAUDE.md
가 있는 대상에서 로드되지 않는다(공식 문서·실측). 범용 템플릿에서
CLAUDE.md 가 있는 대상은 흔하다.

규칙이 「writing-plans 계획의 마지막 태스크는 final-gate」를 강제한다.
관문이 계획서의 체크박스가 돼야 잊히지 않는다. final-gate 는 verify →
ponytail-review → 재검증 → security-review 1회 → 기록 순이고, 계획 끝에
한 번만 돈다.

SETUP 은 플러그인 중복을 다룬다. 같은 이름의 플러그인을 두 마켓에서
켰을 때 무엇이 로드되는지는 문서에 없어서, 이미 다른 마켓으로 켜져
있으면 설치하지 않고 로컬 설정에서 정책 id 를 끈다.

배포 문서가 가리키는 도구·템플릿이 실재하는지 테스트가 지킨다."
```

---

### Task 10: 효과 입증 — 합성 대상 실측

**Files:**
- Create: `proof/run.mjs`
- Modify: `README.md` (§실측)

**Interfaces:**
- Consumes: 설치물 전체 (Task 1~9) · `judgeJunitXml` · `hash12`
- Produces: README §실측 의 표 · 재현 명령 `node proof/run.mjs [--claude]` — 예상과 다른 행이 하나라도 있으면 exit 1

실험 — 모두 「하네스 없이」와 「있을 때」를 같은 대상·같은 조건에서 본다:

| | 무엇을 | 대조 |
|---|---|---|
| P1 | 거짓 완료 — test() 없는 파일 · 실패 · 수정 · 명령이 바뀌어 직전 XML 만 남음 | `npm test` 종료코드 · 남은 XML 만 읽는 판정 vs `verify` |
| P1b | CLI 판별 | 09-28 계획의 판별식 vs `cli()` |
| P5 | ④ 도구 — 묵은 가정 · 일기 거부 · 승격 후보 · 대장 재작업·소멸 | 설치된 배치(`.harness/tools`)에서 CLI 로 |
| P4 | 설정 병합 · 플러그인 중복 | 기존 settings 보존 · `claude plugin list --json` |
| P2 | 규칙 로드 (`--claude`) | `CLAUDE.md` 유무 × 규칙 위치(`AGENTS.md` vs `.claude/rules/`) · 음성 대조 |
| P3 | ponytail 끄기 (`--claude`) | 정책 반영 대상 vs 미반영 대조군의 훅 출력 |

- [x] **Step 1: 실측 스크립트를 작성한다**

`proof/run.mjs`:

```js
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
```

- [x] **Step 2: 결정론 실측을 돌린다**

Run: `node proof/run.mjs`
Expected: exit 0 — P1 4행 · P1b 2행 · P5 4행 · P4 1행이 모두 ✅

⛔ ⛔ 이 나오면 하네스가 틀린 것인지 실험이 틀린 것인지 먼저 가른다. 하네스가 틀렸으면 해당 태스크로 돌아가 테스트부터 고친다.

- [x] **Step 3: 새 세션 실측을 돌린다**

Run: `node proof/run.mjs --claude > proof-result.md; echo "exit=$?"`
Expected: exit 0 — P2 5행(Windows 에서 `tmpdir()` 가 8.3 단축 경로면 7행) · P4 플러그인 2행 · P3 2행까지 모두 ✅. 실행 시간 수 분, haiku 호출 7~9회.
실측이 사용자 환경에 남긴 프로젝트 범위 설치 기록은 스크립트가 되돌리고 그 결과를 행으로 남긴다

⚠️ P3 의 off 세션은 ponytail 의 사용자 전역 모드 플래그를 지운다. 대조군 세션이 다시 켠다.

- [x] **Step 4: README §실측 을 채운다**

`README.md` 의 `_적용 전 — 실측 없음._ …` 한 줄을 `proof-result.md` 의 표로 바꾸고, 표 아래에 읽는 법 세 줄을 둔다:
무엇이 「하네스 없이」 통과였는데 「있을 때」 막혔는가, 무엇이 아직 실측되지 않았는가(실제 프로젝트 적용 · SETUP 을 새 세션이 끝까지 따르는가),
그래서 딱지는 왜 `설계안` 그대로인가. `proof-result.md` 는 커밋하지 않는다 — 값이 아니라 명령(`node proof/run.mjs --claude`)을 남긴다.

- [ ] **Step 5: 커밋한다**

```bash
git add proof/run.mjs README.md
git commit -m "docs: 효과 입증 — 합성 대상에서 하네스 없이와 있을 때를 잰다

같은 대상·같은 조건에서 npm test 의 종료코드, 남은 XML 만 읽는 판정,
09-28 방식의 규칙 위치를 verify·.claude/rules·정책과 견준다. 수치가
아니라 재현 명령(node proof/run.mjs --claude)을 원천으로 남긴다.

딱지는 설계안 그대로다. 합성 대상에서 메커니즘이 의도대로 판정한다는
것까지가 실측이고, 실제 프로젝트에서 값을 냈는지는 아직 모른다."
```

---

### Task 11: 마지막 관문

**Files:**
- Create (로컬 전용): `.harness/harness.json` — `.git/info/exclude` 에 `.harness/` 를 더한다
- Modify: `CLAUDE.local.md` (로컬 전용) · 이 계획서 체크박스

이 레포의 `CLAUDE.local.md` 가 정한 흐름 그대로 — 템플릿이 대상에 심는 `final-gate` 와 같은 순서를 이 레포 자신에 돌린다.

- [x] **Step 1: 이 레포를 verify 로 판정한다**

`.harness/harness.json` (로컬 전용, push 하지 않는다):

```json
{ "checks": [{ "id": "단위 테스트", "cmd": "npm test", "kind": "junit-xml", "evidence": "test-results" }] }
```

Run: `node tools/verify.mjs; echo "exit=$?"`
Expected: `✅ 단위 테스트 — 테스트 79 · 실패 0` · `exit=0`

- [x] **Step 2: `/ponytail-review`**

브랜치 diff (`main..HEAD`) 전체. 지적마다 걷어내거나 남기는 이유를 한 줄 적는다.

실행 기록 (2026-10-02) — `net: -45 lines possible`:

| 지적 | 처리 |
|---|---|
| `tools/policy-diff.mjs` — yagni: 부르는 곳이 SETUP 의 apply 직후 확인뿐이고 그때는 늘 깨끗하다 | **걷어냈다.** 복구는 멱등인 `policy-apply` 재실행(테스트가 멱등을 지킨다), 변경 확인은 `git diff` |
| `test/policy.test.mjs` 의 diff 전용 테스트 2개 — delete | **걷어냈다.** 멱등 테스트 1개가 대신한다 |
| `tools/state-check.mjs` 의 원소 1개 `Set` — shrink | **줄였다.** `r.status === '해당없음'` |
| `lib/config.mjs` 의 `~` 확장 — yagni 후보 | **남긴다.** 커밋된 harness.json 이 팀원마다 다른 홈 아래 경로를 가리키게 하는 유일한 방법이다 |

- [x] **Step 3: 걷어낸 것이 있으면 다시 판정한다**

Run: `node tools/verify.mjs; echo "exit=$?"` 그리고 `node proof/run.mjs`
Expected: 둘 다 exit 0

- [x] **Step 4: `/security-review` 1회**

실행 기록 (2026-10-02) — 후보 2건 → 오탐 판정 서브에이전트가 각각 판정, 확신도 8 미만은 버린다:

| 후보 | 판정 | 처리 |
|---|---|---|
| `policy/settings.json` allow 의 `Bash(find *)` · `Bash(sort *)` — `find -exec` · `sort -o`/`--compress-program` 이 사람 확인 없이 실행·쓰기로 이어져 거부 목록을 우회한다 | **KEEP 8/10 · High** | allow 에서 뺐다. 같은 근본 원인인 `git diff/log/show *`(`--output=<파일>`)도 뺐고, `Bash(node .harness/tools/*)`(`../` 로 저장소의 아무 스크립트나 연다)는 읽기 전용 도구 4개의 정확한 명령으로 고정했다. 회귀 테스트가 배포 정책을 직접 지킨다 |
| `tools/verify.mjs` 가 `harness.json` 의 cmd 를 자동 승인 경로로 실행한다 | DROP 2/10 | 저장소 내용을 통제하는 공격자는 이미 프로젝트 훅으로 더 강한 경로를 가진다. 인젝션 경로는 위 쓰기 수단에 전적으로 의존한다 |

- [x] **Step 5: 기록하고 증거를 요약한다**

계획서 체크박스를 채운다. 걷어낸 것이 있으면 커밋한다 (`fix:` 또는 `refactor:`). 증거 요약은 verify · proof 출력 그대로 옮긴다.
⛔ push 하지 않는다 — 통합(merge · PR)은 사용자가 정한다.

---

# 자체 검토

**1. 스펙 커버리지**

| 설계서 | 태스크 |
|---|---|
| §0 superpowers 베이스 · final-gate ponytail · security 1회 | Task 9 (규칙 · final-gate) · Task 8 (env off) |
| §2 규칙 위치 `.claude/rules/` | Task 9 · Task 10 P2 |
| §3 정직한 값 · Node 실측 | Task 2 · Task 3 · Task 10 P1 |
| §4 흐름 | Task 9 (규칙 · final-gate · README) |
| §5 구성 요소 · 뺀 것 | Task 1~9 (뺀 것은 만들지 않는다) |
| §6 설치 배치 · 플러그인 · 중복 · 신규/기존 | Task 9 SETUP · Task 8 · Task 10 P4 |
| §7 원칙 (OS 무관 · 덮어쓰지 않음) | Task 1 `cli()` · Task 3 `exec` · Task 4 해시 · Task 8 병합 |
| §8 검증 4가지 | Task 9 SETUP 7단계 · Task 10 P2·P3·P4 |
| §9 도입 금지 | Task 9 README |
| §10 graphify · 도메인 지식 | 범위 밖 — 만들지 않는다 |

**2. 플레이스홀더** — `<…>` 는 템플릿과 SETUP 의 자리표시뿐이고, SETUP 4단계가 채우며 `grep` 으로 확인한다. Task 10 Step 4 의 README 표는 실측 값이라 계획에 미리 적지 않는다.

**3. 타입 일관성**

| 이름 | 정의 | 사용 |
|---|---|---|
| `loadConfig(root)` · `cli(url, main)` | Task 1 | Task 3~8 |
| `judgeJunitXml(contents)` | Task 2 | Task 3 · Task 10 |
| `cells(line)` · `parseAuditRows` · `hash12` | Task 4 | Task 4 · Task 6 테스트 · Task 7 · Task 10 |
| `appendLesson` · `NO_GUARD` · `CATEGORIES` | Task 6 | Task 7 |
| `mergeSettings` · `POLICY` · `readJson` | Task 8 | Task 8 |
| `target` · `put` · `fixture` · `repoFile` | Task 1 | Task 2~9 테스트 |

**4. 테스트 수** — 10 + 10 + 11 + 12 + 8 + 8 + 7 + 8 + 5 = **79**. Task 9 Step 8 · Task 11 Step 1 의 기대값이다.
