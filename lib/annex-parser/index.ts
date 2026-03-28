/**
 * 별표 파일 통합 파서 — kordoc + Vercel 호환 PDF 처리
 *
 * - HWPX/HWP5: kordoc 라이브러리 (순수 파싱)
 * - PDF: pdfjs-dist 직접 호출 (Vercel 서버리스에서 kordoc의
 *   createRequire(import.meta.url) + DOMMatrix가 미지원이므로)
 *   PDF 표 추출 로직은 kordoc v1.2.0과 동기화됨
 *
 * @see https://github.com/chrisryugj/kordoc
 */

import { parseHwpx, parseHwp, isHwpxFile, isOldHwpFile, isPdfFile } from "kordoc"
import type { ParseResult } from "kordoc"
// polyfill 먼저 (ES 모듈 호이스팅되므로 별도 파일로 분리)
import "./pdf-polyfill"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs"

// Node.js/Vercel: worker 비활성화 (static import 시점에 설정해야 유효)
GlobalWorkerOptions.workerSrc = ""

// ─── 타입 re-export ─────────────────────────────────

export type AnnexParseResult = ParseResult

export { isHwpxFile, isOldHwpFile, isPdfFile }

// ─── 내부 타입 ──────────────────────────────────────

interface NormItem {
  text: string
  x: number
  y: number
  w: number
  h: number
}

// ─── PDF 파서 (Vercel 호환, kordoc v1.2.0 로직 포팅) ──

async function parsePdfDirect(buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    const data = new Uint8Array(buffer)
    const doc = await getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise

    const pageCount = doc.numPages
    if (pageCount === 0) {
      return { success: false, fileType: "pdf", pageCount: 0, error: "PDF에 페이지가 없습니다." }
    }

    const pageTexts: string[] = []
    let totalChars = 0

    for (let i = 1; i <= Math.min(pageCount, 5000); i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = extractPageContent(textContent.items)
      totalChars += pageText.replace(/\s/g, "").length
      pageTexts.push(pageText)
    }

    const avgCharsPerPage = totalChars / pageCount
    if (avgCharsPerPage < 10) {
      return {
        success: false,
        fileType: "pdf",
        isImageBased: true,
        pageCount,
        error: `이미지 기반 PDF (${pageCount}페이지, 텍스트 ${totalChars}자)`,
      }
    }

    let markdown = pageTexts.filter(t => t.trim()).join("\n\n")
    markdown = cleanPdfText(markdown)

    return { success: true, fileType: "pdf", markdown, pageCount }
  } catch (err) {
    return {
      success: false,
      fileType: "pdf",
      pageCount: 0,
      error: err instanceof Error ? err.message : "PDF 파싱 실패",
    }
  }
}

// ─── 메인 엔트리 ─────────────────────────────────────

export async function parseAnnexFile(buffer: ArrayBuffer): Promise<AnnexParseResult> {
  if (isHwpxFile(buffer)) return parseHwpx(buffer)
  if (isOldHwpFile(buffer)) return parseHwp(buffer)
  if (isPdfFile(buffer)) return parsePdfDirect(buffer)
  return { success: false, fileType: "unknown", error: "지원하지 않는 파일 형식입니다." }
}

// ═══════════════════════════════════════════════════════
// 페이지 콘텐츠 추출 (열 경계 학습 기반 테이블 감지)
// kordoc v1.2.0 동기화
// ═══════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPageContent(rawItems: any[]): string {
  const items = normalizeItems(rawItems)
  if (items.length === 0) return ""

  const yLines = groupByY(items)
  const columns = detectColumns(yLines)

  if (columns && columns.length >= 3) {
    return extractWithColumns(yLines, columns)
  }

  return yLines.map(line => mergeLineSimple(line)).join("\n")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItems(rawItems: any[]): NormItem[] {
  return rawItems
    .filter((i: { str: string }) => typeof i.str === "string" && i.str.trim() !== "")
    .map((i: { str: string; transform: number[]; width: number; height: number }) => ({
      text: i.str.trim(),
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
      w: Math.round(i.width),
      h: Math.round(i.height),
    }))
    .sort((a: NormItem, b: NormItem) => b.y - a.y || a.x - b.x)
}

function groupByY(items: NormItem[]): NormItem[][] {
  if (items.length === 0) return []
  const lines: NormItem[][] = []
  let curY = items[0].y
  let curLine: NormItem[] = [items[0]]

  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].y - curY) > 3) {
      lines.push(curLine)
      curLine = []
      curY = items[i].y
    }
    curLine.push(items[i])
  }
  if (curLine.length > 0) lines.push(curLine)
  return lines
}

// ═══════════════════════════════════════════════════════
// 열 경계 감지 — 빈도 기반 x-히스토그램 클러스터링
// ═══════════════════════════════════════════════════════

function isProseSpread(items: NormItem[]): boolean {
  if (items.length < 4) return false
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w))
  }
  const maxGap = Math.max(...gaps)
  const avgLen = items.reduce((s, i) => s + i.text.length, 0) / items.length
  return maxGap < 40 && avgLen < 5
}

function detectColumns(yLines: NormItem[][]): number[] | null {
  const allItems = yLines.flat()
  if (allItems.length === 0) return null
  const pageWidth = Math.max(...allItems.map(i => i.x + i.w)) - Math.min(...allItems.map(i => i.x))
  if (pageWidth < 100) return null

  let bigoLineIdx = -1
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some(item => item.text === "비고")) {
      bigoLineIdx = i
      break
    }
  }
  const tableYLines = bigoLineIdx >= 0 ? yLines.slice(0, bigoLineIdx) : yLines

  const CLUSTER_TOL = 22
  const xClusters: { center: number; count: number; minX: number }[] = []

  for (const line of tableYLines) {
    if (isProseSpread(line)) continue
    for (const item of line) {
      let found = false
      for (const c of xClusters) {
        if (Math.abs(item.x - c.center) <= CLUSTER_TOL) {
          c.center = Math.round((c.center * c.count + item.x) / (c.count + 1))
          c.minX = Math.min(c.minX, item.x)
          c.count++
          found = true
          break
        }
      }
      if (!found) {
        xClusters.push({ center: item.x, count: 1, minX: item.x })
      }
    }
  }

  const peaks = xClusters
    .filter(c => c.count >= 3)
    .sort((a, b) => a.minX - b.minX)

  if (peaks.length < 3) return null

  const MERGE_TOL = 30
  const merged: { center: number; count: number; minX: number }[] = [peaks[0]]
  for (let i = 1; i < peaks.length; i++) {
    const prev = merged[merged.length - 1]
    if (peaks[i].minX - prev.minX < MERGE_TOL) {
      if (peaks[i].count > prev.count) {
        prev.center = peaks[i].center
      }
      prev.count += peaks[i].count
      prev.minX = Math.min(prev.minX, peaks[i].minX)
    } else {
      merged.push({ ...peaks[i] })
    }
  }

  const columns = merged.filter(c => c.count >= 3).map(c => c.minX)
  return columns.length >= 3 ? columns : null
}

function findColumn(x: number, columns: number[]): number {
  for (let i = columns.length - 1; i >= 0; i--) {
    if (x >= columns[i] - 10) return i
  }
  return 0
}

// ═══════════════════════════════════════════════════════
// 열 기반 추출 — 테이블/텍스트 영역 분리
// ═══════════════════════════════════════════════════════

function extractWithColumns(yLines: NormItem[][], columns: number[]): string {
  const result: string[] = []
  const colMin = columns[0]
  const colMax = columns[columns.length - 1]

  let bigoIdx = -1
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some(item => item.text === "비고")) {
      bigoIdx = i
      break
    }
  }

  let tableStart = -1
  for (let i = 0; i < (bigoIdx >= 0 ? bigoIdx : yLines.length); i++) {
    const usedCols = new Set(yLines[i].map(item => findColumn(item.x, columns)))
    if (usedCols.size >= 3) {
      tableStart = i
      break
    }
  }

  const tableEnd = bigoIdx >= 0 ? bigoIdx : yLines.length

  for (let i = 0; i < (tableStart >= 0 ? tableStart : tableEnd); i++) {
    result.push(mergeLineSimple(yLines[i]))
  }

  if (tableStart >= 0) {
    const tableLines = yLines.slice(tableStart, tableEnd)
    const gridLines: NormItem[][] = []
    for (const line of tableLines) {
      const inRange = line.some(item =>
        item.x >= colMin - 20 && item.x <= colMax + 200
      )
      if (inRange && !isProseSpread(line)) {
        gridLines.push(line)
      } else {
        if (gridLines.length > 0) {
          result.push(buildGridTable(gridLines.splice(0), columns))
        }
        result.push(mergeLineSimple(line))
      }
    }
    if (gridLines.length > 0) {
      result.push(buildGridTable(gridLines, columns))
    }
  }

  if (bigoIdx >= 0) {
    result.push("")
    for (let i = bigoIdx; i < yLines.length; i++) {
      result.push(mergeLineSimple(yLines[i]))
    }
  }

  return result.join("\n")
}

// ═══════════════════════════════════════════════════════
// 그리드 테이블 빌더 — y-라인을 열에 배치 후 행 병합
// ═══════════════════════════════════════════════════════

function buildGridTable(lines: NormItem[][], columns: number[]): string {
  const numCols = columns.length

  const yRows: string[][] = lines.map(items => {
    const row = Array(numCols).fill("")
    for (const item of items) {
      const col = findColumn(item.x, columns)
      row[col] = row[col] ? row[col] + " " + item.text : item.text
    }
    return row
  })

  const dataColStart = Math.max(2, Math.floor(numCols / 2))
  const merged: string[][] = []

  for (const row of yRows) {
    if (row.every(c => c === "")) continue

    if (merged.length === 0) {
      merged.push([...row])
      continue
    }

    const prev = merged[merged.length - 1]
    const filledCols = row.map((c, i) => c ? i : -1).filter(i => i >= 0)
    const filledCount = filledCols.length

    let isNewRow = false

    if (row[0] && row[0].length >= 3) {
      isNewRow = true
    }

    if (!isNewRow && numCols > 1 && row[1]) {
      isNewRow = true
    }

    if (!isNewRow) {
      const hasData = row.slice(dataColStart).some(c => c !== "")
      const prevHasData = prev.slice(dataColStart).some(c => c !== "")
      if (hasData && prevHasData) {
        isNewRow = true
      }
    }

    if (isNewRow && filledCount === 1 && row[0] && row[0].length <= 2) {
      isNewRow = false
    }

    if (isNewRow) {
      merged.push([...row])
    } else {
      for (let c = 0; c < numCols; c++) {
        if (row[c]) {
          prev[c] = prev[c] ? prev[c] + " " + row[c] : row[c]
        }
      }
    }
  }

  if (merged.length < 2) {
    return merged.map(r => r.filter(c => c).join(" ")).join("\n")
  }

  let headerEnd = 0
  for (let r = 0; r < merged.length; r++) {
    const hasDataValues = merged[r].slice(dataColStart).some(c => c && /\d/.test(c))
    if (hasDataValues) break
    headerEnd = r + 1
  }

  if (headerEnd > 1) {
    const headerRow = Array(numCols).fill("")
    for (let r = 0; r < headerEnd; r++) {
      for (let c = 0; c < numCols; c++) {
        if (merged[r][c]) {
          headerRow[c] = headerRow[c] ? headerRow[c] + " " + merged[r][c] : merged[r][c]
        }
      }
    }
    merged.splice(0, headerEnd, headerRow)
  }

  const md: string[] = []
  md.push("| " + merged[0].join(" | ") + " |")
  md.push("| " + merged[0].map(() => "---").join(" | ") + " |")
  for (let r = 1; r < merged.length; r++) {
    md.push("| " + merged[r].join(" | ") + " |")
  }
  return md.join("\n")
}

// ═══════════════════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════════════════

function mergeLineSimple(items: NormItem[]): string {
  if (items.length <= 1) return items[0]?.text || ""
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let result = sorted[0].text
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w)
    if (gap > 15) result += "\t"
    else if (gap > 3) result += " "
    result += sorted[i].text
  }
  return result
}

function cleanPdfText(text: string): string {
  return mergeKoreanLines(
    text
      .replace(/^[\s]*[-–—]\s*\d+\s*[-–—][\s]*$/gm, "")
      .replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, "")
      .replace(/^(법제처\s*국가법령정보센터)\s*$/gm, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function startsWithMarker(line: string): boolean {
  const t = line.trimStart()
  return /^[가-힣ㄱ-ㅎ][.)]/.test(t) || /^\d+[.)]/.test(t) || /^\([가-힣ㄱ-ㅎ\d]+\)/.test(t) ||
    /^[○●※▶▷◆◇■□★☆\-·]\s/.test(t) || /^제\d+[조항호장절]/.test(t)
}

function isStandaloneHeader(line: string): boolean {
  return /^제\d+[조항호장절](\([^)]*\))?(\s+\S+){0,7}$/.test(line.trim())
}

function mergeKoreanLines(text: string): string {
  if (!text) return ""
  const lines = text.split("\n")
  if (lines.length <= 1) return text
  const result: string[] = [lines[0]]

  for (let i = 1; i < lines.length; i++) {
    const prev = result[result.length - 1]
    const curr = lines[i]
    if (/[가-힣·,\-]$/.test(prev) && /^[가-힣(]/.test(curr) && !startsWithMarker(curr) && !isStandaloneHeader(prev)) {
      result[result.length - 1] = prev + " " + curr
    } else {
      result.push(curr)
    }
  }
  return result.join("\n")
}
