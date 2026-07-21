"use client";

/**
 * [ask-user-question-bridge] Web questionnaire UI for the ask_user_question
 * extension tool. Renders the payload from AskUserQuestionUiRequest (see
 * lib/ask-user-question-bridge/protocol.ts) and posts back an
 * AskUserQuestionResult shaped for the extension's buildQuestionnaireResponse().
 *
 * Known limitation: the "rpiv:ask-user:prompt" event only carries
 * `hasPreview` (boolean) per option, not the actual preview markdown — the
 * extension never serializes preview content out of its process. So this
 * dialog can flag "preview available" but can't render it.
 *
 * To remove: delete this file + its ../index.ts export, and the render call
 * in ChatWindow.tsx (marked "[ask-user-question-bridge]").
 */

import { useMemo, useState } from "react";
import type { AskUserQuestionUiRequest } from "@/hooks/useAgentSession";
import type { AskUserQuestionAnswer, AskUserQuestionResult } from "@/lib/ask-user-question-bridge/protocol";

const CHAT_LABEL = "Chat about this";
const TYPE_SOMETHING_LABEL = "Type something.";

interface AskUserQuestionDialogProps {
  request: AskUserQuestionUiRequest;
  onRespond: (request: AskUserQuestionUiRequest, result: AskUserQuestionResult) => void;
}

export function AskUserQuestionDialog({ request, onRespond }: AskUserQuestionDialogProps) {
  const questions = request.payload.questions;
  const [tab, setTab] = useState(0);
  const [answers, setAnswers] = useState<Map<number, AskUserQuestionAnswer>>(new Map());
  const [multiChecked, setMultiChecked] = useState<Set<string>>(new Set());
  const [typingCustom, setTypingCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const question = questions[tab];
  const hasAnyPreview = useMemo(() => question.options.some((o) => o.hasPreview), [question]);
  const showTypeSomething = !question.multiSelect && !hasAnyPreview;

  const finalize = (finalAnswers: Map<number, AskUserQuestionAnswer>, cancelled: boolean) => {
    const ordered = Array.from(finalAnswers.entries())
      .sort(([a], [b]) => a - b)
      .map(([, answer]) => answer);
    onRespond(request, { answers: ordered, cancelled });
  };

  const recordAndAdvance = (answer: AskUserQuestionAnswer) => {
    const next = new Map(answers);
    next.set(tab, answer);
    setAnswers(next);
    setTypingCustom(false);
    setCustomValue("");
    setMultiChecked(new Set());
    if (tab < questions.length - 1) {
      setTab(tab + 1);
    } else {
      finalize(next, false);
    }
  };

  const handleChat = () => {
    const next = new Map(answers);
    next.set(tab, { questionIndex: tab, question: question.question, kind: "chat", answer: CHAT_LABEL });
    finalize(next, false);
  };

  const handleCancel = () => finalize(answers, true);

  const toggleMultiOption = (label: string) => {
    setMultiChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const submitMulti = () => {
    recordAndAdvance({
      questionIndex: tab,
      question: question.question,
      kind: "multi",
      answer: null,
      selected: Array.from(multiChecked),
    });
  };

  const submitCustom = () => {
    const trimmed = customValue.trim();
    if (!trimmed) return;
    recordAndAdvance({ questionIndex: tab, question: question.question, kind: "custom", answer: trimmed });
  };

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 90, display: "flex",
        alignItems: "safe center", justifyContent: "center", padding: 20, overflowY: "auto",
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(560px, 100%)", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--bg)", boxShadow: "0 20px 60px rgba(0,0,0,0.28)", overflow: "hidden",
          maxHeight: "100%", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 650 }}>Ask User Question</div>
            <button
              onClick={handleCancel}
              aria-label="Cancel"
              style={{ border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ marginTop: 3, color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            extension request{questions.length > 1 ? ` · question ${tab + 1} of ${questions.length}` : ""}
          </div>
          {questions.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setTab(i)}
                  style={{
                    padding: "3px 8px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                    border: i === tab ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: answers.has(i) ? "var(--bg-selected)" : "var(--bg-panel)",
                    color: i === tab ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {q.header}{answers.has(i) ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 14, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
          <div style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.5, marginBottom: 10, whiteSpace: "pre-wrap" }}>
            {question.question}
          </div>

          {!question.multiSelect && (
            <div style={{ display: "grid", gap: 8 }}>
              {question.options.map((option) => (
                <button
                  key={option.label}
                  onClick={() => recordAndAdvance({
                    questionIndex: tab, question: question.question, kind: "option", answer: option.label,
                  })}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 7, border: "1px solid var(--border)",
                    background: "var(--bg-panel)", color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {option.label}
                    {option.hasPreview && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-dim)", fontWeight: 400 }}>(preview available)</span>
                    )}
                  </div>
                  {option.description && (
                    <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 12 }}>{option.description}</div>
                  )}
                </button>
              ))}

              {showTypeSomething && !typingCustom && (
                <button
                  onClick={() => setTypingCustom(true)}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 7, border: "1px dashed var(--border)",
                    background: "transparent", color: "var(--text-muted)", cursor: "pointer", textAlign: "left", fontSize: 13,
                  }}
                >
                  {TYPE_SOMETHING_LABEL}
                </button>
              )}
              {showTypeSomething && typingCustom && (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    autoFocus
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); if (e.key === "Escape") setTypingCustom(false); }}
                    placeholder="Type your answer..."
                    style={{
                      flex: 1, padding: "9px 10px", borderRadius: 7, border: "1px solid var(--border)",
                      background: "var(--bg-panel)", color: "var(--text)", outline: "none", fontSize: 13,
                    }}
                  />
                  <button
                    onClick={submitCustom}
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>
          )}

          {question.multiSelect && (
            <div style={{ display: "grid", gap: 8 }}>
              {question.options.map((option) => {
                const checked = multiChecked.has(option.label);
                return (
                  <button
                    key={option.label}
                    onClick={() => toggleMultiOption(option.label)}
                    style={{
                      width: "100%", padding: "9px 10px", borderRadius: 7,
                      border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: checked ? "var(--bg-selected)" : "var(--bg-panel)",
                      color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 13,
                      display: "flex", alignItems: "flex-start", gap: 8,
                    }}
                  >
                    <span style={{ marginTop: 1 }}>{checked ? "☑" : "☐"}</span>
                    <span>
                      <div style={{ fontWeight: 600 }}>{option.label}</div>
                      {option.description && (
                        <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 12 }}>{option.description}</div>
                      )}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={submitMulti}
                style={{
                  padding: "8px 10px", borderRadius: 7, border: "1px solid var(--accent)",
                  background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                {tab < questions.length - 1 ? "Next" : "Submit"}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0 }}>
          <button
            onClick={handleChat}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          >
            {CHAT_LABEL}
          </button>
          <button
            onClick={handleCancel}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
