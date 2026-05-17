import { useEffect, useRef, useState } from "react";

const DAMAGED_DURATION_MS = 500;

export function useDamagedChars(characterHp: Record<string, number>): Set<string> {
  const prevHpRef = useRef<Record<string, number>>(characterHp);
  const [damagedChars, setDamagedChars] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevHpRef.current;
    const damaged = new Set<string>();
    Object.keys(characterHp).forEach((charId) => {
      if ((characterHp[charId] ?? 0) < (prev[charId] ?? 0)) damaged.add(charId);
    });
    prevHpRef.current = characterHp;
    if (damaged.size > 0) {
      setDamagedChars(damaged);
      const timer = setTimeout(() => setDamagedChars(new Set()), DAMAGED_DURATION_MS);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(characterHp)]);

  return damagedChars;
}
