export type ImageInfo = {
  width: number | null;
  height: number | null;
  mimeType: string | null;
  bytes: number;
};

export function inspectImage(buffer: Buffer, contentType = ""): ImageInfo {
  const mimeType = contentType.split(";")[0]?.trim() || sniffMime(buffer);
  const size = readSize(buffer);
  return { width: size?.width ?? null, height: size?.height ?? null, mimeType: mimeType || null, bytes: buffer.length };
}

function sniffMime(buffer: Buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString().includes("<svg")) return "image/svg+xml";
  return "";
}

function readSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString() === "GIF") {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
    const chunk = buffer.subarray(12, 16).toString();
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

export function imageRole(url: string) {
  const path = url.toLowerCase();
  if (path.includes("logo") || path.includes("favicon") || path.includes("icon")) return "logo";
  if (path.includes("mascot")) return "mascot";
  if (path.includes("hero") || path.includes("character")) return "hero";
  if (path.includes("banner") || path.includes("social") || path.includes("share") || path.includes("og")) return "banner";
  if (path.includes("sticker") || path.includes("reaction")) return "sticker";
  if (path.includes("meme")) return "meme";
  return "other";
}
