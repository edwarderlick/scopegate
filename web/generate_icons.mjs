import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="120" fill="#39242c"/>
  <g transform="translate(256 256) rotate(45)">
    <rect x="-110" y="-110" width="220" height="220" fill="none" stroke="#edb8cb" stroke-width="36" rx="24"/>
    <rect x="-45" y="-45" width="90" height="90" fill="#edb8cb" rx="12"/>
    <g transform="rotate(-45)">
      <circle cx="0" cy="-10" r="16" fill="#39242c"/>
      <polygon points="-10,-5 10,-5 16,24 -16,24" fill="#39242c"/>
    </g>
  </g>
</svg>`;

const publicDir = path.join(process.cwd(), 'public');

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgString);

async function generate() {
  const buf = Buffer.from(svgString);
  await sharp(buf).resize(192, 192).toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(buf).resize(512, 512).toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(buf).resize(180, 180).toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Icons generated!');
}

generate().catch(console.error);
