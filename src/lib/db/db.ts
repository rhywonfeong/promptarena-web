// Dexie（IndexedDB）。对应 PA/Models/GenerationRecord.swift + State/HistoryStore.swift。
// 关键设计：图片 Blob 独立成 images 表 —— liveQuery 查 records 时若内联 Blob，
// 全表 Blob 会随查询进内存；分表后列表轻、按 id 单取。
import Dexie, { type Table } from "dexie";

/** 一条生成记录（成功失败都入库，取消不记）。字段与 Swift GenerationRecord 对齐 */
export interface GenerationRecord {
  recordId: string;
  /** 同一次生成/重试共享，还原整轮 */
  batchId: string;
  /** 编辑链：本图由哪条记录演进而来 */
  parentRecordId?: string;
  modelId: string;
  modelName: string;
  /** 本卡实际用的（Agent 轮是子提示词） */
  prompt: string;
  createdAt: number; // epoch ms
  /** 耗时秒 */
  seconds: number;
  status: "done" | "failed";
  errorMessage?: string;
  /** 整单 usage.cost 按张均摊（0 = 未知） */
  costUsd: number;
  referenceCount: number;
  /** ⚠️ 0/1（number）而非 boolean：IndexedDB 索引不支持 boolean 键 */
  liked: 0 | 1;
  /** 请求档位（""=模型默认） */
  resolution: string;
  aspectRatio: string;
  /** 实际出图像素（0=未知） */
  width: number;
  height: number;
  /** images 表 id；失败记录为空 */
  imageId?: string;
  /** 本轮参考图 images id（同批共享 —— 删单条记录不删这些） */
  referenceImageIds: string[];
  /** Agent 批次的原始意图（undefined=普通批次）；批次头显示它 */
  intentPrompt?: string;
  /** 这条是重试哪条失败记录得来的 —— 成功入库后自动删除那条失败记录（重试成功即替换） */
  retryOfRecordId?: string;
  /** 同模型组内张序（0 起）—— 还原"生成顺序"（createdAt 是完成顺序） */
  seriesIndex: number;
  /** URL 结果跨域下载失败的兜底：只展示、无本地 Blob */
  remoteUrl?: string;
}

export interface ImageRow {
  id: string;
  blob: Blob;
}

export class PromptArenaDB extends Dexie {
  records!: Table<GenerationRecord, string>;
  images!: Table<ImageRow, string>;

  constructor() {
    super("promptarena");
    this.version(1).stores({
      records:
        "recordId, batchId, parentRecordId, modelId, createdAt, liked, status, [status+createdAt], [liked+status], [modelId+status]",
      images: "id",
    });
  }
}

export const db = new PromptArenaDB();

export interface StorageProbeResult {
  ok: boolean;
  /** 哪一层挂了：localStorage / indexeddb */
  stage?: "localStorage" | "indexeddb";
  /** 具体错误（提示与 console 都带上，便于定位） */
  error?: string;
}

/** 启动探测：分层测 localStorage 与 IndexedDB 的可写性。
 *  Safari 私密模式 / 全局「阻止所有 Cookie」/ 隐私扩展都会拒写 ——
 *  明确告知（带原因）而不是静默丢数据；错误详情进 console 便于排查。 */
export async function probeStorage(): Promise<StorageProbeResult> {
  // 第一层：localStorage（Safari「阻止所有 Cookie」时直接抛 SecurityError）
  try {
    const key = "__probe__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
  } catch (e) {
    const error = describeError(e);
    console.error("[存储探测] localStorage 不可用:", e);
    return { ok: false, stage: "localStorage", error };
  }

  // 第二层：IndexedDB（Dexie 真实读写一条，非空 Blob 避免边缘实现问题）
  try {
    await db.images.put({ id: "__probe__", blob: new Blob([new Uint8Array([1])]) });
    await db.images.delete("__probe__");
    return { ok: true };
  } catch (e) {
    const error = describeError(e);
    console.error("[存储探测] IndexedDB 不可用:", e);
    return { ok: false, stage: "indexeddb", error };
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
