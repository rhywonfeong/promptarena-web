// 高清晰化后台任务（对应 UpscaleStore）：原图作参考图 + 原 prompt + 更高分辨率档
// 重新生成（不是算法放大）。独立后台任务，可多个并行、可切页面（SPA 常驻）。
import { Store } from "@tanstack/react-store";

export interface UpscaleTask {
  id: string;
  recordId: string;
  modelId: string;
  modelName: string;
  /** 目标档位 */
  resolution: string;
  phase: "loading" | "done" | "failed";
  errorMessage?: string;
}

interface UpscaleState {
  tasks: UpscaleTask[];
}

export const upscaleStore = new Store<UpscaleState>({ tasks: [] });

function patchUpscale(patch: Partial<UpscaleState>) {
  upscaleStore.setState((s) => ({ ...s, ...patch }));
}

export function addUpscaleTask(task: UpscaleTask) {
  patchUpscale({ tasks: [...upscaleStore.state.tasks, task] });
}

export function updateUpscaleTask(id: string, patch: Partial<UpscaleTask>) {
  patchUpscale({
    tasks: upscaleStore.state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
}

export function runningUpscaleCount(): number {
  return upscaleStore.state.tasks.filter((t) => t.phase === "loading").length;
}
