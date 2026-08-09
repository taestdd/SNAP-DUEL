"use client";

import { useRef, useState } from "react";
import type { ZodError } from "zod";
import { CardSchema } from "@/game/engine/cardSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import { CharacterDefSchema } from "@/game/engine/characterSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import styles from "./BulkImportModal.module.css";

export type ImportKind = "cards" | "characters";

type ParseOutcome = { success: true; data: unknown } | { success: false; error: ZodError };

/**
 * 종류별 차이만 모아둔 설정 — 파싱·검증·미리보기·저장 경로.
 * 새 종류(덱 등)를 추가하려면 여기에 한 항목만 더하면 된다.
 */
const KINDS: Record<ImportKind, {
  label: string;
  endpoint: string;
  accept: string;
  supportsCsv: boolean;
  placeholder: string;
  parse: (raw: unknown) => ParseOutcome;
  describe: (data: unknown) => { id: string; name: string; summary: string };
}> = {
  cards: {
    label: "카드",
    endpoint: "/api/admin/cards",
    accept: ".json,.csv",
    supportsCsv: true,
    placeholder: '[\n  {\n    "id": "my_card",\n    "name": "카드 이름",\n    "cost": 1,\n    ...\n  }\n]',
    parse: (raw) => CardSchema.safeParse(raw) as ParseOutcome,
    describe: (data) => {
      const c = data as CardSchemaType;
      return { id: c.id, name: c.name, summary: `cost ${c.cost} · dly ${c.delay}` };
    },
  },
  characters: {
    label: "캐릭터",
    endpoint: "/api/admin/characters",
    accept: ".json",
    supportsCsv: false,
    placeholder: '[\n  {\n    "id": "nagi",\n    "name": "凪",\n    "maxHp": 12,\n    "spriteId": "a",\n    "affinities": ["공통", "공안", "나기"],\n    "entryEffect": null,\n    "exitEffect": null\n  }\n]',
    parse: (raw) => CharacterDefSchema.safeParse(raw) as ParseOutcome,
    describe: (data) => {
      const c = data as CharacterDefSchemaType;
      return { id: c.id, name: c.name, summary: `HP ${c.maxHp} · ${c.spriteId} · ${c.affinities.join(" / ")}` };
    },
  },
};

type ParsedItem =
  | { status: "ok"; id: string; name: string; summary: string; data: unknown }
  | { status: "error"; raw: unknown; message: string };

type ImportResult =
  | { status: "ok"; id: string }
  | { status: "skip"; id: string; reason: string }
  | { status: "error"; id: string; reason: string };

type Stage = "edit" | "preview" | "importing" | "done";

export default function BulkImportModal({
  kind = "cards",
  onClose,
  onSuccess,
}: {
  kind?: ImportKind;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const config = KINDS[kind];
  const [json, setJson] = useState("");
  const [stage, setStage] = useState<Stage>("edit");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string): string {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return "[]";

    function splitCSVLine(line: string): string[] {
      const result: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          result.push(cur); cur = "";
        } else {
          cur += ch;
        }
      }
      result.push(cur);
      return result;
    }

    const headers = splitCSVLine(lines[0]);
    const cards: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = splitCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] ?? "").trim(); });
      if (!row.id) continue;

      const card: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        cost: Number(row.cost || 0),
        // 구 CSV 헤더(speed/gain)도 수용 — 저장은 항상 새 키(delay/advantage)
        delay: Number(row.delay ?? row.speed ?? 0),
        advantage: Number(row.advantage ?? row.gain ?? 0),
        text: row.text || "",
      };

      if (row.cardType) card.cardType = row.cardType;
      if (row.groundAttack) card.groundAttack = Number(row.groundAttack);
      if (row.antiAirAttack) card.antiAirAttack = Number(row.antiAirAttack);
      if (row.useCondition) card.useCondition = row.useCondition;
      if (row.tags) {
        const tags = row.tags.split(",").map((t) => t.trim()).filter(Boolean);
        if (tags.length) card.tags = tags;
      }

      // "dack" 오타 자동 수정
      const fixTypo = (s: string) => s.replace(/dack/g, "deck");

      try { card.effects = row.effects ? JSON.parse(fixTypo(row.effects)) : []; }
      catch { card.effects = []; }
      if (row.statModifiers) {
        try { card.statModifiers = JSON.parse(row.statModifiers); } catch { /* skip */ }
      }
      if (row.altCost) {
        try { card.altCost = JSON.parse(fixTypo(row.altCost)); } catch { /* skip */ }
      }

      cards.push(card);
    }

    return JSON.stringify(cards, null, 2);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      setJson(config.supportsCsv && file.name.endsWith(".csv") ? parseCSV(text) : text);
    };
    reader.readAsText(file, "utf-8");
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
      const result = config.parse(item);
      if (result.success) return { status: "ok", ...config.describe(result.data), data: result.data };
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
      const item = valid[i];
      try {
        const r = await fetch(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data),
        });
        if (r.status === 201) {
          res.push({ status: "ok", id: item.id });
        } else if (r.status === 409) {
          res.push({ status: "skip", id: item.id, reason: "이미 존재" });
        } else {
          const data = await r.json().catch(() => ({}));
          res.push({ status: "error", id: item.id, reason: JSON.stringify(data.error ?? "저장 실패") });
        }
      } catch {
        res.push({ status: "error", id: item.id, reason: "네트워크 오류" });
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
          <span className={styles.title}>{config.label} 일괄 등록</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── 1. 편집 단계 ── */}
        {stage === "edit" && (
          <>
            <div className={styles.hint}>
              {config.supportsCsv
                ? "JSON 배열 또는 CSV 파일을 업로드하세요. CSV는 자동으로 JSON으로 변환됩니다."
                : `${config.label} JSON 배열을 붙여넣거나 .json 파일을 업로드하세요.`}
            </div>
            <div className={styles.fileRow}>
              <input
                ref={fileRef}
                type="file"
                accept={config.accept}
                className={styles.fileInput}
                onChange={handleFileChange}
              />
              <button className={styles.fileBtn} onClick={() => fileRef.current?.click()}>
                {config.supportsCsv ? "파일 선택 (JSON / CSV)" : "파일 선택 (JSON)"}
              </button>
              {fileRef.current?.files?.[0] && (
                <span className={styles.fileName}>{fileRef.current.files[0].name}</span>
              )}
            </div>
            <textarea
              className={styles.textarea}
              placeholder={config.placeholder}
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
                    <span className={styles.previewId}>{item.id}</span>
                    <span className={styles.previewName}>{item.name}</span>
                    <span className={styles.previewMeta}>{item.summary}</span>
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
