/**
 * Vercel 서버리스(Node.js)에서 pdfjs-dist가 요구하는 환경 설정.
 * 이 파일을 pdfjs-dist/pdf.mjs import보다 먼저 import해야 함.
 *
 * pdfjs-dist v5의 fake worker는 `await import(workerSrc)`를 시도하는데,
 * Turbopack 번들 환경에서 이 동적 import가 실패.
 * → globalThis.pdfjsWorker에 WorkerMessageHandler를 미리 주입하면
 *   import를 건너뛰고 즉시 사용.
 */

// 1. 브라우저 API polyfill
if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMMatrix = class DOMMatrix {
    m: number[] = [1, 0, 0, 1, 0, 0]
    constructor(init?: number[]) { if (init) this.m = init }
  }
}

if (typeof globalThis.Path2D === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Path2D = class Path2D {}
}

// 2. fake worker의 동적 import 우회: worker 모듈을 미리 static import
// @ts-expect-error pdfjs-dist worker has no type declarations
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).pdfjsWorker = pdfjsWorker
