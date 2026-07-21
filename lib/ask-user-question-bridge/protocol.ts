/**
 * [ask-user-question-bridge] Protocol types.
 *
 * Mirrors the wire contract published by @juicesharp/rpiv-ask-user-question
 * (tested against v1.20.0). We intentionally do NOT import types from that
 * package — it's a third-party extension loaded dynamically by the SDK, not
 * a build-time dependency of pi-web. These are structural duck-types of its
 * public, JSON-safe contract:
 *   - Input:  the "rpiv:ask-user:prompt" event payload (extension -> us)
 *   - Output: the QuestionnaireResult shape its tool handler expects back
 *
 * To remove this bridge entirely: delete lib/ask-user-question-bridge/ and
 * components/ask-user-question-bridge/, then remove the few marked call
 * sites in lib/rpc-manager.ts, lib/types.ts, hooks/useAgentSession.ts, and
 * components/ChatWindow.tsx (each tagged with an "[ask-user-question-bridge]"
 * comment).
 */

/** Stable channel name from the extension's event contract. Never rename upstream. */
export const ASK_USER_PROMPT_EVENT = "rpiv:ask-user:prompt";

export interface AskUserQuestionOption {
  label: string;
  description: string;
  hasPreview: boolean;
}

export interface AskUserQuestionQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskUserQuestionOption[];
}

/** Payload of the "rpiv:ask-user:prompt" event, emitted right before the tool
 * calls ctx.ui.custom(). Note: this event does NOT carry `preview` text
 * (only `hasPreview`) — previews aren't needed to answer, only to display. */
export interface AskUserQuestionPromptPayload {
  questions: AskUserQuestionQuestion[];
}

export type AskUserQuestionAnswerKind = "option" | "custom" | "chat" | "multi";

export interface AskUserQuestionAnswer {
  questionIndex: number;
  question: string;
  kind: AskUserQuestionAnswerKind;
  answer: string | null;
  selected?: string[];
  notes?: string;
}

/** Shape the extension's buildQuestionnaireResponse() expects back. */
export interface AskUserQuestionResult {
  answers: AskUserQuestionAnswer[];
  cancelled: boolean;
}

export function cancelledAskUserQuestionResult(): AskUserQuestionResult {
  return { answers: [], cancelled: true };
}
