/*
 * The security headers of every answer (12.5, decision A.15), set in
 * next.config.ts. Everything the pages load comes from this server:
 * next/font serves the fonts, the map's worker is in /vendor and its
 * boundaries come from /api/map. Scripts keep 'unsafe-inline' for the inline
 * boot scripts of Next.js and the view settings applied before the first
 * paint; nonces would make every page dynamic. The development server also
 * needs eval and its websocket. The conversation pages send no referrer
 * (their own metadata); elsewhere only the origin leaves the site.
 */

export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    // Ignored over plain HTTP (the laptop, the tests); Caddy serves the site over HTTPS only.
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
