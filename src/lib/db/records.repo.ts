// 记录读写 DAO（对应 HistoryStore.swift 的能力；SwiftData @Query 的自动刷新
// 由组件侧 useLiveQuery 承担）。写入只发生在 engine / upscale。
// ⚠️ liked 存 0/1（number）：IndexedDB 索引不支持 boolean 键。
import Dexie from "dexie";
import { db, type GenerationRecord } from "./db";

export async function putRecord(record: GenerationRecord, imageBlob?: Blob): Promise<void> {
  if (imageBlob && record.imageId) {
    await db.images.put({ id: record.imageId, blob: imageBlob });
  }
  await db.records.put(record);
}

/** 失败记录去重写入（用户要求：同一 prompt 反复失败不多次记录）。
 *  事务内查同 modelId+prompt 的既有失败记录：有则复用它的 recordId/batchId
 *  （刷新错误文案与时间，仍挂首次失败的批次下），没有才插入新的。
 *  返回落库的 recordId（engine 用它写回卡片，打通「重试成功删旧失败」链）。 */
export async function putFailureDedup(record: GenerationRecord): Promise<string> {
  return db.transaction("rw", db.records, async () => {
    const existing = await db.records
      .filter((r) => r.status === "failed" && r.modelId === record.modelId && r.prompt === record.prompt)
      .sortBy("createdAt");
    const old = existing[existing.length - 1];
    if (old) {
      await db.records.put({ ...record, recordId: old.recordId, batchId: old.batchId });
      return old.recordId;
    }
    await db.records.put(record);
    return record.recordId;
  });
}

/** 本轮参考图落库（同批共享一份，id: ref-{batchId}-{k}） */
export async function putReferenceImages(
  batchId: string,
  blobs: Blob[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const [k, blob] of blobs.entries()) {
    const id = `ref-${batchId}-${k}`;
    await db.images.put({ id, blob });
    ids.push(id);
  }
  return ids;
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return (await db.images.get(id))?.blob;
}

export async function findRecord(recordId: string): Promise<GenerationRecord | undefined> {
  return db.records.get(recordId);
}

/** 删除一条失败记录（重试成功的替换语义）；不是失败态或不存在则不动 */
export async function deleteIfFailed(recordId: string | undefined): Promise<void> {
  if (!recordId) return;
  const old = await db.records.get(recordId);
  if (old?.status === "failed") await deleteRecord(recordId);
}

export async function recordsByBatch(batchId: string): Promise<GenerationRecord[]> {
  const rows = await db.records.where("batchId").equals(batchId).toArray();
  return rows.sort((a, b) => a.seriesIndex - b.seriesIndex || a.createdAt - b.createdAt);
}

export async function listDoneDesc(): Promise<GenerationRecord[]> {
  return db.records
    .where("[status+createdAt]")
    .between(["done", Dexie.minKey], ["done", Dexie.maxKey])
    .reverse()
    .toArray();
}

/** 全部记录（含失败）按时间倒序 —— 历史页展示失败记录方便重试（用户要求） */
export async function listAllDesc(): Promise<GenerationRecord[]> {
  return db.records.orderBy("createdAt").reverse().toArray();
}

export async function listLikedDone(): Promise<GenerationRecord[]> {
  // ⚠️ 复合索引精确键不能用 between([k],[k])：Dexie 实测查不到（equals 才命中，
  // 点赞页一直空就是它）。[liked+status] 不含 createdAt，排序显式按时间倒序
  const rows = await db.records.where("[liked+status]").equals([1, "done"]).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function setLiked(recordId: string, liked: boolean): Promise<void> {
  await db.records.update(recordId, { liked: liked ? 1 : 0 });
}

export async function deleteRecord(recordId: string): Promise<void> {
  const rec = await db.records.get(recordId);
  if (!rec) return;
  if (rec.imageId) await db.images.delete(rec.imageId);
  await db.records.delete(recordId);
  // 参考图同批共享：单删不动 ref-*（可能还有兄弟记录引用）
}

export async function deleteBatch(batchId: string): Promise<void> {
  const rows = await db.records.where("batchId").equals(batchId).toArray();
  for (const row of rows) {
    if (row.imageId) await db.images.delete(row.imageId);
  }
  await db.records.bulkDelete(rows.map((r) => r.recordId));
  // 本批参考图 ref-{batchId}-* 只被本批引用，连带清理
  const refIds = await db.images
    .filter((img) => img.id.startsWith(`ref-${batchId}-`))
    .primaryKeys();
  await db.images.bulkDelete(refIds);
}

/** 库内实测均价（$/张，按 modelId 聚合 status=done && costUsd>0）——
 *  token 计价模型的价格标签优先用它（带 ≈） */
export async function measuredCostPerImage(): Promise<Record<string, number>> {
  const rows = await db.records
    .filter((r) => r.status === "done" && r.costUsd > 0)
    .toArray();
  const sum: Record<string, { total: number; count: number }> = {};
  for (const row of rows) {
    const acc = (sum[row.modelId] ??= { total: 0, count: 0 });
    acc.total += row.costUsd;
    acc.count += 1;
  }
  const avg: Record<string, number> = {};
  for (const [modelId, { total, count }] of Object.entries(sum)) {
    avg[modelId] = total / count;
  }
  return avg;
}

/** 沿 parentRecordId 回溯到最早祖先，从上到下返回演进链 */
export async function lineageChain(recordId: string): Promise<GenerationRecord[]> {
  const chain: GenerationRecord[] = [];
  let current = await db.records.get(recordId);
  const guard = new Set<string>();
  while (current && !guard.has(current.recordId)) {
    guard.add(current.recordId);
    chain.unshift(current);
    current = current.parentRecordId
      ? await db.records.get(current.parentRecordId)
      : undefined;
  }
  return chain;
}
