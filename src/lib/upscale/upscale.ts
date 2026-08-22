// 高清晰化执行器（对应 UpscaleStore.swift 的执行逻辑）：
// 条件 = 本地图 + 知来源模型 + 模型在目录 + key 已配。
// 取该模型支持档里比当前档更高的档：唯一 → 直接跑；多个 → 调用方弹选择；没有 → 提示。
// 执行 = 原图作参考图 + 原 prompt + 更高分辨率重新生成，完成入库挂 parentRecordId。
import { generateImage } from "@/lib/openrouter/client";
import {
  resolutionPixels,
  supportedResolutions,
  type ImageModelInfo,
} from "@/lib/openrouter/types";
import { getImage, putRecord } from "@/lib/db/records.repo";
import type { GenerationRecord } from "@/lib/db/db";
import { settingsStore } from "@/stores/settings";
import { addUpscaleTask, updateUpscaleTask } from "@/stores/upscale";
import { downscaleReference } from "@/lib/image/downscale";
import { blobToDataURL } from "@/lib/image/dataUrl";

const ENHANCE_FALLBACK_PROMPT =
  "Enhance this image at higher resolution, keep all details and composition identical";

/** 比当前档更高的可选档位（从记录的 resolution 或长边推断当前档） */
export function higherResolutions(model: ImageModelInfo, record: GenerationRecord): string[] {
  const currentTier = record.resolution || tierFromPixels(Math.max(record.width, record.height));
  const currentPx = currentTier ? (resolutionPixels(currentTier) ?? 0) : 0;
  return supportedResolutions(model)
    .map((res) => ({ res, px: resolutionPixels(res) ?? 0 }))
    .filter((t) => t.px > currentPx)
    .sort((a, b) => a.px - b.px)
    .map((t) => t.res);
}

function tierFromPixels(longEdge: number): string {
  if (longEdge >= 4000) return "4K";
  if (longEdge >= 1900) return "2K";
  if (longEdge >= 900) return "1K";
  return "512";
}

export function canUpscale(record: GenerationRecord, model?: ImageModelInfo): boolean {
  return (
    !!record.imageId && !!model && !!settingsStore.state.apiKey.trim() && !!record.modelId
  );
}

/** 执行一次高清晰化（后台跑，不阻塞调用方） */
export function runUpscale(record: GenerationRecord, model: ImageModelInfo, resolution: string) {
  const taskId = crypto.randomUUID();
  addUpscaleTask({
    id: taskId,
    recordId: record.recordId,
    modelId: record.modelId,
    modelName: record.modelName,
    resolution,
    phase: "loading",
  });
  void (async () => {
    try {
      const blob = await getImage(record.imageId!);
      if (!blob) throw new Error("原图已不可用");
      // 参考图统一走降采样管线（控制请求体大小）
      const ref = await downscaleReference(blob);
      const dataUrl = await blobToDataURL(ref);
      const startedAt = performance.now();
      const result = await generateImage(
        {
          model: model.id,
          prompt: record.prompt || ENHANCE_FALLBACK_PROMPT,
          resolution,
          input_references: [{ type: "image_url", image_url: { url: dataUrl } }],
        },
        { apiKey: settingsStore.state.apiKey.trim() },
      );
      const seconds = (performance.now() - startedAt) / 1000;
      const image = result.images[0];
      if (!image || !("blob" in image)) throw new Error("生成成功但没返回图片");
      const recordId = crypto.randomUUID();
      const batchId = crypto.randomUUID();
      await putRecord(
        {
          recordId,
          batchId,
          parentRecordId: record.recordId,
          modelId: record.modelId,
          modelName: record.modelName,
          prompt: record.prompt || ENHANCE_FALLBACK_PROMPT,
          createdAt: Date.now(),
          seconds,
          status: "done",
          costUsd: result.costUsd ?? 0,
          referenceCount: 1,
          liked: 0,
          resolution,
          aspectRatio: record.aspectRatio,
          width: image.width,
          height: image.height,
          imageId: `img-${recordId}`,
          referenceImageIds: [],
          seriesIndex: 0,
        },
        image.blob,
      );
      updateUpscaleTask(taskId, { phase: "done" });
      notify("高清晰化完成", `${model.name} · ${resolution} 版已入库`);
    } catch (e) {
      updateUpscaleTask(taskId, {
        phase: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      notify("高清晰化失败", e instanceof Error ? e.message : String(e));
    }
  })();
}

/** 简易提示：页内状态行 + 可选 Web Notification（权限只请求一次，失败静默） */
function notify(title: string, body: string) {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission === "default") {
        void Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      }
    }
  } catch {
    // 通知不可用就算了，页面内状态行为主
  }
}
