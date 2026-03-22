# Active Context

**마지막 업데이트**: 2026-03-23 (6차 프로덕션 코드리뷰 — 타임아웃/XSS/AbortController/보안 전면 개선)

## 현재 상태

**6차 프로덕션급 전체 코드리뷰 완료.** 49파일, -175/+254줄. 빌드/린트 모두 통과. **미커밋 상태.**

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

### ✅ 완료된 작업 (2026-03-23 — 6차 코드리뷰)

| 카테고리 | 수정 내용 | 파일 |
|----------|----------|------|
| **가용성 (CRITICAL)** | fetchWithTimeout 공유 래퍼 + 33개 라우트 일괄 적용 (15초) | `lib/fetch-with-timeout.ts` + 33개 route.ts |
| **XSS (CRITICAL)** | lawName escapeHtml + cleanPrecedentHtml 전체 태그 strip + href safeHref | modals, useUnifiedSearch, SearchResultList |
| **스크롤 (CRITICAL)** | HTML 인덱스 비율→DOM querySelector+scrollIntoView | `comparison-modal.tsx` |
| **DRY (CRITICAL)** | formatSimpleJo 47줄 중복→law-parser 재사용 (2줄) | `law-viewer.tsx` |
| **보안 헤더** | proxy.ts에 X-Content-Type-Options, X-Frame-Options 등 추가 | `proxy.ts` |
| **POST body 검증** | proxy.ts에 라우트별 Content-Length 상한 추가 | `proxy.ts` |
| **CLI injection** | `--` argument terminator 추가 (2곳) | `anthropic-client.ts` |
| **SSRF** | drf-html iframe src validateExternalUrl 추가 | `drf-html/route.ts` |
| **Host injection** | article-title origin→getInternalOrigin (VERCEL_URL 우선) | `article-title/route.ts` |
| **timing-safe** | debug/traces timingSafeEqual 적용 | `debug/traces/route.ts` |
| **Race condition** | AbortController 3훅 추가 (three-tier, impact-analysis, comparison-modal) | 3 hooks |
| **Toast 리스너** | useEffect deps [state]→[] (불필요한 재등록 방지) | `use-toast.ts` |
| **Timer 누수** | tool-adapter try/finally clearTimeout | `tool-adapter.ts` |
| **stderr 제한** | anthropic-client 10KB 상한 | `anthropic-client.ts` |
| **console.error** | debugLogger로 통일 (3파일 5건) | precedents 관련 3 hooks |
| **모달 상태** | comparison-modal 닫힘 시 초기화 + 중복 로깅 제거 | `comparison-modal.tsx` |

### 다음 할 일 (7차 리뷰)

- **law-viewer.tsx 추가 분리**: keyboard/swipe 네비 훅 추출 (~60줄), citations 병합 순수함수 추출 (~45줄), props 그룹화 훅 추출 (~60줄) → 770줄 목표
- **search-result-view/index.tsx 캐시 복원 패턴 DRY**: 7회 반복 패턴을 헬퍼 함수로 추출
- **any[] 타입 제거**: types.ts aiRelatedLaws, useSearchState precedentResults/interpretationResults/rulingResults
- **gemini-engine eviction 중복**: allToolResults eviction 코드 헬퍼 추출 (DRY)
- **use-ordinance-benchmark unmount abort**: abortRef cleanup useEffect 추가
- **use-swipe handlers 의존성**: inline 객체→ref 패턴으로 안정화
- **use-content-click-handlers deps 불안정**: context/actions ref 패턴
- **useSearchState state 객체 useMemo**: 매 렌더마다 새 참조 방지
- **search-all maxResults 바운드 체크**: Math.min(max, 100) 추가
- **customs-search/tax-tribunal-search display/page 바운드**: 일관 클램핑
- **annex-viewer bylNo/lsiSeq 숫자 검증**: /^\d+$/ 추가
- **impact-analysis/relation-graph try-catch**: safeErrorResponse 적용

### 쿼리 확장 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/query-expansion.ts` | 핵심 로직 (stripKoreanSuffix, extractKeywords, expandQuery) |
| `lib/query-expansion-data.ts` | 사전 데이터 (동의어, 복합어, 매핑) |
