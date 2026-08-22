// 历史记录展示小件：记录图片 Blob 的响应式读取 + 元信息文案
import { useLiveQuery } from "dexie-react-hooks";
import { getImage } from "@/lib/db/records.repo";
import type { GenerationRecord } from "@/lib/db/db";
import { useBlobUrl } from "@/lib/image/blobUrl";
import { consumedLabel } from "@/lib/catalog/pricing";
import { sizeLabel } from "@/lib/utils/format";

/** 记录 → 图片 objectURL（imageId 变化自动刷新；remoteUrl 兜底直连） */
export function useRecordSrc(record: { imageId?: string; remoteUrl?: string }): string | undefined {
  const blob = useLiveQuery(() => getImage(record.imageId ?? ""), [record.imageId], undefined);
  const url = useBlobUrl(blob);
  return url ?? record.remoteUrl;
}

/** 元信息一行：「12.3 秒 · 2048×2048 (2K) · 3.2 gpt2」（iPad 版同款口径） */
export function recordMetaLine(record: GenerationRecord): string {
  const parts: string[] = [];
  if (record.seconds > 0) parts.push(`${record.seconds.toFixed(1)} 秒`);
  const size = sizeLabel(record.width, record.height, record.resolution);
  if (size) parts.push(size);
  if (record.costUsd > 0) parts.push(consumedLabel(record.costUsd));
  return parts.join(" · ");
}

/** 按记录分组还原序号（同模型组内 k/N，seriesIndex 排序） */
export function sequenceOf(records: GenerationRecord[], target: GenerationRecord): string | undefined {
  const group = records
    .filter((r) => r.modelId === target.modelId)
    .sort((a, b) => a.seriesIndex - b.seriesIndex || a.createdAt - b.createdAt);
  if (group.length < 2) return undefined;
  return `${group.indexOf(target) + 1}/${group.length}`;
}
