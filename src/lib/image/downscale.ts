// 参考图降采样（对应 PA 的统一参考图管线）：长边 ≤1536 + JPEG 0.8。
// 原生 2K/4K 的 base64 几 MB，过大 input_references 会被上游静默丢弃
// （表现为"结果与参考图无关"），所有入口（输入条选图、编辑此图）都走这里。

export const REF_MAX_EDGE = 1536;

export async function downscaleReference(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = Math.max(bitmap.width, bitmap.height);
  if (maxEdge <= REF_MAX_EDGE) {
    // 尺寸合规也统一转 JPEG 0.8 收敛体积与格式
    const out = encodeCanvas(bitmap, bitmap.width, bitmap.height, 0.8);
    bitmap.close();
    return out;
  }
  const scale = REF_MAX_EDGE / maxEdge;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const out = encodeCanvas(bitmap, w, h, 0.8);
  bitmap.close();
  return out;
}

function encodeCanvas(
  src: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(src, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片编码失败"))),
      "image/jpeg",
      quality,
    ),
  );
}
