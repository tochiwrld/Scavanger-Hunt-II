// Server-side image hygiene for every upload: checks the real format, rejects absurd dimensions
// (decompression bombs) and strips metadata such as EXIF/GPS location, camera serials and comments.
// Pixels are never re-encoded, so this is fast and lossless.

const MAX_EDGE = 8000;
const MAX_PIXELS = 40_000_000;

class BadImage extends Error {}
const bad = (m = "That image couldn't be read") => { throw new BadImage(m); };
const checkDims = (w, h) => {
  if (!w || !h) bad();
  if (w > MAX_EDGE || h > MAX_EDGE || w * h > MAX_PIXELS) bad("That image is too large");
};

function jpeg(b) {
  const out = [b.subarray(0, 2)];
  let i = 2, dims = false;
  while (i < b.length) {
    if (b[i] !== 0xff) bad();
    while (b[i] === 0xff) i++; // fill bytes
    const m = b[i];
    const start = i - 1;
    i++;
    if (m === 0xd9) { out.push(b.subarray(start, i)); break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(start, i)); continue; }
    if (i + 2 > b.length) bad();
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) bad();
    const seg = b.subarray(start, i + len);
    if (m === 0xda) { out.push(b.subarray(start)); i = b.length; break; } // scan data: copy the rest verbatim
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      checkDims((b[i + 5] << 8) | b[i + 6], (b[i + 3] << 8) | b[i + 4]);
      dims = true;
    }
    const icc = m === 0xe2 && String.fromCharCode(...b.subarray(i + 2, i + 13)) === "ICC_PROFILE";
    const keep = m === 0xe0 || m === 0xee || icc || !(m >= 0xe1 && m <= 0xef) && m !== 0xfe;
    if (keep) out.push(seg);
    i += len;
  }
  if (!dims) bad();
  return Buffer.concat(out);
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "acTL", "fcTL", "fdAT"]);
function png(b) {
  const out = [b.subarray(0, 8)];
  let i = 8, dims = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > b.length) bad();
    if (type === "IHDR") { checkDims(b.readUInt32BE(i + 8), b.readUInt32BE(i + 12)); dims = true; }
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  if (!dims) bad();
  return Buffer.concat(out);
}

function webp(b) {
  const out = [];
  let i = 12, dims = false;
  while (i + 8 <= b.length) {
    const type = b.toString("latin1", i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > b.length) bad();
    let chunk = Buffer.from(b.subarray(i, Math.min(end, b.length)));
    if (type === "VP8X") {
      chunk[8] &= ~0x0c; // clear the EXIF and XMP flags
      checkDims(1 + chunk.readUIntLE(12, 3), 1 + chunk.readUIntLE(15, 3));
      dims = true;
    } else if (type === "VP8 " && !dims) {
      checkDims(chunk.readUInt16LE(14) & 0x3fff, chunk.readUInt16LE(16) & 0x3fff); dims = true;
    } else if (type === "VP8L" && !dims) {
      const v = chunk.readUInt32LE(9);
      checkDims((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1); dims = true;
    }
    if (type !== "EXIF" && type !== "XMP ") out.push(chunk);
    i = end;
  }
  if (!dims) bad();
  const body = Buffer.concat(out);
  const head = Buffer.from("RIFF0000WEBP", "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
}

/** Returns a clean copy of the image, or throws BadImage with a user-facing message. */
export function sanitizeImage(arrayBuf, kind) {
  const b = Buffer.from(arrayBuf);
  if (kind.ext === "jpg") return jpeg(b);
  if (kind.ext === "png") return png(b);
  if (kind.ext === "webp") return webp(b);
  return bad("Images must be JPEG, PNG or WebP");
}
export { BadImage };
