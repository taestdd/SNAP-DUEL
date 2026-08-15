"use client";

import { useRef, useState } from "react";
import type { ZodError } from "zod";
import { CardSchema } from "@/game/engine/cardSchema";
import type { CardSchemaType } from "@/game/engine/cardSchema";
import { CharacterDefSchema } from "@/game/engine/characterSchema";
import type { CharacterDefSchemaType } from "@/game/engine/characterSchema";
import { parseCardCsv, CSV_COLUMNS } from "./cardBulkCsv";
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
  | {
      status: "ok"; id: string; name: string; summary: string; data: unknown;
      /** 이미 존재하는 id인가 (있으면 갱신 경로) */
      exists: boolean;
      /** 입력에 실제로 적힌 필드 — 갱신 시 이 키만 덮어쓴다 */
      touched: string[];
    }
  | { status: "error"; raw: unknown; message: string };

type ImportResult =
  | { status: "ok"; id: string; updated?: boolean; fields?: string[] }
  | { status: "skip"; id: string; reason: string }
  | { status: "error"; id: string; reason: string };

type Stage = "edit" | "preview" | "importing" | "done";

/** 구 필드명으로 적어도 갱신 대상이 되도록 새 이름으로 옮긴다 (읽기 스키마와 동일 규칙) */
const LEGACY_KEY: Record<string, string> = { speed: "delay", gain: "advantage" };

/**
 * 입력 객체에 **실제로 적힌** 키 목록.
 *
 * Zod 검증 결과를 쓰면 안 된다 — `effects`처럼 기본값이 있는 필드가 채워져 나와서,
 * 적지도 않은 필드로 기존 값을 덮어쓰게 된다.
 */
function touchedKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.keys(raw as Record<string, unknown>)
    .map((k) => LEGACY_KEY[k] ?? k)
    .filter((k) => k !== "id");
}

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
  const [existing, setExisting] = useState<Record<string, Record<string, unknown>>>({});
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      setJson(config.supportsCsv && file.name.endsWith(".csv")
        ? JSON.stringify(parseCardCsv(text), null, 2)
        : text);
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleParse() {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      alert("JSON 파싱 실패: 올바른 JSON 배열인지 확인하세요.");
      return;
    }

    // 기존 문서를 미리 받아 신규/갱신을 구분한다. 실패하면 전부 신규로 보고 진행
    // (등록 단계에서 409가 나면 그때 스킵으로 떨어진다)
    let existingMap: Record<string, Record<string, unknown>> = {};
    try {
      const r = await fetch(config.endpoint);
      if (r.ok) {
        const list = await r.json();
        const arr2 = Array.isArray(list) ? list : Object.values(list ?? {});
        for (const c of arr2 as Record<string, unknown>[]) {
          if (c && typeof c.id === "string") existingMap[c.id] = c;
        }
      }
    } catch { existingMap = {}; }
    setExisting(existingMap);

    const arr = Array.isArray(raw) ? raw : [raw];
    const parsed: ParsedItem[] = arr.map((item) => {
      const result = config.parse(item);
      if (result.success) {
        const info = config.describe(result.data);
        return {
          status: "ok", ...info, data: result.data,
          exists: Boolean(existingMap[info.id]),
          touched: touchedKeys(item),
        };
      }
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
        if (item.exists) {
          // 갱신 — 입력에 적힌 필드만 기존 문서 위에 덮는다.
          // PUT은 문서를 통째로 교체하므로 병합은 여기서 끝내고 보내야 한다.
          const base = existing[item.id] ?? {};
          const incoming = item.data as Record<string, unknown>;
          const merged: Record<string, unknown> = { ...base };
          for (const k of item.touched) merged[k] = incoming[k];

          const r = await fetch(`${config.endpoint}/${encodeURIComponent(item.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
          });
          if (r.ok) {
            res.push({ status: "ok", id: item.id, updated: true, fields: item.touched });
          } else {
            const data = await r.json().catch(() => ({}));
            res.push({ status: "error", id: item.id, reason: JSON.stringify(data.error ?? "수정 실패") });
          }
        } else {
          const r = await fetch(config.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.data),
          });
          if (r.status === 201) {
            res.push({ status: "ok", id: item.id });
          } else if (r.status === 409) {
            res.push({ status: "skip", id: item.id, reason: "이미 존재 (새로고침 후 다시 시도)" });
          } else {
            const data = await r.json().catch(() => ({}));
            res.push({ status: "error", id: item.id, reason: JSON.stringify(data.error ?? "저장 실패") });
          }
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
  const updateCount = items.filter((i) => i.status === "ok" && i.exists).length;
  const newCount = validCount - updateCount;

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
              {" "}이미 있는 id는 <b>적어 넣은 필드만 갱신</b>됩니다.
              {config.supportsCsv && (
                <div className={styles.csvCols}>
                  CSV 인식 컬럼 — {CSV_COLUMNS.join(" · ")}
                  <br />
                  effects · statModifiers · altCost · additionalCost · hitTimings는 셀에 JSON을 넣습니다.
                </div>
              )}
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
              <span className={styles.ok}>✓ 신규 {newCount}개</span>
              &nbsp;|&nbsp;
              <span className={styles.skip}>↻ 갱신 {updateCount}개</span>
              {errorCount > 0 && <>&nbsp;|&nbsp;<span className={styles.err}>✗ 오류 {errorCount}개</span></>}
            </div>
            {updateCount > 0 && (
              <div className={styles.hint}>
                이미 있는 {updateCount}개는 <b>적어 넣은 필드만</b> 덮어씁니다. 적지 않은 필드는 그대로 유지됩니다
                (필드를 지우려면 편집 화면에서 직접 비워야 합니다).
              </div>
            )}
            <div className={styles.previewList}>
              {items.map((item, i) =>
                item.status === "ok" ? (
                  <div key={i} className={`${styles.previewItem} ${styles.previewOk}`}>
                    <span className={styles.previewIcon}>{item.exists ? "↻" : "✓"}</span>
                    <span className={styles.previewId}>{item.id}</span>
                    <span className={styles.previewName}>{item.name}</span>
                    <span className={styles.previewMeta}>
                      {item.exists
                        ? `갱신 · ${item.touched.length > 0 ? item.touched.join(", ") : "변경 없음"}`
                        : item.summary}
                    </span>
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
                {newCount > 0 && updateCount > 0
                  ? `신규 ${newCount} · 갱신 ${updateCount} 진행`
                  : updateCount > 0
                    ? `${updateCount}개 갱신 시작`
                    : `${newCount}개 등록 시작`}
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
              <span className={styles.ok}>
                ✓ 신규 {results.filter((r) => r.status === "ok" && !r.updated).length}개
                &nbsp;·&nbsp; ↻ 갱신 {results.filter((r) => r.status === "ok" && r.updated).length}개
              </span>
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
                    {r.status === "ok" ? (r.updated ? "↻" : "✓") : r.status === "skip" ? "↷" : "✗"}
                  </span>
                  <span className={styles.previewId}>{r.id}</span>
                  {r.status === "ok" && r.updated && (
                    <span className={styles.previewMeta}>
                      갱신 · {r.fields && r.fields.length > 0 ? r.fields.join(", ") : "변경 없음"}
                    </span>
                  )}
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
