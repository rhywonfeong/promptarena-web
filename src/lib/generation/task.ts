// 任务卡类型（对应 PA/Models/GenerationTask.swift）+ 序号表

/** 一个"给某模型发这条 prompt"的任务卡片 */
export interface GenerationTask {
  /** 唯一身份：同一模型多张时为 "modelId#k"，其余情况就是 modelId */
  id: string;
  /** 真实模型 id（发请求 / 入库 / payload 用）—— id 唯一化后两者不再恒等 */
  modelId: string;
  /** 模型显示名 */
  name: string;
  /** 该模型参考图上限（发送时按它截断） */
  maxReferences: number;
  /** 该模型实际要传的生成参数（构造时已按模型支持情况过滤，null = 用默认） */
  resolution: string | null;
  aspectRatio: string | null;
  /** 三态 */
  phase: "loading" | "done" | "failed";
  blob?: Blob;
  remoteUrl?: string; // URL 结果跨域下载失败的兜底（只展示）
  width?: number;
  height?: number;
  seconds?: number;
  errorMessage?: string;
  liked: boolean; // 点赞（同步写回 GenerationRecord）
  recordId?: string; // 入库后的记录 id，点赞时定位到它
  sizeLabel?: string; // 实际尺寸标签（如 "2048×2048 (2K)"），出图后设置
  /** 本卡实际消耗（$/张，多张单均摊）；null = 上游没报 usage */
  costUsd?: number;
  parentRecordId?: string; // 编辑链：由哪条记录演进而来
  /** 智能分工时该卡自己的提示词（Agent 拆出的单张 prompt）；null = 共用本轮 prompt */
  promptOverride?: string;
  /** 同模型组内的张序（0 起）：序号角标与大图序号用；入库随记录走（历史还原用） */
  seriesIndex: number;
  /** 重试来源：本卡重试前那条失败记录的 id（成功后自动删除它） */
  retryOfRecordId?: string;
  /** 疑似地区受限（403）时自动经代理重试的时间点（epoch ms）；undefined = 无 */
  autoRetryAt?: number;
  /** 本次失败疑似地区受限（403）；开关未开时卡片据此显示「开启代理并重试」 */
  regionBlocked?: boolean;
}

/** 同模型多张的序号表（task.id → "k/N"）。按 seriesIndex（生成张序）排；
 *  单张模型不进表。结果网格角标与大图头部序号共用，保证口径一致 */
export function sequenceLabels(tasks: GenerationTask[]): Record<string, string> {
  const labels: Record<string, string> = {};
  const groups = new Map<string, { task: GenerationTask; offset: number }[]>();
  tasks.forEach((task, offset) => {
    const list = groups.get(task.modelId) ?? [];
    list.push({ task, offset });
    groups.set(task.modelId, list);
  });
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.task.seriesIndex - b.task.seriesIndex || a.offset - b.offset);
    members.forEach(({ task }, index) => {
      labels[task.id] = `${index + 1}/${members.length}`;
    });
  }
  return labels;
}
