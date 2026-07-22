export async function GET() {
  return Response.json({ ok: true, service: "telegram-alert" }, { headers: { "cache-control": "no-store" } });
}
