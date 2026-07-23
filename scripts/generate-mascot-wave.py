from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS_SIZE = (520, 520)
ARM_ANCHOR = (230, 320)
ARM_HEIGHT = 270
ARM_ZONE = (40, 35, 236, 326)


def largest_component(cell: Image.Image) -> Image.Image:
    """Drop small fragments that can spill across an AI-generated sheet cell."""
    alpha = cell.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    largest: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] < 32:
                continue
            seen[index] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if seen[next_index] or pixels[next_x, next_y] < 32:
                        continue
                    seen[next_index] = 1
                    queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    if not largest:
        raise ValueError("An arm-sheet cell contains no visible sprite")

    mask = Image.new("L", cell.size, 0)
    mask_pixels = mask.load()
    for x, y in largest:
        mask_pixels[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))
    clean = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    clean.paste(cell, (0, 0), mask)
    return clean


def arm_sprites(sheet: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    width, height = sheet.size
    if columns < 1 or rows < 1 or width % columns or height % rows:
        raise ValueError("The arm sprite sheet must divide evenly into the requested grid")
    cell_width, cell_height = width // columns, height // rows
    sprites: list[Image.Image] = []

    for row in range(rows):
        for column in range(columns):
            cell = largest_component(
                sheet.crop(
                    (
                        column * cell_width,
                        row * cell_height,
                        (column + 1) * cell_width,
                        (row + 1) * cell_height,
                    )
                )
            )
            bounds = cell.getchannel("A").getbbox()
            if not bounds:
                raise ValueError("An arm-sheet cell contains no opaque pixels")
            sprite = cell.crop(bounds)
            scale = ARM_HEIGHT / sprite.height
            sprites.append(
                sprite.resize(
                    (round(sprite.width * scale), ARM_HEIGHT),
                    Image.Resampling.LANCZOS,
                )
            )
    return sprites


def body_plate(source: Image.Image) -> Image.Image:
    """Keep the whole mascot fixed and clear only the palm/cuff being replaced."""
    if source.size != CANVAS_SIZE:
        raise ValueError(f"The mascot base must be {CANVAS_SIZE[0]} x {CANVAS_SIZE[1]}")

    erase = Image.new("L", source.size, 0)
    ImageDraw.Draw(erase).polygon(
        [
            (58, 45),
            (174, 45),
            (174, 133),
            (164, 160),
            (178, 188),
            (175, 210),
            (161, 220),
            (96, 220),
            (78, 194),
            (80, 162),
            (63, 128),
        ],
        fill=255,
    )
    erase = erase.filter(ImageFilter.GaussianBlur(0.75))
    plate = source.copy()
    alpha = plate.getchannel("A")
    alpha = Image.composite(Image.new("L", source.size, 0), alpha, erase)
    plate.putalpha(alpha)

    # The cuff touches the hair silhouette. Restore those exact source pixels so
    # the face and hairstyle are guaranteed not to change between wave frames.
    source_pixels = source.load()
    hair_mask = Image.new("L", source.size, 0)
    hair_pixels = hair_mask.load()
    for y in range(230):
        for x in range(145, 205):
            red, green, blue, source_alpha = source_pixels[x, y]
            if source_alpha > 0 and red < 105 and green < 125 and blue > 60:
                hair_pixels[x, y] = 255
    hair = Image.new("RGBA", source.size, (0, 0, 0, 0))
    hair.paste(source, (0, 0), hair_mask)
    plate.alpha_composite(hair)
    return plate


def compose_keyframes(base: Image.Image, sprites: list[Image.Image]) -> list[Image.Image]:
    plate = body_plate(base)
    frames: list[Image.Image] = []
    for sprite in sprites:
        frame = plate.copy()
        frame.alpha_composite(
            sprite,
            (ARM_ANCHOR[0] - sprite.width, ARM_ANCHOR[1] - sprite.height),
        )
        frames.append(frame)
    return frames


def gif_frames(frames: list[Image.Image]) -> list[Image.Image]:
    # One shared palette keeps the pixel-identical body from colour-flickering.
    palette_source = Image.new("RGB", (CANVAS_SIZE[0] * len(frames), CANVAS_SIZE[1]), (0, 0, 0))
    for index, frame in enumerate(frames):
        rgb = frame.convert("RGB")
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb.paste((0, 0, 0), mask=transparent)
        palette_source.paste(rgb, (CANVAS_SIZE[0] * index, 0))
    palette = palette_source.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    palette_values = palette.getpalette()
    if palette_values is None:
        raise ValueError("Could not build a shared GIF palette")
    # Pillow may return exactly 255 entries for a 255-colour adaptive palette;
    # pad the reserved transparent index so animated GIF saving remains valid.
    # Reserve a unique magenta entry for transparency. A duplicate black entry
    # makes Pillow remap the adaptive palette while writing multi-frame GIFs.
    palette.putpalette((palette_values + [0] * 768)[:765] + [255, 0, 255])
    shared_palette = palette.getpalette()
    if shared_palette is None or len(shared_palette) != 768:
        raise ValueError("The shared GIF palette must contain 256 RGB entries")

    prepared: list[Image.Image] = []
    for frame in frames:
        transparent = frame.getchannel("A").point(lambda alpha: 255 if alpha < 96 else 0)
        rgb = frame.convert("RGB")
        rgb.paste((0, 0, 0), mask=transparent)
        # Error-diffusion would let a changing hand alter later pixels on the
        # same scanline. No dithering guarantees the fixed body keeps exactly
        # the same palette indexes in every frame.
        indexed = rgb.quantize(palette=palette, dither=Image.Dither.NONE)
        indexed.putpalette(shared_palette)
        indexed.paste(255, mask=transparent)
        indexed.info["transparency"] = 255
        prepared.append(indexed)
    return prepared


def assert_static_body(frames: list[Image.Image]) -> None:
    reference = frames[0]
    outside_arm = Image.new("L", CANVAS_SIZE, 255)
    ImageDraw.Draw(outside_arm).rectangle(ARM_ZONE, fill=0)
    for index, frame in enumerate(frames[1:], start=1):
        difference = ImageChops.difference(reference, frame)
        protected_difference = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        protected_difference.paste(difference, (0, 0), outside_arm)
        if protected_difference.getbbox():
            raise ValueError(f"Frame {index} changes pixels outside the raised-arm zone")


def assert_static_indexed_body(frames: list[Image.Image]) -> None:
    reference = frames[0].tobytes()
    left, top, right, bottom = ARM_ZONE
    width, height = CANVAS_SIZE
    for frame_index, frame in enumerate(frames[1:], start=1):
        pixels = frame.tobytes()
        for y in range(height):
            for x in range(width):
                if left <= x < right and top <= y < bottom:
                    continue
                offset = y * width + x
                if pixels[offset] != reference[offset]:
                    raise ValueError(
                        f"Indexed frame {frame_index} changes the static body at {(x, y)}"
                    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a registered hand-wave GIF over one pixel-static mascot body"
    )
    parser.add_argument("base", type=Path, help="Immutable 520 x 520 mascot source")
    parser.add_argument("arms", type=Path, help="Chroma-removed 3 x 2 arm sprite sheet")
    parser.add_argument("still", type=Path, help="Output PNG matching the GIF rest pose")
    parser.add_argument("gif", type=Path, help="Output animated GIF")
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--rows", type=int, default=2)
    args = parser.parse_args()

    base = Image.open(args.base).convert("RGBA")
    sprites = arm_sprites(Image.open(args.arms).convert("RGBA"), args.columns, args.rows)
    if len(sprites) < 6:
        raise ValueError("The natural hand wave needs six generated arm poses")

    keyframes = compose_keyframes(base, sprites[:6])
    assert_static_body(keyframes)

    # Move across one short arc and back. Holds at both extremes create natural
    # slow-in/slow-out without cross-fading fingers or moving the body.
    sequence_indexes = (0, 5, 3, 4, 3, 5, 2, 1, 0)
    sequence = [keyframes[index] for index in sequence_indexes]
    prepared = gif_frames(sequence)
    assert_static_indexed_body(prepared)
    if prepared[0].tobytes() != prepared[-1].tobytes():
        raise ValueError("The final pose must match the first pose exactly")

    args.still.parent.mkdir(parents=True, exist_ok=True)
    args.gif.parent.mkdir(parents=True, exist_ok=True)
    prepared[0].save(
        args.gif,
        save_all=True,
        append_images=prepared[1:],
        duration=[240, 80, 70, 130, 70, 80, 130, 80, 420],
        loop=3,
        transparency=255,
        disposal=2,
        optimize=False,
        palette=prepared[0].getpalette(),
    )

    # Re-open both outputs: this catches palette/disposal mistakes before deploy.
    saved_gif = Image.open(args.gif)
    saved_gif.seek(0)
    saved_gif.convert("RGBA").save(args.still, optimize=True)
    saved_gif.seek(saved_gif.n_frames - 1)
    saved_last = saved_gif.convert("RGBA")
    saved_still = Image.open(args.still).convert("RGBA")
    if ImageChops.difference(saved_still, saved_last).getbbox():
        raise ValueError("The saved GIF would jump when it returns to the static PNG")
    print(
        f"Generated {args.gif} ({saved_gif.n_frames} frames) and {args.still}; "
        "body diff outside arm zone: 0 pixels; static transition: exact"
    )


if __name__ == "__main__":
    main()
