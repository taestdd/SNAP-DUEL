import CardEditor from "@/components/admin/CardEditor";
import { getAdminDb } from "@/lib/firebase-admin";
import type { CardSchemaType } from "@/game/engine/cardSchema";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCardPage({ params }: Props) {
  const { id } = await params;
  const doc = await getAdminDb().collection("cards").doc(id).get();

  if (!doc.exists) {
    return (
      <div style={{ padding: 40, color: "#ff6b6b", fontFamily: "monospace" }}>
        카드를 찾을 수 없습니다: {id}
      </div>
    );
  }

  const card = { id: doc.id, ...doc.data() } as CardSchemaType;
  return <CardEditor mode="edit" initial={card} />;
}
