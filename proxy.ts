import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/** Guard every /admin route and the authenticated APIs. Public forms and /respond stay open. */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const protectedPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (protectedPath && !req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
