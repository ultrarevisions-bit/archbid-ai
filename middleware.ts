import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  // Keep /dashboard as the real app/dashboard/page.tsx route.
  // Do not rewrite it to /workspace.
  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard",
};
