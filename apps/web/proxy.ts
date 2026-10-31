import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { promptUrl } from "@/lib/demo-mode";
import { AUTH_DISABLED, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";
import { withPathHeader } from "@/lib/request-path";

/** Refreshes the Supabase session cookie and keeps signed-out visitors out of /app and /admin. */
export async function proxy(request: NextRequest) {
  // The header learns the path from x-ug-path, always taken from the real request (journey M2, N11).
  const forwarded = { headers: withPathHeader(request) };
  let response = NextResponse.next({ request: forwarded });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: withPathHeader(request) } });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!data.user && ["/app", "/admin", "/agency", "/parent"].some((p) => path.startsWith(p))) {
    // With sign-in switched off the guest goes home, where a banner says which mode opens the page.
    const target = AUTH_DISABLED ? promptUrl(path) : `/login?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(new URL(target, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
