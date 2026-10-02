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
