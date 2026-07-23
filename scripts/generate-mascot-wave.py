from __future__ import annotations

import argparse
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops


CANVAS_SIZE = (520, 520)
GRID = (4, 3)

# The generated sheet contains twelve full-body drawings. We deliberately skip
# the clenched-hand anticipation and the two broad reaching poses, then play the
# registered shoulder/head poses on a calm arc and return to the exact first pose.
SEQUENCE = (8, 9, 7, 6, 10, 11, 0, 3, 2, 3, 0, 11, 10, 6, 7, 9, 8)
DURATIONS = (180, 80, 70, 70, 70, 70, 70, 90, 130, 90, 70, 70, 70, 70, 80, 100, 360)


def split_sheet(sheet: Image.Image) -> list[Image.Image]:
    columns, rows = GRID
    width, height = sheet.size
    frames: list[Image.Image] = []

    for row in range(rows):
        top = round(row * height / rows)
        bottom = round((row + 1) * height / rows)
        for column in range(columns):
            left = round(column * width / columns)
            right = round((column + 1) * width / columns)
            frame = sheet.crop((left, top, right, bottom)).resize(
                CANVAS_SIZE,
                Image.Resampling.LANCZOS,
            )
            if not frame.getchannel("A").getbbox():
                raise ValueError(f"Sprite-sheet cell {len(frames)} is empty")
            frames.append(frame)

    if len(frames) != 12:
        raise ValueError("The natural wave source must contain exactly twelve full-body poses")
    return frames


def lower_body_anchor(frame: Image.Image) -> float:
    """Find the waist anchor without letting the moving arm affect alignment QA."""
    alpha = frame.getchannel("A")
    pixels = alpha.load()
    weighted_x = 0
    weight = 0
    for y in range(round(frame.height * 0.70), frame.height):
        for x in range(round(frame.width * 0.22), round(frame.width * 0.78)):
            value = pixels[x, y]
            if value >= 96:
                weighted_x += x * value
                weight += value
    if not weight:
        raise ValueError("A pose has no visible lower torso for anchor validation")
    return weighted_x / weight


def register_torso(frames: list[Image.Image]) -> list[Image.Image]:
    anchors = [lower_body_anchor(frame) for frame in frames]
    target = median(anchors)
    registered: list[Image.Image] = []
    for frame, anchor in zip(frames, anchors, strict=True):
        aligned = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        aligned.alpha_composite(frame, (round(target - anchor), 0))
        registered.append(aligned)
    return registered


def validate_registration(frames: list[Image.Image]) -> float:
    anchors = [lower_body_anchor(frame) for frame in frames]
    drift = max(anchors) - min(anchors)
    if drift > 10:
        raise ValueError(f"Generated torso anchor drifts by {drift:.1f}px")

    # A whole-character wave must include secondary motion around the shoulder
    # and head; this guards against accidentally returning to a hand-only overlay.
    follow_region = (120, 55, 420, 330)
    first = frames[SEQUENCE[0]].crop(follow_region)
    peak = frames[SEQUENCE[8]].crop(follow_region)
    changed = ImageChops.difference(first, peak).convert("RGB").getbbox()
    if not changed:
        raise ValueError("The shoulder/head follow-through is missing")
    return drift


def indexed_frames(frames: list[Image.Image]) -> list[Image.Image]:
    palette_source = Image.new("RGB", (CANVAS_SIZE[0] * len(frames), CANVAS_SIZE[1]), (0, 0, 0))
    for index, frame in enumerate(frames):
        rgb = frame.convert("RGB")
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb.paste((0, 0, 0), mask=transparent)
        palette_source.paste(rgb, (CANVAS_SIZE[0] * index, 0))

    palette = palette_source.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    values = palette.getpalette()
    if values is None:
        raise ValueError("Could not build a shared GIF palette")
    palette.putpalette((values + [0] * 768)[:765] + [255, 0, 255])
    shared_palette = palette.getpalette()
    if shared_palette is None or len(shared_palette) != 768:
        raise ValueError("The GIF palette must contain 256 RGB entries")

    prepared: list[Image.Image] = []
    for frame in frames:
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb = frame.convert("RGB")
        rgb.paste((0, 0, 0), mask=transparent)
        indexed = rgb.quantize(palette=palette, dither=Image.Dither.NONE)
        indexed.putpalette(shared_palette)
        indexed.paste(255, mask=transparent)
        indexed.info["transparency"] = 255
        prepared.append(indexed)
    return prepared


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a full upper-body wave with registered shoulder and head follow-through"
    )
    parser.add_argument("base", type=Path, help="Original clean 520 x 520 mascot used by the static style")
    parser.add_argument("sheet", type=Path, help="Chroma-removed 4 x 3 full-body pose sheet")
    parser.add_argument("animated_still", type=Path, help="Rest PNG matching the first GIF frame")
    parser.add_argument("gif", type=Path, help="Animated GIF output")
    parser.add_argument("static_still", type=Path, help="Unanimated original mascot output")
    args = parser.parse_args()

    base = Image.open(args.base).convert("RGBA")
    if base.size != CANVAS_SIZE:
        raise ValueError(f"The original mascot must be {CANVAS_SIZE[0]} x {CANVAS_SIZE[1]}")

    source_frames = register_torso(split_sheet(Image.open(args.sheet).convert("RGBA")))
    drift = validate_registration(source_frames)
    sequence = [source_frames[index] for index in SEQUENCE]
    prepared = indexed_frames(sequence)
    if prepared[0].tobytes() != prepared[-1].tobytes():
        raise ValueError("The wave must finish on its exact first pose")

    for path in (args.animated_still, args.gif, args.static_still):
        path.parent.mkdir(parents=True, exist_ok=True)

    prepared[0].save(
        args.gif,
        save_all=True,
        append_images=prepared[1:],
        duration=list(DURATIONS),
        loop=3,
        transparency=255,
        disposal=2,
        optimize=False,
        palette=prepared[0].getpalette(),
    )

    saved_gif = Image.open(args.gif)
    saved_gif.seek(0)
    saved_gif.convert("RGBA").save(args.animated_still, optimize=True)
    saved_gif.seek(saved_gif.n_frames - 1)
    if ImageChops.difference(Image.open(args.animated_still).convert("RGBA"), saved_gif.convert("RGBA")).getbbox():
        raise ValueError("The saved GIF would jump when it returns to the animated still")

    base.save(args.static_still, optimize=True)
    print(
        f"Generated {args.gif} ({saved_gif.n_frames} frames), {args.animated_still}, "
        f"and {args.static_still}; torso anchor drift: {drift:.1f}px; transition: exact"
    )


if __name__ == "__main__":
    main()
