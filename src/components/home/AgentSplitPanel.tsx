// Agent 拆分面板（对应 ContentView 的拆分面板 + AgentPromptList + SplitConfirmSheet）：
// 拆分中 = 流式打印（思考淡色小字 + 正文等宽打字机感，自动滚底跟随）；
// 完成 = 可折叠「思考」+ 编号子 prompt 清单（第 k 条 = 第 k 张卡）；
// 失败 = 橙色原因 + 已收到的原始输出留档；splitPending = 确认对话框。
import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { generationStore } from "@/stores/generation";
import { settingsStore, updateSettings } from "@/stores/settings";
import { amendSplit, cancelSplitReview, confirmSplit } from "@/lib/generation/engine";
import { cn } from "@/lib/utils";

export function AgentSplitPanel() {
  const isPlanning = useStore(generationStore, (s) => s.isPlanning);
  const reasoning = useStore(generationStore, (s) => s.planningReasoning);
  const text = useStore(generationStore, (s) => s.planningText);
  const error = useStore(generationStore, (s) => s.planningError);
  const subPrompts = useStore(generationStore, (s) => s.lastSubPrompts);
  const splitPending = useStore(generationStore, (s) => s.splitPending);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = isPlanning || !!error || subPrompts.length > 0;
  if (!active) return null;

  // 流式自动滚到底跟随
  useEffect(() => {
    if (isPlanning && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  return (
    <div className="rounded-xl border bg-card p-3">
      {isPlanning && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto">
          {reasoning && (
            <p className="break-words whitespace-pre-wrap font-mono text-xs text-muted-foreground/60 [overflow-wrap:anywhere]">
              {reasoning}
            </p>
          )}
          <p className="mt-1 break-words whitespace-pre-wrap font-mono text-sm [overflow-wrap:anywhere]">{text}</p>
        </div>
      )}
      {!isPlanning && error && (
        <div className="space-y-2">
          <p className="text-sm text-orange-500">{error}</p>
          {text && (
            <p className="max-h-32 overflow-y-auto break-words whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {text}
            </p>
          )}
        </div>
      )}
      {!isPlanning && !error && subPrompts.length > 0 && (
        <CompletedPanel reasoning={reasoning} subPrompts={subPrompts} />
      )}
      <SplitConfirmDialog open={splitPending} />
    </div>
  );
}

function CompletedPanel({ reasoning, subPrompts }: { reasoning: string; subPrompts: string[] }) {
  const [showReasoning, setShowReasoning] = useState(false);
  return (
    <div>
      {reasoning && (
        <div className="mb-2">
          <button
            className="text-xs text-muted-foreground"
            onClick={() => setShowReasoning((v) => !v)}
          >
            {showReasoning ? "收起思考" : "展开思考"}
          </button>
          {showReasoning && (
            <p className="mt-1 max-h-32 overflow-y-auto break-words whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {reasoning}
            </p>
          )}
        </div>
      )}
      <AgentPromptList prompts={subPrompts} />
    </div>
  );
}

/** 编号子提示词清单：序号等宽字体 tint 色 + 正文；顺序对应卡片角标 */
export function AgentPromptList({ prompts }: { prompts: string[] }) {
  return (
    <ol className="space-y-1.5">
      {prompts.map((p, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="shrink-0 font-mono text-xs leading-6 text-primary">{i + 1}.</span>
          <span className="min-w-0 break-words leading-6 [overflow-wrap:anywhere]">{p}</span>
        </li>
      ))}
    </ol>
  );
}

/** 拆分确认（对应 SplitConfirmSheet）：编号清单 + 追加修正（可连改）+ 下次跳过确认 */
function SplitConfirmDialog({ open }: { open: boolean }) {
  const subPrompts = useStore(generationStore, (s) => s.lastSubPrompts);
  const ask = useStore(settingsStore, (s) => s.askSplitConfirmation);
  const [amending, setAmending] = useState(false);
  const [amendment, setAmendment] = useState("");

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>拆分完成，先过目</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto">
          <p className="mb-2 text-xs text-muted-foreground">顺序对应卡片</p>
          <AgentPromptList prompts={subPrompts} />
        </div>
        {amending ? (
          <div className="space-y-2">
            <Textarea
              autoFocus
              placeholder="修正要求，如：第 3 张换成夜景…"
              value={amendment}
              onChange={(e) => setAmendment(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmending(false)}>
                返回
              </Button>
              <Button
                size="sm"
                disabled={!amendment.trim()}
                onClick={() => {
                  void amendSplit(amendment);
                  setAmending(false);
                  setAmendment("");
                }}
              >
                重新拆分
              </Button>
            </div>
          </div>
        ) : (
          <button
            className={cn("text-sm text-primary underline underline-offset-2")}
            onClick={() => setAmending(true)}
          >
            追加修正…
          </button>
        )}
        <label className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">下次跳过确认，拆完直接生成</span>
          <Switch checked={!ask} onCheckedChange={(v) => updateSettings({ askSplitConfirmation: !v })} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => cancelSplitReview()}>
            取消
          </Button>
          <Button onClick={() => void confirmSplit()}>开始生成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
