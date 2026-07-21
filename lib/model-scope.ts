import type { SettingsManager } from "@earendil-works/pi-coding-agent";

const THINKING_SUFFIXES = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function stripThinkingSuffix(modelRef: string): string {
  const trimmed = modelRef.trim();
  const colonIndex = trimmed.lastIndexOf(":");
  if (colonIndex === -1) return trimmed;
  const suffix = trimmed.substring(colonIndex + 1);
  return THINKING_SUFFIXES.has(suffix) ? trimmed.substring(0, colonIndex) : trimmed;
}

/**
 * Scope a model list by the user's `enabledModels` whitelist.
 *
 * `enabledModels` refs may carry a `:thinking` suffix (e.g.
 * `ollama-cloud/kimi-k2.7-code:thinking`); the suffix is stripped before
 * matching so a suffixed ref still enables the base model. Refs match by
 * `provider/modelId` OR bare `modelId`.
 *
 * When `enabledModels` is unset/empty, every model is shown (no filter).
 */
export function scopeAvailableModels<T extends { provider: string; id: string }>(
  models: readonly T[],
  settings: SettingsManager,
): T[] {
  const enabledPatterns = settings.getEnabledModels();
  if (!enabledPatterns || enabledPatterns.length === 0) {
    return [...models];
  }
  const enabledSet = new Set(enabledPatterns.map(stripThinkingSuffix).filter(Boolean));
  return models.filter((m) => enabledSet.has(`${m.provider}/${m.id}`) || enabledSet.has(m.id));
}