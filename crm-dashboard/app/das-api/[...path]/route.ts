import { dispatch } from "@/lib/server";

// The built-in DAS Engage 360 API. When DAS_API_BASE_URL is set, next.config.mjs
// proxies /das-api/* to that server first and this handler is never reached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: Request, { params }: { params: { path: string[] } }) {
  const url = new URL(req.url);
  const path = "/" + params.path.join("/").replace(/^api\/v1\/?/, "");
  const text = req.method === "GET" || req.method === "DELETE" ? "" : await req.text();
  const r = await dispatch(req.method, path.replace(/\/$/, "") || "/", url.searchParams, text, req.headers.get("authorization"), req.headers.get("cookie"));
  if (r.status === 204 || r.body === undefined) return new Response(null, { status: r.status });
  const isText = r.contentType && typeof r.body === "string";
  return new Response(isText ? (r.body as string) : JSON.stringify(r.body), {
    status: r.status,
    headers: { "Content-Type": r.contentType ?? "application/json", "Cache-Control": "no-store" },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
