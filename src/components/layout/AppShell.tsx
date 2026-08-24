import { Link, useMatches } from "@tanstack/react-router";
import { Heart, History, Images, ScrollText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/** 顶栏导航 + 内容区 + 全局 overlay 挂载点（查看器等在 __root 层挂，切路由不卸载）。
 *  主题切换在设置页（默认跟随系统，见 lib/theme）。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const matches = useMatches();
  const current = matches[matches.length - 1]?.fullPath ?? "/";

  const nav = [
    { to: "/models", label: "模型", icon: Images, match: "/models" },
    { to: "/history", label: "历史", icon: History, match: "/history" },
    { to: "/liked", label: "点赞", icon: Heart, match: "/liked" },
    { to: "/changelog", label: "日志", icon: ScrollText, match: "/changelog" },
    { to: "/settings", label: "设置", icon: Settings, match: "/settings" },
  ] as const;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* pt-safe：刘海屏顶部安全区 */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] sm:px-3">
        <Link to="/" className="mr-1 flex items-center gap-2 font-semibold sm:mr-2">
          <img src="/icon-192.png" alt="" className="size-6 rounded-md" />
          <span className="hidden sm:inline">生图大乱斗</span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                // 小屏：只留图标（≥44px 触摸目标）；sm 起带文字
                "flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm",
                current === item.match && "bg-accent text-foreground",
              )}
              aria-label={item.label}
            >
              <item.icon className="size-5 sm:size-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
