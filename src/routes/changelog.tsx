// 更新日志独立页（用户向内容见 lib/updates/changelog.ts，倒序展示；
// 新增/优化/修复用彩色标签区分）
import { createFileRoute } from "@tanstack/react-router";
import { CHANGELOG, type ChangeType } from "@/lib/updates/changelog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});

const TYPE_LABEL: Record<ChangeType, string> = {
  new: "新增",
  improve: "优化",
  fix: "修复",
};

const TYPE_CLASS: Record<ChangeType, string> = {
  new: "bg-green-500/10 text-green-600 dark:text-green-400",
  improve: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  fix: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function ChangelogPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-xl space-y-4 pb-8">
        <h1 className="text-lg font-semibold">更新日志</h1>
        {CHANGELOG.map((entry) => (
          <section key={entry.date} className="space-y-2.5 rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">{entry.date}</p>
            <ul className="space-y-2">
              {entry.items.map((item) => (
                <li key={item.text} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      TYPE_CLASS[item.type],
                    )}
                  >
                    {TYPE_LABEL[item.type]}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
