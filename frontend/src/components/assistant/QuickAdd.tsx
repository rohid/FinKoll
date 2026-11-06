import { useState, useRef } from "react";
import { useAssistantStatus, useAssistantChat, useCommitDraft } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import type { AssistantDraft } from "@/types";
import { Sparkles, Send, Check, X, Loader2 } from "lucide-react";

// Inline natural-language quick-add, scoped to the month being viewed. Reuses the
// assistant engine: type an entry in words → a draft you confirm. Hidden unless an
// AI provider is configured in Settings.
export function AssistantQuickAdd({ year, month }: { year: number; month: number }) {
  const { t } = useTranslation();
  const { data: status } = useAssistantStatus();
  const chat = useAssistantChat();
  const commit = useCommitDraft();
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<{ draft: AssistantDraft; state: "pending" | "committed" | "declined" }[]>([]);
  const [note, setNote] = useState("");
  // Shell-style Up/Down recall of earlier quick-add requests, persisted per browser.
  const inputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef("");
  const [histIdx, setHistIdx] = useState(-1);
  const HKEY = "finkoll.assistant.quickadd";
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch { return []; }
  });

  if (!status?.configured) return null;

  function caretToEnd() {
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { const n = el.value.length; el.setSelectionRange(n, n); } });
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = history.reduce<string[]>((a, c) => { if (a[a.length - 1] !== c) a.push(c); return a; }, []).slice(-50);
    if (e.key === "ArrowUp") {
      if (list.length === 0) return;
      e.preventDefault();
      const next = histIdx === -1 ? (draftRef.current = input, list.length - 1) : Math.max(0, histIdx - 1);
      setHistIdx(next); setInput(list[next]); caretToEnd();
    } else if (e.key === "ArrowDown") {
      if (histIdx === -1) return;
      e.preventDefault();
      const next = histIdx + 1;
      if (next >= list.length) { setHistIdx(-1); setInput(draftRef.current); }
      else { setHistIdx(next); setInput(list[next]); }
      caretToEnd();
    }
  }

  function setState(i: number, s: "committed" | "declined") {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, state: s } : d)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || chat.isPending) return;
    const nextHist = [...history.filter((h, i) => !(i === history.length - 1 && h === msg)), msg].slice(-50);
    setHistory(nextHist);
    try { localStorage.setItem(HKEY, JSON.stringify(nextHist)); } catch { /* ignore */ }
    setHistIdx(-1);
    setNote(""); setDrafts([]);
    // This field is add-scoped: make the intent explicit and bias the entry toward
    // the month on screen so it lands in the right period.
    const content = `Add this entry: ${msg} — record it for ${year}-${String(month).padStart(2, "0")}`;
    try {
      const res = await chat.mutateAsync([{ role: "user", content }]);
      setDrafts(res.drafts.map((d) => ({ draft: d, state: "pending" as const })));
      if (res.text && !res.drafts.length) setNote(res.text);
      setInput("");
    } catch (err: any) {
      setNote(err?.response?.data?.error ?? t("assistant.error"));
    }
  }

  async function confirm(i: number, draft: AssistantDraft) {
    try { await commit.mutateAsync(draft); setState(i, "committed"); }
    catch { setState(i, "declined"); }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Sparkles size={16} className="text-primary shrink-0" />
        <input ref={inputRef} value={input}
          onChange={(e) => { setInput(e.target.value); if (histIdx !== -1) setHistIdx(-1); }}
          onKeyDown={onKeyDown}
          placeholder={t("assistant.quickAddPlaceholder")}
          className="flex-1 bg-transparent text-sm focus:outline-none" />
        <Button type="submit" size="sm" variant="ghost" disabled={chat.isPending || !input.trim()}>
          {chat.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </Button>
      </form>

      {note && <p className="text-xs text-muted-foreground">{note}</p>}

      {drafts.map((d, i) => (
        <div key={i} className="rounded-md border bg-background p-2.5">
          <p className="text-sm">{d.draft.preview}</p>
          {d.state === "pending" ? (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => confirm(i, d.draft)} disabled={commit.isPending}>
                <Check size={13} className="mr-1" />{t("assistant.confirm")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setState(i, "declined")}>
                <X size={13} className="mr-1" />{t("assistant.cancel")}
              </Button>
            </div>
          ) : (
            <p className={`text-xs mt-1.5 font-medium ${d.state === "committed" ? "text-green-600" : "text-muted-foreground"}`}>
              {d.state === "committed" ? t("assistant.saved") : t("assistant.declined")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
