/**
 * FC-RAG API endpoint with SSE streaming.
 *
 * ── LLM 구성 ──
 * Primary : Hermes Agent API (GPT-5.4)
 *   로컬: localhost:8642 직접 호출
 *   Vercel: CF Worker → Quick Tunnel → Hermes API (동일 경로)
 * Fallback: Gemini Flash — Hermes 불능 시
 */

import { NextRequest } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { verifyAllCitations, type Citation, type VerifiedCitation } from "@/lib/citation-verifier"
import { executeClaudeRAGStream, executeGeminiRAGStream, type FCRAGCitation } from "@/lib/fc-rag/engine"
import {
  getUsageHeaders,
  getUsageWarningMessage,
  isQuotaExceeded,
  recordAITokens,
  recordAIUsage,
} from "@/lib/usage-tracker"
import { generateTraceId, traceLogger } from "@/lib/trace-logger"
import { appendQueryLog, type QueryLogEntry } from "@/lib/query-logger"
import { getClientIP } from "@/lib/get-client-ip"
import { validate, ragRequestSchema, createErrorResponse } from "@/lib/api-validation"

function convertForVerification(fcCitations: FCRAGCitation[]): {
  verifiable: Citation[]
  skipped: VerifiedCitation[]
} {
  const verifiable: Citation[] = []
  const skipped: VerifiedCitation[] = []

  for (const citation of fcCitations) {
    if (/^제?\d+조(?:의\d+)?(?:의\d+)?/.test(citation.articleNumber)) {
      verifiable.push({
        lawName: citation.lawName,
        articleNum: citation.articleNumber,
        text: citation.chunkText,
        source: citation.source,
      })
      continue
    }

    skipped.push({
      lawName: citation.lawName,
      articleNum: citation.articleNumber,
      text: citation.chunkText,
      source: citation.source,
      verified: false,
      verificationMethod: "skipped",
    })
  }

  return { verifiable, skipped }
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const userApiKey = request.headers.get("X-User-API-Key") || undefined

  if (userApiKey && !/^AIzaSy[A-Za-z0-9_-]{33}$/.test(userApiKey)) {
    return Response.json({ error: "API key format is invalid." }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return createErrorResponse("Invalid JSON body", 400)
  }

  const validation = validate(ragRequestSchema, body)
  if (!validation.success) {
    return createErrorResponse(validation.error, 400)
  }

  const { query, conversationId, preEvidence } = validation.data

  let usageHeaders: Record<string, string> | undefined
  if (!userApiKey) {
    if (await isQuotaExceeded(clientIP)) {
      return Response.json(
        { error: "일일 AI 검색 시도를 초과했습니다. 내일 다시 시도해 주세요." },
        { status: 429, headers: await getUsageHeaders(clientIP) }
      )
    }

    await recordAIUsage(clientIP)
    usageHeaders = await getUsageHeaders(clientIP)
  }

  const traceId = generateTraceId()
  traceLogger.startTrace(traceId, query)

  const encoder = new TextEncoder()
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller already closed (client disconnected)
        }
      }

      // ── 질의 로그 수집기 ──
      const logStartMs = Date.now()
      const logTools: string[] = []
      let logAnswerLen = 0
      let logCitationCount = 0
      let logVerifiedCount = 0
      let logComplexity = ''
      let logQueryType = ''
      let logError: string | null = null

      const sendAndLog = (data: unknown) => {
        const evt = data as Record<string, unknown>
        if (evt.type === 'tool_call' && evt.name) logTools.push(evt.name as string)
        if (evt.type === 'answer') {
          const d = evt.data as Record<string, unknown> | undefined
          logAnswerLen = String(d?.answer || '').length
          logCitationCount = (d?.citations as unknown[] || []).length
          logComplexity = String(d?.complexity || '')
          logQueryType = String(d?.queryType || '')
        }
        if (evt.type === 'citation_verification') {
          logVerifiedCount = ((evt.citations as unknown[]) || []).filter((c: any) => c?.verified).length
        }
        if (evt.type === 'error') logError = String(evt.message || 'unknown')
        send(data)
      }

      // request.signal + cancel() 양쪽 모두 반응하는 합성 signal
        const combinedSignal = AbortSignal.any([request.signal, abortController.signal])

      try {
        let handled = false
        let source: 'hermes' | 'gemini' = 'gemini'

        // ── Hermes Primary (통일 경로) ──
        // 로컬: localhost:8642 직접 / Vercel: HERMES_API_URL(CF Worker) 경유
        try {
          traceLogger.addEvent(traceId, 'hermes_start', {})
          sendAndLog({ type: "status", message: "AI 엔진 연결 중...", progress: 2 })

          let lastAnswerCitations: FCRAGCitation[] = []

          const isTransient = (msg: string) => /타임아웃|timeout|ECONNRESET|EPIPE|ETIMEDOUT/i.test(msg)
          let cliSuccess = false

          for (let attempt = 0; attempt < 2 && !cliSuccess; attempt++) {
            if (attempt > 0) {
              sendAndLog({ type: "status", message: "Hermes 타임아웃 — 재시도 중...", progress: 3 })
              traceLogger.addEvent(traceId, 'hermes_retry', { attempt })
            }

            let claudeHadError = false
            let errorMessage = ''

            for await (const event of executeClaudeRAGStream(query, {
              signal: combinedSignal,
              conversationId,
              preEvidence,
            })) {
              if (event.type === "error") {
                claudeHadError = true
                errorMessage = event.message
                traceLogger.addEvent(traceId, 'hermes_internal_error', { message: event.message })
                continue
              }
              if (claudeHadError && event.type === "answer") continue

              if (event.type === "answer") {
                lastAnswerCitations = event.data.citations || []
                if (!userApiKey) {
                  const usageStats = await recordAITokens(clientIP, event.data.answer.length)
                  const warningMessage = getUsageWarningMessage(usageStats)
                  if (warningMessage) {
                    const warnings = [...(event.data.warnings || []), warningMessage]
                    sendAndLog({ ...event, data: { ...event.data, warnings } })
                    continue
                  }
                }
              }

              sendAndLog(event)
            }

            if (!claudeHadError) {
              cliSuccess = true
            } else if (attempt === 0 && isTransient(errorMessage)) {
              continue // 1회 재시도
            } else {
              throw new Error('Hermes internal error, falling back to Gemini')
            }
          }

          if (!cliSuccess) throw new Error('Hermes API failed after retries')

          // Citation 검증 (양쪽 경로 공통)
          if (lastAnswerCitations.length > 0) {
            try {
              const { verifiable, skipped } = convertForVerification(lastAnswerCitations)
              if (verifiable.length > 0) {
                sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              debugLogger.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          handled = true
          source = 'hermes'
          traceLogger.completeTrace(traceId, 'hermes')
        } catch (hermesError) {
          traceLogger.addEvent(traceId, 'hermes_failed', {
            message: hermesError instanceof Error ? hermesError.message : 'unknown',
            fallback: 'gemini',
          })
        }

        // ── Gemini Fallback ──
        if (!handled) {
          sendAndLog({ type: "status", message: "Gemini 엔진으로 전환 중...", progress: 3 })
          traceLogger.addEvent(traceId, 'gemini_start', {})

          let lastAnswerCitations: FCRAGCitation[] = []
          let geminiAnswerSent = false

          for await (const event of executeGeminiRAGStream(query, {
            apiKey: userApiKey,
            signal: combinedSignal,
            conversationId,
            preEvidence,
          })) {
            if (event.type === "answer") {
              geminiAnswerSent = true
              lastAnswerCitations = event.data.citations || []

              if (!userApiKey) {
                const usageStats = await recordAITokens(clientIP, event.data.answer.length)
                const warningMessage = getUsageWarningMessage(usageStats)

                if (warningMessage) {
                  const warnings = [...(event.data.warnings || []), warningMessage]
                  sendAndLog({ ...event, data: { ...event.data, warnings } })
                  continue
                }
              }
            }

            sendAndLog(event)
          }

          // 안전장치: Hermes+Gemini 모두 answer를 보내지 못한 경우
          if (!geminiAnswerSent) {
            sendAndLog({
              type: "answer",
              data: {
                answer: "죄송합니다. AI 엔진에 일시적 문제가 발생하여 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                citations: [],
                confidenceLevel: "low",
                complexity: "simple",
                queryType: "application",
                warnings: ["Hermes 및 Gemini 엔진 모두 응답 실패"],
              },
            })
          }

          if (lastAnswerCitations.length > 0) {
            try {
              const { verifiable, skipped } = convertForVerification(lastAnswerCitations)
              if (verifiable.length > 0) {
                sendAndLog({ type: "status", message: "인용 법조문 검증 중...", progress: 95 })
                const verified = await verifyAllCitations(verifiable)
                sendAndLog({ type: "citation_verification", citations: [...verified, ...skipped] })
              }
            } catch (error) {
              debugLogger.error("[FC-RAG] Citation verification failed:", error)
            }
          }

          source = 'gemini'
          traceLogger.completeTrace(traceId, 'gemini')
        }

        sendAndLog({ type: 'source', source })

        // ── 질의 로그 기록 ──
        appendQueryLog({
          ts: new Date().toISOString(),
          traceId,
          query,
          source,
          model: source === 'hermes' ? 'gpt-5.4' : 'gemini-flash',
          env: process.env.VERCEL ? 'vercel' : 'local',
          complexity: logComplexity,
          queryType: logQueryType,
          durationMs: Date.now() - logStartMs,
          tools: logTools,
          answerLength: logAnswerLen,
          citationCount: logCitationCount,
          verifiedCount: logVerifiedCount,
          error: logError,
        })
      } catch (error) {
        logError = error instanceof Error ? error.message : 'unknown'
        traceLogger.addEvent(traceId, 'error', { message: logError })
        sendAndLog({
          type: "error",
          message: "AI 검색 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
        })
        // 에러 시에도 로그 기록
        appendQueryLog({
          ts: new Date().toISOString(),
          traceId,
          query,
          source: 'gemini',
          model: 'error',
          env: process.env.VERCEL ? 'vercel' : 'local',
          complexity: logComplexity,
          queryType: logQueryType,
          durationMs: Date.now() - logStartMs,
          tools: logTools,
          answerLength: 0,
          citationCount: 0,
          verifiedCount: 0,
          error: logError,
        })
      } finally {
        controller.close()
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }

  if (usageHeaders) {
    for (const [key, value] of Object.entries(usageHeaders)) {
      headers[key] = value
    }
  }

  return new Response(stream, { headers })
}
