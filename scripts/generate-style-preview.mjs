import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const staticMascotPath = `${root}public/mascot-anime-static.png`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 82,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const animeQr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 168,
  margin: 1,
  errorCorrectionLevel: "H",
  color: { dark: "#123253", light: "#f2fbff" },
});
const staticMascot = await sharp(staticMascotPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ height: 390, fit: "inside", withoutEnlargement: true })
  .png()
  .toBuffer();
const animeForeground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1260">
    <defs>
      <linearGradient id="ring" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#64e8f1"/><stop offset=".46" stop-color="#6688e0"/>
        <stop offset=".72" stop-color="#9a62c9"/><stop offset="1" stop-color="#f0a83f"/>
      </linearGradient>
    </defs>
    <g transform="translate(40 80)" font-family="Segoe UI, Arial, sans-serif">
      <circle cx="70" cy="164" r="42" fill="url(#ring)"/>
      <circle cx="70" cy="164" r="36" fill="#192b50" stroke="#10203d" stroke-width="4"/>
      <text x="70" y="172" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">АС</text>
      <rect x="118" y="141" width="184" height="48" rx="16" fill="#10254c" fill-opacity=".9" stroke="#8ee8ff" stroke-opacity=".24"/>
      <text x="135" y="171" fill="#fff" font-size="21" font-weight="720">Анна Смирнова</text>
    </g>
  </svg>
`);

await sharp(source)
  .composite([
    { input: staticMascot, left: 252, top: 142 },
    { input: animeForeground, left: 0, top: 0 },
    { input: animeQr, left: 76, top: 392 },
    { input: qr, left: 1044, top: 438 },
    { input: qr, left: 444, top: 1058 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
