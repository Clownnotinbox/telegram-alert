import { Overlay } from "../ui/overlay";

export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  return <Overlay preview={params.preview !== undefined} overlayKey={key ?? null} />;
}
