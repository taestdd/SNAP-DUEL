import { getAdminDb } from "@/lib/firebase-admin";
import CharacterEditor from "@/components/admin/CharacterEditor";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getAdminDb().collection("characters").doc(id).get();
  if (!doc.exists) return <div>캐릭터를 찾을 수 없습니다: {id}</div>;
  const character = { id: doc.id, ...doc.data() } as CharacterDefSchemaType;
  return <CharacterEditor mode="edit" initial={character} />;
}
