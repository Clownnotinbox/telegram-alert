import { runtimeEnv } from "../../../lib/runtime-env";

export async function GET() {
  const release = await runtimeEnv("RENDER_GIT_COMMIT");
  return Response.json(
    { release: release ?? "local" },
    { headers: { "cache-control": "no-store, no-cache, must-revalidate" } },
  );
}
