/**
 * 외부 API 호출용 공유 fetch 래퍼
 * - 타임아웃 기본 15초 (법제처 API hang 방지)
 * - Cascading failure 방지
 */

const DEFAULT_TIMEOUT_MS = 15_000

export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init || {}

  // 이미 signal이 있으면 타임아웃과 합성
  if (fetchInit.signal) {
    return fetch(url, fetchInit)
  }

  return fetch(url, {
    ...fetchInit,
    signal: AbortSignal.timeout(timeoutMs),
  })
}
