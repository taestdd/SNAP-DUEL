import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game/engine/types";
import { useGameTransitions } from "./useGameTransitions";

/** 태그 연출(tag_exit → tag_entry)이 화면에서 재생되는 총 시간 (ms) */
const TAG_ANIM_DURATION = 700;

/**
 * 캐릭터 교체(태그) 연출 재생 중인지를 반환한다.
 * 싱글플레이·온라인 호스트·튜토리얼에 복제돼 있던
 * prevCharRef + setTimeout 패턴을 단일화한 것.
 */
export function useTagAnimating(state: GameState | null, durationMs: number = TAG_ANIM_DURATION): boolean {
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGameTransitions(state, {
    onCharacterSwitch: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setAnimating(true);
      timerRef.current = setTimeout(() => setAnimating(false), durationMs);
    },
  });

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return animating;
}
