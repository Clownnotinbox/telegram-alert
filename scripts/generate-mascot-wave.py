from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def rgba_frames(sheet: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    width, height = sheet.size
    if columns < 1 or rows < 1 or width % columns or height % rows:
        raise ValueError("The sprite sheet must divide evenly into the requested grid")
    frame_width, frame_height = width // columns, height // rows
    boxes = [
        (
            column * frame_width,
            row * frame_height,
            (column + 1) * frame_width,
            (row + 1) * frame_height,
        )
        for row in range(rows)
        for column in range(columns)
    ]
    return [
        sheet.crop(box).resize((520, 520), Image.Resampling.LANCZOS)
        for box in boxes
    ]


def gif_frames(frames: list[Image.Image]) -> list[Image.Image]:
    # A shared palette prevents distracting colour flicker between generated poses.
    palette_source = Image.new("RGB", (520 * len(frames), 520), (0, 0, 0))
    for index, frame in enumerate(frames):
        rgb = frame.convert("RGB")
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb.paste((0, 0, 0), mask=transparent)
        palette_source.paste(rgb, (520 * index, 0))
    palette = palette_source.quantize(colors=255, method=Image.Quantize.MEDIANCUT)

    prepared: list[Image.Image] = []
    for frame in frames:
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb = frame.convert("RGB")
        rgb.paste((0, 0, 0), mask=transparent)
        indexed = rgb.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
        indexed.paste(255, mask=transparent)
        indexed.info["transparency"] = 255
        prepared.append(indexed)
    return prepared


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the waving mascot GIF from a registered alpha sprite sheet")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--rows", type=int, default=2)
    args = parser.parse_args()

    frames = rgba_frames(Image.open(args.input).convert("RGBA"), args.columns, args.rows)
    if len(frames) < 6:
        raise ValueError("The natural wave sequence needs at least six generated poses")

    # The shoulder and elbow stay registered. The wrist moves through two small
    # arcs with longer holds at the extremes for a natural slow-in/slow-out loop.
    # The broadest generated pose is intentionally omitted to keep the gesture calm.
    sequence = [frames[index] for index in (0, 1, 2, 1, 0, 3, 5, 3, 0)]
    prepared = gif_frames(sequence)
    if prepared[0].tobytes() != prepared[-1].tobytes():
        raise ValueError("The final pose must match the static first pose exactly")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    prepared[0].save(
        args.output,
        save_all=True,
        append_images=prepared[1:],
        duration=[160, 90, 190, 90, 130, 110, 190, 140, 500],
        loop=3,
        transparency=255,
        disposal=2,
        optimize=False,
    )


if __name__ == "__main__":
    main()
