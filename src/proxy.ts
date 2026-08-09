import { NextResponse, type NextRequest } from "next/server";

/**
 * Güvenlik başlıkları + hafif oturum koruması (Next.js 16 proxy konvansiyonu).
 * Database session kullanıldığı için yalnızca cookie varlığı kontrol edilir;
 * asıl doğrulama layout ve Server Action katmanında yapılır.
 */

const PUBLIC_PREFIXES = [
  "/giris",
  "/dogrulama",
  "/up",
  "/api/auth",
  "/api/v1",
  "/api/qstash",
  "/api/cron",
];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * Sunucu tarafı oturumu geçersiz bulduğunda /giris'e eklenen işaret
 * (bkz. src/app/(panel)/layout.tsx).
 */
const SESSION_ENDED_PARAM = "durum";
const SESSION_ENDED_VALUE = "oturum-sonlandi";

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => request.cookies.has(name));
}

/**
 * Kalıntı oturum çerezlerini siler. delete() Secure bayrağını koymadığı için
 * `__Secure-` önekli çerez tarayıcıca reddedilirdi; bu yüzden açıkça yazılır.
 */
function clearSessionCookies(response: NextResponse): NextResponse {
  for (const name of SESSION_COOKIES) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }
  return response;
}

function applySecurityHeaders(
  response: NextResponse,
  requestId: string
): NextResponse {
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Profil fotoğrafları uzak HTTPS kaynaklarından doğrudan gösterilebilir
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Request-Id", requestId);
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains"
    );
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = hasSessionCookie(request);
  const incomingRequestId = request.headers.get("x-request-id");
  const requestId =
    incomingRequestId &&
    incomingRequestId.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(incomingRequestId)
      ? incomingRequestId
      : crypto.randomUUID();

  if (pathname === "/") {
    return applySecurityHeaders(
      NextResponse.redirect(
        new URL(authed ? "/dashboard" : "/giris", request.url)
      ),
      requestId
    );
  }

  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!isPublic && !authed) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/giris", request.url)),
      requestId
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  // Layout'lar searchParams alamaz; hangi sayfanın istendiğini ayırt edebilmesi
  // için pathname aktarılır (bkz. src/app/(panel)/layout.tsx). set() istemciden
  // gelen aynı adlı başlığın üzerine yazdığı için taklit edilemez.
  requestHeaders.set("x-pathname", pathname);
  const passThrough = () =>
    applySecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      requestId
    );

  if (pathname === "/giris" && authed) {
    // Çerez var ama sunucu oturumu geçersiz bulduysa /dashboard'a geri atmak
    // /giris ↔ /dashboard sonsuz döngüsü üretir: çerezi silip girişi göster.
    if (
      request.nextUrl.searchParams.get(SESSION_ENDED_PARAM) ===
      SESSION_ENDED_VALUE
    ) {
      return clearSessionCookies(passThrough());
    }
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.url)),
      requestId
    );
  }

  return passThrough();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
