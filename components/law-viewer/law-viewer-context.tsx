"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { LawMeta } from "@/lib/law-types"

// ─── Context 타입 ───

export interface LawViewerContextValue {
  // 타입 판별
  meta: LawMeta
  isPrecedent: boolean
  isOrdinance: boolean
  aiAnswerMode: boolean
  viewMode: "single" | "full"

  // 글자크기
  fontSize: number
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void

  // 즐겨찾기
  favorites: Set<string>
  isFavorite: (jo: string) => boolean
  favoriteKey: (jo: string) => string
  onToggleFavorite?: (jo: string) => void

  // 콜백 — 분석 도구
  onCompare?: (jo: string) => void
  onSummarize?: (jo: string) => void
  onRefresh?: () => void
  onDelegationGap?: (meta: LawMeta) => void
  onTimeMachine?: (meta: LawMeta) => void
  onImpactTracker?: (lawName: string) => void
  onOrdinanceSync?: (lawName: string) => void
  onOrdinanceBenchmark?: (lawName: string) => void

  // 공유 액션
  openLawCenter: () => void
  formatSimpleJo: (jo: string, forceOrdinance?: boolean) => string
}

// ─── Context 생성 ───

const LawViewerContext = createContext<LawViewerContextValue | null>(null)

export function LawViewerProvider({
  value,
  children,
}: {
  value: LawViewerContextValue
  children: ReactNode
}) {
  return (
    <LawViewerContext.Provider value={value}>
      {children}
    </LawViewerContext.Provider>
  )
}

export function useLawViewerContext(): LawViewerContextValue {
  const ctx = useContext(LawViewerContext)
  if (!ctx) throw new Error("useLawViewerContext must be used within LawViewerProvider")
  return ctx
}
