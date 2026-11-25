import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS_DIR = path.join(ROOT, "apps/web/public/assets");

// ---------- Minimal Pure-Node RGBA Pixel Buffer + PNG Encoder ----------

type RGBA = [number, number, number, number];

function hexToRgba(hex: string, alpha = 255): RGBA {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b, alpha];
}

function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  const c = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
    Math.round(a[3] + (b[3] - a[3]) * c),
  ];
}

class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  setPixel(x: number, y: number, color: RGBA): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return;
    const idx = (iy * this.width + ix) * 4;
    const a = color[3] / 255;
    if (a >= 1) {
      this.data[idx] = color[0];
      this.data[idx + 1] = color[1];
      this.data[idx + 2] = color[2];
      this.data[idx + 3] = 255;
    } else if (a > 0) {
      const dstA = (this.data[idx + 3] ?? 0) / 255;
      const outA = a + dstA * (1 - a);
      if (outA > 0) {
        this.data[idx] = Math.round((color[0] * a + (this.data[idx] ?? 0) * dstA * (1 - a)) / outA);
        this.data[idx + 1] = Math.round((color[1] * a + (this.data[idx + 1] ?? 0) * dstA * (1 - a)) / outA);
        this.data[idx + 2] = Math.round((color[2] * a + (this.data[idx + 2] ?? 0) * dstA * (1 - a)) / outA);
        this.data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  getPixel(x: number, y: number): RGBA {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return [0, 0, 0, 0];
    const idx = (iy * this.width + ix) * 4;
    return [this.data[idx] ?? 0, this.data[idx + 1] ?? 0, this.data[idx + 2] ?? 0, this.data[idx + 3] ?? 0];
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGBA): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setPixel(x + dx, y + dy, color);
      }
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, color: RGBA, thickness = 1): void {
    this.fillRect(x, y, w, thickness, color);
    this.fillRect(x, y + h - thickness, w, thickness, color);
    this.fillRect(x, y, thickness, h, color);
    this.fillRect(x + w - thickness, y, thickness, h, color);
  }

  fillCircle(cx: number, cy: number, r: number, color: RGBA): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.setPixel(x, y, color);
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: RGBA): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.setPixel(x, y, color);
      }
    }
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: RGBA): void {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / area;
        const w1 = ((x2 - x1) * (y - y1) - (x - x1) * (y2 - y1)) / area;
        const w2 = ((x0 - x2) * (y - y2) - (x - x2) * (y0 - y2)) / area;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.setPixel(x, y, color);
      }
    }
  }

  fillVerticalGradient(top: RGBA, bottom: RGBA, bandSteps = 0): void {
    for (let y = 0; y < this.height; y++) {
      let t = y / Math.max(1, this.height - 1);
      if (bandSteps > 0) t = Math.floor(t * bandSteps) / bandSteps;
      const col = lerpColor(top, bottom, t);
      for (let x = 0; x < this.width; x++) {
        this.setPixel(x, y, col);
      }
    }
  }

  addPixelOutline(outlineColor: RGBA = [18, 20, 30, 255]): void {
    const copy = new Uint8Array(this.data);
    const isOpaque = (x: number, y: number): boolean => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
      return (copy[(y * this.width + x) * 4 + 3] ?? 0) > 40;
    };
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!isOpaque(x, y)) {
          if (isOpaque(x - 1, y) || isOpaque(x + 1, y) || isOpaque(x, y - 1) || isOpaque(x, y + 1)) {
            this.setPixel(x, y, outlineColor);
          }
        }
      }
    }
  }

  blit(src: PixelCanvas, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const px = src.getPixel(x, y);
        if (px[3] > 0) this.setPixel(dx + x, dy + y, px);
      }
    }
  }

  scaleNearest(factor: number): PixelCanvas {
    const out = new PixelCanvas(this.width * factor, this.height * factor);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const px = this.getPixel(x, y);
        if (px[3] > 0) out.fillRect(x * factor, y * factor, factor, factor, px);
      }
    }
    return out;
  }

  crop(sx: number, sy: number, sw: number, sh: number): PixelCanvas {
    const out = new PixelCanvas(sw, sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        out.setPixel(x, y, this.getPixel(sx + x, sy + y));
      }
    }
    return out;
  }

  downsampleNearest(targetW: number, targetH: number): PixelCanvas {
    const out = new PixelCanvas(targetW, targetH);
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const sx = Math.floor((x / targetW) * this.width);
        const sy = Math.floor((y / targetH) * this.height);
        out.setPixel(x, y, this.getPixel(sx, sy));
      }
    }
    return out;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(canvas: PixelCanvas): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = canvas.width * 4 + 1;
  const raw = Buffer.alloc(rowBytes * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    raw[y * rowBytes] = 0; // filter None
    const srcStart = y * canvas.width * 4;
    raw.set(canvas.data.subarray(srcStart, srcStart + canvas.width * 4), y * rowBytes + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function savePng(relPath: string, canvas: PixelCanvas): void {
  const abs = path.join(ASSETS_DIR, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, encodePng(canvas));
}

function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1. GENERATE ALL 15 DISTINCT BIRD SKINS (36x28 per frame x 3 frames) ----------

type BirdStyleId =
  | "classic-sparrow"
  | "bluebird"
  | "green-parrot"
  | "pigeon"
  | "duck"
  | "penguin"
  | "owl"
  | "robot-bird"
  | "skeleton-bird"
  | "ninja-bird"
  | "ghost-bird"
  | "phoenix"
  | "crystal-bird"
  | "golden-bird"
  | "cosmic-dragon";

function drawBirdFrame(id: BirdStyleId, wingFrame: 0 | 1 | 2): PixelCanvas {
  const c = new PixelCanvas(36, 28);
  const wy = wingFrame === 0 ? -4 : wingFrame === 1 ? 0 : 4;
  const dark: RGBA = [22, 20, 28, 255];
  const white: RGBA = [255, 255, 255, 255];

  if (id === "classic-sparrow") {
    const body = hexToRgba("#c98542");
    const belly = hexToRgba("#f6e7cb");
    const wing = hexToRgba("#8f5629");
    const beak = hexToRgba("#f59e0b");
    // Tail feathers
    c.fillTriangle(3, 12, 10, 14, 5, 19, wing);
    // Body & belly
    c.fillEllipse(18, 15, 9, 7, body);
    c.fillEllipse(19, 18, 7, 4, belly);
    // Crown tuft
    c.fillRect(15, 6, 4, 3, wing);
    // Beak
    c.fillTriangle(26, 12, 33, 15, 26, 17, beak);
    // Eye
    c.fillRect(21, 10, 4, 4, white);
    c.fillRect(23, 11, 2, 2, dark);
    // Wing
    c.fillEllipse(15, 15 + wy, 6, 3.2, wing);
    c.fillRect(13, 14 + wy, 4, 1, belly);
    c.addPixelOutline(dark);
  } else if (id === "bluebird") {
    const body = hexToRgba("#2589e6");
    const lightBlue = hexToRgba("#60b8ff");
    const breast = hexToRgba("#f48c42");
    const beak = hexToRgba("#fbbf24");
    // Sleek forked tail
    c.fillTriangle(2, 10, 11, 14, 4, 16, body);
    c.fillTriangle(3, 17, 11, 16, 5, 20, hexToRgba("#1d4ed8"));
    // Body
    c.fillEllipse(18, 15, 9, 6.5, body);
    c.fillEllipse(21, 18, 5, 3.5, breast);
    // Swept head crest
    c.fillTriangle(13, 8, 18, 4, 21, 9, lightBlue);
    // Pointed beak
    c.fillTriangle(26, 12, 34, 14, 26, 16, beak);
    // Eye
    c.fillRect(21, 10, 4, 4, white);
    c.fillRect(23, 11, 2, 2, dark);
    // Swept Wing
    c.fillEllipse(15, 14 + wy, 6.5, 3, lightBlue);
    c.addPixelOutline(dark);
  } else if (id === "green-parrot") {
    const green = hexToRgba("#22c55e");
    const darkGreen = hexToRgba("#15803d");
    const red = hexToRgba("#ef4444");
    const yellow = hexToRgba("#facc15");
    const ivory = hexToRgba("#fef3c7");
    // Long vibrant macaw tail
    c.fillRect(1, 14, 9, 3, red);
    c.fillRect(2, 17, 8, 2, yellow);
    // Tall parrot body
    c.fillEllipse(17, 15, 8.5, 7.5, green);
    // Red & yellow head crest
    c.fillRect(15, 5, 3, 4, red);
    c.fillRect(18, 6, 3, 3, yellow);
    // Hooked macaw beak
    c.fillRect(25, 11, 5, 4, ivory);
    c.fillRect(28, 14, 3, 4, hexToRgba("#d97706"));
    // White face patch + eye
    c.fillCircle(22, 12, 3, white);
    c.fillRect(22, 11, 2, 2, dark);
    // Wing with red/yellow tip
    c.fillEllipse(14, 15 + wy, 6, 3.5, darkGreen);
    c.fillRect(10, 15 + wy, 4, 2, yellow);
    c.addPixelOutline(dark);
  } else if (id === "pigeon") {
    const grey = hexToRgba("#94a3b8");
    const darkGrey = hexToRgba("#475569");
    const teal = hexToRgba("#14b8a6");
    const purple = hexToRgba("#a855f7");
    const pinkBeak = hexToRgba("#f472b6");
    // Tail
    c.fillRect(3, 14, 7, 5, darkGrey);
    // Plump pigeon body
    c.fillEllipse(17, 16, 9, 7, grey);
    c.fillCircle(22, 11, 5, grey);
    // Iridescent neck band
    c.fillRect(18, 13, 7, 2, teal);
    c.fillRect(18, 15, 6, 1, purple);
    // Small beak + cere
    c.fillRect(26, 10, 2, 2, white);
    c.fillTriangle(27, 11, 32, 13, 27, 14, pinkBeak);
    // Orange pigeon eye
    c.fillRect(22, 9, 3, 3, hexToRgba("#fb923c"));
    c.fillRect(23, 10, 1, 1, dark);
    // Wing with two dark bars
    c.fillEllipse(15, 16 + wy, 6, 3.5, grey);
    c.fillRect(12, 15 + wy, 6, 1, darkGrey);
    c.fillRect(12, 17 + wy, 6, 1, darkGrey);
    c.addPixelOutline(dark);
  } else if (id === "duck") {
    const mallard = hexToRgba("#15803d");
    const brown = hexToRgba("#92400e");
    const cream = hexToRgba("#e7e5e4");
    const orange = hexToRgba("#f59e0b");
    // Upturned duck tail
    c.fillTriangle(3, 12, 10, 15, 6, 19, brown);
    // Plump floating body
    c.fillEllipse(16, 17, 9, 6, cream);
    c.fillEllipse(18, 17, 6, 5, brown);
    // Glossy green head + white collar
    c.fillCircle(23, 11, 5, mallard);
    c.fillRect(19, 14, 6, 2, white);
    // Wide flat orange duck bill
    c.fillRect(27, 11, 7, 3, orange);
    c.fillRect(28, 10, 5, 1, hexToRgba("#fbbf24"));
    // Eye
    c.fillRect(23, 9, 3, 3, white);
    c.fillRect(24, 10, 2, 2, dark);
    // Wing
    c.fillEllipse(14, 16 + wy, 6, 3, hexToRgba("#78350f"));
    c.fillRect(12, 16 + wy, 3, 2, hexToRgba("#2563eb"));
    c.addPixelOutline(dark);
  } else if (id === "penguin") {
    const navy = hexToRgba("#1e293b");
    const snow = hexToRgba("#f8fafc");
    const orange = hexToRgba("#fb923c");
    // Round chubby tuxedo penguin
    c.fillEllipse(17, 15, 9, 8.5, navy);
    c.fillEllipse(19, 17, 6, 6, snow);
    // Rosy cheek & yellow crown stripe
    c.fillRect(21, 13, 2, 2, hexToRgba("#fda4af"));
    // Cute triangular beak
    c.fillTriangle(25, 11, 32, 13, 25, 15, orange);
    // Little webbed feet dangling below
    c.fillRect(13, 22, 4, 2, orange);
    c.fillRect(19, 22, 4, 2, orange);
    // Eye
    c.fillRect(21, 9, 4, 4, snow);
    c.fillRect(23, 10, 2, 2, dark);
    // Flipper wing
    c.fillEllipse(14, 16 + wy, 6, 2.5, hexToRgba("#334155"));
    c.addPixelOutline(dark);
  } else if (id === "owl") {
    const brown = hexToRgba("#78492a");
    const tan = hexToRgba("#d6a574");
    const gold = hexToRgba("#fbbf24");
    const darkBrown = hexToRgba("#4a2b17");
    // Horned ear tufts
    c.fillTriangle(12, 10, 13, 4, 17, 9, darkBrown);
    c.fillTriangle(20, 9, 24, 4, 25, 10, darkBrown);
    // Round owl body
    c.fillEllipse(18, 16, 9, 8, brown);
    // Speckled tan breast
    c.fillEllipse(19, 18, 6, 5, tan);
    c.fillRect(16, 17, 2, 1, darkBrown);
    c.fillRect(20, 19, 2, 1, darkBrown);
    c.fillRect(17, 21, 2, 1, darkBrown);
    // Huge golden owl eyes
    c.fillCircle(20, 12, 3, gold);
    c.fillCircle(25, 12, 2.5, gold);
    c.fillRect(20, 11, 2, 2, dark);
    c.fillRect(25, 11, 1, 2, dark);
    // Short hooked beak
    c.fillTriangle(23, 14, 27, 15, 23, 17, hexToRgba("#f59e0b"));
    // Wide feathered wing
    c.fillEllipse(12, 16 + wy, 6.5, 4, darkBrown);
    c.addPixelOutline(dark);
  } else if (id === "robot-bird") {
    const steel = hexToRgba("#94a3b8");
    const darkSteel = hexToRgba("#475569");
    const lightSteel = hexToRgba("#cbd5e1");
    const cyan = hexToRgba("#22d3ee");
    const flame = hexToRgba("#f97316");
    // Antenna
    c.fillRect(17, 3, 2, 5, darkSteel);
    c.fillRect(16, 2, 4, 2, cyan);
    // Exhaust booster tail + flame
    c.fillRect(4, 13, 5, 5, darkSteel);
    c.fillRect(1, 14, 3, 3, wingFrame === 1 ? hexToRgba("#fde047") : flame);
    // Boxy chamfered robot torso
    c.fillRect(9, 8, 17, 14, steel);
    c.fillRect(10, 9, 15, 3, lightSteel);
    c.fillRect(10, 19, 15, 2, darkSteel);
    // Glowing cyan visor
    c.fillRect(20, 10, 7, 4, cyan);
    c.fillRect(22, 11, 4, 1, white);
    // Metallic beak
    c.fillTriangle(26, 13, 33, 15, 26, 18, darkSteel);
    // Mechanical articulated wing + thruster spark
    c.fillRect(11, 13 + wy, 9, 4, darkSteel);
    c.fillRect(12, 14 + wy, 7, 2, lightSteel);
    c.fillRect(11, 17 + wy, 3, 2, cyan);
    c.addPixelOutline(dark);
  } else if (id === "skeleton-bird") {
    const bone = hexToRgba("#f5f5f4");
    const shade = hexToRgba("#a8a29e");
    const glow = hexToRgba("#4ade80");
    // Spine tail
    c.fillRect(4, 15, 6, 2, bone);
    c.fillRect(6, 13, 2, 5, shade);
    // Ribcage torso (hollow gaps between ribs!)
    c.fillRect(10, 12, 10, 2, bone);
    c.fillRect(10, 15, 9, 2, bone);
    c.fillRect(11, 18, 8, 2, bone);
    c.fillRect(10, 12, 2, 9, shade);
    // Skull head
    c.fillCircle(23, 12, 5.5, bone);
    // Hollow glowing eye socket
    c.fillRect(22, 10, 4, 4, dark);
    c.fillRect(23, 11, 2, 2, glow);
    // Bony beak
    c.fillTriangle(28, 11, 34, 14, 28, 16, shade);
    // Skeletal phalange wing
    c.fillRect(11, 13 + wy, 8, 2, bone);
    c.fillRect(9, 15 + wy, 6, 1, bone);
    c.fillRect(12, 16 + wy, 5, 1, shade);
    c.addPixelOutline(dark);
  } else if (id === "ninja-bird") {
    const suit = hexToRgba("#1f2937");
    const darkSuit = hexToRgba("#111827");
    const crimson = hexToRgba("#dc2626");
    const skin = hexToRgba("#fde68a");
    // Flowing red shinobi headband tails
    c.fillRect(1, 9 + (wingFrame === 0 ? 1 : 0), 9, 2, crimson);
    c.fillRect(3, 12 + (wingFrame === 2 ? -1 : 0), 7, 2, hexToRgba("#991b1b"));
    // Body in dark stealth hood
    c.fillEllipse(18, 15, 9, 7, suit);
    // Crimson headband wrapped around forehead
    c.fillRect(10, 9, 16, 3, crimson);
    // Mask eye slit + determined eyes
    c.fillRect(19, 12, 8, 3, skin);
    c.fillRect(21, 12, 2, 2, dark);
    c.fillRect(25, 12, 2, 2, dark);
    // Metallic kunai-style beak
    c.fillTriangle(27, 13, 33, 15, 27, 17, hexToRgba("#cbd5e1"));
    // Stealth wing with silver shuriken trim
    c.fillEllipse(14, 15 + wy, 6, 3.2, darkSuit);
    c.fillRect(13, 14 + wy, 2, 2, hexToRgba("#e2e8f0"));
    c.addPixelOutline([8, 10, 16, 255]);
  } else if (id === "ghost-bird") {
    const ecto: RGBA = [207, 250, 254, 220];
    const glow: RGBA = [103, 232, 249, 200];
    const core: RGBA = [255, 255, 255, 240];
    // Wispy ghost tail tendrils
    c.fillRect(2, 13, 8, 3, glow);
    c.fillRect(4, 17, 7, 2, glow);
    c.fillRect(1, 15, 4, 2, [165, 243, 252, 150]);
    // Ethereal body
    c.fillEllipse(18, 15, 9, 7.5, ecto);
    c.fillEllipse(19, 14, 6, 5, core);
    // Hollow spectral eyes & subtle glow
    c.fillRect(21, 11, 3, 4, hexToRgba("#083344"));
    c.fillRect(22, 12, 1, 2, hexToRgba("#22d3ee"));
    // Ghostly beak
    c.fillTriangle(27, 13, 32, 15, 27, 17, glow);
    // Translucent phantom wing
    c.fillEllipse(14, 15 + wy, 6.5, 3.5, glow);
    c.addPixelOutline(hexToRgba("#0e7490", 230));
  } else if (id === "phoenix") {
    const crimson = hexToRgba("#dc2626");
    const orange = hexToRgba("#f97316");
    const gold = hexToRgba("#fde047");
    // Flowing solar fire tail plumes
    c.fillTriangle(1, 11, 11, 15, 2, 18, orange);
    c.fillTriangle(2, 15, 10, 17, 3, 21, gold);
    // Radiant flame crown
    c.fillTriangle(14, 9, 17, 2, 20, 9, gold);
    c.fillTriangle(18, 9, 21, 4, 23, 9, orange);
    // Body
    c.fillEllipse(18, 15, 8.5, 7, crimson);
    c.fillEllipse(20, 17, 6, 4, orange);
    // Golden beak & fiery eye
    c.fillTriangle(26, 12, 34, 14, 26, 17, gold);
    c.fillRect(21, 10, 4, 4, gold);
    c.fillRect(23, 11, 2, 2, dark);
    // Molten wing with flaming gold edge
    c.fillEllipse(14, 15 + wy, 7, 3.5, orange);
    c.fillRect(10, 14 + wy, 6, 2, gold);
    c.addPixelOutline(hexToRgba("#450a0a"));
  } else if (id === "crystal-bird") {
    const cyan = hexToRgba("#38bdf8");
    const sapphire = hexToRgba("#0284c7");
    const amethyst = hexToRgba("#e879f9");
    const ice = hexToRgba("#e0f2fe");
    // Sharp prism tail shards
    c.fillTriangle(2, 12, 10, 15, 4, 19, amethyst);
    // Geometric diamond faceted body
    c.fillTriangle(10, 15, 18, 7, 27, 15, cyan);
    c.fillTriangle(10, 15, 18, 23, 27, 15, sapphire);
    c.fillTriangle(18, 7, 23, 15, 18, 15, ice);
    c.fillTriangle(13, 15, 18, 22, 23, 15, amethyst);
    // Crystal crest shard
    c.fillTriangle(16, 8, 19, 3, 22, 8, ice);
    // Faceted beak
    c.fillTriangle(26, 13, 34, 15, 26, 17, ice);
    // Glowing diamond eye
    c.fillRect(21, 11, 3, 3, white);
    c.fillRect(22, 12, 1, 1, hexToRgba("#701a75"));
    // Crystalline wing shard
    c.fillTriangle(9, 15 + wy, 17, 11 + wy, 20, 16 + wy, ice);
    c.fillTriangle(10, 15 + wy, 17, 18 + wy, 20, 16 + wy, amethyst);
    c.addPixelOutline(hexToRgba("#0c4a6e"));
  } else if (id === "golden-bird") {
    const gold = hexToRgba("#f59e0b");
    const brightGold = hexToRgba("#fef08a");
    const deepGold = hexToRgba("#b45309");
    const ruby = hexToRgba("#ef4444");
    // Ornate tail
    c.fillTriangle(3, 12, 10, 15, 4, 19, deepGold);
    c.fillRect(4, 14, 5, 2, brightGold);
    // Gilded body
    c.fillEllipse(18, 16, 9, 7, gold);
    c.fillEllipse(19, 13, 6, 3, brightGold);
    // Royal crown with ruby gem
    c.fillRect(15, 5, 9, 4, brightGold);
    c.fillRect(15, 3, 2, 2, gold);
    c.fillRect(19, 2, 2, 3, gold);
    c.fillRect(22, 3, 2, 2, gold);
    c.fillRect(19, 6, 2, 2, ruby);
    // Gleaming beak & eye
    c.fillTriangle(26, 13, 33, 15, 26, 18, hexToRgba("#fbbf24"));
    c.fillRect(21, 11, 4, 4, white);
    c.fillRect(23, 12, 2, 2, dark);
    // Shimmering wing
    c.fillEllipse(14, 16 + wy, 6.5, 3.5, deepGold);
    c.fillRect(11, 15 + wy, 6, 2, brightGold);
    c.addPixelOutline(hexToRgba("#451a03"));
  } else if (id === "cosmic-dragon") {
    const indigo = hexToRgba("#312e81");
    const violet = hexToRgba("#6366f1");
    const nebula = hexToRgba("#f472b6");
    const star = hexToRgba("#fef08a");
    const cyan = hexToRgba("#22d3ee");
    // Forked dragon tail with star tip
    c.fillRect(2, 16, 8, 3, indigo);
    c.fillTriangle(1, 14, 5, 17, 1, 20, nebula);
    // Serpentine dragon body & snout
    c.fillEllipse(16, 16, 8, 6.5, indigo);
    c.fillEllipse(24, 13, 6, 5, violet);
    // Curved celestial horns
    c.fillTriangle(18, 9, 14, 3, 21, 7, star);
    c.fillTriangle(22, 9, 19, 4, 24, 8, cyan);
    // Dragon snout + fang
    c.fillRect(28, 12, 6, 4, violet);
    c.fillRect(32, 16, 1, 2, white);
    // Glowing starlight eye
    c.fillRect(24, 10, 4, 3, star);
    c.fillRect(26, 11, 2, 2, hexToRgba("#be185d"));
    // Nebula star freckles
    c.setPixel(14, 14, star);
    c.setPixel(18, 18, cyan);
    c.setPixel(21, 15, nebula);
    // Bat-like starlight dragon wing
    c.fillTriangle(9, 14 + wy, 17, 9 + wy, 20, 17 + wy, nebula);
    c.fillTriangle(11, 15 + wy, 17, 12 + wy, 19, 17 + wy, indigo);
    c.setPixel(14, 14 + wy, star);
    c.addPixelOutline(hexToRgba("#0f0a29"));
  }

  return c;
}

function generateAllBirds(): void {
  const birdIds: BirdStyleId[] = [
    "classic-sparrow",
    "bluebird",
    "green-parrot",
    "pigeon",
    "duck",
    "penguin",
    "owl",
    "robot-bird",
    "skeleton-bird",
    "ninja-bird",
    "ghost-bird",
    "phoenix",
    "crystal-bird",
    "golden-bird",
    "cosmic-dragon",
  ];

  for (const id of birdIds) {
    const sheet = new PixelCanvas(108, 28);
    const f0 = drawBirdFrame(id, 0);
    const f1 = drawBirdFrame(id, 1);
    const f2 = drawBirdFrame(id, 2);
    sheet.blit(f0, 0, 0);
    sheet.blit(f1, 36, 0);
    sheet.blit(f2, 72, 0);
    savePng(`birds/${id}.png`, sheet);
    savePng(`birds/${id}-preview.png`, f1.scaleNearest(2));
  }
}

// ---------- 2. GENERATE ALL 12 UNLOCKABLE SCENES ----------

interface SceneArtSpec {
  slug: string;
  skyTop: string;
  skyBottom: string;
  farColor: string;
  farAccent: string;
  midColor: string;
  midAccent: string;
  groundTop: string;
  groundBase: string;
  groundStripe: string;
  pipeBody: string;
  pipeLight: string;
  pipeDark: string;
  pipeTrim: string;
  motif:
    | "meadow"
    | "valley"
    | "city"
    | "desert"
    | "forest"
    | "snow"
    | "garden"
    | "underwater"
    | "haunted"
    | "cyberpunk"
    | "space"
    | "volcanic";
}

const SCENE_SPECS: SceneArtSpec[] = [
  { slug: "sunny-meadow", skyTop: "#38a3f1", skyBottom: "#c5ecff", farColor: "#78c850", farAccent: "#ffffff", midColor: "#4da63f", midAccent: "#8ce26b", groundTop: "#64c943", groundBase: "#c79a5b", groundStripe: "#a97c44", pipeBody: "#3fa34d", pipeLight: "#80e27e", pipeDark: "#246a2f", pipeTrim: "#194d22", motif: "meadow" },
  { slug: "sunset-valley", skyTop: "#4b1d52", skyBottom: "#ff8c42", farColor: "#a4454f", farAccent: "#ffd166", midColor: "#7a2e3a", midAccent: "#f4a261", groundTop: "#c85a32", groundBase: "#7f3622", groundStripe: "#5c2416", pipeBody: "#b85d38", pipeLight: "#f4a261", pipeDark: "#71321c", pipeTrim: "#4a1f10", motif: "valley" },
  { slug: "midnight-city", skyTop: "#090f24", skyBottom: "#1d2d50", farColor: "#16213e", farAccent: "#fde047", midColor: "#0f172a", midAccent: "#38bdf8", groundTop: "#475569", groundBase: "#1e293b", groundStripe: "#334155", pipeBody: "#475569", pipeLight: "#94a3b8", pipeDark: "#1e293b", pipeTrim: "#fbbf24", motif: "city" },
  { slug: "desert-ruins", skyTop: "#c2690a", skyBottom: "#fde68a", farColor: "#d99b43", farAccent: "#fef3c7", midColor: "#b57a2e", midAccent: "#e9c46a", groundTop: "#e6be70", groundBase: "#ba853e", groundStripe: "#9a6a2a", pipeBody: "#b88948", pipeLight: "#ecd091", pipeDark: "#7a5524", pipeTrim: "#573915", motif: "desert" },
  { slug: "rainy-forest", skyTop: "#142c29", skyBottom: "#466e64", farColor: "#22463f", farAccent: "#93c5fd", midColor: "#17322c", midAccent: "#3f6a5c", groundTop: "#3c6e3b", groundBase: "#3d2c1e", groundStripe: "#2c1f14", pipeBody: "#5c4028", pipeLight: "#8a6642", pipeDark: "#382415", pipeTrim: "#4e8a42", motif: "forest" },
  { slug: "snowy-mountains", skyTop: "#2c5282", skyBottom: "#bee3f8", farColor: "#6384a6", farAccent: "#ffffff", midColor: "#4a6b8a", midAccent: "#e2f1ff", groundTop: "#f1f5f9", groundBase: "#94a3b8", groundStripe: "#cbd5e1", pipeBody: "#5d89b0", pipeLight: "#bae6fd", pipeDark: "#335473", pipeTrim: "#e0f2fe", motif: "snow" },
  { slug: "japanese-garden", skyTop: "#e685aa", skyBottom: "#ffeedd", farColor: "#8b6f8e", farAccent: "#fff5f7", midColor: "#5c4a63", midAccent: "#f9a8d4", groundTop: "#6d9654", groundBase: "#8c7a6b", groundStripe: "#6e5f52", pipeBody: "#b91c1c", pipeLight: "#ef4444", pipeDark: "#7f1d1d", pipeTrim: "#1f2937", motif: "garden" },
  { slug: "underwater-world", skyTop: "#023959", skyBottom: "#0c8599", farColor: "#0b5d73", farAccent: "#67e8f9", midColor: "#084457", midAccent: "#20c997", groundTop: "#e3c584", groundBase: "#b59252", groundStripe: "#96743b", pipeBody: "#d94862", pipeLight: "#ff8787", pipeDark: "#8f2239", pipeTrim: "#2dd4bf", motif: "underwater" },
  { slug: "haunted-cemetery", skyTop: "#140e24", skyBottom: "#382954", farColor: "#241b38", farAccent: "#fef08a", midColor: "#1b1429", midAccent: "#4ade80", groundTop: "#3a4a3c", groundBase: "#24262b", groundStripe: "#181a1f", pipeBody: "#4b5563", pipeLight: "#9ca3af", pipeDark: "#1f2937", pipeTrim: "#4ade80", motif: "haunted" },
  { slug: "cyberpunk-city", skyTop: "#0a021c", skyBottom: "#3a0ca3", farColor: "#1d0940", farAccent: "#f72585", midColor: "#100626", midAccent: "#00f5d4", groundTop: "#240046", groundBase: "#10002b", groundStripe: "#00f5d4", pipeBody: "#1e293b", pipeLight: "#00f5d4", pipeDark: "#0f172a", pipeTrim: "#f72585", motif: "cyberpunk" },
  { slug: "outer-space", skyTop: "#03050f", skyBottom: "#14183d", farColor: "#1e1b4b", farAccent: "#f472b6", midColor: "#172554", midAccent: "#38bdf8", groundTop: "#94a3b8", groundBase: "#475569", groundStripe: "#64748b", pipeBody: "#475569", pipeLight: "#94a3b8", pipeDark: "#1e293b", pipeTrim: "#38bdf8", motif: "space" },
  { slug: "volcanic-kingdom", skyTop: "#1a0505", skyBottom: "#8a1c14", farColor: "#3d1111", farAccent: "#fb923c", midColor: "#260b0b", midAccent: "#f97316", groundTop: "#3b3230", groundBase: "#1c1917", groundStripe: "#f97316", pipeBody: "#292524", pipeLight: "#57534e", pipeDark: "#0c0a09", pipeTrim: "#fb923c", motif: "volcanic" },
];

function drawPillarTexture(
  bodyHex: string,
  lightHex: string,
  darkHex: string,
  trimHex: string,
  pattern: "classic" | "bricks" | "neon" | "bamboo" | "marble" | "volcanic" | "gold"
): PixelCanvas {
  const c = new PixelCanvas(56, 256);
  const body = hexToRgba(bodyHex);
  const light = hexToRgba(lightHex);
  const dark = hexToRgba(darkHex);
  const trim = hexToRgba(trimHex);
  const outline: RGBA = [16, 16, 24, 255];

  // Shaft (x: 4..51, y: 24..255)
  c.fillRect(4, 24, 48, 232, body);
  c.fillRect(8, 24, 8, 232, light);
  c.fillRect(40, 24, 10, 232, dark);
  c.fillRect(4, 24, 2, 232, outline);
  c.fillRect(50, 24, 2, 232, outline);

  if (pattern === "bricks") {
    for (let y = 32; y < 252; y += 18) {
      c.fillRect(6, y, 44, 2, dark);
      const offset = (y / 18) % 2 === 0 ? 18 : 30;
      c.fillRect(offset, y, 2, 18, dark);
    }
  } else if (pattern === "neon") {
    c.fillRect(10, 24, 3, 232, trim);
    c.fillRect(43, 24, 3, 232, light);
    for (let y = 40; y < 250; y += 28) {
      c.fillRect(8, y, 40, 3, trim);
    }
  } else if (pattern === "bamboo") {
    for (let y = 48; y < 252; y += 36) {
      c.fillRect(4, y, 48, 4, dark);
      c.fillRect(6, y + 4, 44, 2, light);
    }
  } else if (pattern === "marble") {
    for (const x of [14, 24, 34, 42]) {
      c.fillRect(x, 26, 3, 228, dark);
      c.fillRect(x + 3, 26, 2, 228, light);
    }
  } else if (pattern === "volcanic") {
    for (let y = 36; y < 248; y += 32) {
      c.fillRect(12 + ((y * 7) % 20), y, 14, 3, trim);
      c.fillRect(20 + ((y * 3) % 14), y + 3, 4, 10, trim);
    }
  } else if (pattern === "gold") {
    c.fillRect(14, 24, 4, 232, [255, 255, 255, 160]);
    for (let y = 36; y < 248; y += 26) {
      c.fillRect(8, y, 40, 4, trim);
      c.fillRect(24, y - 2, 8, 8, trim);
    }
  } else {
    // Classic arcade metallic bands
    c.fillRect(18, 24, 3, 232, [255, 255, 255, 70]);
    for (let y = 44; y < 248; y += 44) {
      c.fillRect(8, y, 4, 4, trim);
      c.fillRect(44, y, 4, 4, trim);
    }
  }

  // Cap lip at top (y: 0..26, full 56px width)
  c.fillRect(0, 0, 56, 26, body);
  c.fillRect(4, 2, 10, 22, light);
  c.fillRect(42, 2, 12, 22, dark);
  c.fillRect(2, 20, 52, 4, trim);
  c.strokeRect(0, 0, 56, 26, outline, 2);

  return c;
}

function drawGroundTile(topHex: string, baseHex: string, stripeHex: string, style: string): PixelCanvas {
  const c = new PixelCanvas(400, 80);
  const top = hexToRgba(topHex);
  const base = hexToRgba(baseHex);
  const stripe = hexToRgba(stripeHex);
  const outline: RGBA = [20, 18, 28, 255];

  c.fillRect(0, 0, 400, 80, base);
  c.fillRect(0, 0, 400, 16, top);
  c.fillRect(0, 0, 400, 3, outline);
  c.fillRect(0, 16, 400, 3, outline);

  if (style === "arcade-checker") {
    for (let y = 20; y < 80; y += 16) {
      for (let x = 0; x < 400; x += 16) {
        if (((x / 16) + (y / 16)) % 2 === 0) {
          c.fillRect(x, y, 16, 16, stripe);
        }
      }
    }
    c.fillRect(0, 6, 400, 4, hexToRgba("#00f5d4"));
  } else if (style === "cobblestone") {
    for (let y = 20; y < 80; y += 15) {
      const shift = ((y - 20) / 15) % 2 === 0 ? 0 : 12;
      for (let x = -12; x < 400; x += 24) {
        c.fillRect(x + shift, y, 22, 13, stripe);
        c.strokeRect(x + shift, y, 22, 13, outline, 1);
      }
    }
  } else {
    // Diagonal repeating chevron turf / pixel ground blocks (seamless at 400px!)
    for (let x = 0; x < 400; x += 20) {
      c.fillTriangle(x, 3, x + 10, 3, x + 4, 15, [255, 255, 255, 55]);
      c.fillRect(x, 22, 16, 12, stripe);
      c.fillRect(x + 8, 40, 14, 14, stripe);
      c.fillRect(x + 2, 60, 16, 14, stripe);
    }
  }

  return c;
}

function generateAllScenes(): void {
  for (let i = 0; i < SCENE_SPECS.length; i++) {
    const s = SCENE_SPECS[i]!;
    const rand = seededRand(1000 + i * 97);

    // 1. Sky backdrop (400x520)
    const sky = new PixelCanvas(400, 520);
    sky.fillVerticalGradient(hexToRgba(s.skyTop), hexToRgba(s.skyBottom), 18);

    // Celestial bodies / sky details
    if (s.motif === "meadow" || s.motif === "desert") {
      sky.fillCircle(318, 86, 26, hexToRgba("#fef08a"));
      sky.fillCircle(318, 86, 20, hexToRgba("#ffffff", 180));
    } else if (s.motif === "valley" || s.motif === "garden") {
      sky.fillCircle(200, 290, 58, hexToRgba("#fde68a", 210));
      sky.fillCircle(200, 290, 44, hexToRgba("#fff7ed", 200));
    } else if (s.motif === "city" || s.motif === "haunted") {
      sky.fillCircle(310, 82, 24, hexToRgba("#fef9c3"));
      if (s.motif === "city") sky.fillCircle(320, 76, 20, hexToRgba(s.skyTop));
      for (let st = 0; st < 45; st++) {
        sky.fillRect(Math.floor(rand() * 396), Math.floor(rand() * 240), 2, 2, [255, 255, 255, 190]);
      }
    } else if (s.motif === "space") {
      for (let st = 0; st < 110; st++) {
        const sz = rand() > 0.85 ? 3 : 2;
        const col = rand() > 0.7 ? hexToRgba("#93c5fd") : rand() > 0.5 ? hexToRgba("#f9a8d4") : [255, 255, 255, 230] as RGBA;
        sky.fillRect(Math.floor(rand() * 396), Math.floor(rand() * 480), sz, sz, col);
      }
      // Nebula band
      sky.fillEllipse(120, 180, 130, 48, [168, 85, 247, 50]);
      sky.fillEllipse(280, 130, 110, 38, [56, 189, 248, 45]);
    } else if (s.motif === "underwater") {
      // Sunbeams through ocean surface
      for (let r = 0; r < 6; r++) {
        const bx = 40 + r * 68;
        sky.fillTriangle(bx, 0, bx + 28, 0, bx - 40, 420, [186, 230, 253, 35]);
      }
    } else if (s.motif === "cyberpunk") {
      // Retrowave striped sun
      for (let y = 110; y < 230; y += 6) {
        const dy = y - 170;
        const halfW = Math.sqrt(Math.max(0, 60 * 60 - dy * dy));
        sky.fillRect(200 - halfW, y, halfW * 2, 4, hexToRgba("#f72585", 190));
      }
    }

    // 2. Far Parallax Layer (400x520 seamless horizontal wrap)
    const far = new PixelCanvas(400, 520);
    const farCol = hexToRgba(s.farColor);
    const farAcc = hexToRgba(s.farAccent);

    if (s.motif === "meadow") {
      // Puffy pixel clouds + distant rolling hills
      for (const cx of [50, 175, 310]) {
        far.fillEllipse(cx, 110 + (cx % 35), 34, 14, farAcc);
        far.fillEllipse(cx - 16, 114 + (cx % 35), 20, 12, farAcc);
        far.fillEllipse(cx + 18, 114 + (cx % 35), 22, 12, farAcc);
      }
      for (let x = 0; x < 400; x++) {
        const h = Math.round(90 + Math.sin((x / 400) * Math.PI * 4) * 28);
        far.fillRect(x, 520 - h, 1, h, farCol);
      }
    } else if (s.motif === "valley") {
      // Stepped canyon mesas
      far.fillRect(0, 390, 400, 130, farCol);
      far.fillRect(20, 320, 90, 70, farCol);
      far.fillRect(150, 290, 110, 100, farCol);
      far.fillRect(295, 335, 85, 55, farCol);
      far.fillRect(20, 320, 90, 6, farAcc);
      far.fillRect(150, 290, 110, 6, farAcc);
    } else if (s.motif === "city" || s.motif === "cyberpunk") {
      const heights = [180, 240, 150, 290, 210, 260, 170, 230, 190, 250];
      for (let b = 0; b < 10; b++) {
        const bx = b * 40;
        const bh = heights[b]!;
        far.fillRect(bx + 2, 520 - bh, 36, bh, farCol);
        for (let wy = 520 - bh + 12; wy < 500; wy += 16) {
          for (let wx = bx + 7; wx < bx + 33; wx += 9) {
            if (rand() > 0.35) far.fillRect(wx, wy, 4, 6, farAcc);
          }
        }
      }
    } else if (s.motif === "desert") {
      // Distant pyramids
      far.fillTriangle(30, 450, 110, 320, 190, 450, farCol);
      far.fillTriangle(110, 320, 190, 450, 145, 450, hexToRgba("#a87028"));
      far.fillTriangle(210, 460, 310, 295, 400, 460, farCol);
      far.fillRect(0, 445, 400, 75, farCol);
    } else if (s.motif === "snow") {
      // Jagged snow-capped peaks
      const peaks = [
        [0, 160],
        [100, 250],
        [220, 200],
        [320, 240],
      ];
      for (const [px, ph] of peaks) {
        far.fillTriangle(px! - 70, 520, px! + 40, 520 - ph!, px! + 150, 520, farCol);
        far.fillTriangle(px! + 4, 520 - ph! + 55, px! + 40, 520 - ph!, px! + 76, 520 - ph! + 55, farAcc);
      }
    } else if (s.motif === "garden") {
      // Mount Fuji silhouette + snow cap
      far.fillTriangle(40, 520, 200, 250, 360, 520, farCol);
      far.fillTriangle(155, 326, 200, 250, 245, 326, farAcc);
      far.fillRect(0, 440, 400, 80, farCol);
    } else if (s.motif === "space") {
      // Ringed gas giant planet
      far.fillCircle(280, 190, 46, hexToRgba("#6366f1"));
      far.fillEllipse(280, 182, 44, 8, hexToRgba("#818cf8", 160));
      far.fillEllipse(280, 202, 42, 6, hexToRgba("#4338ca", 180));
      // Tilted ring
      for (let x = -78; x <= 78; x++) {
        const y = Math.round(x * 0.22);
        if (Math.abs(x) > 44 || y > 8) {
          far.fillRect(280 + x, 192 + y, 2, 5, farAcc);
        }
      }
      // Small moon
      far.fillCircle(85, 130, 18, hexToRgba("#cbd5e1"));
    } else if (s.motif === "volcanic") {
      // Smoking caldera peaks
      far.fillTriangle(-20, 520, 100, 265, 220, 520, farCol);
      far.fillTriangle(170, 520, 300, 240, 420, 520, farCol);
      far.fillRect(88, 265, 24, 10, farAcc);
      far.fillRect(288, 240, 24, 12, farAcc);
    } else {
      // Forest / Underwater / Haunted rolling silhouettes
      for (let x = 0; x < 400; x++) {
        const h = Math.round(115 + Math.sin((x / 400) * Math.PI * 6) * 32 + Math.cos((x / 400) * Math.PI * 2) * 20);
        far.fillRect(x, 520 - h, 1, h, farCol);
      }
    }

    // 3. Mid Parallax Layer (400x520 seamless)
    const mid = new PixelCanvas(400, 520);
    const midCol = hexToRgba(s.midColor);
    const midAcc = hexToRgba(s.midAccent);

    if (s.motif === "meadow" || s.motif === "forest") {
      for (let x = 0; x < 400; x += 40) {
        const h = 75 + ((x * 13) % 45);
        if (s.motif === "forest") {
          mid.fillTriangle(x, 520, x + 20, 520 - h - 55, x + 40, 520, midCol);
          mid.fillTriangle(x + 4, 520 - 30, x + 20, 520 - h - 30, x + 36, 520 - 30, midAcc);
        } else {
          mid.fillCircle(x + 20, 495, 28 + (x % 15), midCol);
          mid.fillCircle(x + 20, 488, 16, midAcc);
        }
      }
    } else if (s.motif === "garden") {
      // Pagoda silhouette + cherry trees
      mid.fillRect(260, 385, 60, 135, midCol);
      for (let roof = 0; roof < 3; roof++) {
        const ry = 460 - roof * 34;
        mid.fillTriangle(242, ry, 290, ry - 20, 338, ry, midCol);
      }
      for (const tx of [60, 150, 370]) {
        mid.fillRect(tx - 4, 460, 8, 60, midCol);
        mid.fillCircle(tx, 450, 26, midAcc);
      }
    } else if (s.motif === "underwater") {
      // Swaying pixel kelp & coral arches
      for (let x = 20; x < 400; x += 50) {
        for (let y = 390; y < 520; y += 8) {
          const sx = Math.round(Math.sin(y * 0.08 + x) * 5);
          mid.fillRect(x + sx, y, 6, 8, midAcc);
        }
        mid.fillCircle(x + 25, 505, 18, midCol);
      }
    } else if (s.motif === "haunted") {
      // Tombstones & dead gnarled trees
      for (const gx of [35, 115, 225, 315]) {
        mid.fillRect(gx, 470, 24, 50, midCol);
        mid.fillCircle(gx + 12, 470, 12, midCol);
        mid.fillRect(gx + 10, 475, 4, 18, midAcc);
        mid.fillRect(gx + 6, 480, 12, 4, midAcc);
      }
    } else if (s.motif === "city" || s.motif === "cyberpunk") {
      for (let x = 0; x < 400; x += 50) {
        const bh = 90 + ((x * 7) % 80);
        mid.fillRect(x + 4, 520 - bh, 42, bh, midCol);
        mid.fillRect(x + 4, 520 - bh, 42, 4, midAcc);
      }
    } else if (s.motif === "space") {
      // Floating pixel asteroids
      for (const [ax, ay, ar] of [
        [60, 370, 16],
        [185, 420, 22],
        [330, 355, 14],
      ]) {
        mid.fillCircle(ax!, ay!, ar!, midCol);
        mid.fillCircle(ax! - 4, ay! - 4, Math.floor(ar! / 3), midAcc);
      }
    } else {
      for (let x = 0; x < 400; x++) {
        const h = Math.round(62 + Math.sin((x / 400) * Math.PI * 8) * 18);
        mid.fillRect(x, 520 - h, 1, h, midCol);
      }
    }

    // 4. Seamless Ground Tile (400x80)
    const ground = drawGroundTile(s.groundTop, s.groundBase, s.groundStripe, s.motif);

    // 5. Scene Obstacle Pillar (56x256)
    const pipePattern =
      s.motif === "cyberpunk" || s.motif === "space"
        ? "neon"
        : s.motif === "desert" || s.motif === "valley"
          ? "bricks"
          : s.motif === "volcanic"
            ? "volcanic"
            : s.motif === "garden"
              ? "bamboo"
              : "classic";
    const obstacle = drawPillarTexture(s.pipeBody, s.pipeLight, s.pipeDark, s.pipeTrim, pipePattern);

    // 6. Composite Preview Thumbnail (200x120)
    const composite = new PixelCanvas(400, 240);
    composite.blit(sky.crop(0, 140, 400, 240), 0, 0);
    composite.blit(far.crop(0, 280, 400, 240), 0, 0);
    composite.blit(mid.crop(0, 280, 400, 240), 0, 0);
    composite.blit(obstacle.crop(0, 0, 56, 90), 280, 110);
    composite.blit(ground.crop(0, 0, 400, 48), 0, 192);
    const preview = composite.downsampleNearest(200, 120);

    savePng(`scenes/${s.slug}-sky.png`, sky);
    savePng(`scenes/${s.slug}-far.png`, far);
    savePng(`scenes/${s.slug}-mid.png`, mid);
    savePng(`scenes/${s.slug}-ground.png`, ground);
    savePng(`scenes/${s.slug}-obstacle.png`, obstacle);
    savePng(`scenes/${s.slug}-preview.png`, preview);
  }
}

// ---------- 3. GENERATE EXTRA COSMETICS (OBSTACLES, GROUNDS, EFFECTS, AVATARS, FRAMES, PWA ICONS) ----------

function generateExtraCosmetics(): void {
  // Obstacle Skins
  savePng("obstacles/scene-default.png", drawPillarTexture("#3fa34d", "#80e27e", "#246a2f", "#194d22", "classic").crop(0, 0, 56, 128));
  savePng("obstacles/jade-bamboo.png", drawPillarTexture("#15803d", "#4ade80", "#14532d", "#bbf7d0", "bamboo"));
  savePng("obstacles/ancient-marble.png", drawPillarTexture("#cbd5e1", "#f8fafc", "#64748b", "#94a3b8", "marble"));
  savePng("obstacles/neon-conduit.png", drawPillarTexture("#1e1b4b", "#22d3ee", "#0f172a", "#f72585", "neon"));
  savePng("obstacles/royal-gold.png", drawPillarTexture("#f59e0b", "#fef08a", "#b45309", "#dc2626", "gold"));

  // Ground Textures
  savePng("grounds/scene-default.png", drawGroundTile("#64c943", "#c79a5b", "#a97c44", "meadow").crop(0, 0, 200, 80));
  savePng("grounds/arcade-checker.png", drawGroundTile("#1e1b4b", "#0f172a", "#312e81", "arcade-checker"));
  savePng("grounds/cobblestone.png", drawGroundTile("#4d7c0f", "#64748b", "#94a3b8", "cobblestone"));
  savePng("grounds/magma-crust.png", drawGroundTile("#f97316", "#1c1917", "#dc2626", "volcanic"));

  // Effect Previews (96x48)
  const effectSpecs: Array<{ file: string; bg: string; colors: string[]; shape: "dots" | "ring" | "burst" | "shatter" }> = [
    { file: "effects/trail-classic.png", bg: "#1e293b", colors: ["#ffffff", "#cbd5e1"], shape: "dots" },
    { file: "effects/trail-feathers.png", bg: "#3b2314", colors: ["#fef3c7", "#fbbf24", "#fb923c"], shape: "dots" },
    { file: "effects/trail-frost.png", bg: "#0c4a6e", colors: ["#e0f2fe", "#7dd3fc", "#38bdf8"], shape: "burst" },
    { file: "effects/trail-embers.png", bg: "#450a0a", colors: ["#fef08a", "#fb923c", "#ef4444"], shape: "dots" },
    { file: "effects/trail-rainbow.png", bg: "#18181b", colors: ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"], shape: "dots" },
    { file: "effects/trail-starlight.png", bg: "#1e1b4b", colors: ["#fef08a", "#c4b5fd", "#ffffff"], shape: "burst" },
    { file: "effects/flap-classic.png", bg: "#1e3a5f", colors: ["#ffffff", "#93c5fd"], shape: "ring" },
    { file: "effects/flap-sonic-ring.png", bg: "#083344", colors: ["#22d3ee", "#67e8f9"], shape: "ring" },
    { file: "effects/flap-star-burst.png", bg: "#422006", colors: ["#fbbf24", "#fef08a"], shape: "burst" },
    { file: "effects/flap-lightning.png", bg: "#172554", colors: ["#67e8f9", "#ffffff"], shape: "shatter" },
    { file: "effects/gameover-classic.png", bg: "#27272a", colors: ["#ffffff", "#fbbf24"], shape: "shatter" },
    { file: "effects/gameover-pixel-shatter.png", bg: "#0f172a", colors: ["#38bdf8", "#818cf8"], shape: "shatter" },
    { file: "effects/gameover-ghost-ascend.png", bg: "#1e1b4b", colors: ["#a7f3d0", "#67e8f9"], shape: "ring" },
    { file: "effects/gameover-supernova.png", bg: "#451a03", colors: ["#f59e0b", "#fde047", "#ef4444"], shape: "burst" },
  ];

  for (const ef of effectSpecs) {
    const c = new PixelCanvas(96, 48);
    c.fillRect(0, 0, 96, 48, hexToRgba(ef.bg));
    c.strokeRect(0, 0, 96, 48, [16, 16, 24, 255], 2);
    if (ef.shape === "dots") {
      for (let i = 0; i < 8; i++) {
        const col = hexToRgba(ef.colors[i % ef.colors.length]!);
        const r = Math.max(2, 6 - Math.floor(i / 2));
        c.fillCircle(80 - i * 9, 24 + Math.round(Math.sin(i) * 6), r, col);
      }
    } else if (ef.shape === "ring") {
      const col = hexToRgba(ef.colors[0]!);
      c.fillCircle(48, 24, 16, col);
      c.fillCircle(48, 24, 12, hexToRgba(ef.bg));
      c.fillCircle(48, 24, 7, hexToRgba(ef.colors[1] ?? ef.colors[0]!));
    } else if (ef.shape === "burst") {
      for (let i = 0; i < 6; i++) {
        const col = hexToRgba(ef.colors[i % ef.colors.length]!);
        const px = 18 + i * 12;
        const py = 14 + ((i * 11) % 20);
        c.fillRect(px - 4, py, 9, 3, col);
        c.fillRect(px, py - 4, 3, 9, col);
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const col = hexToRgba(ef.colors[i % ef.colors.length]!);
        c.fillRect(14 + ((i * 19) % 66), 8 + ((i * 13) % 30), 6, 6, col);
      }
    }
    savePng(ef.file, c);
  }

  // Avatars (64x64 pixel portraits built from crisp bird portraits)
  const avatarSpecs: Array<{ file: string; bird: BirdStyleId; bgTop: string; bgBottom: string; goggles?: boolean }> = [
    { file: "avatars/avatar-sparrow-pilot.png", bird: "classic-sparrow", bgTop: "#1e3a8a", bgBottom: "#3b82f6" },
    { file: "avatars/avatar-cyber-bot.png", bird: "robot-bird", bgTop: "#0f172a", bgBottom: "#0e7490" },
    { file: "avatars/avatar-ninja-crest.png", bird: "ninja-bird", bgTop: "#450a0a", bgBottom: "#991b1b" },
    { file: "avatars/avatar-phoenix-crown.png", bird: "phoenix", bgTop: "#7c2d12", bgBottom: "#f97316" },
    { file: "avatars/avatar-cosmic-dragon.png", bird: "cosmic-dragon", bgTop: "#1e1b4b", bgBottom: "#7e22ce" },
    { file: "avatars/avatar-ace-goggles.png", bird: "golden-bird", bgTop: "#172554", bgBottom: "#1d4ed8", goggles: true },
  ];

  for (const av of avatarSpecs) {
    const c = new PixelCanvas(64, 64);
    c.fillVerticalGradient(hexToRgba(av.bgTop), hexToRgba(av.bgBottom), 8);
    const birdScaled = drawBirdFrame(av.bird, 1).scaleNearest(2);
    c.blit(birdScaled.crop(4, 0, 64, 56), 0, 6);
    if (av.goggles) {
      c.fillRect(30, 22, 16, 8, hexToRgba("#22d3ee"));
      c.strokeRect(30, 22, 16, 8, hexToRgba("#f59e0b"), 2);
    }
    c.strokeRect(0, 0, 64, 64, [16, 16, 24, 255], 3);
    savePng(av.file, c);
  }

  // Profile Frames (64x64)
  const frameSpecs: Array<{ file: string; outer: string; inner: string; corner: string }> = [
    { file: "frames/frame-classic-brass.png", outer: "#b45309", inner: "#f59e0b", corner: "#fef08a" },
    { file: "frames/frame-silver-wing.png", outer: "#64748b", inner: "#cbd5e1", corner: "#ffffff" },
    { file: "frames/frame-neon-circuit.png", outer: "#0891b2", inner: "#22d3ee", corner: "#f72585" },
    { file: "frames/frame-royal-gold.png", outer: "#92400e", inner: "#fbbf24", corner: "#ef4444" },
    { file: "frames/frame-cosmic-void.png", outer: "#4c1d95", inner: "#a855f7", corner: "#38bdf8" },
  ];

  for (const fr of frameSpecs) {
    const c = new PixelCanvas(64, 64);
    c.strokeRect(0, 0, 64, 64, hexToRgba(fr.outer), 6);
    c.strokeRect(4, 4, 56, 56, hexToRgba(fr.inner), 3);
    for (const [x, y] of [
      [0, 0],
      [54, 0],
      [0, 54],
      [54, 54],
    ]) {
      c.fillRect(x!, y!, 10, 10, hexToRgba(fr.corner));
      c.strokeRect(x!, y!, 10, 10, [16, 16, 24, 255], 2);
    }
    savePng(fr.file, c);
  }

  // PWA App Icons (192x192, 512x512, 64x64 favicon)
  const iconBase = new PixelCanvas(48, 48);
  iconBase.fillVerticalGradient(hexToRgba("#1d4ed8"), hexToRgba("#38bdf8"), 8);
  iconBase.fillRect(0, 38, 48, 10, hexToRgba("#4da63f"));
  iconBase.fillRect(0, 38, 48, 2, [16, 16, 24, 255]);
  iconBase.blit(drawBirdFrame("golden-bird", 0), 6, 8);
  iconBase.strokeRect(0, 0, 48, 48, hexToRgba("#fbbf24"), 3);
  savePng("icons/favicon.png", iconBase);
  savePng("icons/icon-192.png", iconBase.scaleNearest(4));
  savePng("icons/icon-512.png", iconBase.scaleNearest(10).downsampleNearest(512, 512));
}

// ---------- 4. SYNTHESIZE ORIGINAL RETRO ARCADE WAV AUDIO ASSETS ----------

function encodeWav(samples: Float32Array, sampleRate = 22050): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function saveWav(relPath: string, samples: Float32Array, sampleRate = 22050): void {
  const abs = path.join(ASSETS_DIR, "audio", relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, encodeWav(samples, sampleRate));
}

function synthNotes(
  notes: Array<{ freq: number; start: number; dur: number; wave: "square" | "triangle" | "sine" | "noise"; gain?: number }>,
  totalDur: number,
  sampleRate = 22050
): Float32Array {
  const len = Math.floor(totalDur * sampleRate);
  const out = new Float32Array(len);
  const rand = seededRand(42);

  for (const n of notes) {
    const startIdx = Math.floor(n.start * sampleRate);
    const durSamples = Math.floor(n.dur * sampleRate);
    const gain = n.gain ?? 0.35;
    for (let i = 0; i < durSamples; i++) {
      const idx = startIdx + i;
      if (idx < 0 || idx >= len) continue;
      const t = i / sampleRate;
      const progress = i / Math.max(1, durSamples);
      const env = Math.min(1, progress * 18) * Math.pow(1 - progress, 0.7);
      let v = 0;
      if (n.wave === "square") {
        v = Math.sin(2 * Math.PI * n.freq * t) >= 0 ? 1 : -1;
      } else if (n.wave === "triangle") {
        v = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * n.freq * t));
      } else if (n.wave === "sine") {
        v = Math.sin(2 * Math.PI * n.freq * t);
      } else {
        v = rand() * 2 - 1;
      }
      out[idx] = (out[idx] ?? 0) + v * env * gain;
    }
  }
  return out;
}

function synthSweep(f0: number, f1: number, dur: number, wave: "square" | "triangle" | "sine", gain = 0.35): Float32Array {
  const sr = 22050;
  const len = Math.floor(dur * sr);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const p = i / Math.max(1, len);
    const freq = f0 + (f1 - f0) * p;
    phase += (2 * Math.PI * freq) / sr;
    const env = Math.min(1, p * 20) * (1 - p);
    const v =
      wave === "square"
        ? Math.sin(phase) >= 0
          ? 1
          : -1
        : wave === "triangle"
          ? (2 / Math.PI) * Math.asin(Math.sin(phase))
          : Math.sin(phase);
    out[i] = v * env * gain;
  }
  return out;
}

function generateAllAudio(): void {
  // SFX
  saveWav("flap.wav", synthSweep(280, 640, 0.09, "triangle", 0.42));
  saveWav(
    "score.wav",
    synthNotes(
      [
        { freq: 659.25, start: 0, dur: 0.08, wave: "square", gain: 0.25 },
        { freq: 987.77, start: 0.07, dur: 0.16, wave: "square", gain: 0.28 },
      ],
      0.24
    )
  );
  saveWav(
    "hit.wav",
    synthNotes(
      [
        { freq: 140, start: 0, dur: 0.14, wave: "noise", gain: 0.45 },
        { freq: 110, start: 0, dur: 0.16, wave: "square", gain: 0.35 },
      ],
      0.18
    )
  );
  saveWav("die.wav", synthSweep(380, 95, 0.35, "square", 0.3));
  saveWav(
    "coin.wav",
    synthNotes(
      [
        { freq: 987.77, start: 0, dur: 0.06, wave: "square", gain: 0.25 },
        { freq: 1318.51, start: 0.055, dur: 0.16, wave: "square", gain: 0.25 },
      ],
      0.22
    )
  );
  saveWav(
    "purchase.wav",
    synthNotes(
      [
        { freq: 523.25, start: 0, dur: 0.08, wave: "square", gain: 0.24 },
        { freq: 659.25, start: 0.07, dur: 0.08, wave: "square", gain: 0.24 },
        { freq: 783.99, start: 0.14, dur: 0.08, wave: "square", gain: 0.24 },
        { freq: 1046.5, start: 0.21, dur: 0.22, wave: "square", gain: 0.28 },
      ],
      0.45
    )
  );
  saveWav(
    "achievement.wav",
    synthNotes(
      [
        { freq: 523.25, start: 0, dur: 0.1, wave: "triangle", gain: 0.35 },
        { freq: 659.25, start: 0.09, dur: 0.1, wave: "triangle", gain: 0.35 },
        { freq: 783.99, start: 0.18, dur: 0.1, wave: "triangle", gain: 0.35 },
        { freq: 1046.5, start: 0.27, dur: 0.3, wave: "square", gain: 0.24 },
      ],
      0.6
    )
  );
  saveWav(
    "levelup.wav",
    synthNotes(
      [
        { freq: 440, start: 0, dur: 0.08, wave: "square", gain: 0.22 },
        { freq: 554.37, start: 0.08, dur: 0.08, wave: "square", gain: 0.22 },
        { freq: 659.25, start: 0.16, dur: 0.08, wave: "square", gain: 0.22 },
        { freq: 880, start: 0.24, dur: 0.12, wave: "square", gain: 0.26 },
        { freq: 1108.73, start: 0.36, dur: 0.28, wave: "square", gain: 0.28 },
      ],
      0.68
    )
  );
  saveWav("click.wav", synthSweep(520, 740, 0.045, "triangle", 0.25));
  saveWav("countdown.wav", synthSweep(440, 440, 0.11, "square", 0.22));
  saveWav("go.wav", synthSweep(660, 880, 0.18, "square", 0.26));

  // Upbeat 6.4s Looping Chiptune Arcade BGM
  const step = 0.2;
  const melody = [
    523.25, 659.25, 783.99, 659.25, 880.0, 783.99, 659.25, 587.33,
    523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 0,
    587.33, 698.46, 880.0, 698.46, 783.99, 659.25, 587.33, 523.25,
    493.88, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 0,
  ];
  const bass = [
    130.81, 130.81, 196.0, 196.0, 174.61, 174.61, 196.0, 196.0,
    130.81, 130.81, 196.0, 196.0, 174.61, 174.61, 130.81, 130.81,
    146.83, 146.83, 220.0, 220.0, 196.0, 196.0, 130.81, 130.81,
    123.47, 123.47, 196.0, 196.0, 196.0, 146.83, 130.81, 130.81,
  ];
  const bgmNotes: Array<{ freq: number; start: number; dur: number; wave: "square" | "triangle"; gain: number }> = [];
  for (let i = 0; i < melody.length; i++) {
    if (melody[i]! > 0) {
      bgmNotes.push({ freq: melody[i]!, start: i * step, dur: step * 0.82, wave: "square", gain: 0.11 });
    }
    bgmNotes.push({ freq: bass[i]!, start: i * step, dur: step * 0.9, wave: "triangle", gain: 0.16 });
  }
  saveWav("bgm-arcade.wav", synthNotes(bgmNotes, melody.length * step));

  // 12 Subtle Scene-Specific Looping Ambient Beds (2.5s seamless pads)
  const ambientConfigs: Array<{ file: string; baseFreq: number; chord: number[]; noiseLevel: number }> = [
    { file: "ambient-meadow.wav", baseFreq: 261.63, chord: [1, 1.25, 1.5], noiseLevel: 0.012 },
    { file: "ambient-valley.wav", baseFreq: 220.0, chord: [1, 1.2, 1.5], noiseLevel: 0.015 },
    { file: "ambient-city.wav", baseFreq: 146.83, chord: [1, 1.5, 1.875], noiseLevel: 0.02 },
    { file: "ambient-desert.wav", baseFreq: 196.0, chord: [1, 1.06, 1.5], noiseLevel: 0.03 },
    { file: "ambient-rain.wav", baseFreq: 174.61, chord: [1, 1.2, 1.5], noiseLevel: 0.065 },
    { file: "ambient-snow.wav", baseFreq: 293.66, chord: [1, 1.5, 2.0], noiseLevel: 0.025 },
    { file: "ambient-garden.wav", baseFreq: 246.94, chord: [1, 1.33, 1.5], noiseLevel: 0.01 },
    { file: "ambient-underwater.wav", baseFreq: 130.81, chord: [1, 1.25, 1.5], noiseLevel: 0.022 },
    { file: "ambient-haunted.wav", baseFreq: 110.0, chord: [1, 1.189, 1.414], noiseLevel: 0.024 },
    { file: "ambient-cyberpunk.wav", baseFreq: 123.47, chord: [1, 1.5, 2.0], noiseLevel: 0.018 },
    { file: "ambient-space.wav", baseFreq: 98.0, chord: [1, 1.5, 2.25], noiseLevel: 0.01 },
    { file: "ambient-volcanic.wav", baseFreq: 82.41, chord: [1, 1.2, 1.5], noiseLevel: 0.045 },
  ];

  const sr = 22050;
  const dur = 2.5;
  const len = Math.floor(sr * dur);
  for (let idx = 0; idx < ambientConfigs.length; idx++) {
    const cfg = ambientConfigs[idx]!;
    const out = new Float32Array(len);
    const rand = seededRand(500 + idx);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Smooth sine loop envelope (integer cycles for click-free loop!)
      let tone = 0;
      for (const ratio of cfg.chord) {
        const cycles = Math.max(1, Math.round(cfg.baseFreq * ratio * dur));
        tone += Math.sin((2 * Math.PI * cycles * i) / len) * 0.032;
      }
      const n = rand() * 2 - 1;
      lp = lp * 0.92 + n * 0.08;
      out[i] = tone + lp * cfg.noiseLevel;
    }
    saveWav(cfg.file, out, sr);
  }
}

console.log("Generating SKYHOP original pixel-art PNG assets and WAV audio...");
generateAllBirds();
generateAllScenes();
generateExtraCosmetics();
generateAllAudio();
console.log("Asset generation complete!");
