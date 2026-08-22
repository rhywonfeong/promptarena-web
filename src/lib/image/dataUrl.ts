// Blob → data URL（发送 input_references 参考图的统一包装，engine / upscale 共用）。
// MIME 兜底：老库里存的 Blob 可能没有 type（空 type 的 data URL 是
// application/octet-stream，OpenRouter 校验会 400 拒绝）—— 按魔数嗅探修正。
import { sniffImageMime } from "./reencode";

export async function blobToDataURL(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type.startsWith("image/") ? blob.type : sniffImageMime(buf);
  // 分块 base64（避免大图 String.fromCharCode 栈溢出）
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}
