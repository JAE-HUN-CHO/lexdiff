import type { LawArticle, LawMeta } from "./law-types"
import { debugLogger } from "./debug-logger"
import { buildJO } from "./law-parser"

export function parseOrdinanceXML(xmlText: string): {
  meta: LawMeta
  articles: LawArticle[]
} {
  debugLogger.debug("자치법규 XML 파싱 시작", { length: xmlText.length })
  console.log("[v0] Parsing ordinance XML, length:", xmlText.length)
  console.log("[v0] Ordinance XML sample (first 2000 chars):", xmlText.substring(0, 2000))

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, "text/xml")

    const parserError = xmlDoc.querySelector("parsererror")
    if (parserError) {
      console.log("[v0] XML parser error:", parserError.textContent)
      throw new Error("XML 파싱 오류")
    }

    const rootElement = xmlDoc.documentElement
    console.log("[v0] Root element name:", rootElement.tagName)
    console.log("[v0] Root element children count:", rootElement.children.length)
    console.log(
      "[v0] Root element child names:",
      Array.from(rootElement.children)
        .map((c) => c.tagName)
        .join(", "),
    )

    const meta = extractOrdinanceMetadata(xmlDoc)
    const articles = extractOrdinanceArticles(xmlDoc)

    debugLogger.success("자치법규 XML 파싱 완료", { articleCount: articles.length })
    console.log("[v0] Parsed ordinance data:", { meta, articleCount: articles.length })

    return { meta, articles }
  } catch (error) {
    debugLogger.error("자치법규 XML 파싱 실패", error)
    console.log("[v0] Ordinance parsing error:", error)
    throw error
  }
}

function extractOrdinanceMetadata(xmlDoc: Document): LawMeta {
  const ordinId = xmlDoc.querySelector("자치법규ID")?.textContent || undefined
  const ordinSeq = xmlDoc.querySelector("자치법규일련번호")?.textContent || undefined
  const ordinName = xmlDoc.querySelector("자치법규명")?.textContent || ""
  const effectiveDate = xmlDoc.querySelector("시행일자")?.textContent || undefined
  const promDate = xmlDoc.querySelector("공포일자")?.textContent || undefined
  const promNum = xmlDoc.querySelector("공포번호")?.textContent || undefined
  const ordinKind = xmlDoc.querySelector("자치법규종류명")?.textContent || undefined
  const orgName = xmlDoc.querySelector("지자체기관명")?.textContent || undefined

  console.log("[v0] Extracted ordinance metadata:", {
    ordinId,
    ordinSeq,
    ordinName,
    effectiveDate,
    ordinKind,
    orgName,
  })

  return {
    lawId: ordinId,
    mst: ordinSeq,
    lawTitle: ordinName || "알 수 없는 자치법규",
    latestEffectiveDate: effectiveDate,
    promulgation: promDate || promNum ? { date: promDate, number: promNum } : undefined,
    revisionType: ordinKind,
    fetchedAt: new Date().toISOString(),
  }
}

function extractOrdinanceArticles(xmlDoc: Document): LawArticle[] {
  const articles: LawArticle[] = []

  const contentContainers = ["조문단위", "본문", "조문", "조문내용", "조문단위_본문"]
  let containerElement: Element | null = null

  for (const containerName of contentContainers) {
    const element = xmlDoc.querySelector(containerName)
    if (element) {
      console.log(`[v0] Found content container: ${containerName}`)
      containerElement = element
      break
    }
  }

  const searchRoot = containerElement || xmlDoc

  const possibleSelectors = ["조문단위 > 조문", "조문", "조문단위", "조", "조항", "Article", "조문내용"]

  let joElements: NodeListOf<Element> | null = null

  for (const selector of possibleSelectors) {
    const elements = searchRoot.querySelectorAll(selector)
    if (elements.length > 0) {
      console.log(`[v0] Found ${elements.length} articles using selector: ${selector}`)
      joElements = elements
      break
    }
  }

  if (!joElements || joElements.length === 0) {
    console.log("[v0] No articles found with any selector")
    const allElements = xmlDoc.getElementsByTagName("*")
    const elementNames = new Set<string>()
    for (let i = 0; i < Math.min(allElements.length, 50); i++) {
      elementNames.add(allElements[i].tagName)
    }
    console.log("[v0] Available element names in XML:", Array.from(elementNames).join(", "))
    return articles
  }

  joElements.forEach((joElement, index) => {
    console.log(`[v0] Processing article ${index + 1}, element name: ${joElement.tagName}`)
    console.log(
      `[v0] Article ${index + 1} children:`,
      Array.from(joElement.children)
        .map((c) => c.tagName)
        .join(", "),
    )

    const joNum =
      joElement.querySelector("조문번호, 조번호, 조문호수")?.textContent ||
      joElement.getAttribute("번호") ||
      `제${index + 1}조`

    const joTitle = joElement.querySelector("조제목, 조문제목, 제목")?.textContent?.trim() || undefined

    const joContent =
      joElement.querySelector("조내용, 조문내용, 내용, 본문")?.textContent || joElement.textContent || ""

    console.log("[v0] Processing article:", {
      joNum,
      joTitle,
      hasContent: !!joContent.trim(),
      contentLength: joContent.length,
    })

    let normalizedJo = joNum
    try {
      // buildJO는 "제1조", "1조", "제10조의2" 등을 6자리 코드로 변환
      normalizedJo = buildJO(joNum)
      console.log(`[v0] Normalized jo using buildJO: "${joNum}" → "${normalizedJo}"`)
    } catch (error) {
      // buildJO 실패 시 fallback: 숫자만 추출하여 정규화
      console.log(`[v0] buildJO failed for "${joNum}", using fallback`)
      const articleMatch = joNum.match(/(\d+)/)
      if (articleMatch) {
        const articleNum = Number.parseInt(articleMatch[1], 10)
        normalizedJo = articleNum.toString().padStart(4, "0") + "00"
      }
    }

    if (joContent.trim()) {
      articles.push({
        jo: normalizedJo,
        joNum,
        title: joTitle,
        content: joContent,
        hasChanges: false,
        paragraphs: undefined,
      })
    }
  })

  console.log("[v0] Extracted articles:", articles.length)

  return articles
}
