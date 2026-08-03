import { Overlay } from "../ui/overlay";
import type { OverlayStyle } from "../ui/types";

const PREVIEW_STYLES = new Set<OverlayStyle>(["noir", "noir-wide", "noir-animated", "anime", "graphite", "paper", "mono"]);

export default async function OverlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const requestedStyle = Array.isArray(params.style) ? params.style[0] : params.style;
  const previewStyle = PREVIEW_STYLES.has(requestedStyle as OverlayStyle)
    ? requestedStyle as OverlayStyle
    : null;
  const requestedPhase = Array.isArray(params.phase) ? params.phase[0] : params.phase;
  const previewPhase = requestedPhase === "exit" || requestedPhase === "enter" ? requestedPhase : null;
  /* «С анимацией» spends most of a cycle face up, which makes checking the back
     a waiting game. ?side=back opens on it and then carries on turning. */
  const requestedSide = Array.isArray(params.side) ? params.side[0] : params.side;
  const previewSide = requestedSide === "front" || requestedSide === "back" ? requestedSide : null;
  return (
    <Overlay
      preview={params.preview !== undefined}
      overlayKey={key ?? null}
      previewName={name?.slice(0, 80) ?? null}
      previewUsername={username === undefined ? undefined : username.trim().replace(/^@/, "").slice(0, 64) || null}
      previewPhase={previewPhase}
      previewStyle={previewStyle}
      previewSide={previewSide}
    />
  );
}
