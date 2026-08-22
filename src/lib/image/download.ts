// 下载文件（iPad 版"保存到相册"的 web 等价物）
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Web Share API 可用时走系统分享（移动端体验好），不可用返回 false 由调用方下载 */
export async function shareBlob(blob: Blob, filename: string): Promise<boolean> {
  if (!navigator.canShare?.({ files: [new File([blob], filename, { type: blob.type })] })) {
    return false;
  }
  try {
    await navigator.share({
      files: [new File([blob], filename, { type: blob.type })],
    });
    return true;
  } catch {
    return false; // 用户取消也算完成，不报错
  }
}
