// 设置页（对应 SettingsView）：API key（输入时快速验证：有效立即标识并异步开始批量
// 翻译；无效立刻显示原因）/ 受限模型同域代理 / 翻译模型 / 按张计费上限 / Agent 拆分
// （确认开关 + 系统提示词）/ 计价单位 gpt2 说明（含实时汇率）。更新日志独立成页。
// 关闭页面时补翻描述（换翻译模型的场景）。
import { useEffect, useRef, useState } from "react";
import { storedSetting, setThemeSetting, type ThemeSetting } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { settingsStore, updateSettings } from "@/stores/settings";
import { RESTRICTED_COUNTRIES, regionName, useLoc } from "@/lib/region/loc";
import { SPLIT_SYSTEM_PROMPT_DEFAULT, verifyApiKey } from "@/lib/openrouter/client";
import { ensureTranslations } from "@/lib/translate/translate";
import { GPT2_BASE_PRICE } from "@/lib/catalog/pricing";
import { cachedRate, fetchRate } from "@/lib/rate/rate";
import { useCatalog } from "@/lib/catalog/useCatalog";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

/** 完整 key 的形状：sk-or-v1- + 64 位 hex。粘贴场景一次 onChange 就是完整 key ——
 *  识别到即触发（验证 + 翻译并行），不等 debounce */
const COMPLETE_KEY_RE = /^sk-or-v1-[a-f0-9]{64}$/;

type KeyCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "valid";
      label?: string;
      pendingTranslations: number;
      account: {
        usageMonthly?: number;
        usageDaily?: number;
        limitRemaining?: number | null;
        isFreeTier?: boolean;
        expiresAt?: string | null;
      };
    }
  | { status: "invalid"; error: string };

function ApiKeySection({
  catalogReady,
  models,
}: {
  catalogReady: boolean;
  models: Parameters<typeof ensureTranslations>[0];
}) {
  const apiKey = useStore(settingsStore, (st) => st.apiKey);
  const [check, setCheck] = useState<KeyCheckState>({ status: "idle" });
  const verifyCtrl = useRef<AbortController | null>(null);
  const firedKey = useRef<string>(""); // 同一个 key 只触发一次验证+翻译

  // key 变化：完整格式立即触发；不完整则 debounce 后验证。验证与翻译并行 ——
  // key 无效时翻译批会失败（401 不计费），不让验证的往返拖慢首译
  useEffect(() => {
    const key = apiKey.trim();
    if (!key) {
      setCheck({ status: "idle" });
      firedKey.current = "";
      return;
    }
    if (firedKey.current === key) return; // 已触发过

    const fire = () => {
      firedKey.current = key;
      // 翻译：立即异步开跑（不等验证结果）；返回值 = 真实待翻数，
      // 0 表示缓存已全覆盖，文案不能再说「翻译进行中」
      const pendingTranslations = catalogReady ? ensureTranslations(models) : 0;
      // 验证：只做标识
      verifyCtrl.current?.abort();
      const ctrl = new AbortController();
      verifyCtrl.current = ctrl;
      setCheck({ status: "checking" });
      void verifyApiKey(key, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setCheck(
            r.ok
              ? {
                  status: "valid",
                  label: r.label,
                  pendingTranslations,
                  account: {
                    usageMonthly: r.usageMonthly,
                    usageDaily: r.usageDaily,
                    limitRemaining: r.limitRemaining,
                    isFreeTier: r.isFreeTier,
                    expiresAt: r.expiresAt,
                  },
                }
              : { status: "invalid", error: r.error ?? "key 无效" },
          );
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setCheck({ status: "idle" });
        });
    };

    if (COMPLETE_KEY_RE.test(key)) {
      fire();
      return;
    }
    const timer = setTimeout(fire, 600); // 手动输入/粘贴不完整 key：等输入停稳
    return () => clearTimeout(timer);
  }, [apiKey, catalogReady, models]);

  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <Label htmlFor="api-key">OpenRouter API Key</Label>
      <Input
        id="api-key"
        type="password"
        autoComplete="off"
        placeholder="sk-or-v1-…"
        value={apiKey}
        onChange={(e) => updateSettings({ apiKey: e.target.value })}
      />
      {check.status === "checking" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          正在验证 key…
        </p>
      )}
      {check.status === "valid" && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-green-600">
            <Check className="size-3.5" />
            key 有效{check.label ? ` · ${check.label}` : ""}
            {check.account.isFreeTier ? " · 免费档" : ""}
            {check.pendingTranslations > 0
              ? `，模型描述翻译已在后台进行（${check.pendingTranslations} 条）`
              : ""}
          </p>
          {/* 账户概况（真实账单数据，仅设置页展示） */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {typeof check.account.usageMonthly === "number" && (
              <span>本月消费 ${check.account.usageMonthly.toFixed(2)}</span>
            )}
            {typeof check.account.usageDaily === "number" && (
              <span>今日 ${check.account.usageDaily.toFixed(2)}</span>
            )}
            {typeof check.account.limitRemaining === "number" && check.account.limitRemaining >= 0 && (
              <span
                className={
                  check.account.limitRemaining < 1 ? "text-orange-500" : undefined
                }
              >
                剩余额度 ${check.account.limitRemaining.toFixed(2)}
              </span>
            )}
            {check.account.expiresAt && (
              <span>有效期至 {new Date(check.account.expiresAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
      )}
      {check.status === "invalid" && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <TriangleAlert className="size-3.5" />
          {check.error}，请检查后重填
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        只存在本机浏览器（localStorage），不经过任何第三方服务器。没有 key 到{" "}
        <a
          className="underline underline-offset-2"
          href="https://openrouter.ai/settings/keys"
          target="_blank"
          rel="noreferrer"
        >
          openrouter.ai/settings/keys
        </a>{" "}
        创建。
      </p>
    </section>
  );
}

/** 受限模型同域代理：经本站固定海外出口转发（CF Worker → 海外透传链路，见 worker/index.ts；默认关） */
function ProxySection() {
  const s = useStore(settingsStore);
  const loc = useLoc().data;
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <label className="flex items-center justify-between text-sm">
        <span>受限模型走同域代理</span>
        <Switch
          checked={s.proxyEnabled}
          onCheckedChange={(v) => updateSettings({ proxyEnabled: v })}
        />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        部分模型（如 GPT Image）不允许中国大陆 IP 直连。开启后，这类模型的请求改经本站海外出口转发，无需自备代理；API
        key 仍只存本机浏览器，全程仅透传不存储。直连被 403 拦截的模型会自动记录，并在短暂倒计时后自动重试。
      </p>
      {loc && (
        <p
          className={cn(
            "text-xs",
            RESTRICTED_COUNTRIES.has(loc) ? "text-orange-600" : "text-green-600",
          )}
        >
          {RESTRICTED_COUNTRIES.has(loc)
            ? `当前 IP 位于${regionName(loc)}，建议开启。`
            : `当前 IP 位于${regionName(loc)}，可能无需开启。`}
        </p>
      )}
      {s.proxyModels.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">已记录的受限模型</Label>
            <button
              className="text-xs text-primary underline underline-offset-2"
              onClick={() => updateSettings({ proxyModels: [] })}
            >
              清除记录
            </button>
          </div>
          <p className="font-mono text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {s.proxyModels.join("、")}
          </p>
        </div>
      )}
    </section>
  );
}

function SettingsPage() {
  const s = useStore(settingsStore);
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>(() => storedSetting());
  const catalog = useCatalog();
  const rate = useQuery({
    queryKey: ["rate", "USD"],
    queryFn: fetchRate,
    staleTime: 60 * 60 * 1000,
    initialData: cachedRate,
  }).data!;

  // 设置页卸载时补翻（刚填 key 或换翻译模型）
  useEffect(() => {
    return () => {
      if (catalog.state === "idle") ensureTranslations(catalog.models);
    };
  }, [catalog.state, catalog.models]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-xl space-y-6 pb-8">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <Label>主题</Label>
          <div className="flex gap-1.5">
            {(
              [
                ["system", "跟随系统"],
                ["light", "浅色"],
                ["dark", "深色"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={cn(
                  "h-8 rounded-full border px-3 text-sm transition-colors",
                  themeSetting === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
                onClick={() => {
                  setThemeSetting(value);
                  setThemeSettingState(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">默认跟随系统；选「跟随系统」时系统的深浅切换实时生效。</p>
        </section>

        <ApiKeySection catalogReady={catalog.state === "idle"} models={catalog.models} />

        <ProxySection />

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <Label htmlFor="translate-model">翻译模型</Label>
          <Input
            id="translate-model"
            className="font-mono"
            placeholder="deepseek/deepseek-v4-flash"
            value={s.translateModel}
            onChange={(e) => updateSettings({ translateModel: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            模型描述翻译与 Agent 拆分共用。默认 deepseek/deepseek-v4-flash（便宜）；
            注意 Google 系模型在国内区域 403。
          </p>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <Label>按张计费上限</Label>
          <div className="flex gap-1.5">
            {["512", "1K", "2K", "4K"].map((cap) => (
              <button
                key={cap}
                className={`h-8 rounded-full border px-3 text-sm transition-colors ${
                  s.flatResolutionCap === cap
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => updateSettings({ flatResolutionCap: cap })}
              >
                {cap}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            按张计费的模型同价白拿清晰度 —— 发送时自动用不超此上限的最高分辨率档。
          </p>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label>Agent 拆分</Label>
          <label className="flex items-center justify-between text-sm">
            <span>拆分完成后先确认</span>
            <Switch
              checked={s.askSplitConfirmation}
              onCheckedChange={(v) => updateSettings({ askSplitConfirmation: v })}
            />
          </label>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">系统提示词</Label>
              <button
                className="text-xs text-primary underline underline-offset-2"
                onClick={() => updateSettings({ splitSystemPrompt: "" })}
              >
                恢复默认
              </button>
            </div>
            <Textarea
              className="min-h-32 font-mono text-xs"
              placeholder={SPLIT_SYSTEM_PROMPT_DEFAULT}
              value={s.splitSystemPrompt}
              onChange={(e) => updateSettings({ splitSystemPrompt: e.target.value })}
            />
          </div>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
          <Label>计价单位 gpt2</Label>
          <p className="text-xs leading-5 text-muted-foreground">
            基准 = GPT Image 2 实测均价 ${GPT2_BASE_PRICE.toFixed(3)}/张（1024² 输出）。
            模型行的「N gpt2」= 该模型单价是基准的 N 倍；「≈」表示按实测估算。
            当前汇率 1 USD ≈ ¥{rate.toFixed(2)}（获取失败按 7.0）。
            看真实账单去{" "}
            <a
              className="underline underline-offset-2"
              href="https://openrouter.ai/activity"
              target="_blank"
              rel="noreferrer"
            >
              openrouter.ai/activity
            </a>
            。
          </p>
        </section>
      </div>
    </div>
  );
}
