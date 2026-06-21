import { registerCharacter } from "../engine/characters";

/** 튜토리얼 캐릭터 단일 출처. id·maxHp·affinities를 한 곳에서 관리 (stages·state 공유). */
export type TutCharDef = { id: string; name: string; maxHp: number; affinities: string[] };

export const TUT_CHARS = {
  /** Stages 1-4 기본 캐릭터. maxHp는 스테이지별 동적 값으로 등록 시 덮어쓴다. */
  trainee: { id: "tut_char", name: "훈련병", maxHp: 1, affinities: [] },
  warrior: { id: "tut_char_warrior", name: "전사", maxHp: 1, affinities: ["power"] },
  fighter: { id: "tut_char_fighter", name: "격투가", maxHp: 8, affinities: [] },
  teamA: { id: "tut_team_a", name: "팀원 A", maxHp: 15, affinities: [] },
  teamB: { id: "tut_team_b", name: "팀원 B", maxHp: 15, affinities: [] },
} satisfies Record<string, TutCharDef>;

/** 벤치/액티브 지정 시 캐릭터 정의에서 hp를 파생 (maxHp 중복 정의 방지). */
export const benchOf = (c: TutCharDef): { id: string; hp: number } => ({ id: c.id, hp: c.maxHp });

export function registerTutorialChars(traineeMaxHp: number): void {
  for (const def of Object.values(TUT_CHARS)) {
    registerCharacter(def.id, {
      id: def.id,
      name: def.name,
      maxHp: def.id === TUT_CHARS.trainee.id ? traineeMaxHp : def.maxHp,
      spriteId: "default",
      entryEffect: null,
      exitEffect: null,
      affinities: def.affinities,
    });
  }
}
