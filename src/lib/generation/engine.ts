// 生成指挥官（对应 PA/State/ComparisonViewModel.swift）：建卡、并发请求、
// 结果分发、cost 均摊入库、取消/重试、Agent 拆分。
// 超时 abort 与用户取消的入库语义不同：前者按失败入库，后者不入库。
import { generateImage, splitSeriesPrompt } from "@/lib/openrouter/client";
import { withoutParenthetical, type ImageModelInfo } from "@/lib/openrouter/types";
import type { CatalogPricing } from "@/lib/catalog/pricing";
import { perImageEstimate, resolutionFor } from "./estimate";
import type { GenerationTask } from "./task";
import { generationStore, patchGeneration, patchTask } from "@/stores/generation";
import { settingsStore } from "@/stores/settings";
import { selectionStore } from "@/stores/selection";
import { deleteIfFailed, putRecord, putReferenceImages, setLiked } from "@/lib/db/records.repo";
import type { GenerationRecord } from "@/lib/db/db";
import { sizeLabel } from "@/lib/utils/format";
import { blobToDataURL } from "@/lib/image/dataUrl";

/** engine 需要的目录快照（组件层从 useCatalog 传入） */
export interface EngineContext {
  models: Record<string, ImageModelInfo>;
  pricing: CatalogPricing;
}

type Outcome =
  | {
      kind: "success";
      taskIds: string[];
      images: ({ blob: Blob; width: number; height: number } | { remoteUrl: string })[];
      seconds: number;
      costUsd?: number;
    }
  | { kind: "failure"; taskIds: string[]; message: string };

// ── 轮次上下文（模块级，不进 store —— 重试要用） ──
let lastPrompt = "";
let lastRefs: Blob[] = [];
let lastRefImageIds: string[] = [];
let batchId = "";
let lastParentRecordId: string | null = null;
let runController: AbortController | null = null;
// Agent 确认暂停时扣住的轮次上下文 —— 确认后原样继续
let heldTasks: GenerationTask[] = [];
let heldIntent = "";
let heldCount = 1;

function snapshotTasks(tasks: GenerationTask[]) {
  generationStore.setState((s) => {
    const map: Record<string, GenerationTask> = {};
    for (const task of tasks) map[task.id] = task;
    return { ...s, tasks: map, taskOrder: tasks.map((t) => t.id) };
  });
}

function currentTasks(): GenerationTask[] {
  const s = generationStore.state;
  return s.taskOrder.map((id) => s.tasks[id]).filter(Boolean);
}

export async function start(ctx: EngineContext, onlyModels?: string[], retryOfRecordId?: string) {
  const s = generationStore.state;
  const settings = settingsStore.state;
  const trimmedPrompt = s.draftPrompt.trim();
  const candidateIds = onlyModels ?? selectionSnapshot();
  if (!trimmedPrompt || !candidateIds.length || !settings.apiKey.trim()) return;

  lastPrompt = trimmedPrompt;
  lastRefs = s.draftReferences.map((r) => r.blob);
  lastParentRecordId = s.pendingParentRecordId;
  patchGeneration({ pendingParentRecordId: null });
  const apiKey = settings.apiKey.trim();

  // 参考图过滤：剔除不支持的模型并提示；超限的保留发送（按上限截断）但点名
  let effective = candidateIds.map((id) => ctx.models[id]).filter(Boolean);
  if (lastRefs.length) {
    const supported = effective.filter((m) => (m.supported_parameters?.input_references?.max ?? 0) > 0);
    const skipped = effective.length - supported.length;
    const overLimit = supported.filter(
      (m) => (m.supported_parameters?.input_references?.max ?? 0) < lastRefs.length,
    );
    const messages: string[] = [];
    if (skipped > 0) messages.push(`已跳过 ${skipped} 个不支持参考图的模型`);
    if (overLimit.length) {
      const names = overLimit
        .slice(0, 3)
        .map((m) => `${withoutParenthetical(m.name)}(限${m.supported_parameters!.input_references!.max})`)
        .join("、");
      const extra = overLimit.length > 3 ? ` 等${overLimit.length}个` : "";
      messages.push(`参考图 ${lastRefs.length} 张超出${extra}：${names}，发送时按各自上限截断`);
    }
    effective = supported;
    patchGeneration({ notice: messages.length ? messages.join("；") : null });
  } else {
    patchGeneration({ notice: null });
  }

  const count = Math.max(1, settings.imageCount);
  // 有参考图但全被过滤：明确提示（曾经的静默 return —— 表现为"点了没反应"）
  if (lastRefs.length && !effective.length) {
    patchGeneration({ notice: "所选模型都不支持参考图 —— 请换模型或移除参考图" });
    return;
  }
  // 每次生成开一批全新卡片。同模型多张 id 唯一化（"modelId#k"）贯穿全链路
  const newTasks: GenerationTask[] = effective.flatMap((info) =>
    Array.from({ length: count }, (_, index) => ({
      id: index === 0 ? info.id : `${info.id}#${index}`,
      modelId: info.id,
      name: info.name,
      maxReferences: info.supported_parameters?.input_references?.max ?? 0,
      resolution: resolutionFor(info, ctx.pricing, settings.resolution, settings.flatResolutionCap),
      aspectRatio:
        settings.aspectRatio &&
        (info.supported_parameters?.aspect_ratio?.values ?? []).includes(settings.aspectRatio)
          ? settings.aspectRatio
          : null,
      phase: "loading" as const,
      liked: false,
      seriesIndex: index,
      retryOfRecordId,
    })),
  );
  if (!newTasks.length) return;

  // 本轮预估：逐任务按计价模式估算（flat/measured 按张；perPixel 按将发送档位像素放大）
  let total = 0;
  let unpriced = 0;
  for (const task of newTasks) {
    const per = perImageEstimate(task.modelId, task.resolution, ctx.pricing);
    if (per != null) total += per;
    else unpriced += 1;
  }

  batchId = crypto.randomUUID();
  // 参考图落库（同批共享一份；重试沿用这组 id，不重复落库）
  lastRefImageIds = lastRefs.length
    ? await putReferenceImages(batchId, lastRefs)
    : [];

  generationStore.setState((s2) => ({
    ...s2,
    // Agent 轮任务卡先不亮：拆分完成前结果区只显示流式面板
    ...(settings.smartSplit && count > 1
      ? { tasks: {}, taskOrder: [] }
      : {}),
    isRunning: true,
    isPlanning: false,
    planningReasoning: "",
    planningText: "",
    planningError: null,
    splitPending: false,
    lastSubPrompts: [],
    currentPrompt: lastPrompt,
    lastReferenceImageIds: lastRefImageIds,
    lastReferenceBlobs: lastRefs,
    // 已启动：清空输入（prompt 已记入 lastPrompt，重试不受影响）
    draftPrompt: "",
    draftReferences: [],
    estimate: { usd: total, imageCount: newTasks.length, unpricedCount: unpriced },
  }));
  if (!(settings.smartSplit && count > 1)) snapshotTasks(newTasks);

  runController = new AbortController();
  const signal = runController.signal;

  if (settings.smartSplit && count > 1) {
    // ── Agent 组织：先拆意图（流式上屏），拆完停下等确认再逐张生成 ──
    heldTasks = newTasks;
    heldIntent = trimmedPrompt;
    heldCount = count;
    const subPrompts = await planSplit(trimmedPrompt, count, apiKey, signal, null, null);
    if (!subPrompts) return; // 失败/取消已处理好现场
    if (settingsStore.state.askSplitConfirmation) {
      // 拆分结果先过目 —— 确认前不动钱包
      patchGeneration({ isRunning: false, splitPending: true });
      return;
    }
    await runAgentGeneration(subPrompts, apiKey, signal);
  } else {
    // ── 普通模式：每个模型一个请求（多张走 API 的 n 参数）──
    await runGrouped(newTasks, lastPrompt, apiKey, signal);
    patchGeneration({ isRunning: false });
  }
}

function selectionSnapshot(): string[] {
  return selectionStore.state.selectedModelIds;
}

// ── Agent 拆分确认（生成前的人工把关） ──

/** 确认拆分结果：带着扣住的轮次上下文继续生成 */
export async function confirmSplit() {
  const s = generationStore.state;
  if (!s.splitPending || !s.lastSubPrompts.length) return;
  patchGeneration({ splitPending: false });
  const apiKey = settingsStore.state.apiKey.trim();
  runController = new AbortController();
  await runAgentGeneration(s.lastSubPrompts, apiKey, runController.signal);
}

/** 追加修正：带着上一轮结果与修正要求重拆（仍流式上屏），拆完回到确认态 —— 可连改 */
export async function amendSplit(amendment: string) {
  const trimmed = amendment.trim();
  const s = generationStore.state;
  if (!s.splitPending || !trimmed) return;
  const apiKey = settingsStore.state.apiKey.trim();
  const previousJSON = s.planningText; // 上一轮完整 JSON（作为 assistant 消息回传）
  patchGeneration({ splitPending: false });
  runController = new AbortController();
  const subPrompts = await planSplit(
    heldIntent,
    heldCount,
    apiKey,
    runController.signal,
    previousJSON,
    trimmed,
  );
  if (!subPrompts) return;
  if (settingsStore.state.askSplitConfirmation) {
    patchGeneration({ isRunning: false, splitPending: true });
  } else {
    await runAgentGeneration(subPrompts, apiKey, runController.signal);
  }
}

/** 取消本次 Agent 轮（还没花钱）：面板清空，输入还原 */
export function cancelSplitReview() {
  if (!generationStore.state.splitPending) return;
  patchGeneration({ splitPending: false, lastSubPrompts: [], planningText: "", planningReasoning: "" });
  restoreInputs();
}

/** 一轮拆分（可带修正上下文）：流式上屏，成功返回子提示词并更新面板；
 *  失败/取消处理好现场（面板留档 + 输入还原）后返回 null */
async function planSplit(
  intent: string,
  count: number,
  apiKey: string,
  signal: AbortSignal,
  previousJSON: string | null,
  amendment: string | null,
): Promise<string[] | null> {
  patchGeneration({ isPlanning: true, planningReasoning: "", planningText: "", planningError: null });
  const settings = settingsStore.state;
  try {
    const subPrompts = await splitSeriesPrompt(intent, {
      apiKey,
      model: settings.translateModel,
      count,
      systemPrompt: settings.splitSystemPrompt || undefined,
      previousJSON: previousJSON ?? undefined,
      amendment: amendment ?? undefined,
      signal,
      onDelta: (delta) => {
        generationStore.setState((s) =>
          delta.type === "reasoning"
            ? { ...s, planningReasoning: s.planningReasoning + delta.text }
            : { ...s, planningText: s.planningText + delta.text },
        );
      },
    });
    patchGeneration({ isPlanning: false, lastSubPrompts: subPrompts });
    return subPrompts;
  } catch (e) {
    const cancelled = e instanceof DOMException && e.name === "AbortError";
    patchGeneration({
      isPlanning: false,
      isRunning: false,
      splitPending: false,
      planningError: cancelled ? "已取消" : `拆分失败：${e instanceof Error ? e.message : String(e)}`,
    });
    restoreInputs();
    return null;
  }
}

/** 生成阶段：回填各卡自己的 prompt（每模型的第 k 张拿第 k 个子 prompt，
 *  所有模型对同一子 prompt 的演绎可对比），再逐张独立请求（prompt 不同没法合单） */
async function runAgentGeneration(subPrompts: string[], apiKey: string, signal: AbortSignal) {
  snapshotTasks(heldTasks); // 任务卡这时候才亮（loading 从这里开始）
  patchGeneration({ isRunning: true });
  const runs = heldTasks.map(async (task) => {
    const sub = subPrompts[Math.min(task.seriesIndex, subPrompts.length - 1)];
    patchTask(task.id, { promptOverride: sub });
    const outcome = await runOne([task.id], task.modelId, sub, apiKey, signal, {
      maxReferences: task.maxReferences,
      resolution: task.resolution,
      aspectRatio: task.aspectRatio,
    });
    update(outcome); // 完成即分发 —— 界面"陆续亮灯"
  });
  await Promise.all(runs);
  patchGeneration({ isRunning: false });
}

/** 输入还原（prompt + 参考图回输入条）—— 中断/取消后改两个字就能重试 */
function restoreInputs() {
  generationStore.setState((s) => ({
    ...s,
    draftPrompt: lastPrompt,
    draftReferences: lastRefs.map((blob, i) => ({ id: `restore-${i}`, blob })),
    lastReferenceBlobs: [],
  }));
}

export function cancel() {
  runController?.abort(); // 取消传播进所有请求
}

/** 把一张图加入参考图（"编辑此图"入口用：生成结果 → 下一轮的输入） */
export function addReference(blob: Blob) {
  generationStore.setState((s) => ({
    ...s,
    draftReferences: [...s.draftReferences, { id: crypto.randomUUID(), blob }],
    notice: "已加入参考图，输入新的提示词继续生成",
  }));
}

/** 点赞/取消点赞：更新卡片状态并同步写回历史记录 */
export async function toggleLike(taskId: string) {
  const task = generationStore.state.tasks[taskId];
  if (!task || task.phase !== "done") return;
  await patchLike(taskId, !task.liked);
}

/** 指定目标值翻转（查看器乐观翻转后同步卡片用） */
export async function patchLike(taskId: string, liked: boolean) {
  const task = generationStore.state.tasks[taskId];
  if (!task) return;
  patchTask(taskId, { liked });
  if (task.recordId) await setLiked(task.recordId, liked);
}

export function clearNotice() {
  patchGeneration({ notice: null });
}

/** 是否"全军覆没"：所有卡片都失败 → 界面出现"重试全部" */
export function allTasksFailed(): boolean {
  const { taskOrder, tasks } = generationStore.state;
  if (!taskOrder.length) return false;
  return taskOrder.every((id) => tasks[id]?.phase === "failed");
}

/** 一键重试全部失败卡片（用最近一次的 prompt 和参考图） */
export async function retryAll() {
  const s = generationStore.state;
  if (s.isRunning || !settingsStore.state.apiKey.trim() || !lastPrompt) return;
  const failed = currentTasks().filter((t) => t.phase === "failed");
  if (!failed.length) return;

  batchId = crypto.randomUUID(); // 重试也算独立批次（沿用已落库的参考图 id）
  for (const task of failed) {
    patchTask(task.id, { phase: "loading", errorMessage: undefined, retryOfRecordId: task.recordId });
  }
  patchGeneration({ isRunning: true });
  const apiKey = settingsStore.state.apiKey.trim();
  runController = new AbortController();
  const signal = runController.signal;

  await runGrouped(failed, lastPrompt, apiKey, signal);
  patchGeneration({ isRunning: false });
}

/** 单卡重试：只重跑一个失败的模型（Agent 轮用该卡自己的子提示词），不动其他卡片 */
export async function retry(taskId: string) {
  const task = generationStore.state.tasks[taskId];
  if (!task || task.phase !== "failed") return;
  const prompt = task.promptOverride ?? lastPrompt;
  if (!prompt || !settingsStore.state.apiKey.trim()) return;
  const apiKey = settingsStore.state.apiKey.trim();

  batchId = crypto.randomUUID(); // 单卡重试同样算独立批次
  // 重试来源 = 眼前这条失败记录（成功入库后自动删除它 —— 重试成功即替换）
  patchTask(taskId, { phase: "loading", errorMessage: undefined, retryOfRecordId: task.recordId });
  runController = new AbortController();
  const outcome = await runOne([taskId], task.modelId, prompt, apiKey, runController.signal, {
    maxReferences: task.maxReferences,
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
  });
  update(outcome);
}

// ── 内部 ──

/** 按模型分组发请求：Agent 轮（带子提示词）的调用方已逐张拆开；
 *  普通轮同模型合单（n 参数一次出多张） */
async function runGrouped(tasks: GenerationTask[], prompt: string, apiKey: string, signal: AbortSignal) {
  const hasOverride = tasks.some((t) => t.promptOverride != null);
  const groups: GenerationTask[][] = hasOverride
    ? tasks.map((t) => [t])
    : groupBy(tasks, (t) => t.modelId);
  const runs = groups.map(async (group) => {
    const outcome = await runOne(
      group.map((t) => t.id),
      group[0].modelId,
      group[0].promptOverride ?? prompt,
      apiKey,
      signal,
      {
        maxReferences: group[0].maxReferences,
        resolution: group[0].resolution,
        aspectRatio: group[0].aspectRatio,
      },
    );
    update(outcome); // 完成即分发 —— 界面"陆续亮灯"
  });
  await Promise.all(runs);
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return [...map.values()];
}

interface RunOptions {
  maxReferences: number;
  resolution: string | null;
  aspectRatio: string | null;
}

async function runOne(
  taskIds: string[],
  modelId: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  opts: RunOptions,
): Promise<Outcome> {
  // 各模型参考图上限不同，发送前按各自上限截断
  const refs = opts.maxReferences > 0 ? lastRefs.slice(0, opts.maxReferences) : [];
  const dataUrls = await Promise.all(
    refs.map(async (blob) => await blobToDataURL(blob)),
  );
  const startedAt = performance.now();
  try {
    const result = await generateImage(
      {
        model: modelId,
        prompt,
        resolution: opts.resolution ?? undefined,
        aspect_ratio: opts.aspectRatio ?? undefined,
        input_references: dataUrls.length
          ? dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))
          : undefined,
        n: taskIds.length > 1 ? taskIds.length : undefined,
      },
      { apiKey, signal },
    );
    const seconds = (performance.now() - startedAt) / 1000;
    return { kind: "success", taskIds, images: result.images, seconds, costUsd: result.costUsd };
  } catch (e) {
    if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
      // 用户取消：卡标失败"已取消"但不入库；超时（timeout abort）按失败入库
      return e.name === "TimeoutError"
        ? { kind: "failure", taskIds, message: "请求超时（180 秒），模型太慢或网络不佳" }
        : { kind: "failure", taskIds, message: "已取消" };
    }
    return { kind: "failure", taskIds, message: e instanceof Error ? e.message : String(e) };
  }
}

function update(outcome: Outcome) {
  if (outcome.kind === "success") {
    // 一次请求的多张图按序分发给同模型的任务卡；
    // 整单成本按张均摊入库（usage.cost 是这一单的总价）
    const share = outcome.costUsd != null ? outcome.costUsd / Math.max(1, outcome.taskIds.length) : undefined;
    outcome.taskIds.forEach((taskId, index) => {
      const task = generationStore.state.tasks[taskId];
      if (!task) return;
      const image = outcome.images[index];
      if (!image) {
        // 模型没给够 n 张：缺的卡标失败
        failTask(taskId, `模型仅返回 ${outcome.images.length} 张`);
        return;
      }
      const recordId = crypto.randomUUID();
      const w = "blob" in image ? image.width : 0;
      const h = "blob" in image ? image.height : 0;
      const label = w && h ? sizeLabel(w, h, task.resolution ?? "") : "";
      patchTask(taskId, {
        phase: "done",
        blob: "blob" in image ? image.blob : undefined,
        remoteUrl: "remoteUrl" in image ? image.remoteUrl : undefined,
        width: w,
        height: h,
        seconds: outcome.seconds,
        costUsd: share,
        sizeLabel: label,
        recordId,
        parentRecordId: lastParentRecordId ?? undefined,
      });
      const record: GenerationRecord = {
        recordId,
        batchId,
        parentRecordId: lastParentRecordId ?? undefined,
        modelId: task.modelId,
        modelName: task.name,
        prompt: task.promptOverride ?? lastPrompt,
        createdAt: Date.now(),
        seconds: outcome.seconds,
        status: "done",
        costUsd: share ?? 0,
        referenceCount: lastRefs.length,
        liked: 0,
        resolution: task.resolution ?? "",
        aspectRatio: task.aspectRatio ?? "",
        width: w,
        height: h,
        imageId: "blob" in image ? `img-${recordId}` : undefined,
        remoteUrl: "remoteUrl" in image ? image.remoteUrl : undefined,
        referenceImageIds: lastRefImageIds,
        intentPrompt: task.promptOverride != null ? lastPrompt : undefined,
        seriesIndex: task.seriesIndex,
        retryOfRecordId: task.retryOfRecordId,
      };
      void putRecord(record, "blob" in image ? image.blob : undefined).then(() =>
        // 重试成功的替换语义：删掉被重试的那条失败记录
        deleteIfFailed(task.retryOfRecordId),
      );
    });
  } else {
    for (const taskId of outcome.taskIds) {
      failTask(taskId, outcome.message);
    }
  }
}

function failTask(taskId: string, message: string) {
  const task = generationStore.state.tasks[taskId];
  if (!task) return;
  patchTask(taskId, { phase: "failed", errorMessage: message });
  // 失败也入库（取消不算，价值低）；记录能还原每一轮的完整经过
  if (message === "已取消") return;
  const recordId = crypto.randomUUID();
  const record: GenerationRecord = {
    recordId,
    batchId,
    modelId: task.modelId,
    modelName: task.name,
    prompt: task.promptOverride ?? lastPrompt,
    createdAt: Date.now(),
    seconds: 0,
    status: "failed",
    errorMessage: message,
    costUsd: 0,
    referenceCount: lastRefs.length,
    liked: 0,
    resolution: task.resolution ?? "",
    aspectRatio: task.aspectRatio ?? "",
    width: 0,
    height: 0,
    referenceImageIds: lastRefImageIds,
    intentPrompt: task.promptOverride != null ? lastPrompt : undefined,
    seriesIndex: task.seriesIndex,
    retryOfRecordId: task.retryOfRecordId,
  };
  putRecord(record);
}
