# LexDiff

**Korean law search, comparison, and AI analysis platform**
— 한국 법령 검색 · 신구조문 비교 · AI 법률 분석 올인원 플랫폼

<p align="center">
  <img src="demo/out/lexdiff-demo.gif" alt="LexDiff Demo" width="720" />
</p>

<p align="center">
  <a href="https://lexdiff.vercel.app">lexdiff.vercel.app</a>
</p>

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Claude Sonnet 4.6](https://img.shields.io/badge/Claude-Sonnet_4.6-cc785c?logo=anthropic)
![667 Tests](https://img.shields.io/badge/Tests-667-green)

---

## What it does

일상 언어로 법률을 질문하면 AI가 법령·판례를 근거로 답합니다.

| Feature | Description |
|---------|-------------|
| **AI 법률 검색** | 자연어 질문 → Claude Sonnet 4.6 + MCP 도구로 법령·판례 기반 실시간 답변 |
| **신구조문 비교** | 개정 전후 변경점 하이라이팅 + AI 변경 요약 |
| **3단 위임법령 비교** | 법률 → 시행령 → 시행규칙 한 화면에 |
| **판례·해석례 통합** | 대법원 판례, 법제처 해석례, 조세심판원 재결례, 관세청 해석 |
| **자치법규 검색** | 전국 17개 시도 + 226개 시군구 조례/규칙 통합 |
| **위임법령 추적** | 조문별 행정규칙(고시/훈령) 자동 연결 |
| **구법령 조회** | 과거 시점 법령 원문 + 개정 이력 |

---

## Who it's for

- **공무원·지자체 담당자** — 상위법령-조례 위임 관계, 조례 개정 시 상위법 변경사항 추적
- **관세사·무역 전문가** — 관세법 3단 비교, 관세청 해석례, HS코드 분류 기준
- **세무사·변호사** — 세법 개정 영향 분석, 조세심판원 재결례, 법령해석례

---

## Quick start

```bash
git clone https://github.com/chrisryugj/lexdiff.git
cd lexdiff
pnpm install
cp .env.local.example .env.local   # API 키 설���
pnpm dev                            # http://localhost:3000
```

**Requirements**: Node.js 20+, pnpm

---

## Architecture

```
사용자 질문
  ↓
Claude Sonnet 4.6 (CLI subprocess, stream-json)
  ↓ MCP 도구 호출
법제처 API (73개 엔드포인트)  ←→  korean-law MCP
  ↓
실시간 SSE 스트리밍 → UI
```

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, Tailwind v4, shadcn/ui, Framer Motion |
| **Backend** | Next.js 16 API Routes, Zod validation |
| **AI** | Claude Sonnet 4.6 (primary), Gemini Flash (fallback), MCP tool use |
| **Data** | 법제처 Open API, Supabase PostgreSQL, IndexedDB cache |
| **Testing** | Vitest, 667 tests |

---

## Project structure

```
app/api/          73 API routes (law, precedent, AI RAG, comparison...)
components/       Law viewer, search, modals, precedent panels
lib/              Core logic (link generator, law parser, AI engine)
hooks/            React hooks (law viewer, search, precedents)
demo/             Remotion intro video source
```

---

## Tech stack

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui · Radix UI ·
Claude Sonnet 4.6 · Gemini 2.5 Flash · korean-law MCP · Supabase · Turso/LibSQL ·
IndexedDB · Vitest · Framer Motion

---

## License

MIT

---

<p align="center">
  <strong>LexDiff</strong> — 법령을 쉽게. AI로 똑똑하게.<br/>
  <sub>Korean law search · AI legal analysis · statute comparison · precedent search · ordinance lookup</sub>
</p>
