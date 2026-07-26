import { Overlay } from "../ui/overlay";
import type { OverlayStyle } from "../ui/types";

const PREVIEW_STYLES = new Set<OverlayStyle>(["anime", "graphite", "paper", "mono"]);

export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const requestedStyle = Array.isArray(params.style) ? params.style[0] : params.style;
  const previewStyle = PREVIEW_STYLES.has(requestedStyle as OverlayStyle)
    ? requestedStyle as OverlayStyle
    : null;
  const requestedPhase = Array.isArray(params.phase) ? params.phase[0] : params.phase;
  const previewPhase = requestedPhase === "exit" || requestedPhase === "enter" ? requestedPhase : null;
  return (
    <Overlay
      preview={params.preview !== undefined}
      overlayKey={key ?? null}
      previewName={name?.slice(0, 80) ?? null}
      previewPhase={previewPhase}
      previewStyle={previewStyle}
    />
  );
}
