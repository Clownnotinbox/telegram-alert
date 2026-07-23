from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def rgba_frames(sheet: Image.Image) -> list[Image.Image]:
    width, height = sheet.size
    if width % 2 or height % 2:
        raise ValueError("The sprite sheet must contain an exact 2x2 grid")
    frame_width, frame_height = width // 2, height // 2
    boxes = [
        (0, 0, frame_width, frame_height),
        (frame_width, 0, width, frame_height),
        (0, frame_height, frame_width, height),
        (frame_width, frame_height, width, height),
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
    parser = argparse.ArgumentParser(description="Build the waving mascot GIF from a 2x2 alpha sprite sheet")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    frames = rgba_frames(Image.open(args.input).convert("RGBA"))
    sequence = [frames[index] for index in (0, 1, 2, 3, 1)]
    prepared = gif_frames(sequence)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    prepared[0].save(
        args.output,
        save_all=True,
        append_images=prepared[1:],
        duration=[130, 110, 150, 110, 130],
        loop=0,
        transparency=255,
        disposal=2,
        optimize=False,
    )


if __name__ == "__main__":
    main()
