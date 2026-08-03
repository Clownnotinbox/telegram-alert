import { fileURLToPath } from "node:url";
import sharp from "sharp";

/* The mask «С анимацией» slides across a plate to crumble it away pixel by
   pixel.  Baking the field into one image beats computing it per frame: the
   browser only has to move a mask it already has, there is no filter chain on a
   1280 × 853 layer, and the grain is identical every time round.
   The image is 2.6 plates wide so that at either end of the slide the plate sees
   only the solid part or only the empty part of it, with the crumbling front
   parked off-screen — anything narrower would leave one edge half eaten while
   the card is just sitting there. */
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}public/noir-dissolve-mask.png`;

const WIDTH = 1300;
const HEIGHT = 333;
/* One dissolving pixel.  The mask is drawn at 2.5× the size it is used at, so
   four here land as ten on a 1280-wide plate — coarse enough to read as pixels
   rather than as film grain, fine enough not to read as tiles. */
const CELL = 4;
/* How much of the sweep the crumbling front spans.  Too narrow and the plate
   wipes like a curtain, too wide and it fades instead of crumbling. */
const BAND = 0.15;
/* The top of the plate goes a little before the bottom, so the front leans and
   the top-left corner is the first thing to leave. */
const TILT = 0.05;

/* Fixed sequence: the same grain every build, so the effect is reproducible and
   the file only changes when the numbers above do. */
let seed = 20_260_803;
const random = () => {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 4_294_967_296;
};

const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
const columns = Math.ceil(WIDTH / CELL);
const rows = Math.ceil(HEIGHT / CELL);

for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const across = (column * CELL + CELL / 2) / WIDTH;
    const down = (row * CELL + CELL / 2) / HEIGHT;
    /* Every pixel gets its own moment to go: the front is where those moments
       are spread, and the plate is solid on one side of it and gone on the other. */
    const goesAt = 0.5 + TILT * (0.5 - down) + BAND * (random() - 0.5);
    const alpha = across > goesAt ? 255 : 0;

    for (let y = row * CELL; y < Math.min((row + 1) * CELL, HEIGHT); y += 1) {
      for (let x = column * CELL; x < Math.min((column + 1) * CELL, WIDTH); x += 1) {
        pixels[(y * WIDTH + x) * 4 + 3] = alpha;
      }
    }
  }
}

const { size } = await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9, palette: true, colours: 2 })
  .toFile(output);

console.log(`noir-dissolve-mask.png  ${WIDTH} × ${HEIGHT}  ${(size / 1024).toFixed(1)} KB`);
