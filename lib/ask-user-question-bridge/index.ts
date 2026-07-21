/**
 * [ask-user-question-bridge] Session wiring.
 *
 * The bridge intercepts the ask_user_question extension tool's ctx.ui.custom()
 * call and routes it to the web dialog. To observe the extension's
 * ASK_USER_PROMPT_EVENT the bridge must subscribe to the SAME EventBus the
 * extension emits on. The SDK wires `pi.events` (which the extension emits on)
 * to the resource loader's EventBus, so we create one EventBus here and feed it
 * to createAgentSessionServices() via resourceLoaderOptions.eventBus, then hand
 * the same bus to AgentSessionWrapper for the bridge to subscribe to.
 *
 * Do NOT pass settingsManager/resourceLoader to createAgentSessionFromServices:
 * that constructor only reads services.* (plus a fixed option set) and silently
 * drops them — which disconnects the bridge. Inject the bus at service-creation
 * time instead.
 *
 * To disable at runtime without touching code: set
 * PIWEB_DISABLE_ASK_USER_QUESTION_BRIDGE=1 in the server environment.
 * To remove entirely: delete this directory (and its components/ sibling)
 * and the marked call sites elsewhere (see protocol.ts header).
 */

import { createEventBus, type EventBus } from "@earendil-works/pi-coding-agent";

export { AskUserQuestionBridge, type AskUserQuestionBridgeDeps, type AskUserQuestionEventBusLike } from "./server";
export * from "./protocol";

export function isAskUserQuestionBridgeEnabled(): boolean {
  return process.env.PIWEB_DISABLE_ASK_USER_QUESTION_BRIDGE !== "1";
}

/**
 * Create the shared EventBus for the bridge. The SAME bus must be passed to
 * createAgentSessionServices({ resourceLoaderOptions: { eventBus } }) so the
 * extension's ASK_USER_PROMPT_EVENT reaches the bridge, and to
 * AgentSessionWrapper so the bridge can subscribe. Returns null when disabled,
 * in which case the SDK creates its own internal bus and the bridge stays inert.
 */
export function createAskUserQuestionEventBus(): EventBus | null {
  if (!isAskUserQuestionBridgeEnabled()) return null;
  return createEventBus();
}
