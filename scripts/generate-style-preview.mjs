import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const mascotPath = `${root}public/mascot-anime.png`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 82,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const animeQr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 92,
  margin: 1,
  errorCorrectionLevel: "H",
  color: { dark: "#123253", light: "#f2fbff" },
});
const mascot = await sharp(mascotPath)
  .resize({ height: 360, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();

await sharp(source)
  .composite([
    { input: qr, left: 1024, top: 438 },
    { input: qr, left: 444, top: 1046 },
    { input: animeQr, left: 82, top: 452 },
    { input: mascot, left: 234, top: 92 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
