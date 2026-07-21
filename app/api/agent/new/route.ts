import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { startRpcSession } from "@/lib/rpc-manager";
import { createAgentSessionServices, getAgentDir } from "@earendil-works/pi-coding-agent";
import { scopeAvailableModels } from "@/lib/model-scope";

/**
 * Resolve the default model for a new session, scoped to the user's enabledModels
 * + enabledProviders whitelists (mirrors GET /api/models). Returns the settings default
 * if available in the scoped set, else the first scoped model. Used when the client
 * creates a session without specifying a model, so the SDK's findInitialModel doesn't
 * fall through to an arbitrary openrouter model (openrouter/moonshotai/kimi-k2.6) and
 * ignore the user's settings defaultModel + enabledModels + enabledProviders.
 */
async function resolveScopedDefaultModel(cwd: string): Promise<{ provider: string; modelId: string } | null> {
  try {
    const agentDir = getAgentDir();
    const services = await createAgentSessionServices({ cwd, agentDir });
    const settings = services.settingsManager;
    const available = await services.modelRuntime.getAvailable();
    const scoped = scopeAvailableModels(available, settings);
    const dp = settings.getDefaultProvider();
    const dm = settings.getDefaultModel();
    if (dp && dm && scoped.some((m) => m.provider === dp && m.id === dm)) {
      return { provider: dp, modelId: dm };
    }
    if (scoped.length > 0) {
      return { provider: scoped[0].provider, modelId: scoped[0].id };
    }
    return null;
  } catch {
    return null;
  }
}

// POST /api/agent/new  body: { cwd: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns { sessionId, data } where sessionId is pi's real session id.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: string; [key: string]: unknown };
    const { cwd, ...command } = body;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, toolNames, thinkingLevel, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: string[]; thinkingLevel?: string; [key: string]: unknown };

    const tempKey = `__new__${Date.now()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, toolNames);

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    allowFileRoot(cwd);
    invalidateSessionListCache();

    // Apply pre-selected model before sending the prompt. If the client sent no model
    // (e.g. the /api/models fetch hadn't resolved yet), fall back to the scoped default
    // — otherwise the SDK's findInitialModel picks an arbitrary openrouter model
    // (openrouter/moonshotai/kimi-k2.6), ignoring settings defaultModel + enabledModels.
    if (provider && modelId) {
      await session.send({ type: "set_model", provider, modelId });
    } else {
      const fallback = await resolveScopedDefaultModel(cwd);
      if (fallback) {
        await session.send({ type: "set_model", provider: fallback.provider, modelId: fallback.modelId });
      }
    }

    // Apply pre-selected thinking level before sending the prompt
    if (thinkingLevel) {
      await session.send({ type: "set_thinking_level", level: thinkingLevel });
    }

    if (promptCommand.type === "ensure_session") {
      return NextResponse.json({ success: true, sessionId: realSessionId, data: null });
    }

    const result = await session.send(promptCommand);

    return NextResponse.json({ success: true, sessionId: realSessionId, data: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
