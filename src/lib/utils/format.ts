// 展示格式化小工具
/** 秒 → "12.3 秒" */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} 秒`;
}

/** 相对时间（历史批次头） */
export function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(epochMs);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 尺寸标签："2048×2048 (2K)"。档位优先用请求时记录的；没有则从长边推断 */
export function sizeLabel(width: number, height: number, tier: string): string {
  if (!width || !height) return tier ? `(${tier})` : "";
  const t = tier || tierFromLongEdge(Math.max(width, height));
  return t ? `${width}×${height} (${t})` : `${width}×${height}`;
}

/** 老记录兜底：从长边推断档位（同 Swift 的阈值） */
export function tierFromLongEdge(longEdge: number): string {
  if (longEdge >= 4000) return "4K";
  if (longEdge >= 1900) return "2K";
  if (longEdge >= 900) return "1K";
  if (longEdge >= 400) return "512";
  return "";
}

/** 美元显示：$1.23 */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** 文件大小：356 KB / 1.8 MB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 人民币显示：≈¥7.8 */
export function formatCny(usd: number, rate: number): string {
  return `≈¥${(usd * rate).toFixed(1)}`;
}
