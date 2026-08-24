// 更新日志（用户向：只写用户能感知、受影响的变化，不写内部实现细节）。新条目加最上面。
export type ChangeType = "new" | "improve" | "fix";

export interface ChangelogItem {
  type: ChangeType;
  text: string;
}

export interface ChangelogEntry {
  /** 发布日期（本地时区） */
  date: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-08-24",
    items: [
      {
        type: "new",
        text: "受限模型代理 —— 部分模型（如 GPT Image）不允许中国大陆 IP 直连，可在设置里开启「受限模型走同域代理」，无需自备梯子；直连被拦的模型会自动记录并自动重试",
      },
      { type: "new", text: "新版本上线后自动刷新页面，不用再手动刷新" },
      { type: "new", text: "更新日志" },
      { type: "improve", text: "大图查看器的点赞按钮贴到图像右上角；点「编辑此图」后输入框自动聚焦" },
      { type: "improve", text: "长提示词点生成后，输入框高度立即还原" },
      { type: "improve", text: "同一提示词反复失败，历史里不再重复堆积记录" },
      { type: "fix", text: "点赞页看不到已点赞图片的问题" },
    ],
  },
];
