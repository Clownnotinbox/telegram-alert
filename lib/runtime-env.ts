export async function runtimeEnv(name: string) {
  const processValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (processValue) return processValue;

  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>)[name];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeTelegramWebhookSecret(value: string | undefined) {
  return value?.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

export async function requireAdmin(request: Request) {
  const expected = await runtimeEnv("ADMIN_KEY");
  if (!expected && (await runtimeEnv("NODE_ENV")) !== "production") return true;
  return Boolean(expected) && request.headers.get("x-admin-key") === expected;
}
