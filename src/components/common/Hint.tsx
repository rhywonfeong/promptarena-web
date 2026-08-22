// 统一 hover 提示（shadcn Tooltip 封装）。全应用不要用原生 title —— 又慢又不可样式化。
// Provider 挂在 __root（delayDuration 300ms）。
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Hint({
  label,
  children,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
