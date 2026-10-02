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

합성 대상(임시 git 저장소)에 SETUP 과 같은 배치로 하네스를 얹고, **같은 대상 · 같은 조건**에서 「하네스 없이」와 「있을 때」를 견줬다.
재현: `node proof/run.mjs` (결정론 — LLM 없음) · `node proof/run.mjs --claude` (새 세션 포함 — haiku 7~9회)

| | |
|---|---|
| 일시 | 2026-10-02 07:49 UTC |
| 환경 | win32 · Node v24.18.0 · Claude Code 2.1.287 |
| 명령 | `node proof/run.mjs --claude` |
| 예상과 다른 행 | 0개 / 22행 |

| 실험 | 조건 | 관측 | 예상대로 |
|---|---|---|---|
| P1 거짓 완료 | 테스트 파일에 test() 가 없다 | npm test exit 0 (ℹ pass 1) → verify exit 1 · 실행된 테스트가 0개다 (XML 1개 · 테스트 없는 파일 1개는 세지 않았다) — 종료코드와 러너 요약은 이것을 통과시킨다 | ✅ |
| P1 거짓 완료 | 실패하는 테스트 | npm test exit 1 (ℹ pass 0) → verify exit 1 · 종료코드 1 · 테스트 1 · 실패 1 | ✅ |
| P1 거짓 완료 | 고쳤다 | npm test exit 0 (ℹ pass 1) → verify exit 0 · 테스트 1 · 실패 0 | ✅ |
| P1 거짓 완료 | 테스트 명령이 아무것도 안 돌게 바뀜 (직전 통과 XML 이 남음) | npm test exit 0 · 남은 XML 만 읽으면 통과 → verify exit 1 · 결과 XML 이 이번 실행에서 갱신되지 않았다 (종료코드 0) — 이전 결과를 증거로 쓰지 않는다 | ✅ |
| P1b CLI 판별 | 09-28 계획의 판별식 (win32) | exit 0 · 아무것도 안 돌았다 | ✅ |
| P1b CLI 판별 | lib/config.mjs 의 cli() | exit 1 · 돌았다 | ✅ |
| P5 가정 | 20일 묵은 열린 질문 1건 | 열린 결정 1건 · 갱신 후 20일 · 경고 · exit 0 | ✅ |
| P5 교훈 | 근본 원인 없이 적기 | exit 1 · ⛔ 근본 원인이 비었다 — 증상만 적는 것은 일기이지 교훈이 아니다 | ✅ |
| P5 교훈 | 같은 분류 2회 · 막는 것 없음 | 검증 부족 ×2 (L001 L002) | ✅ |
| P5 대장 | 분석 뒤 원본이 바뀜 + 가리키는 파일 소멸 | 대장 2행 · 잔량 0 · 재작업 1 · 소멸 1 · exit 1 | ✅ |
| P2 규칙 로드 | CLAUDE.md 있음 · 규칙을 AGENTS.md 에 (09-28 방식) | 완료 명령 → 「모름」 | ✅ |
| P2 규칙 로드 | CLAUDE.md 없음 · 규칙을 AGENTS.md 에 (09-28 방식) | 완료 명령 → verify.mjs 를 답함 | ✅ |
| P2 규칙 로드 | CLAUDE.md 있음 · 규칙을 .claude/rules/ 에 (A안) | 완료 명령 → verify.mjs 를 답함 | ✅ |
| P2 규칙 로드 | AGENTS.md 만 있음 · 규칙을 .claude/rules/ 에 (A안) | 완료 명령 → verify.mjs 를 답함 | ✅ |
| P2 규칙 로드 | CLAUDE.md 없음 · 규칙을 AGENTS.md 에 · 8.3 단축 경로로 연 세션 | 완료 명령 → 「모름」 | ✅ |
| P2 규칙 로드 | CLAUDE.md 있음 · 규칙을 .claude/rules/ 에 · 8.3 단축 경로로 연 세션 | 완료 명령 → verify.mjs 를 답함 | ✅ |
| P2 규칙 로드 | A안 대상 · 음성 대조 (지시에 없는 사실) | 「모름」 | ✅ |
| P4 설정 병합 | 기존 settings(권한 1 · 훅) 위에 정책 반영 | 정책 반영 · 기존 권한·훅 보존 | ✅ |
| P4 플러그인 | 중복 처리 뒤 (로컬에서 끈 정책 id: superpowers@claude-plugins-official) | 활성 id — superpowers 1개 · ponytail 1개 | ✅ |
| P3 ponytail | 정책 반영 (env PONYTAIL_DEFAULT_MODE=off) | 훅의 PONYTAIL MODE ACTIVE 0회 | ✅ |
| P3 ponytail | 정책 미반영 (대조군) | 훅의 PONYTAIL MODE ACTIVE 4회 | ✅ |
| P4 플러그인 | 프로젝트가 선언 + 이 PC 에 사용자 범위로 이미 설치 → 세션을 연다 | 프로젝트 범위 설치 기록 0 → 1 (실측 뒤 정리 0) | ✅ |

**읽는 법**

- **하네스 없이는 통과였는데 있을 때 막힌 것** — test() 없는 파일(`npm test` exit 0 · `pass 1`), 테스트 명령이 바뀌어 직전 통과 XML 만 남은 경우,
  09-28 판별식이 Windows 에서 검사를 아예 돌리지 않은 경우(exit 0). 규칙을 `AGENTS.md` 에 두면 `CLAUDE.md` 가 있는 대상과 8.3 단축 경로로 연
  세션에서 빠졌고, `.claude/rules/` 는 시험한 세 조건(`CLAUDE.md` 있음 · `AGENTS.md` 만 · 8.3 단축 경로) 모두에서 읽혔다
- **아직 실측하지 않은 것** — 실제 프로젝트에 적용해 값을 냈는가 · SETUP 을 새 세션이 처음부터 끝까지 따르는가 · macOS · Linux
- **그래서 딱지는 전부 `설계안` 이다** — 합성 대상에서 메커니즘이 의도대로 판정한다는 데까지가 실측이다
- 실측은 `~/.claude/projects/` 에 임시 대상마다 빈 폴더를 남긴다(Claude Code 가 세션의 작업 폴더마다 만든다). 프로젝트 범위 플러그인 설치 기록은 스크립트가 되돌린다

## 개발

```bash
npm test      # 결과 XML 은 test-results/
```

설계: `docs/2026-09-28-design.md` · 계획: `docs/plans/2026-09-28-agent-harness.md`
