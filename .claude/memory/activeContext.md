# Active Context

**마지막 업데이트**: 2026-03-22 (5차 프로덕션 코드리뷰 — 보안/성능/DRY 전면 개선)

## 현재 상태

**5차 프로덕션급 전체 코드리뷰 완료.** CRITICAL 5건 + HIGH 3건 + WARNING 17건 전면 수정. 빌드/린트 모두 통과.

## 프로젝트 관계 (중요!)

| 레포 | 역할 | 실행 환경 |
|------|------|----------|
| **lexdiff** | 웹앱 (Next.js) — 자체 FC-RAG 엔진 (`lib/fc-rag/`) | Vercel/로컬 |
| **chrisbot** (`github.com/chrisryugj/chrisbot`) | 미니PC 봇 — Bridge + nanobot | 미니PC (Mong NAS) |

**두 시스템은 완전 별개 파이프라인.** lexdiff FC-RAG 수정 ≠ nanobot 수정.

### ✅ 완료된 작업 (2026-03-22 — 5차 코드리뷰)

| 카테고리 | 수정 내용 | 파일 |
|----------|----------|------|
| **SSRF 방지** | 상대경로 허용목록 검증 추가 | `hwp-to-html/route.ts`, `annex-to-markdown/route.ts` |
| **XSS 방지** | HTML 텍스트 콘텐츠 escapeHtml 적용 | `link-pattern-matchers.ts`, `link-specialized.ts`, `ordinance-benchmark-view.tsx` |
| **성능 (CRITICAL)** | 기본 props 모듈레벨 상수 + useCallback 적용 | `law-viewer.tsx` |
| **에러 정보 노출** | safeErrorResponse 적용 + env var명 제거 | `old-law/route.ts`, `law-history/route.ts`, `summarize/route.ts` |
| **IP 스푸핑** | X-Forwarded-For 신뢰 계층 문서화 | `get-client-ip.ts` |
| **API 키 노출** | Gemini 에러 메시지 sanitize | `gemini-engine.ts` |
| **DRY** | IndexedDB 헬퍼 추출 (~200줄) | `admin-rule-cache.ts` |
| **DRY** | linkifyAndEscape 파이프라인 추출 (~100줄) | `law-xml-parser.tsx` |
| **DRY** | 판례/조례 fetch 헬퍼 추출 (~80줄) | `useUnifiedSearch.ts` |
| **DRY** | overlap splice 헬퍼 추출 (~50줄) | `link-pattern-matchers.ts` |
| **DRY** | ConfidenceBadge/FontControls 추출 + typing O(n²)→O(n) | `law-viewer-ai-answer.tsx` |
| **DRY** | comparison-modal useCallback + console.error→debugLogger | `comparison-modal.tsx` |
| **로직 버그** | resolveConflicts regulation 타입 추가 | `unified-link-generator.ts` |
| **로직 버그** | checkbox key 안정 식별자 + 타입 가드 | `ordinance-benchmark-view.tsx` |
| **입력 검증** | display/page 클램핑 + keyword/focus 길이 제한 | 프록시 API 3개 + `benchmark-analyze/route.ts` |
| **타입 안전성** | revisionHistory any[]→RevisionHistoryItem + 에러 로깅 | `law-viewer.tsx` |
| **정리** | legalStop 중복 추출, _excludeRegion 제거, dead code, eviction 일관성 | `query-expansion.ts`, `gemini-engine.ts`, `law-xml-parser.tsx` |
| **구조 개선** | 병렬 배열→ChangeWithDiff 단일 객체 | `impact-tracker/engine.ts` |

### ✅ 이전 완료 작업 (2026-03-22 — 4차 코드리뷰)

| 작업 | 파일 | 상태 |
|------|------|------|
| SSRF 취약점 수정 | `app/api/law-html/route.ts` | ✅ |
| 법률 파싱 3중 복사 통합 | `lib/law-data-utils.ts` | ✅ |
| console.log→debugLogger 130회 전환 | API 22개 + lib 3개 | ✅ |
| getClientIP 5중 복사 통합 | `lib/get-client-ip.ts` | ✅ |
| Tooltip 4중 복사 제거 | `hooks/use-truncation-tooltip.ts` | ✅ |
| LawViewer 중복 렌더링 제거 | `search-result-view/index.tsx` | ✅ |

### 다음 할 일 (6차 리뷰)

- useUnifiedSearch에 AbortSignal 추가 (unmount 시 stale state update 방지)
- comparison-modal 스크롤 로직 개선 (HTML 인덱스→DOM querySelector)
- 글로벌 레이트리밋 미들웨어 (비AI 프록시 라우트용)
- POST 엔드포인트 Content-Length/body size 일관 검증
- law-viewer.tsx 1,000줄 → 분리 검토 (keyboard nav hook, formatSimpleJo 추출 등)

### 쿼리 확장 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/query-expansion.ts` | 핵심 로직 (stripKoreanSuffix, extractKeywords, expandQuery) |
| `lib/query-expansion-data.ts` | 사전 데이터 (동의어, 복합어, 매핑) |
