/**
 * [ask-user-question-bridge] Server-side bridge.
 *
 * Reimplements the ctx.ui.custom() escape hatch for exactly one caller: the
 * ask_user_question tool. Everything else that calls custom() (e.g.
 * pi-guardrails' command-approval fallback chain) must keep seeing
 * `undefined` so its own fallback logic (ctx.ui.select) keeps working —
 * see tryHandleCustom() below.
 *
 * Flow:
 *   1. The extension emits ASK_USER_PROMPT_EVENT on the session's event bus
 *      right before calling ctx.ui.custom(). We subscribe to that bus and
 *      stash the payload.
 *   2. When ctx.ui.custom() is actually invoked, we consume the stashed
 *      payload, emit an "extension_ui_request" SSE event carrying it, and
 *      return a Promise that resolves when the browser posts back an
 *      "extension_ui_response".
 *   3. The caller (AgentSessionWrapper) registers our pending resolver in
 *      the SAME map it already uses for select/confirm/input/editor, so
 *      session teardown (which cancels all pending UI responses) cancels
 *      ours for free too.
 */

import { randomUUID } from "crypto";
import {
  ASK_USER_PROMPT_EVENT,
  cancelledAskUserQuestionResult,
  type AskUserQuestionPromptPayload,
} from "./protocol";

export interface AskUserQuestionEventBusLike {
  on(channel: string, handler: (data: unknown) => void): () => void;
}

type ExtensionUiResponseLike = Record<string, unknown> & { id: string };

export interface AskUserQuestionBridgeDeps {
  emit(event: Record<string, unknown>): void;
  registerPending(
    id: string,
    resolve: (response: ExtensionUiResponseLike) => void,
    cancel: () => void,
  ): void;
}

export class AskUserQuestionBridge {
  private pendingPrompt: AskUserQuestionPromptPayload | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(eventBus: AskUserQuestionEventBusLike, private deps: AskUserQuestionBridgeDeps) {
    this.unsubscribe = eventBus.on(ASK_USER_PROMPT_EVENT, (data) => {
      this.pendingPrompt = data as AskUserQuestionPromptPayload;
    });
  }

  /** Returns a Promise if a prompt is pending, or undefined to signal "not mine". */
  tryHandleCustom<T>(): Promise<T> | undefined {
    if (!this.pendingPrompt) return undefined;
    const payload = this.pendingPrompt;
    this.pendingPrompt = null;
    return this.request<T>(payload);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private request<T>(payload: AskUserQuestionPromptPayload): Promise<T> {
    return new Promise<T>((resolvePromise) => {
      const id = randomUUID();
      this.deps.registerPending(
        id,
        (response) => resolvePromise(this.extractResult(response) as T),
        () => resolvePromise(cancelledAskUserQuestionResult() as T),
      );
      this.deps.emit({
        type: "extension_ui_request",
        id,
        method: "ask_user_question",
        payload,
      });
    });
  }

  private extractResult(response: ExtensionUiResponseLike) {
    if (response && typeof response === "object" && "result" in response) {
      return response.result;
    }
    return cancelledAskUserQuestionResult();
  }
}
