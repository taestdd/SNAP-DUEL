import { useEffect, useRef, useState } from "react";
import type { CharacterId } from "@/game/engine/types";

const CHARS: CharacterId[] = ["A", "B"];
const DAMAGED_DURATION_MS = 500;

export function useDamagedChars(characterHp: Record<CharacterId, number>): Set<CharacterId> {
  const prevHpRef = useRef<Record<CharacterId, number>>(characterHp);
  const [damagedChars, setDamagedChars] = useState<Set<CharacterId>>(new Set());

  useEffect(() => {
    const prev = prevHpRef.current;
    const damaged = new Set<CharacterId>();
    CHARS.forEach((charId) => {
      if (characterHp[charId] < prev[charId]) damaged.add(charId);
    });
    prevHpRef.current = characterHp;
    if (damaged.size > 0) {
      setDamagedChars(damaged);
      const timer = setTimeout(() => setDamagedChars(new Set()), DAMAGED_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [characterHp]);

  return damagedChars;
}
