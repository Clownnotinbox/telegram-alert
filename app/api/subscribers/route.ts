import { requireAdmin } from "../../../lib/runtime-env";
import { getInstallationByOverlayKey, recordSubscriber, subscriberSnapshot } from "../../../lib/subscribers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const afterValue = Number(url.searchParams.get("after") ?? 0);
  const after = Number.isFinite(afterValue) && afterValue > 0 ? Math.floor(afterValue) : 0;
  const overlayKey = url.searchParams.get("key");
  const installation = overlayKey ? await getInstallationByOverlayKey(overlayKey) : null;
  if (overlayKey && (!installation || !installation.active)) {
    return Response.json({ error: "Оверлей не найден или отключён" }, { status: 404 });
  }
  const snapshot = await subscriberSnapshot(after, installation?.id ?? null);
  return Response.json(snapshot, { headers: { "cache-control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Неверный ADMIN_KEY" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { name?: string; username?: string };
  const name = body.name?.trim().slice(0, 80);
  if (!name) return Response.json({ error: "Укажите имя подписчика" }, { status: 400 });
  const event = await recordSubscriber({
    eventKey: `test:${crypto.randomUUID()}`,
    id: crypto.randomUUID(),
    name,
    username: body.username?.trim().replace(/^@/, "").slice(0, 64) || null,
    avatarUrl: null,
    joinedAt: new Date().toISOString(),
    source: "test",
  });
  return Response.json({ ok: true, event });
}
