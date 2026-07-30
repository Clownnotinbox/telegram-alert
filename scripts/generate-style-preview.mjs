import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}public/style-preview.svg`;
const output = `${root}public/style-preview.png`;
const staticMascotPath = `${root}public/mascot-anime-static.png`;
const noirPortraitPath = `${root}public/noir-portrait.webp`;
const noirWidePath = `${root}public/noir-wide-source.png`;

function isFinderCell(row, column, size) {
  return (row < 7 && column < 7)
    || (row < 7 && column >= size - 7)
    || (row >= size - 7 && column < 7);
}

function styledQrSvg(value, width) {
  const symbol = QRCode.create(value, { errorCorrectionLevel: "H" });
  const margin = 2;
  const total = symbol.modules.size + margin * 2;
  const modules = [];
  for (let row = 0; row < symbol.modules.size; row += 1) {
    for (let column = 0; column < symbol.modules.size; column += 1) {
      if (symbol.modules.get(row, column) && !isFinderCell(row, column, symbol.modules.size)) {
        modules.push(`<rect x="${margin + column + 0.02}" y="${margin + row + 0.02}" width=".96" height=".96" rx=".14" fill="url(#ink)"/>`);
      }
    }
  }
  const finders = [
    [0, 0],
    [0, symbol.modules.size - 7],
    [symbol.modules.size - 7, 0],
  ].map(([row, column]) => {
    const x = margin + column;
    const y = margin + row;
    return `<g>
      <rect x="${x}" y="${y}" width="7" height="7" rx=".7" fill="url(#ink)"/>
      <rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx=".35" fill="url(#surface)"/>
      <rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".45" fill="url(#ink)"/>
    </g>`;
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${total} ${total}">
    <defs>
      <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050506"/><stop offset=".55" stop-color="#17181a"/><stop offset="1" stop-color="#292a2d"/></linearGradient>
      <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0f0ed"/><stop offset=".55" stop-color="#dedfdd"/><stop offset="1" stop-color="#c9cac9"/></linearGradient>
    </defs>
    <rect width="${total}" height="${total}" rx="2.2" fill="url(#surface)"/>
    ${modules.join("")}
    ${finders.join("")}
  </svg>`);
}

const qr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 200,
  margin: 1,
  errorCorrectionLevel: "M",
  color: { dark: "#111111", light: "#ffffff" },
});
const animeQr = await QRCode.toBuffer("https://t.me/xedat1va", {
  width: 188,
  margin: 1,
  errorCorrectionLevel: "H",
  color: { dark: "#123253", light: "#f2fbff" },
});
const noirQr = styledQrSvg("https://t.me/xedat1va", 205);
const noirPortrait = await sharp(noirPortraitPath)
  .resize(520, 520, { fit: "cover" })
  .modulate({ brightness: 0.82 })
  .linear(1.08, -8)
  .composite([{
    input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520"><rect width="520" height="520" rx="47" fill="#fff"/></svg>'),
    blend: "dest-in",
  }])
  .webp()
  .toBuffer();
const noirWide = await sharp(noirWidePath)
  .resize(520, 347, { fit: "fill" })
  .png()
  .toBuffer();
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
    <g transform="translate(640 80)" font-family="Segoe UI, Arial, sans-serif">
      <circle cx="109" cy="115" r="76" fill="url(#ring)"/>
      <circle cx="109" cy="115" r="67" fill="#192b50" stroke="#10203d" stroke-width="4"/>
      <text x="109" y="124" text-anchor="middle" fill="#fff" font-size="29" font-weight="700">АС</text>
      <rect x="227" y="35" width="253" height="66" rx="19" fill="#10254c" fill-opacity=".9" stroke="#8ee8ff" stroke-opacity=".24"/>
      <text x="245" y="79" fill="#fff" font-size="29" font-weight="720">Анна Смирнова</text>
    </g>
  </svg>
`);
const noirForeground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1880">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity=".72"/>
        <stop offset=".48" stop-color="#000" stop-opacity=".45"/>
        <stop offset=".82" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g transform="translate(40 80)" font-family="Bahnschrift Condensed, Arial Narrow, Segoe UI, sans-serif">
      <rect width="520" height="520" rx="47" fill="url(#shade)"/>
      <rect x="16" y="16" width="488" height="488" rx="36" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="1.4" filter="url(#glow)"/>
      <text x="39" y="65" fill="#fff" fill-opacity=".66" font-size="13" font-weight="650" letter-spacing="2.2">ПОСЛЕДНИЙ ПОДПИСЧИК</text>
      <text x="39" y="108" fill="#fff" font-size="40" font-weight="650" letter-spacing="1.3" filter="url(#glow)">@anna_live</text>
      <line x1="39" y1="128" x2="325" y2="128" stroke="#fff" stroke-opacity=".9" stroke-width="1.5" filter="url(#glow)"/>
      <rect x="37" y="211" width="221" height="221" rx="30" fill="#030304" fill-opacity=".86" stroke="#fff" stroke-opacity=".97" stroke-width="1.7" filter="url(#glow)"/>
    </g>
  </svg>
`);
const noirWideForeground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1880">
    <defs>
      <filter id="wideGlow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g transform="translate(640 1320)" font-family="Bahnschrift Condensed, Arial Narrow, Segoe UI, sans-serif">
      <text x="31" y="126" fill="#fff" fill-opacity=".64" font-size="12" font-weight="600" letter-spacing="2">ПОСЛЕДНИЙ ПОДПИСЧИК</text>
      <text x="31" y="159" fill="#fff" font-size="37" font-weight="650" letter-spacing="1.2" filter="url(#wideGlow)">@anna_live</text>
      <rect x="31" y="208" width="179" height="179" rx="21" fill="#030304" fill-opacity=".86" stroke="#fff" stroke-opacity=".97" stroke-width="1.7" filter="url(#wideGlow)"/>
    </g>
  </svg>
`);

await sharp(source)
  .composite([
    { input: noirPortrait, left: 40, top: 80 },
    { input: noirForeground, left: 0, top: 0 },
    { input: noirQr, left: 85, top: 299 },
    { input: animeQr, left: 684, top: 359 },
    { input: staticMascot, left: 849, top: 191 },
    { input: animeForeground, left: 0, top: 0 },
    { input: qr, left: 94, top: 918 },
    { input: qr, left: 694, top: 918 },
    { input: noirWide, left: 640, top: 1407 },
    { input: noirWideForeground, left: 0, top: 0 },
    { input: styledQrSvg("https://t.me/xedat1va", 167), left: 677, top: 1534 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Generated ${output}`);
