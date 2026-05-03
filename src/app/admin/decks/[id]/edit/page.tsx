import DeckEditor from "@/components/admin/DeckEditor";
import type { DeckSchemaType } from "@/game/engine/deckSchema";
import fs from "fs/promises";
import path from "path";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDeckPage({ params }: Props) {
  const { id } = await params;
  const filePath = path.join(process.cwd(), "src/data/decks.json");
  const raw = await fs.readFile(filePath, "utf-8");
  const decks: Record<string, DeckSchemaType> = JSON.parse(raw);
  const deck = decks[id];

  if (!deck) {
    return (
      <div style={{ padding: 40, color: "#ff6b6b", fontFamily: "monospace" }}>
        덱을 찾을 수 없습니다: {id}
      </div>
    );
  }

  return <DeckEditor mode="edit" initial={deck} />;
}
