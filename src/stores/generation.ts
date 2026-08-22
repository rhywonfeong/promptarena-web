// 生成运行时 store（不持久化 —— 任务卡是内存态，记录在 Dexie）。
// ResultCard 用 useSelector 单卡订阅：谁先出结果谁先亮，其他卡不重渲染
// （对应 Swift @Observable 逐卡观察）。
import { Store } from "@tanstack/react-store";
import type { GenerationTask } from "@/lib/generation/task";

export interface GenerationEstimate {
  usd: number;
  imageCount: number;
  unpricedCount: number;
}

export interface GenerationState {
  tasks: Record<string, GenerationTask>;
  taskOrder: string[];
  /** 输入条草稿：提示词 + 参考图（选图瞬间即压缩：长边 1536 + JPEG 0.8；
   *  original 记录压缩前的尺寸/体积，查看时体现压缩） */
  draftPrompt: string;
  draftReferences: { id: string; blob: Blob; original?: { width: number; height: number; size: number; name?: string } }[];
  /** 编辑入口设置：本图演进自哪条记录（start 时消费） */
  pendingParentRecordId: string | null;
  isRunning: boolean;
  /** Agent 拆分中（提示词规划阶段，还没发图） */
  isPlanning: boolean;
  /** 拆分阶段的流式输出（实时渲染在拆分面板）：思考 + 正文，边收边长 */
  planningReasoning: string;
  planningText: string;
  /** 最近一次拆分失败的原因（非 null = 本轮没进生成阶段、无任务卡） */
  planningError: string | null;
  /** 拆分结果待确认：拆完停在这等用户（开始生成 / 追加修正 / 取消）。
   *  确认前不创建任务卡 —— 生成是花钱的事，拆分结果先过目 */
  splitPending: boolean;
  /** 本轮 Agent 拆分出的子提示词（顺序 = 任务卡顺序；空 = 本轮非智能分工） */
  lastSubPrompts: string[];
  /** 本轮的 prompt（生成后输入框已清空，结果区/重试用它） */
  currentPrompt: string;
  /** 本轮参考图的 images id（结果区点开对比用；空 = 纯文生图） */
  lastReferenceImageIds: string[];
  /** 本轮参考图缩略 blob（结果区展示） */
  lastReferenceBlobs: Blob[];
  /** 一次性提示（如"已跳过 N 个不支持参考图的模型"），显示后被清除 */
  notice: string | null;
  estimate: GenerationEstimate | null;
}

export const generationStore = new Store<GenerationState>({
  tasks: {},
  taskOrder: [],
  draftPrompt: "",
  draftReferences: [],
  pendingParentRecordId: null,
  isRunning: false,
  isPlanning: false,
  planningReasoning: "",
  planningText: "",
  planningError: null,
  splitPending: false,
  lastSubPrompts: [],
  currentPrompt: "",
  lastReferenceImageIds: [],
  lastReferenceBlobs: [],
  notice: null,
  estimate: null,
});

export function patchTask(id: string, patch: Partial<GenerationTask>) {
  generationStore.setState((s) => {
    const task = s.tasks[id];
    if (!task) return s;
    return { ...s, tasks: { ...s.tasks, [id]: { ...task, ...patch } } };
  });
}

/** 部分更新（此版本 setState 只接受返回完整 state 的 updater） */
export function patchGeneration(patch: Partial<GenerationState>) {
  generationStore.setState((s) => ({ ...s, ...patch }));
}
