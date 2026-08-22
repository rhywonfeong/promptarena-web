// /history 布局层：flat 路由里 history.$batchId 是本路由的子路由，
// 详情页渲染在这里的 Outlet（列表在 history.index.tsx —— 曾因列表无 Outlet
// 导致「URL 变了页面没动」）
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: () => <Outlet />,
});
