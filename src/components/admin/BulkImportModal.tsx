"use client";

import { useRef, useState } from "react";
import { CardSchema } from "@/game/engine/cardSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import styles from "./BulkImportModal.module.css";

type ParsedItem =
  | { status: "ok"; card: CardSchemaType }
  | { status: "error"; raw: unknown; message: string };

type ImportResult =
  | { status: "ok"; id: string }
  | { status: "skip"; id: string; reason: string }
  | { status: "error"; id: string; reason: string };

type Stage = "edit" | "preview" | "importing" | "done";

export default function BulkImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [json, setJson] = useState("");
  const [stage, setStage] = useState<Stage>("edit");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setJson((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleParse() {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      alert("JSON 파싱 실패: 올바른 JSON 배열인지 확인하세요.");
      return;
    }

    const arr = Array.isArray(raw) ? raw : [raw];
    const parsed: ParsedItem[] = arr.map((item) => {
      const result = CardSchema.safeParse(item);
      if (result.success) return { status: "ok", card: result.data };
      const msg = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return { status: "error", raw: item, message: msg };
    });

    setItems(parsed);
    setStage("preview");
  }

  async function handleImport() {
    const valid = items.filter((i) => i.status === "ok") as Extract<ParsedItem, { status: "ok" }>[];
    setStage("importing");
    setProgress(0);

    const res: ImportResult[] = [];
    for (let i = 0; i < valid.length; i++) {
      const card = valid[i].card;
      try {
        const r = await fetch("/api/admin/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(card),
        });
        if (r.status === 201) {
          res.push({ status: "ok", id: card.id });
        } else if (r.status === 409) {
          res.push({ status: "skip", id: card.id, reason: "이미 존재" });
        } else {
          const data = await r.json().catch(() => ({}));
          res.push({ status: "error", id: card.id, reason: JSON.stringify(data.error ?? "저장 실패") });
        }
      } catch {
        res.push({ status: "error", id: card.id, reason: "네트워크 오류" });
      }
      setProgress(i + 1);
    }

    setResults(res);
    setStage("done");
    if (res.some((r) => r.status === "ok")) onSuccess();
  }

  const validCount = items.filter((i) => i.status === "ok").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>카드 일괄 등록</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── 1. 편집 단계 ── */}
        {stage === "edit" && (
          <>
            <div className={styles.hint}>
              JSON 배열로 카드를 붙여넣거나 .json 파일을 업로드하세요.
            </div>
            <div className={styles.fileRow}>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className={styles.fileInput}
                onChange={handleFileChange}
              />
              <button className={styles.fileBtn} onClick={() => fileRef.current?.click()}>
                파일 선택
              </button>
              {fileRef.current?.files?.[0] && (
                <span className={styles.fileName}>{fileRef.current.files[0].name}</span>
              )}
            </div>
            <textarea
              className={styles.textarea}
              placeholder={'[\n  {\n    "id": "my_card",\n    "name": "카드 이름",\n    "cost": 1,\n    ...\n  }\n]'}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
            />
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>취소</button>
              <button className={styles.primaryBtn} disabled={!json.trim()} onClick={handleParse}>
                파싱 & 검증 →
              </button>
            </div>
          </>
        )}

        {/* ── 2. 미리보기 단계 ── */}
        {stage === "preview" && (
          <>
            <div className={styles.summary}>
              총 {items.length}개 &nbsp;|&nbsp;
              <span className={styles.ok}>✓ 유효 {validCount}개</span>
              {errorCount > 0 && <>&nbsp;|&nbsp;<span className={styles.err}>✗ 오류 {errorCount}개</span></>}
            </div>
            <div className={styles.previewList}>
              {items.map((item, i) =>
                item.status === "ok" ? (
                  <div key={i} className={`${styles.previewItem} ${styles.previewOk}`}>
                    <span className={styles.previewIcon}>✓</span>
                    <span className={styles.previewId}>{item.card.id}</span>
                    <span className={styles.previewName}>{item.card.name}</span>
                    <span className={styles.previewMeta}>cost {item.card.cost} · spd {item.card.speed}</span>
                  </div>
                ) : (
                  <div key={i} className={`${styles.previewItem} ${styles.previewErr}`}>
                    <span className={styles.previewIcon}>✗</span>
                    <span className={styles.previewId}>{String((item.raw as Record<string,unknown>)?.id ?? "?")}</span>
                    <span className={styles.previewErrMsg}>{item.message}</span>
                  </div>
                )
              )}
            </div>
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={() => setStage("edit")}>← 돌아가기</button>
              <button
                className={styles.primaryBtn}
                disabled={validCount === 0}
                onClick={handleImport}
              >
                {validCount}개 등록 시작
              </button>
            </div>
          </>
        )}

        {/* ── 3. 임포트 중 ── */}
        {stage === "importing" && (
          <div className={styles.progressWrap}>
            <div className={styles.progressLabel}>등록 중... {progress} / {validCount}</div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(progress / validCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 4. 완료 ── */}
        {stage === "done" && (
          <>
            <div className={styles.summary}>
              <span className={styles.ok}>✓ 성공 {results.filter((r) => r.status === "ok").length}개</span>
              &nbsp;|&nbsp;
              <span className={styles.skip}>↷ 스킵 {results.filter((r) => r.status === "skip").length}개</span>
              &nbsp;|&nbsp;
              <span className={styles.err}>✗ 실패 {results.filter((r) => r.status === "error").length}개</span>
            </div>
            <div className={styles.previewList}>
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`${styles.previewItem} ${
                    r.status === "ok" ? styles.previewOk
                    : r.status === "skip" ? styles.previewSkip
                    : styles.previewErr
                  }`}
                >
                  <span className={styles.previewIcon}>
                    {r.status === "ok" ? "✓" : r.status === "skip" ? "↷" : "✗"}
                  </span>
                  <span className={styles.previewId}>{r.id}</span>
                  {r.status !== "ok" && <span className={styles.previewErrMsg}>{r.reason}</span>}
                </div>
              ))}
            </div>
            <div className={styles.footer}>
              <button className={styles.primaryBtn} onClick={onClose}>닫기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
