import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { checkDistributedRateLimit } from "@/lib/server/traffic-control"
import { getClientIP } from "@/lib/get-client-ip"

const RATE_LIMITS = {
  default: { requests: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 100), windowMs: 60 * 1000 },
  ai: { requests: Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 20), windowMs: 60 * 1000 },
}

const AI_ENDPOINTS = ["/api/fc-rag", "/api/summarize", "/api/annex-to-markdown"]

// 보안 응답 헤더
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
}

// POST body 크기 제한 (Content-Length 기반 사전 검증)
const MAX_BODY_SIZE: Record<string, number> = {
  "/api/hwp-to-html": 20 * 1024 * 1024,
  "/api/annex-to-markdown": 10 * 1024 * 1024,
  "/api/fc-rag": 50 * 1024,
  "/api/benchmark-analyze": 1024 * 1024,
  "/api/impact-tracker": 512 * 1024,
  "/api/summarize": 200 * 1024,
}
const DEFAULT_MAX_BODY = 1024 * 1024

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  if (pathname === "/api/health" || pathname.startsWith("/api/_")) {
    return NextResponse.next()
  }

  // POST body 크기 사전 검증
  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("content-length") || "0")
    const maxSize = MAX_BODY_SIZE[pathname] ?? DEFAULT_MAX_BODY
    if (contentLength > maxSize) {
      return NextResponse.json(
        { error: "요청 본문이 너무 큽니다." },
        { status: 413, headers: SECURITY_HEADERS },
      )
    }
  }

  const isAIEndpoint = AI_ENDPOINTS.some((endpoint) => pathname.startsWith(endpoint))
  const limit = isAIEndpoint ? RATE_LIMITS.ai : RATE_LIMITS.default
  const ip = getClientIP(request)

  const { allowed, remaining, resetTime } = await checkDistributedRateLimit({
    namespace: "api-rate-limit",
    identifier: `${isAIEndpoint ? "ai" : "default"}:${ip}`,
    limit: limit.requests,
    windowMs: limit.windowMs,
  })

  if (!allowed) {
    const retryAfter = Math.max(Math.ceil((resetTime - Date.now()) / 1000), 1)

    return NextResponse.json(
      {
        error: "Too Many Requests",
        message: "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit.requests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
        },
      }
    )
  }

  const response = NextResponse.next()
  // 레이트리밋 헤더
  response.headers.set("X-RateLimit-Limit", String(limit.requests))
  response.headers.set("X-RateLimit-Remaining", String(remaining))
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))
  // 보안 헤더
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: "/api/:path*",
}
