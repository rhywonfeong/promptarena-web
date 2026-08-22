// 结果网格：列宽 = 容器自适应（最小列宽算列数），flex-wrap **每行居中** ——
// 数量少时（如 1 张）居中显示，多了从中间向两边延伸（用户明确要求）。
// 同批生成图尺寸接近，无需按高度贪心分列（原瀑布流已随之移除）。
import { useEffect, useRef, useState, type ReactNode } from "react";

export function WaterfallGrid<T>(props: {
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, columnWidth: number) => ReactNode;
  minColumnWidth?: number;
  gap?: number;
}) {
  const { items, itemKey, renderItem } = props;
  const minColumnWidth = props.minColumnWidth ?? 260;
  const gap = props.gap ?? 16;

  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const columnCount = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
  const columnWidth = (width - gap * (columnCount - 1)) / columnCount;

  return (
    <div ref={ref} className="flex w-full flex-wrap justify-center" style={{ gap }}>
      {width > 0 &&
        items.map((item) => (
          <div key={itemKey(item)} style={{ width: columnWidth }}>
            {renderItem(item, columnWidth)}
          </div>
        ))}
    </div>
  );
}
