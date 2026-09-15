import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap cookie check so unauthenticated requests are redirected before they
 * reach a page. The real authorisation happens in every page and action via
 * requireUser / requireAdmin — this is only here to avoid a flash of a loading
 * page for signed-out visitors.
 */
const PUBLIC_PATHS = ["/signin", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.png$).*)"],
};
