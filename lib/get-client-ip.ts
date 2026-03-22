/**
 * Extract the client IP address from a request.
 *
 * Trust hierarchy (most trusted first):
 * 1. x-vercel-forwarded-for — Set by Vercel's edge, NOT user-spoofable.
 * 2. x-forwarded-for        — Standard proxy header; can be spoofed if not
 *                              behind a trusted reverse proxy.
 * 3. x-real-ip               — Nginx convention; same trust caveats.
 * 4. 127.0.0.1               — Fallback for local development.
 */
export function getClientIP(request: Request): string {
  // Vercel platform header — injected by the edge, cannot be set by clients
  const vercelIP = request.headers.get("x-vercel-forwarded-for")
  if (vercelIP) return vercelIP.split(",")[0].trim()

  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  const realIP = request.headers.get("x-real-ip")
  if (realIP) return realIP

  return "127.0.0.1"
}
