// 魔数判断 + webp 等不可写格式重编码 JPEG + 读尺寸（对应 OpenRouterClient.writableImageData，
// 但拆到图片管线且顺带产出宽高 —— 瀑布流布局与入库都需要）。canvas 是异步的（createImageBitmap）。

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** 魔数判断：JPEG（FFD8FF）/ PNG（89504E47）/ ISO BMFF 容器（HEIC 系，"ftyp" @4） */
function isDirectlyWritable(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (JPEG.every((b, i) => bytes[i] === b)) return true;
  if (PNG.every((b, i) => bytes[i] === b)) return true;
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return true; // "ftyp"
  return false;
}

export interface WritableImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 魔数嗅探 MIME（blob.type 缺失/为空时的兜底 —— 空 type 的 data URL 是
 *  application/octet-stream，OpenRouter 会 400 拒绝，已踩） */
export function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  // webp: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg"; // 管线统一收敛到 JPEG
}

/** 可写格式（JPEG/PNG/HEIC 容器）原样返回；其余（webp 等）canvas 重编码为 JPEG 0.95。
 *  解码失败时原样返回（尺寸 0）—— 不让格式问题炸掉整单 */
export async function reencodeToWritable(blob: Blob): Promise<WritableImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    bitmap = null;
  }
  if (!bitmap) return { blob, width: 0, height: 0 };

  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (isDirectlyWritable(bytes)) {
    const out = { blob, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return out;
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  if (!jpeg) return { blob, width: 0, height: 0 };
  return { blob: jpeg, width: canvas.width, height: canvas.height };
}
