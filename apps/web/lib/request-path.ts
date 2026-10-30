/**
 * Journey M2 (J2.2): the root layout's header can't see the URL, so the proxy passes the request
 * path on as a request header. It is always set from the real path, overwriting anything the client
 * sent, so a crafted header can't make a page read the journey or hide a banner.
 */
export const PATH_HEADER = "x-ug-path";

/** A copy of the request headers with `x-ug-path` set to the request's own path. */
export function withPathHeader(request: { headers: Headers; nextUrl: { pathname: string } }): Headers {
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, request.nextUrl.pathname);
  return headers;
}

/** True for /app and everything under it. */
export const isAppPath = (path: string | null | undefined): boolean => path === "/app" || Boolean(path?.startsWith("/app/"));
