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
