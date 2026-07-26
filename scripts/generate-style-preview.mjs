import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const staticMascotPath = `${root}public/mascot-anime-static.png`;

const qr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 200,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const animeQr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 206,
  margin: 1,
  errorCorrectionLevel: "H",
  color: { dark: "#123253", light: "#f2fbff" },
});
const staticMascot = await sharp(staticMascotPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize({ height: 408, fit: "inside", withoutEnlargement: true })
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
      <circle cx="70" cy="70" r="42" fill="url(#ring)"/>
      <circle cx="70" cy="70" r="36" fill="#192b50" stroke="#10203d" stroke-width="4"/>
      <text x="70" y="78" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">АС</text>
      <rect x="118" y="46" width="320" height="50" rx="16" fill="#10254c" fill-opacity=".9" stroke="#8ee8ff" stroke-opacity=".24"/>
      <text x="135" y="78" fill="#fff" font-size="22" font-weight="720">Анна Смирнова</text>
    </g>
  </svg>
`);

await sharp(source)
  .composite([
    { input: staticMascot, left: 249, top: 191 },
    { input: animeForeground, left: 0, top: 0 },
    { input: animeQr, left: 84, top: 293 },
    { input: qr, left: 694, top: 298 },
    { input: qr, left: 94, top: 918 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
