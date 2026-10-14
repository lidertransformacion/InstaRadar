// Copy profile photos from a folder (<username>.jpg) into data/avatars, the only place the app serves them from.
// Usage: node scripts/import-avatars.mjs ~/Documents/Libertario/avatars-inbox
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error("Usage: node scripts/import-avatars.mjs <folder with username.jpg files>");
  process.exit(1);
}
const target = path.join(process.cwd(), "data", "avatars");
fs.mkdirSync(target, { recursive: true });

const isImage = (b) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
  (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP");

let copied = 0;
let skipped = 0;
for (const name of fs.readdirSync(source)) {
  const match = name.match(/^([a-z0-9._]{1,30})\.(jpe?g|png|webp)$/i);
  if (!match) continue;
  const bytes = fs.readFileSync(path.join(source, name));
  if (bytes.length < 32 || bytes.length > 1_500_000 || !isImage(bytes)) {
    skipped += 1;
    console.warn(`Skipped ${name}: not a valid image under 1.5 MB`);
    continue;
  }
  const file = path.join(target, `${match[1].toLowerCase()}.jpg`);
  fs.writeFileSync(`${file}.part`, bytes);
  fs.renameSync(`${file}.part`, file);
  copied += 1;
}
console.log(`Copied ${copied} photos to data/avatars (${skipped} skipped).`);
