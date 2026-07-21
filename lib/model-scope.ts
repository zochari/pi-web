import type { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * Raw settings shape extended with the pi-web-specific `enabledProviders` field.
 * The pi SDK's `Settings` schema does not declare this key, so callers read it off
 * the parsed object returned by SettingsManager.getGlobalSettings()/getProjectSettings().
 */
type SettingsWithProviders = { enabledProviders?: unknown };

/**
 * Read the pi-web-specific `enabledProviders` whitelist from settings.
 *
 * `enabledProviders` is a string[] of provider names (e.g. ["ollama-cloud",
 * "opencode-go"]). It is NOT part of the pi SDK's `Settings` schema — the SDK's
 * SettingsManager has no getter for it — so we read it off the raw parsed settings
 * object, merging global + project scopes.
 *
 * Returns the deduplicated provider list, or `undefined` when unset/empty. An
 * `undefined` result means "no provider filter" — every provider is shown — so
 * existing setups without this field behave exactly as before.
 */
export function getEnabledProviders(settings: SettingsManager): string[] | undefined {
  const lists: unknown[] = [
    (settings.getGlobalSettings() as unknown as SettingsWithProviders).enabledProviders,
    (settings.getProjectSettings() as unknown as SettingsWithProviders).enabledProviders,
  ];
  const merged: string[] = [];
  for (const ep of lists) {
    if (Array.isArray(ep)) {
      for (const entry of ep) {
        if (typeof entry === "string" && entry.length > 0) merged.push(entry);
      }
    }
  }
  return merged.length > 0 ? Array.from(new Set(merged)) : undefined;
}

const THINKING_SUFFIXES = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

function stripThinkingSuffix(modelRef: string): string {
  const trimmed = modelRef.trim();
  const colonIndex = trimmed.lastIndexOf(":");
  if (colonIndex === -1) return trimmed;
  const suffix = trimmed.substring(colonIndex + 1);
  return THINKING_SUFFIXES.has(suffix) ? trimmed.substring(0, colonIndex) : trimmed;
}

/**
 * Scope a model list by both whitelists, applied as an intersection:
 *   - `settings.enabledProviders` (pi-web-specific; provider granularity)
 *   - `settings.enabledModels`    (pi SDK; `provider/modelId` granularity,
 *                                  with `:thinking` suffixes stripped)
 *
 * Each is optional:
 *   - enabledProviders unset/empty -> no provider filter
 *   - enabledModels unset/empty     -> no model filter
 *
 * `enabledModels` refs may carry a `:thinking` suffix (e.g.
 * `ollama-cloud/kimi-k2.7-code:thinking`); the suffix is stripped before
 * matching so a suffixed ref still enables the base model. Refs match by
 * `provider/modelId` OR bare `modelId`.
 */
export function scopeAvailableModels<T extends { provider: string; id: string }>(
  models: readonly T[],
  settings: SettingsManager,
): T[] {
  const providers = getEnabledProviders(settings);
  const providerSet = providers ? new Set(providers) : null;
  const enabledPatterns = settings.getEnabledModels();
  const enabledSet =
    enabledPatterns && enabledPatterns.length > 0
      ? new Set(enabledPatterns.map(stripThinkingSuffix).filter(Boolean))
      : null;

  let scoped = [...models];
  if (providerSet) scoped = scoped.filter((m) => providerSet.has(m.provider));
  if (enabledSet) scoped = scoped.filter((m) => enabledSet.has(`${m.provider}/${m.id}`) || enabledSet.has(m.id));
  return scoped;
}