import { runtimeEnv } from "../../../../lib/runtime-env";

export async function GET() {
  const token = await runtimeEnv("BOT_TOKEN");
  if (!token) return Response.json({ ready: false }, { status: 503 });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const body = (await response.json()) as {
      ok?: boolean;
      result?: { id: number; first_name: string; username?: string };
    };
    if (!response.ok || !body.ok || !body.result?.username) {
      return Response.json({ ready: false }, { status: 502 });
    }
    return Response.json(
      { ready: true, username: body.result.username, name: body.result.first_name },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch {
    return Response.json({ ready: false }, { status: 502 });
  }
}
