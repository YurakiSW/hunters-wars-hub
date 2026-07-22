import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "./lib/session";

const PUBLIC_PATHS = [
  "/login", "/register",
  "/forgot-password", "/reset-password",
  "/api/auth/login", "/api/auth/register",
  "/api/auth/forgot-password", "/api/auth/reset-password",
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/monsters/sync")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  if (!userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Esclude anche i file statici dentro /public (logo.jpg e futuri): senza
  // questo, il middleware li trattava come pagine protette e rimandava al
  // login chi provava a caricarli — compresa la pagina di login stessa,
  // che ci mette dentro il logo!
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico|woff2?)$).*)"],
};
