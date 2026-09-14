import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, landingFor, type AppRole } from "./auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Guard the console (/admin, /api/admin) for staff and the portals (/portal/*, /api/portal) for the
 * matching musician / community login. Public forms, /respond and /calendar/<token> stay open.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role as AppRole | undefined;
  const staffPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const musicianPath = pathname.startsWith("/portal/musician") || pathname.startsWith("/api/portal/musician");
  const facilityPath = pathname.startsWith("/portal/facility") || pathname.startsWith("/api/portal/facility");
  const portalPath = pathname.startsWith("/portal") || pathname.startsWith("/api/portal");

  if (!(staffPath || portalPath)) return NextResponse.next();

  if (!req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const allowed = staffPath ? role === "ADMIN" || role === "STAFF" : musicianPath ? role === "MUSICIAN" : facilityPath ? role === "FACILITY" : true;
  if (!allowed) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL(landingFor(role), req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/portal/:path*", "/api/portal/:path*"],
};
