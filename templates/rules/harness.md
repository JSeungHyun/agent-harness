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
