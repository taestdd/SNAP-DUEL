// ── 시드 기반 결정론 RNG (mulberry32) ──────────────────────────────────────
// 모든 함수는 순수: rng 상태(number)를 받아 [결과, 다음 상태]를 반환한다.
// 같은 시드 → 같은 난수 시퀀스 → 게임 재현/리플레이/온라인 동기화의 기반.

/** mulberry32 한 스텝. [0,1) 실수와 다음 rng 상태를 반환. */
export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, t >>> 0];
}

/** [0, maxExclusive) 정수와 다음 rng 상태를 반환. */
export function randomInt(state: number, maxExclusive: number): [value: number, next: number] {
  const [f, next] = nextRandom(state);
  return [Math.floor(f * maxExclusive), next];
}

/** 시드 기반 Fisher–Yates. [셔플된 새 배열, 다음 rng 상태]를 반환. */
export function shuffleSeeded<T>(array: T[], state: number): [result: T[], next: number] {
  const arr = [...array];
  let s = state;
  for (let i = arr.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = randomInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return [arr, s];
}

/** 게임 시작용 무작위 시드 생성 (32bit). */
export function makeSeed(): number {
  return (Math.floor(Math.random() * 0x100000000)) >>> 0;
}

// ── 레거시 비시드 셔플 ──────────────────────────────────────────────────────
// 결정론이 필요 없는 UI 영역(예: AI 자동 드래프트 후보 선택)에서만 사용.
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
