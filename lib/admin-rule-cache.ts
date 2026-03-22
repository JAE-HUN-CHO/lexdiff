/**
 * IndexedDB를 사용한 행정규칙 캐싱 시스템
 *
 * 2단계 캐시 구조:
 * - lawAdminRulesPurposeCache: 법령별 행정규칙 hierarchy 캐시 (법령명 기준)
 * - articleMatchIndexCache: 조문별 매칭 결과 인덱스 (법령명 + 조문번호 기준)
 * - adminRulesContentCache: 행정규칙 전체 내용 캐시 (규칙ID 기준)
 */

import type { AdminRuleMatch } from "./use-admin-rules"
import { debugLogger } from "./debug-logger"

const DB_NAME = "LexDiffCache"
const DB_VERSION = 12 // Tier 2 검색 필터링 개선 — 기존 과다 매칭 캐시 무효화
const PURPOSE_STORE = "lawAdminRulesPurposeCache" // 법령별 hierarchy 규칙 목록 캐시
const MATCH_INDEX_STORE = "articleMatchIndexCache" // 조문별 매칭 인덱스
const CONTENT_STORE = "adminRulesContentCache"
const CACHE_EXPIRY_DAYS = 7

// 법령별 행정규칙 hierarchy 캐시 (제1조 없이 이름+ID만)
interface LawAdminRulesPurposeCache {
  key: string // "${lawName}"
  lawName: string
  mst: string // 법령 버전
  timestamp: number
  rules: Array<{
    id: string
    name: string
    serialNumber?: string
  }>
}

// 조문별 매칭 결과 인덱스 (가벼움)
interface ArticleMatchIndex {
  key: string // "${lawName}_${articleNumber}"
  lawName: string
  articleNumber: string
  mst: string // 법령 버전
  timestamp: number
  matchedRuleIds: string[] // 매칭된 규칙 ID 배열 (참조)
}

interface ContentCacheEntry {
  key: string // "${ruleId}"
  timestamp: number
  title: string
  html: string
  effectiveDate?: string
}

// IndexedDB 초기화
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error

      // VersionError 발생 시 DB 삭제 후 재시도
      if (error?.name === 'VersionError') {
        debugLogger.warning('[admin-rule-cache] VersionError detected, deleting database and retrying...')
        indexedDB.deleteDatabase(DB_NAME)
      }

      reject(error)
    }

    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      // 기존 스토어 모두 삭제 (스키마 충돌 방지)
      Array.from(db.objectStoreNames).forEach((storeName) => {
        db.deleteObjectStore(storeName)
      })

      // 법령별 제1조 캐시 스토어
      const purposeStore = db.createObjectStore(PURPOSE_STORE, { keyPath: "key" })
      purposeStore.createIndex("timestamp", "timestamp", { unique: false })
      purposeStore.createIndex("lawName", "lawName", { unique: false })

      // 조문별 매칭 인덱스 스토어
      const matchIndexStore = db.createObjectStore(MATCH_INDEX_STORE, { keyPath: "key" })
      matchIndexStore.createIndex("timestamp", "timestamp", { unique: false })
      matchIndexStore.createIndex("lawName", "lawName", { unique: false })

      // 행정규칙 내용 캐시 스토어
      const contentStore = db.createObjectStore(CONTENT_STORE, { keyPath: "key" })
      contentStore.createIndex("timestamp", "timestamp", { unique: false })
    }
  })
}

// Generic IndexedDB helper to eliminate repeated open-transaction-request-close pattern
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = fn(tx.objectStore(storeName))
    request.onsuccess = () => { resolve(request.result as T | undefined) }
    request.onerror = () => { reject(request.error) }
    tx.oncomplete = () => { db.close() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// 만료된 캐시 정리
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDB()
    const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

    const cleanStore = (storeName: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite")
        const store = tx.objectStore(storeName)
        const index = store.index("timestamp")
        const range = IDBKeyRange.upperBound(expiryTime)
        const request = index.openCursor(range)

        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) {
            cursor.delete()
            cursor.continue()
          }
        }

        tx.oncomplete = () => { resolve() }
        tx.onerror = () => { reject(tx.error) }
      })

    await cleanStore(PURPOSE_STORE)
    await cleanStore(MATCH_INDEX_STORE)
    await cleanStore(CONTENT_STORE)
    db.close()
  } catch (error) {
    debugLogger.warning("[admin-rule-cache] Failed to clean expired cache:", error)
  }
}

// ========================================
// 법령별 제1조 캐시 (새로운 1단계 캐시)
// ========================================

/**
 * Optimistic UI용: MST 체크 없이 캐시 엔트리 전체 반환
 * - 페이지 새로고침 후에도 IndexedDB 캐시가 있으면 즉시 보여주기 위함
 * - 반환값: { rules, mst } 또는 null
 */
export async function getLawAdminRulesPurposeCacheOptimistic(
  lawName: string
): Promise<{ rules: LawAdminRulesPurposeCache["rules"]; mst: string } | null> {
  try {
    const entry = await withStore<LawAdminRulesPurposeCache>(
      PURPOSE_STORE, "readonly", (store) => store.get(lawName)
    )
    return entry ? { rules: entry.rules, mst: entry.mst } : null
  } catch (error: unknown) {
    debugLogger.error("[admin-rule-cache] Error reading optimistic cache:", error)
    return null
  }
}

/**
 * 법령별 전체 행정규칙의 제1조 캐시 조회 (MST 검증 포함)
 */
export async function getLawAdminRulesPurposeCache(
  lawName: string,
  currentMst: string
): Promise<LawAdminRulesPurposeCache["rules"] | null> {
  try {
    const entry = await withStore<LawAdminRulesPurposeCache>(
      PURPOSE_STORE, "readonly", (store) => store.get(lawName)
    )
    if (!entry || entry.mst !== currentMst) return null
    return entry.rules
  } catch (error: unknown) {
    debugLogger.error("[admin-rule-cache] Error reading purpose cache:", error)

    if (error instanceof DOMException && error.name === 'NotFoundError') {
      try {
        indexedDB.deleteDatabase(DB_NAME)
      } catch (deleteError) {
        debugLogger.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 법령별 전체 행정규칙의 제1조 캐시 조회 (MST 검증 없음 - Optimistic UI용)
 * - 캐시된 데이터와 MST를 함께 반환하여 호출자가 백그라운드에서 검증할 수 있게 함
 */
export async function getLawAdminRulesPurposeCacheEntry(
  lawName: string
): Promise<LawAdminRulesPurposeCache | null> {
  try {
    const entry = await withStore<LawAdminRulesPurposeCache>(
      PURPOSE_STORE, "readonly", (store) => store.get(lawName)
    )
    return entry || null
  } catch (error) {
    debugLogger.error("[admin-rule-cache] Error reading purpose cache entry:", error)
    return null
  }
}

/**
 * 법령별 전체 행정규칙의 제1조 캐시 저장
 */
export async function setLawAdminRulesPurposeCache(
  lawName: string,
  mst: string,
  rules: LawAdminRulesPurposeCache["rules"]
): Promise<void> {
  try {
    const entry: LawAdminRulesPurposeCache = {
      key: lawName,
      lawName,
      mst,
      timestamp: Date.now(),
      rules,
    }
    await withStore(PURPOSE_STORE, "readwrite", (store) => store.put(entry))
  } catch (error) {
    debugLogger.error("[admin-rule-cache] Error saving purpose cache:", error)
  }
}

// ========================================
// 조문별 매칭 인덱스 (새로운 2단계 캐시)
// ========================================

/**
 * 조문별 매칭 결과 인덱스 조회
 */
export async function getArticleMatchIndex(
  lawName: string,
  articleNumber: string,
  currentMst: string
): Promise<string[] | null> {
  try {
    const key = `${lawName}_${articleNumber}`
    const entry = await withStore<ArticleMatchIndex>(
      MATCH_INDEX_STORE, "readonly", (store) => store.get(key)
    )
    if (!entry || entry.mst !== currentMst) return null
    return entry.matchedRuleIds
  } catch (error: unknown) {
    debugLogger.error("[admin-rule-cache] Error reading match index:", error)

    if (error instanceof DOMException && error.name === 'NotFoundError') {
      try {
        indexedDB.deleteDatabase(DB_NAME)
      } catch (deleteError) {
        debugLogger.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 조문별 매칭 결과 인덱스 저장
 */
export async function setArticleMatchIndex(
  lawName: string,
  articleNumber: string,
  mst: string,
  matchedRuleIds: string[]
): Promise<void> {
  try {
    const entry: ArticleMatchIndex = {
      key: `${lawName}_${articleNumber}`,
      lawName,
      articleNumber,
      mst,
      timestamp: Date.now(),
      matchedRuleIds,
    }
    await withStore(MATCH_INDEX_STORE, "readwrite", (store) => store.put(entry))
  } catch (error) {
    debugLogger.warning('[admin-rule-cache] cache operation failed:', error)
  }
}

// ========================================
// 행정규칙 내용 캐시 (기존 유지)
// ========================================

/**
 * 행정규칙 내용 캐시 조회
 */
export async function getAdminRuleContentCache(
  ruleId: string
): Promise<{ title: string; html: string } | null> {
  try {
    const entry = await withStore<ContentCacheEntry>(
      CONTENT_STORE, "readonly", (store) => store.get(ruleId)
    )
    return entry ? { title: entry.title, html: entry.html } : null
  } catch (error: unknown) {
    debugLogger.error("[admin-rule-cache] Error reading content cache:", error)

    if (error instanceof DOMException && error.name === 'NotFoundError') {
      try {
        indexedDB.deleteDatabase(DB_NAME)
      } catch (deleteError) {
        debugLogger.error('[admin-rule-cache] Failed to delete database:', deleteError)
      }
    }

    return null
  }
}

/**
 * 행정규칙 내용 캐시 저장
 */
export async function setAdminRuleContentCache(
  ruleId: string,
  title: string,
  html: string,
  effectiveDate?: string
): Promise<void> {
  try {
    const entry: ContentCacheEntry = {
      key: ruleId,
      timestamp: Date.now(),
      title,
      html,
      effectiveDate,
    }
    await withStore(CONTENT_STORE, "readwrite", (store) => store.put(entry))
  } catch (error) {
    debugLogger.warning('[admin-rule-cache] cache operation failed:', error)
  }
}

/**
 * 개별 행정규칙 내용 캐시 삭제
 */
export async function clearAdminRuleContentCache(ruleId: string): Promise<void> {
  try {
    await withStore(CONTENT_STORE, "readwrite", (store) => store.delete(ruleId))
  } catch (error) {
    debugLogger.warning('[admin-rule-cache] cache operation failed:', error)
  }
}

/**
 * 전체 캐시 삭제 (디버깅용)
 */
export async function clearAllAdminRuleCache(): Promise<void> {
  try {
    await withStore(PURPOSE_STORE, "readwrite", (store) => store.clear())
    await withStore(MATCH_INDEX_STORE, "readwrite", (store) => store.clear())
    await withStore(CONTENT_STORE, "readwrite", (store) => store.clear())
  } catch (error) {
    debugLogger.warning('[admin-rule-cache] cache operation failed:', error)
  }
}

// 앱 시작 시 만료된 캐시 정리
if (typeof window !== "undefined") {
  try {
    cleanExpiredCache()
  } catch {
    // IndexedDB 사용 불가 시 무시
  }
}
