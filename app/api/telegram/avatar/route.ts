import { runtimeEnv } from "../../../../lib/runtime-env";
import {
  getInstallationByOverlayKey,
  installationHasSubscriber,
} from "../../../../lib/subscribers";

type PhotoSize = { file_id: string; width: number; height: number };
type TelegramResult<T> = { ok?: boolean; result?: T };

async function telegram<T>(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as TelegramResult<T>;
  return response.ok && body.ok ? body.result ?? null : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const overlayKey = url.searchParams.get("key") ?? "";
  const userId = url.searchParams.get("user") ?? "";
  if (!overlayKey || !/^\d+$/.test(userId)) return new Response(null, { status: 404 });

  const installation = await getInstallationByOverlayKey(overlayKey);
  if (!installation?.active || !(await installationHasSubscriber(installation.id, userId))) {
    return new Response(null, { status: 404 });
  }

  const token = await runtimeEnv("BOT_TOKEN");
  if (!token) return new Response(null, { status: 404 });

  const photos = await telegram<{ total_count: number; photos: PhotoSize[][] }>(token, "getUserProfilePhotos", {
    user_id: Number(userId),
    limit: 1,
  });
  const sizes = photos?.photos[0];
  if (!sizes?.length) return new Response(null, { status: 404 });

  const largest = [...sizes].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
  const file = await telegram<{ file_path?: string }>(token, "getFile", { file_id: largest.file_id });
  if (!file?.file_path) return new Response(null, { status: 404 });

  const photo = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!photo.ok) return new Response(null, { status: 404 });
  return new Response(photo.body, {
    headers: {
      "content-type": photo.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
