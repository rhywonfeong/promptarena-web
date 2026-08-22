// 描述翻译管线（对应 ModelCatalog.ensureTranslations）：
// 待翻 = 无缓存且有英文描述的模型；15 条一批、批间并发；
// 每批完成即合并 + 落盘（UI 渐进切中文）；某批失败不影响其他批，下次启动重试。
// 触发时机：模型列表加载完成后 / 设置页关闭后（刚填 key 或换翻译模型时补翻）。
import { translateDescriptions } from "@/lib/openrouter/client";
import type { ImageModelInfo } from "@/lib/openrouter/types";
import {
  beginTranslateRun,
  endTranslateRun,
  mergeTranslations,
  translationsStore,
} from "@/stores/translations";
import { settingsStore } from "@/stores/settings";

/** 批大小：比 iPad 版的 15 略小 —— 单批输出 token 少返回更快，
 *  中文渐进出现的节奏也更平滑 */
const BATCH_SIZE = 12;
/** 批间并发上限：不做全量并发（一次性几十个请求容易限流），滑动窗口跑完一个补一个 */
const CONCURRENCY = 4;

/** 返回待翻条数（0 = 已全部有缓存、什么都没发生 —— 调用方别再宣称「翻译进行中」） */
export function ensureTranslations(models: ImageModelInfo[]): number {
  const apiKey = settingsStore.state.apiKey.trim();
  if (!apiKey) return 0;

  const pending = models.filter((m) => {
    const cached = translationsStore.state.dict[m.id];
    return !cached && !!m.description?.trim();
  });
  if (!pending.length) return 0;

  const items = pending.map((m) => ({ id: m.id, text: m.description! }));
  const batches = chunked(items, BATCH_SIZE);

  beginTranslateRun();
  void (async () => {
    await mapLimit(batches, CONCURRENCY, async (batch) => {
      try {
        const dict = await translateDescriptions(batch, {
          apiKey,
          model: settingsStore.state.translateModel,
        });
        mergeTranslations(dict); // 每批完成即合并落盘，UI 渐进切中文
      } catch {
        // 某批失败（如限流）不影响其他批，下次启动重试
      }
    });
    endTranslateRun();
  })();
  return pending.length;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 滑动窗口并发限制：最多 limit 个任务同时在跑，完成一个补一个，保持结果顺序 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
