import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const mascotPath = `${root}public/mascot-wave.gif`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va_bot", {
  width: 82,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const mascot = await sharp(mascotPath)
  .resize({ height: 360, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();

await sharp(source)
  .composite([
    { input: qr, left: 444, top: 438 },
    { input: qr, left: 1024, top: 438 },
    { input: qr, left: 662, top: 1070 },
    { input: mascot, left: 814, top: 704 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
