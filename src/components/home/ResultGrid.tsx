// 结果网格：居中网格 + 序号表。订阅 taskOrder（id 变化才重排），
// 单卡内容由 ResultCardView 自行订阅 store（谁先亮谁先渲染）。
import { useStore } from "@tanstack/react-store";
import { generationStore } from "@/stores/generation";
import { sequenceLabels } from "@/lib/generation/task";
import { WaterfallGrid } from "@/components/common/WaterfallGrid";
import { ResultCardView } from "./ResultCard";

export function ResultGrid() {
  const tasks = useStore(generationStore, (s) => s.taskOrder.map((id) => s.tasks[id]));
  const list = tasks?.filter(Boolean) ?? [];
  const labels = sequenceLabels(list);

  return (
    <WaterfallGrid
      items={list}
      itemKey={(t) => t.id}
      renderItem={(t, columnWidth) => (
        <ResultCardView task={t} sequence={labels[t.id]} columnWidth={columnWidth} />
      )}
    />
  );
}
