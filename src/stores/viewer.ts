// 大图查看器 overlay 状态。挂 __root 与 Outlet 同级 —— 载荷是内存 Blob/记录数组，
// 无法塞进 URL，切路由不卸载（upscale 后台任务同理受益）。
// 全屏内容用 overlay 不用路由（iPad 版 fullScreenCover 的 web 等价）。
import { Store } from "@tanstack/react-store";
import type { GenerationRecord } from "@/lib/db/db";
import type { GenerationTask } from "@/lib/generation/task";

/** 查看器条目：运行时任务卡（blob 在内存）或历史记录（imageId → DB blob） */
export type ViewerItem =
  | { kind: "task"; task: GenerationTask }
  | { kind: "record"; record: GenerationRecord }
  /** 本轮参考图（点开对比用，无「编辑此图」—— 防套娃；
   *  original = 压缩前信息（输入条新选的图才有，历史落库的参考图没有） */
  | { kind: "reference"; blob: Blob; original?: { width: number; height: number; size: number; name?: string } };

interface ViewerState {
  items: ViewerItem[];
  index: number;
  /** 查看器内再点开参考图/父图时，上一层内容压栈 —— 关闭时先退回上一层（Esc 同语义） */
  stack: { items: ViewerItem[]; index: number }[];
  /** 演进链 overlay（叠加在查看器之上） */
  lineageRecordId: string | null;
}

export const viewerStore = new Store<ViewerState>({
  items: [],
  index: 0,
  stack: [],
  lineageRecordId: null,
});

export function viewerOpen(items: ViewerItem[], startIndex: number) {
  viewerStore.setState((s) =>
    s.items.length > 0
      ? { ...s, stack: [...s.stack, { items: s.items, index: s.index }], items, index: startIndex }
      : { ...s, items, index: startIndex },
  );
}

/** 关闭 = 返回上一层（查看器内开过参考图/父图），没有上一层才真正关闭 */
export function viewerClose() {
  viewerStore.setState((s) => {
    const parent = s.stack.at(-1);
    if (parent) {
      return { ...s, items: parent.items, index: parent.index, stack: s.stack.slice(0, -1) };
    }
    return { items: [], index: 0, stack: [], lineageRecordId: null };
  });
}

export function viewerNavigate(delta: number) {
  viewerStore.setState((s) => ({
    ...s,
    index: Math.min(s.items.length - 1, Math.max(0, s.index + delta)),
  }));
}

export function openLineage(recordId: string) {
  viewerStore.setState((s) => ({ ...s, lineageRecordId: recordId }));
}

export function closeLineage() {
  viewerStore.setState((s) => ({ ...s, lineageRecordId: null }));
}
