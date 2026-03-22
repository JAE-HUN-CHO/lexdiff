/**
 * Next.js Instrumentation Hook
 *
 * 법제처(law.go.kr) SSL 인증서 호환성 해결:
 * 법제처는 한국 정부 전용 CA(GPKI/SOOSAN INT)를 사용하는데,
 * Node.js 기본 CA 스토어에 포함되어 있지 않아 SELF_SIGNED_CERT_IN_CHAIN 에러 발생.
 *
 * NODE_EXTRA_CA_CERTS는 프로세스 시작 전(C++ 초기화 시점)에만 적용되므로
 * 런타임에 tls.createSecureContext를 패치하여 법제처 CA를 신뢰 목록에 추가.
 *
 * 보안: NODE_TLS_REJECT_UNAUTHORIZED='0'과 달리 인증서 검증은 유지하면서
 * 법제처 CA만 추가 신뢰 — Anthropic/Gemini/Upstash 등 타 API의 TLS 보호 유지.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const fs = await import('fs')
    const path = await import('path')
    const tls = await import('tls')

    const certPath = path.join(process.cwd(), 'certs', 'law-go-kr-chain.pem')

    if (fs.existsSync(certPath)) {
      const lawCaCert = fs.readFileSync(certPath, 'utf-8')
      const extendedCa = [...tls.rootCertificates, lawCaCert]

      // tls.createSecureContext를 패치하여 모든 TLS 연결에 법제처 CA 추가
      // (https 모듈 + undici 기반 fetch 모두 내부적으로 이 함수를 호출)
      const _origCreateSecureContext = tls.createSecureContext
      const origFn = _origCreateSecureContext
      ;(tls as any).createSecureContext = (options?: Parameters<typeof origFn>[0]) => {
        // 호출자가 명시적으로 CA를 지정한 경우 그대로 사용
        if (options?.ca) return _origCreateSecureContext(options)
        // 기본 CA + 법제처 CA로 확장
        return _origCreateSecureContext({ ...options, ca: extendedCa })
      }

      console.log('[instrumentation] 법제처 CA 신뢰 목록 추가 완료 (TLS 검증 유지)')
    } else {
      console.warn('[instrumentation] certs/law-go-kr-chain.pem 없음 — 법제처 API SSL 오류 가능')
    }
  }
}
