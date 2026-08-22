// 模型目录 hook：三个 TanStack Query（models 公开端点为主，cards/icons 静默增强）
// + 库内实测均价（useLiveQuery）。价格/logo/短名不阻塞列表出现 —— 到了自动刷新。
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { fetchAuthorIcons, fetchImageCards, fetchImageModels } from "@/lib/openrouter/client";
import type { ImageModelInfo } from "@/lib/openrouter/types";
import { derivePricing, emptyPricing, type CatalogPricing } from "./pricing";
import { measuredCostPerImage } from "@/lib/db/records.repo";

export type CatalogState = "loading" | "failed" | "idle";

export interface Catalog {
  models: ImageModelInfo[];
  modelById: Record<string, ImageModelInfo>;
  pricing: CatalogPricing;
  authorIcons: Record<string, string>;
  measuredCosts: Record<string, number>;
  state: CatalogState;
  errorMessage?: string;
  refetch: () => void;
}

export function useCatalog(): Catalog {
  const modelsQuery = useQuery({
    queryKey: ["or", "image-models"],
    queryFn: ({ signal }) => fetchImageModels(signal),
    staleTime: 12 * 60 * 60 * 1000,
  });
  // cards / icons 静默增强：失败不挡列表（打开模型选择页时再兜底重试）
  const cardsQuery = useQuery({
    queryKey: ["or", "image-cards"],
    queryFn: ({ signal }) => fetchImageCards(signal),
    staleTime: 12 * 60 * 60 * 1000,
    retry: false,
  });
  const iconsQuery = useQuery({
    queryKey: ["or", "author-icons"],
    queryFn: ({ signal }) => fetchAuthorIcons(signal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const measuredCosts = useLiveQuery(() => measuredCostPerImage(), [], {}) ?? {};

  const models = useMemo(
    () => [...(modelsQuery.data ?? [])].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)),
    [modelsQuery.data],
  );
  const modelById = useMemo(
    () => Object.fromEntries(models.map((m) => [m.id, m])),
    [models],
  );
  const pricing = useMemo(
    () => (cardsQuery.data ? derivePricing(cardsQuery.data) : emptyPricing()),
    [cardsQuery.data],
  );

  const state: CatalogState = modelsQuery.isPending
    ? "loading"
    : modelsQuery.isError
      ? "failed"
      : "idle";
  const errorMessage =
    modelsQuery.error instanceof Error ? modelsQuery.error.message : undefined;

  return {
    models,
    modelById,
    pricing,
    authorIcons: iconsQuery.data ?? {},
    measuredCosts,
    state,
    errorMessage,
    refetch: () => {
      modelsQuery.refetch();
      cardsQuery.refetch();
      iconsQuery.refetch();
    },
  };
}
