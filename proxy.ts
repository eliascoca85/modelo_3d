import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "museo_admin_session";

// En Next 16 `middleware.ts` está deprecado y pasó a llamarse `proxy.ts` (la
// función exportada es `proxy` en vez de `middleware`). Lógica y matcher
// idénticos al middleware anterior: protege `/admin/*` exigiendo la cookie de
// sesión y redirige a /admin/login si falta o no empieza con "user:".
// Referencia: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin/")) {
    const cookie = request.cookies.get(AUTH_COOKIE);
    if (!cookie || !cookie.value.startsWith("user:")) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
