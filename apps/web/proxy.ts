import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_DISABLED, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Refreshes the Supabase session cookie and keeps signed-out visitors out of /app and /admin. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!data.user && ["/app", "/admin", "/agency", "/parent"].some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    // With sign-in switched off the guest goes home, where the navbar offers the mode switch.
    url.pathname = AUTH_DISABLED ? "/" : "/login";
    url.search = AUTH_DISABLED ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
