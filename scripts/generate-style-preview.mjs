import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const mascotPath = `${root}public/mascot-anime.png`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va_bot", {
  width: 82,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const mascot = await sharp(mascotPath)
  .resize({ height: 248, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();

await sharp(source)
  .composite([
    { input: qr, left: 444, top: 438 },
    { input: qr, left: 1024, top: 438 },
    { input: qr, left: 1024, top: 1046 },
    { input: mascot, left: 888, top: 716 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
