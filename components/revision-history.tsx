"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronDown, ChevronUp, History } from "lucide-react"
import type { RevisionHistoryItem } from "@/lib/law-types"

interface RevisionHistoryProps {
  history: RevisionHistoryItem[]
  articleTitle?: string
}

export function RevisionHistory({ history, articleTitle }: RevisionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [selectedRevision, setSelectedRevision] = useState<RevisionHistoryItem | null>(null)

  if (!history || history.length === 0) {
    return null
  }

  const sortedHistory = [...history].reverse()
  const displayedHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, 10)
  const hasMoreHistory = sortedHistory.length > 10

  const getReasonBadgeVariant = (reason: string) => {
    if (reason === "조문변경") return "default"
    if (reason === "전부개정") return "destructive"
    if (reason === "제정") return "secondary"
    return "outline"
  }

  return (
    <>
      <div className="mt-6 border border-border rounded-lg overflow-hidden">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">개정 이력</span>
            <Badge variant="secondary" className="text-xs">
              {history.length}건
            </Badge>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {isExpanded && (
          <div className="p-4 pt-0 bg-secondary/20">
            {articleTitle && <div className="font-semibold text-sm mb-3 text-foreground">{articleTitle}</div>}
            <div className="space-y-1 font-mono text-sm">
              {displayedHistory.map((item, index) => {
                const isLast = index === displayedHistory.length - 1 && !hasMoreHistory
                const prefix = isLast ? "└─" : "├─"

                return (
                  <div key={index} className="flex items-start gap-2 text-muted-foreground">
                    <span className="text-border select-none">{prefix}</span>
                    <div className="flex-1">
                      <button
                        onClick={() => setSelectedRevision(item)}
                        className="text-left hover:bg-secondary/50 rounded px-1 -mx-1 transition-colors w-full"
                        disabled={!item.articleLink}
                      >
                        <span className="text-foreground font-medium">{item.date}</span>
                        <span className="mx-2 text-foreground">{item.type}</span>
                        {item.description && (
                          <Badge variant={getReasonBadgeVariant(item.description)} className="text-xs ml-1">
                            {item.description}
                          </Badge>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
              {hasMoreHistory && !showAllHistory && (
                <div className="flex items-start gap-2 text-muted-foreground pt-2">
                  <span className="text-border select-none">└─</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllHistory(true)}
                    className="h-auto py-1 px-2 text-xs text-primary hover:text-primary"
                  >
                    <ChevronDown className="h-3 w-3 mr-1" />
                    {sortedHistory.length - 10}개 더보기
                  </Button>
                </div>
              )}
              {showAllHistory && (
                <div className="flex items-start gap-2 text-muted-foreground pt-2">
                  <span className="text-border select-none">└─</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllHistory(false)}
                    className="h-auto py-1 px-2 text-xs text-primary hover:text-primary"
                  >
                    <ChevronUp className="h-3 w-3 mr-1" />
                    접기
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRevision} onOpenChange={(open) => !open && setSelectedRevision(null)}>
        <DialogContent
          className="h-[90vh] overflow-hidden flex flex-col bg-white text-black"
          style={{ width: "1000px", maxWidth: "1000px" }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg text-black">
              {selectedRevision?.date} {selectedRevision?.type}
              {selectedRevision?.description && (
                <Badge variant={getReasonBadgeVariant(selectedRevision.description)} className="ml-2">
                  {selectedRevision.description}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden min-h-0 bg-white">
            {selectedRevision?.articleLink && (
              <iframe
                src={selectedRevision.articleLink}
                className="w-full h-full border-0 rounded bg-white"
                title="조문 내용"
                style={{ colorScheme: "light" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
