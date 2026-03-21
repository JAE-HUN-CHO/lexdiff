"use client"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { CopyButton } from "@/components/ui/copy-button"
import { LawViewerAnalysisMenu } from "./law-viewer-analysis-menu"
import { useLawViewerContext } from "./law-viewer-context"
import type { LawArticle } from "@/lib/law-types"

interface LawViewerOrdinanceActionsProps {
  actualArticles: LawArticle[]
}

export function LawViewerOrdinanceActions({
  actualArticles,
}: LawViewerOrdinanceActionsProps) {
  const {
    isOrdinance, isPrecedent, meta,
    fontSize, increaseFontSize, decreaseFontSize, resetFontSize,
    openLawCenter, onRefresh, formatSimpleJo,
    onTimeMachine, onImpactTracker, onOrdinanceSync, onOrdinanceBenchmark,
  } = useLawViewerContext()

  if (!isOrdinance) {
    return null
  }

  return (
    <div className="border-b border-border px-3 sm:px-4 py-0.5 pt-2 sm:pt-3 pb-2 sm:pb-3">
      <div className="flex items-center justify-between gap-1">
        {/* 좌측: 원문 보기 + 분석 도구 */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={openLawCenter} className="bg-transparent h-7 px-2">
            <Icon name="external-link" size={14} className="mr-1" />
            원문 보기
          </Button>
          <LawViewerAnalysisMenu
            meta={meta}
            isOrdinance={isOrdinance}
            isPrecedent={isPrecedent}
            onTimeMachine={onTimeMachine}
            onImpactTracker={onImpactTracker}
            onOrdinanceSync={onOrdinanceSync}
            onOrdinanceBenchmark={onOrdinanceBenchmark}
          />
        </div>

        {/* 우측: 새로고침 + 글자크기 + 복사 */}
        <div className="flex items-center gap-0.5">
          {/* 강제 새로고침 버튼 */}
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10" onClick={onRefresh} title="캐시 무시 새로고침 (개발용)">
              <Icon name="refresh-cw" size={14} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={decreaseFontSize} title="글자 작게" className="h-7 px-2">
            <Icon name="zoom-out" size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={resetFontSize} title="기본 크기" className="h-7 px-2">
            <Icon name="rotate-clockwise" size={12} />
          </Button>
          <Button variant="ghost" size="sm" onClick={increaseFontSize} title="글자 크게" className="h-7 px-2">
            <Icon name="zoom-in" size={14} />
          </Button>
          <span className="text-xs text-muted-foreground ml-1">{fontSize}px</span>
          <CopyButton
            getText={() => actualArticles.map(a => `${formatSimpleJo(a.jo)}\n${a.content}`).join('\n\n')}
            message="전체 복사됨"
            className="h-7 w-7 p-0"
          />
        </div>
      </div>
    </div>
  )
}
