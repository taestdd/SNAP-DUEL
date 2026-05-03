import CardEditor from "@/components/admin/CardEditor";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import fs from "fs/promises";
import path from "path";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCardPage({ params }: Props) {
  const { id } = await params;
  const filePath = path.join(process.cwd(), "src/data/cards.json");
  const raw = await fs.readFile(filePath, "utf-8");
  const cards: Record<string, CardSchemaType> = JSON.parse(raw);
  const card = cards[id];

  if (!card) {
    return (
      <div style={{ padding: 40, color: "#ff6b6b", fontFamily: "monospace" }}>
        카드를 찾을 수 없습니다: {id}
      </div>
    );
  }

  return <CardEditor mode="edit" initial={card} />;
}
