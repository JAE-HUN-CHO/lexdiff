import { NextResponse } from "next/server"

export async function GET() {
  try {
    const url = "https://www.law.go.kr/DRF/lawSearch.do?OC=" + (process.env.LAW_OC || "") + "&type=XML&target=law&query=%EA%B4%80%EC%84%B8%EB%B2%95"
    const res = await fetch(url)
    const text = await res.text()
    return NextResponse.json({
      status: res.status,
      length: text.length,
      preview: text.substring(0, 200),
      env: { LAW_OC: process.env.LAW_OC ? "set" : "unset", NODE_TLS: process.env.NODE_TLS_REJECT_UNAUTHORIZED }
    })
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5) : undefined,
      cause: error instanceof Error && error.cause ? String(error.cause) : undefined
    }, { status: 500 })
  }
}
