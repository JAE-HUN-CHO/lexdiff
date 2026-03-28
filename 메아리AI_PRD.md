# 메아리 AI - PRD (Product Requirements Document)

> 광진구 홍보팀 업무 어시스턴트 | Google File Search + Gemini 기반 RAG 챗봇

---

## 1. 프로젝트 개요

### 1.1 기본 정보

| 항목           | 내용                                        |
| -------------- | ------------------------------------------- |
| 프로젝트명     | 메아리 AI (아차산메아리 AI 어시스턴트)      |
| 목적           | 홍보팀 인수인계서/매뉴얼 기반 질의응답 챗봇 |
| 기술 기반      | Google AI File Search + Gemini 2.5 Flash    |
| 배포           | Vercel                                      |
| 예상 개발 기간 | 3~5일                                       |

### 1.2 LexDiff 재활용 항목

| 재활용                     | 신규 개발                  |
| -------------------------- | -------------------------- |
| Next.js 14 App Router 구조 | Google AI File Search 연동 |
| Tailwind CSS 설정          | Gemini API 스트리밍        |
| 채팅 UI 컴포넌트           | 홍보팀 브랜딩 UI           |
| 메시지 스트리밍 로직       | 문서 관리 페이지           |
| Vercel 배포 설정           | 프롬프트 템플릿            |
| 반응형 레이아웃            | 출처 표시 컴포넌트         |

---

## 2. 기술 스택

| 레이어       | 기술                     | 비고             |
| ------------ | ------------------------ | ---------------- |
| Framework    | Next.js 14 (App Router)  | LexDiff 동일     |
| Styling      | Tailwind CSS + shadcn/ui | LexDiff 동일     |
| AI/RAG       | Google AI File Search    | Gemini 2.5 Flash |
| File Storage | Google AI Files API      | 1GB 무료         |
| Deploy       | Vercel                   | icn1 리전        |

### 의존성

```json
{
  "@google/genai": "^1.0.0",
  "next": "14.x",
  "react": "18.x",
  "tailwindcss": "3.x",
  "lucide-react": "latest"
}
```

### 환경변수

```bash
GOOGLE_API_KEY=your-google-api-key
NEXT_PUBLIC_APP_NAME=메아리 AI
```

---

## 3. 디렉토리 구조

```
/meari-ai
├── /app
│   ├── /api
│   │   ├── /chat/route.ts           # 채팅 API (스트리밍)
│   │   └── /files
│   │       ├── route.ts             # 파일 목록
│   │       ├── /upload/route.ts     # 파일 업로드
│   │       └── /[id]/route.ts       # 파일 삭제
│   ├── /chat/page.tsx               # 메인 채팅
│   ├── /documents/page.tsx          # 문서 관리
│   ├── layout.tsx
│   ├── page.tsx                     # 랜딩 → /chat 리다이렉트
│   └── globals.css
├── /components
│   ├── /chat
│   │   ├── ChatContainer.tsx        # ← LexDiff 포팅
│   │   ├── MessageList.tsx          # ← LexDiff 포팅
│   │   ├── MessageItem.tsx          # ← LexDiff 포팅
│   │   ├── ChatInput.tsx            # ← LexDiff 포팅
│   │   └── SourceCard.tsx           # 🆕 출처 표시
│   ├── /documents
│   │   ├── FileUploader.tsx         # 🆕
│   │   └── FileList.tsx             # 🆕
│   ├── /ui                          # ← LexDiff shadcn 복사
│   ├── Header.tsx                   # 🆕 브랜딩
│   ├── Sidebar.tsx                  # ← LexDiff 수정
│   └── PromptTemplates.tsx          # 🆕
├── /lib
│   ├── google-ai.ts                 # 🆕 Google AI 클라이언트
│   └── utils.ts                     # ← LexDiff
├── /types/index.ts
└── /public
    └── logo.svg
```

---

## 4. 핵심 기능 명세

### 4.1 MVP 기능

| ID  | 기능          | 설명                                  |
| --- | ------------- | ------------------------------------- |
| F01 | AI 채팅       | 문서 기반 질의응답, 스트리밍 응답     |
| F02 | 문서 업로드   | PDF, DOCX, TXT 지원 (HWP는 변환 필요) |
| F03 | 출처 표시     | 답변 근거 문서명 표시                 |
| F04 | 대화 히스토리 | 세션 내 맥락 유지                     |

### 4.2 프롬프트 템플릿 (기본 제공)

| 라벨            | 프롬프트                                                      |
| --------------- | ------------------------------------------------------------- |
| 📅 1월 일정 확인 | "1월 한 달간 체크해야 할 일정과 할 일을 날짜순으로 정리해줘." |
| 📞 연락처 찾기   | "점자소식지 담당자 연락처 알려줘."                            |
| 📋 마감일 확인   | "2월호 관련 주요 마감일을 정리해줘."                          |
| 🕐 업무 절차     | "국장단 편집회의 준비 절차와 필요한 자료를 알려줘."           |

---

## 5. API 명세

### 5.1 POST /api/chat

**Request:**
```typescript
{
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
```

**Response:** Server-Sent Events
```
data: {"type": "text", "content": "답변 내용..."}
data: {"type": "source", "sources": [...]}
data: {"type": "done"}
```

### 5.2 GET /api/files

**Response:**
```typescript
{
  files: Array<{
    id: string;
    name: string;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  }>;
}
```

### 5.3 POST /api/files/upload

**Request:** multipart/form-data (file, displayName)

**Response:**
```typescript
{ success: boolean; file: { id, name, ... } }
```

### 5.4 DELETE /api/files/[id]

**Response:**
```typescript
{ success: boolean }
```

---

## 6. Google AI 연동 핵심 로직

### 6.1 파일 업로드

```typescript
// Google AI Files API
const uploadedFile = await genAI.files.upload({
  file: new Blob([buffer], { type: mimeType }),
  config: { displayName }
});
```

### 6.2 File Search 채팅

```typescript
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const chat = model.startChat({
  history: [...],
  tools: [{
    fileSearch: {
      dataSources: fileIds.map(id => ({ fileId: id }))
    }
  }]
});

const result = await chat.sendMessageStream(message);
```

### 6.3 스트리밍 처리

```typescript
for await (const chunk of result.stream) {
  const text = chunk.text();
  // SSE로 클라이언트에 전송
}
```

---

## 7. UI 와이어프레임

### 7.1 메인 채팅 화면

```
┌─────────────────────────────────────────────────────────┐
│  🏔️ 메아리 AI                        [문서관리] [설정]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  (초기 상태: 환영 메시지 + 프롬프트 템플릿 버튼 4개)      │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  [👤] 사용자 메시지                                      │
│                                                         │
│  [🤖] AI 답변 (스트리밍)                                 │
│       ┌─────────────────────────────────┐              │
│       │ 📄 출처: 인수인계서.pdf          │              │
│       └─────────────────────────────────┘              │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 메시지 입력...                          [전송]   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 7.2 문서 관리 화면

```
┌─────────────────────────────────────────────────────────┐
│  🏔️ 메아리 AI                           [채팅] [설정]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📁 문서 관리                                            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📎 파일 드래그 또는 클릭하여 업로드              │   │
│  │     PDF, DOCX, TXT 지원 (최대 20MB)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  업로드된 문서 (N개)                                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📄 인수인계서.pdf  │ 2.3MB │ ✅ 활성    [삭제]   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📄 업무매뉴얼.pdf  │ 5.1MB │ 🔄 처리중  [삭제]   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 8. 디자인 토큰

```typescript
const colors = {
  primary: '#2563eb',      // 메인 블루
  secondary: '#059669',    // 포인트 그린
  background: '#f8fafc',
  surface: '#ffffff',
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
  },
  user: '#dbeafe',         // 사용자 메시지 배경
  assistant: '#f1f5f9',    // AI 메시지 배경
};

const font = '"Pretendard", -apple-system, sans-serif';
```

---

## 9. 타입 정의

```typescript
// /types/index.ts

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  createdAt: Date;
}

interface Source {
  file: string;
  page?: number;
}

interface UploadedFile {
  id: string;
  name: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  createTime: string;
}

interface ChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

interface StreamEvent {
  type: 'text' | 'source' | 'done' | 'error';
  content?: string;
  sources?: Source[];
  message?: string;
}
```

---

## 10. 구현 체크리스트

### Day 1: 프로젝트 셋업

- [ ] Next.js 14 프로젝트 생성
- [ ] LexDiff에서 tailwind.config.js 복사
- [ ] LexDiff에서 /components/ui 복사
- [ ] @google/genai 설치
- [ ] /lib/google-ai.ts 작성
- [ ] Google AI API 키 설정 및 테스트

### Day 2: 채팅 기능

- [ ] /api/chat/route.ts (스트리밍)
- [ ] LexDiff에서 채팅 컴포넌트 포팅
  - [ ] ChatContainer.tsx
  - [ ] MessageList.tsx
  - [ ] MessageItem.tsx
  - [ ] ChatInput.tsx
- [ ] SourceCard.tsx (출처 표시)
- [ ] PromptTemplates.tsx
- [ ] /app/chat/page.tsx

### Day 3: 문서 관리 + 배포

- [ ] /api/files/route.ts (목록)
- [ ] /api/files/upload/route.ts
- [ ] /api/files/[id]/route.ts (삭제)
- [ ] FileUploader.tsx
- [ ] FileList.tsx
- [ ] /app/documents/page.tsx
- [ ] Header.tsx (네비게이션)
- [ ] Vercel 배포

### Day 4-5: 개선

- [ ] 에러 핸들링 강화
- [ ] 로딩 상태 UI
- [ ] 빈 상태 UI
- [ ] 반응형 점검
- [ ] 테스트 및 버그 수정

---

## 11. LexDiff 코드 참조 위치

| 필요 코드       | LexDiff 경로 (예상) |
| --------------- | ------------------- |
| Tailwind 설정   | /tailwind.config.js |
| shadcn 컴포넌트 | /components/ui/*    |
| 채팅 컨테이너   | /components/chat/*  |
| 스트리밍 훅     | /hooks/useChat.ts   |
| 유틸리티 함수   | /lib/utils.ts       |
| cn() 함수       | /lib/utils.ts       |

---

## 12. 테스트 시나리오

| ID  | 시나리오            | 예상 결과                       |
| --- | ------------------- | ------------------------------- |
| T01 | 문서 없이 질문      | "업로드된 문서가 없습니다" 안내 |
| T02 | PDF 업로드 후 질문  | 문서 기반 답변                  |
| T03 | "1월 20일 준비사항" | 일정 목록 답변                  |
| T04 | "연락처" 질문       | 담당자 정보 답변                |
| T05 | 연속 질문           | 이전 맥락 유지                  |
| T06 | 파일 삭제           | 목록에서 제거                   |

---

## 13. 참고 링크

- [Google AI SDK (npm)](https://www.npmjs.com/package/@google/genai)
- [Gemini File Search 문서](https://ai.google.dev/gemini-api/docs/file-search)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Vercel 배포](https://vercel.com/docs)

---

## 변경 이력

| 버전 | 날짜       | 내용      |
| ---- | ---------- | --------- |
| 1.0  | 2026.01.01 | 초안 작성 |
