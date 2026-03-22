"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { ImpactResult } from "@/lib/relation-graph/impact-analysis"

interface UseImpactAnalysisReturn {
  data: ImpactResult | null
  isLoading: boolean
  error: string | null
  fetch: () => void
  reset: () => void
}

/**
 * 영향 분석 데이터를 가져오는 훅.
 * 자동 fetch 하지 않고, fetch() 호출 시에만 실행.
 */
export function useImpactAnalysis(
  lawId: string | undefined,
  jo?: string,
): UseImpactAnalysisReturn {
  const [data, setData] = useState<ImpactResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Unmount 시 in-flight 요청 취소
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const fetchImpact = useCallback(() => {
    if (!lawId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ lawId })
    if (jo) params.append("jo", jo)

    fetch(`/api/impact-analysis?${params}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(json => {
        if (controller.signal.aborted) return
        if (json.success) {
          setData(json.impact)
        } else {
          setError(json.error || "영향 분석 실패")
        }
      })
      .catch(e => {
        if (e.name === 'AbortError') return
        setError(e.message || "영향 분석 중 오류 발생")
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
  }, [lawId, jo])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return { data, isLoading, error, fetch: fetchImpact, reset }
}
