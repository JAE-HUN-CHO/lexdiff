/**
 * Vercel 서버리스(Node.js)에서 pdfjs-dist가 요구하는 브라우저 API polyfill.
 * 이 파일을 pdfjs-dist import보다 먼저 import해야 함.
 */

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
