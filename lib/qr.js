// Tiny QR code maker (no package). Byte mode, error correction level M, versions 1–10 (up to 213 bytes:
// plenty for an invite link). Returns a square grid of booleans (true = dark), without the quiet zone.
// Follows ISO/IEC 18004; checked against OpenCV's QR reader.

const EC_M = [null, // [EC codewords per block, [[block count, data codewords per block], ...]]
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsEc(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
    g = ng;
  }
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift();
    rem.push(0);
    if (f) for (let j = 0; j < n; j++) rem[j] ^= mul(g[j + 1], f);
  }
  return rem;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 0;
  for (let v = 1; v <= 10; v++) {
    const cap = EC_M[v][1].reduce((s, [n, c]) => s + n * c, 0);
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) { ver = v; break; }
  }
  if (!ver) throw new Error("That link is too long for a QR code.");
  const [ecn, blocks] = EC_M[ver];
  const dataCap = blocks.reduce((s, [n, c]) => s + n * c, 0);

  // Data codewords.
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
  for (let p = 0; cw.length < dataCap; p++) cw.push(p % 2 ? 0x11 : 0xec);

  // Blocks + error correction, interleaved.
  const dB = [], eB = [];
  let k = 0;
  for (const [n, c] of blocks) for (let i = 0; i < n; i++) { const d = cw.slice(k, k + c); k += c; dB.push(d); eB.push(rsEc(d, ecn)); }
  const out = [];
  const maxD = Math.max(...dB.map((b) => b.length));
  for (let i = 0; i < maxD; i++) for (const b of dB) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const b of eB) out.push(b[i]);

  // Function patterns. m[row][col]; fn marks modules that data must skip.
  const N = 17 + 4 * ver;
  const m = Array.from({ length: N }, () => new Array(N).fill(false));
  const fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (r, c, v) => { m[r][c] = v; fn[r][c] = true; };
  const finder = (r0, c0) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const r = r0 + i, c = c0 + j;
      if (r < 0 || c < 0 || r >= N || c >= N) continue;
      const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
      set(r, c, ring !== 2 && ring !== 4);
    }
  };
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver], last = al[al.length - 1];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
  }
  const drawFormat = (mask) => {
    const data = mask; // level M = 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412;
    const b = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(i, 8, b(i));
    set(7, 8, b(6)); set(8, 8, b(7)); set(8, 7, b(8));
    for (let i = 9; i < 15; i++) set(8, 14 - i, b(i));
    for (let i = 0; i < 8; i++) set(8, N - 1 - i, b(i));
    for (let i = 8; i < 15; i++) set(N - 15 + i, 8, b(i));
    set(N - 8, 8, true); // dark module
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const on = ((v >>> i) & 1) === 1, a = N - 11 + (i % 3), b = Math.floor(i / 3);
      set(b, a, on); set(a, b, on);
    }
  }

  // Data, zigzag from the bottom right.
  let bi = 0, up = true;
  const total = out.length * 8;
  for (let c = N - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let i = 0; i < N; i++) {
      const r = up ? N - 1 - i : i;
      for (let d = 0; d < 2; d++) {
        const cc = c - d;
        if (fn[r][cc]) continue;
        m[r][cc] = bi < total && ((out[bi >> 3] >> (7 - (bi & 7))) & 1) === 1;
        bi++;
      }
    }
    up = !up;
  }

  // Pick the mask with the lowest penalty.
  const apply = (mask) => { const f = MASKS[mask]; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!fn[r][c] && f(r, c)) m[r][c] = !m[r][c]; };
  let best = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    apply(mask); drawFormat(mask);
    const s = penalty(m, N);
    if (s < bestScore) { bestScore = s; best = mask; }
    apply(mask);
  }
  apply(best); drawFormat(best);
  return m;
}

function penalty(m, N) {
  let s = 0, dark = 0;
  const line = (get) => {
    for (let a = 0; a < N; a++) {
      let run = 1;
      for (let b = 1; b <= N; b++) {
        if (b < N && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) s += run - 2; run = 1; }
      }
      for (let b = 0; b + 10 < N; b++) {
        const p = [];
        for (let k = 0; k < 11; k++) p.push(get(a, b + k) ? 1 : 0);
        const t = p.join("");
        if (t === "10111010000" || t === "00001011101") s += 40;
      }
    }
  };
  line((r, c) => m[r][c]);
  line((c, r) => m[r][c]);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (m[r][c]) dark++;
    if (r + 1 < N && c + 1 < N && m[r][c] === m[r + 1][c] && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c + 1]) s += 3;
  }
  s += Math.floor(Math.abs((dark * 20) / (N * N) - 10)) * 10;
  return s;
}

/** SVG path ("M x y h1 v1 h-1 z" per dark module), offset by the quiet zone. */
export function qrPath(m, quiet = 4) {
  let d = "";
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return d;
}
