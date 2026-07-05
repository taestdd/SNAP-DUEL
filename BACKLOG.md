# SNAP-DUEL 작업 백로그

향후 진행할 리팩터/기능 후보. 우선순위·범위·위험을 기록해 둔다.

(현재 비어 있음)

---

## 완료된 항목

- **페이즈 전환 이벤트 단일화 (flow 이벤트화)** — `hooks/useGameTransitions`로 구현.
  GameScreen·useArenaAnimation·게임 페이지 3곳에 흩어져 있던 prevXRef 전환 감지를
  `detectTransitions` 단일 진실원으로 통합. 사용 규칙은 CLAUDE.md "전환 감지 규칙" 참고.
