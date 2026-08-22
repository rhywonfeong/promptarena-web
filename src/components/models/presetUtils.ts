// 预设（阵容）小工具：有效成员（模型下架自动过滤）+ 集合相等
export function effectiveMembers(preset: { modelIds: string[] }, activeModelIds: string[]): string[] {
  return preset.modelIds.filter((id) => activeModelIds.includes(id));
}

export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}
