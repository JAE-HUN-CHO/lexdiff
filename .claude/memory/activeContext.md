# Active Context

**마지막 업데이트**: 2026-03-16 (쿼리 확장 엔진 4차 검증 + 법령 검색 확장 + 차세대 개선안)

## 현재 상태

**쿼리 확장 엔진 4차 실전 검증 완료.** Phase A~F 전체 수행 + 법령 검색까지 확장. 차세대 개선안(LLM 자동보강 + 하이브리드 검색) PRD 확정.

## 프로젝트 관계 (중요!)

| 레포 | 역할 | 실행 환경 |
|------|------|----------|
| **lexdiff** | 웹앱 (Next.js) — 자체 FC-RAG 엔진 (`lib/fc-rag/`) | Vercel/로컬 |
| **chrisbot** (`github.com/chrisryugj/chrisbot`) | 미니PC 봇 — Bridge + nanobot | 미니PC (Mong NAS) |

**두 시스템은 완전 별개 파이프라인.** lexdiff FC-RAG 수정 ≠ nanobot 수정.

### ✅ 완료된 작업 (2026-03-15~16)

| 작업 | 파일 | 상태 |
|------|------|------|
| Phase A: 확장 Lift 50개 쿼리 | `lib/query-expansion.ts` | ✅ 96% 개선율, no_help 4% |
| Phase B: Precision 10개 쿼리 | `lib/query-expansion.ts` | ✅ 99% (머징+리랭킹 후) |
| Phase C: 사전 Gap 발견 + 보강 | `lib/query-expansion.ts` | ✅ 강아지/식당/킥보드 등 추가 |
| Phase D: 자연어 질의 18/20 | `lib/query-expansion.ts` | ✅ 전처리 파이프라인 추가 |
| Phase F: 자동완성 연동 | `app/api/search-suggest/route.ts` | ✅ 7/10 쿼리에서 확장 효과 |
| 동의어 세분화 (택시/버스) | `lib/query-expansion.ts` | ✅ precision 60%→100% |
| 결과 머징+리랭킹 | `useBasicSearch.ts` | ✅ 상위3전략 병렬→RRF |
| **법령 검색 확장** | `useBasicSearch.ts` | ✅ expandForLawSearch 병렬 호출 |
| 자연어 전처리 파이프라인 | `lib/query-expansion.ts` | ✅ stripKoreanSuffix + extractKeywords |
| 차세대 개선안 PRD | `.claude/plans/query-expansion-next-gen.md` | ✅ 3단계 로드맵 |

### 쿼리 확장 핵심 파일

| 파일 | 역할 |
|------|------|
| `lib/query-expansion.ts` | 사전 + 확장 엔진 + 전략 생성 + 전처리 파이프라인 |
| `components/search-result-view/hooks/useSearchHandlers/useBasicSearch.ts` | 법령/조례 검색 실행 (머징+리랭킹) |
| `app/api/search-suggest/route.ts` | 자동완성 API (확장 연동) |
| `app/api/law-search/route.ts` | 법령 검색 API |
| `app/api/ordin-search/route.ts` | 조례 검색 API |

### 쿼리 확장 최종 수치

| 지표 | 값 |
|------|-----|
| 조례 Lift (개선율) | 96% |
| 조례 Precision | 99% |
| 법령 Lift (0→N) | 10/12 (83%) |
| 자동완성 확장 효과 | 7/10 |
| 통합 커버리지 | 90% |

### 📋 다음 할 일

**쿼리 확장 차세대 (PRD: `.claude/plans/query-expansion-next-gen.md`):**
- [ ] Phase 1: LLM 사전 자동보강 (1~2주, $2/월)
  - `lib/server/zero-hit-logger.ts` — 0건 쿼리 로깅
  - `lib/query-expansion-dynamic.ts` — Redis 동적 사전
  - `lib/query-expansion-warm.ts` — 비동기 Warm Path
  - `lib/query-expansion-pipeline.ts` — 배치 파이프라인
- [ ] Phase 2: 하이브리드 검색 (2~3주, ~$1)
  - Supabase pgvector + OpenAI/LBox 임베딩
  - RRF 머징
- [ ] Phase 3: 조문 검색 + 리랭킹 (1~2개월, $30/월)

**법령 분석 도구 모음 (PRD: `important-docs/19-LAW_ANALYSIS_TOOLKIT_PRD.md`):**
- [ ] 법령 뷰어 "분석 도구" 드롭다운 메뉴
- [ ] 위임입법 미비 탐지기
- [ ] 법령 타임머신

**보류:**
- [ ] Phase D: API Route 정리
- [ ] 미니PC OpenClaw Bridge: `format=json` 파라미터 지원
