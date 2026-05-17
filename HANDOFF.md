# SNAP-DUEL Firestore 마이그레이션 인수인계서

## 브랜치
`claude/firestore-migration` (base: `dev`)

---

## 완료된 작업

### 엔진 변경
- `src/game/engine/cards.ts` — 정적 JSON import 제거, `initCards()` / `getCard()` / `getAllCards()` 함수로 전환
- `src/game/engine/state.ts` — 정적 decks import 제거, `initDecks()` / `getDeckRegistry()` 함수로 전환
- `src/game/engine/ai.ts` — `CARDS` 상수 제거 → `getAllCards()` 호출로 변경 (lazy)
- `src/components/game/SetupScreen.tsx` — `DECK_REGISTRY` → `getDeckRegistry()` 로 교체
- `src/components/game/CardDetailModal.tsx`, `Hand.tsx`, `CardView.tsx` — `CARDS` → `getCard()` 로 교체

### API 라우트 (모두 firebase-admin 사용)
- `src/lib/firebase-admin.ts` — Admin SDK lazy 초기화 (`getAdminDb()`)
- `src/app/api/cards/route.ts` — 공개 GET
- `src/app/api/decks/route.ts` — 공개 GET
- `src/app/api/admin/cards/route.ts` — GET, POST
- `src/app/api/admin/cards/[id]/route.ts` — PUT, DELETE
- `src/app/api/admin/decks/route.ts` — GET, POST
- `src/app/api/admin/decks/[id]/route.ts` — PUT, DELETE
- `src/app/api/admin/migrate/route.ts` — **일회성 마이그레이션 엔드포인트 (완료 후 삭제 필요)**

### 게임 페이지
- `src/app/game/page.tsx` — `/api/cards`, `/api/decks` fetch 후 `initCards()` / `initDecks()` 호출, 로딩 화면 추가
- `src/app/online/game/page.tsx` — 동일

---

## 현재 블로커

두 가지 문제가 동시에 막혀 있음:

### 1. Firestore 보안 규칙
`allow read, write: if true` 로 변경 시도했으나 아직 `PERMISSION_DENIED` 반환 중.
Firebase Console에서 규칙이 실제로 **게시(Publish)** 됐는지 재확인 필요.

확인 명령어:
```bash
curl -X POST "https://firestore.googleapis.com/v1/projects/snap-duel-5252/databases/(default)/documents/test" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"ping":{"stringValue":"ok"}}}'
# 200이면 규칙 열림, 403이면 아직 막힘
```

### 2. Vercel 환경변수
`FIREBASE_SERVICE_ACCOUNT` 추가했으나 Preview 배포에 미적용.
설정 시 **Production + Preview + Development 세 환경 모두 체크** 필요.

---

## 다음 작업 순서

### 방법 A — 로컬에서 마이그레이션 스크립트 실행 (데스크톱, 가장 확실)
```bash
# 1. Firebase 서비스 계정 키 다운로드
#    Firebase Console → 프로젝트 설정(⚙) → 서비스 계정 → 새 비공개 키 생성
#    → 다운로드한 JSON을 scripts/serviceAccountKey.json 에 저장

# 2. 실행
npx tsx scripts/migrate-to-firestore.ts
```

### 방법 B — Firestore 규칙 수정 후 Vercel 엔드포인트 실행
1. Firebase Console → Firestore → Rules → 아래 규칙 게시:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
2. Vercel 최신 배포 URL에서 `/api/admin/migrate` GET 접속
3. `{"ok":true,"uploaded":{"cards":18,"decks":2}}` 확인

### 방법 C — Vercel 환경변수 수정 후 재배포
1. Vercel → 프로젝트 → Settings → Environment Variables
2. `FIREBASE_SERVICE_ACCOUNT` — Firebase 서비스 계정 JSON 전체 내용, **3개 환경 모두 체크**
3. 재배포 후 최신 URL에서 `/api/admin/migrate` 접속

---

## 마이그레이션 완료 후 정리
```bash
rm src/app/api/admin/migrate/route.ts
git add -A && git commit -m "Remove one-time migration endpoint"
git push
# → dev 브랜치에 PR 머지
```

---

## 참고: Firestore 컬렉션 구조
- `cards/{cardId}` — 카드 데이터 (18개)
- `decks/{deckId}` — 덱 데이터 (2개)

서버사이드(API 라우트)는 `firebase-admin` 사용 → 보안 규칙 우회  
클라이언트사이드(온라인 대전)는 기존 `firebase` 클라이언트 SDK 유지
