import { useState, useRef, useEffect } from "react";
import { useAssistantStatus, useAssistantChat, useCommitDraft, useAssistantHistory } from "@/api/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AssistantDraft, AssistantMessage } from "@/types";
import { Sparkles, Send, Check, X, Loader2 } from "lucide-react";
import { ExperimentalBanner } from "@/components/ExperimentalBanner";

// A chat turn in the local UI: the plain text plus any write drafts the model
// proposed (each resolved to committed/declined once the user acts on it).
interface Turn {
  role: "user" | "assistant";
  content: string;
  drafts?: { draft: AssistantDraft; state: "pending" | "committed" | "declined" }[];
}

function DraftCard({ d, onConfirm, onDecline, busy }: {
  d: { draft: AssistantDraft; state: "pending" | "committed" | "declined" };
  onConfirm: () => void; onDecline: () => void; busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{t("assistant.draftTitle")}</p>
      <p className="text-sm">{d.draft.preview}</p>
      {d.state === "pending" ? (
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            <Check size={14} className="mr-1" />{t("assistant.confirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDecline} disabled={busy}>
            <X size={14} className="mr-1" />{t("assistant.cancel")}
          </Button>
        </div>
      ) : (
        <p className={`text-xs mt-2 font-medium ${d.state === "committed" ? "text-green-600" : "text-muted-foreground"}`}>
          {d.state === "committed" ? t("assistant.saved") : t("assistant.declined")}
        </p>
      )}
    </div>
  );
}

export function Assistant() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: status } = useAssistantStatus();
  const history = useAssistantHistory();
  const chat = useAssistantChat();
  const commit = useCommitDraft();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);
  // Shell-style input recall: Up/Down cycle through your earlier requests.
  const draftRef = useRef("");           // the in-progress text, stashed while recalling
  const [histIdx, setHistIdx] = useState(-1); // -1 = not recalling
  const HISTORY_LIMIT = 50;

  // Seed the chat once from the persisted history so the conversation survives a
  // reload. Past turns carry no drafts (those are resolved at save time).
  useEffect(() => {
    if (seeded.current || !history.data) return;
    seeded.current = true;
    if (history.data.length) setTurns(history.data.map((m) => ({ role: m.role, content: m.content })));
  }, [history.data]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, chat.isPending]);

  const suggestions = [
    t("assistant.sug1"), t("assistant.sug2"), t("assistant.sug3"),
  ];

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    const history: AssistantMessage[] = [...turns.map((x) => ({ role: x.role, content: x.content })), { role: "user", content: msg }];
    setTurns((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setHistIdx(-1);
    try {
      const res = await chat.mutateAsync(history);
      setTurns((prev) => [...prev, {
        role: "assistant",
        content: res.text || (res.drafts.length ? t("assistant.proposed") : t("assistant.noAnswer")),
        drafts: res.drafts.map((draft) => ({ draft, state: "pending" as const })),
      }]);
    } catch (e: any) {
      const err = e?.response?.data?.error;
      setTurns((prev) => [...prev, { role: "assistant", content: typeof err === "string" ? err : t("assistant.error") }]);
    }
  }

  function setDraftState(turnIdx: number, draftIdx: number, state: "committed" | "declined") {
    setTurns((prev) => prev.map((turn, i) => {
      if (i !== turnIdx || !turn.drafts) return turn;
      return { ...turn, drafts: turn.drafts.map((d, j) => (j === draftIdx ? { ...d, state } : d)) };
    }));
  }

  async function confirmDraft(turnIdx: number, draftIdx: number, draft: AssistantDraft) {
    try { await commit.mutateAsync(draft); setDraftState(turnIdx, draftIdx, "committed"); }
    catch { setDraftState(turnIdx, draftIdx, "declined"); }
  }

  // Your earlier requests, most recent last, consecutive repeats collapsed, capped.
  const requestHistory = turns
    .filter((x) => x.role === "user")
    .map((x) => x.content)
    .reduce<string[]>((acc, c) => { if (acc[acc.length - 1] !== c) acc.push(c); return acc; }, [])
    .slice(-HISTORY_LIMIT);

  function caretToEnd() {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { const n = el.value.length; el.setSelectionRange(n, n); }
    });
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      if (requestHistory.length === 0) return;
      e.preventDefault();
      const idx = histIdx === -1
        ? (draftRef.current = input, requestHistory.length - 1)   // entering recall: stash the draft
        : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(requestHistory[idx]);
      caretToEnd();
    } else if (e.key === "ArrowDown") {
      if (histIdx === -1) return;
      e.preventDefault();
      const idx = histIdx + 1;
      if (idx >= requestHistory.length) { setHistIdx(-1); setInput(draftRef.current); } // back to the draft
      else { setHistIdx(idx); setInput(requestHistory[idx]); }
      caretToEnd();
    }
  }

  if (status && !status.configured) {
    return (
      <div className="max-w-2xl space-y-4">
        <ExperimentalBanner moduleKey="assistant" />
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary" size={22} />
          <h1 className="text-2xl font-bold">{t("assistant.title")}</h1>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
            <p>{t("assistant.notConfigured")}</p>
            <Button onClick={() => navigate("/settings")}>{t("assistant.goToSettings")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl flex flex-col h-[calc(100vh-7rem)]">
      <ExperimentalBanner moduleKey="assistant" />
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="text-primary" size={22} />
        <h1 className="text-2xl font-bold">{t("assistant.title")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {turns.length === 0 && !history.isLoading && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-muted-foreground">{t("assistant.intro")}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="text-xs rounded-full border px-3 py-1.5 hover:bg-muted transition-colors text-left">
                    {s}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}>
              {turn.content}
              {turn.drafts?.map((d, j) => (
                <DraftCard key={j} d={d}
                  busy={commit.isPending}
                  onConfirm={() => confirmDraft(i, j, d.draft)}
                  onDecline={() => setDraftState(i, j, "declined")} />
              ))}
            </div>
          </div>
        ))}

        {chat.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />{t("assistant.thinking")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); if (histIdx !== -1) setHistIdx(-1); }}
          onKeyDown={onInputKeyDown}
          placeholder={t("assistant.placeholder")}
          className="flex-1 rounded-full border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={chat.isPending || !input.trim()}>
          <Send size={16} />
        </Button>
      </form>
      <p className="text-[11px] text-muted-foreground mt-2 text-center">{t("assistant.disclaimer")}</p>
    </div>
  );
}
