import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const animatedMascotPath = `${root}public/mascot-anime.png`;
const staticMascotPath = `${root}public/mascot-anime-static.png`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 82,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const animeQr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 124,
  margin: 1,
  errorCorrectionLevel: "H",
  color: { dark: "#123253", light: "#f2fbff" },
});
const animatedMascot = await sharp(animatedMascotPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ height: 365, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();
const staticMascot = await sharp(staticMascotPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ height: 365, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();

await sharp(source)
  .composite([
    { input: animatedMascot, left: 260, top: 145 },
    { input: staticMascot, left: 860, top: 145 },
    { input: animeQr, left: 95, top: 433 },
    { input: animeQr, left: 695, top: 433 },
    { input: qr, left: 1644, top: 438 },
    { input: qr, left: 744, top: 1058 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
