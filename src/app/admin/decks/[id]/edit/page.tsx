import DeckEditor from "@/components/admin/DeckEditor";
import { getAdminDb } from "@/lib/firebase-admin";
import type { DeckSchemaType } from "@/game/engine/deckSchema";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDeckPage({ params }: Props) {
  const { id } = await params;
  const doc = await getAdminDb().collection("decks").doc(id).get();

  if (!doc.exists) {
    return (
      <div style={{ padding: 40, color: "#ff6b6b", fontFamily: "monospace" }}>
        덱을 찾을 수 없습니다: {id}
      </div>
    );
  }

  const deck = { id: doc.id, ...doc.data() } as DeckSchemaType;
  return <DeckEditor mode="edit" initial={deck} />;
}
