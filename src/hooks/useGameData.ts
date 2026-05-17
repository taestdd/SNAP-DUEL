"use client";

import { useEffect, useState } from "react";
import { initCards } from "@/game/engine/cards";
import { initDecks } from "@/game/engine/state";
import { initCharacters } from "@/game/engine/characters";

type Status = "loading" | "ready" | "error";

export function useGameData() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then((r) => {
        if (!r.ok) throw new Error("카드 데이터 로드 실패");
        return r.json();
      }),
      fetch("/api/decks").then((r) => {
        if (!r.ok) throw new Error("덱 데이터 로드 실패");
        return r.json();
      }),
      fetch("/api/characters").then((r) => {
        if (!r.ok) throw new Error("캐릭터 데이터 로드 실패");
        return r.json();
      }),
    ])
      .then(([cards, decks, characters]) => {
        initCards(cards);
        initDecks(decks);
        initCharacters(characters);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  return status;
}
