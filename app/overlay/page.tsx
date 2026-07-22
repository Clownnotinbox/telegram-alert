import { Overlay } from "../ui/overlay";

export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <Overlay preview={params.preview !== undefined} />;
}
