import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ApiError, ChatTurn, sendChatMessage } from "../services/api";
import { TicketFilters } from "../utils/filters";
import { ChatIcon, CloseIcon, SendIcon } from "./icons";

interface DisplayMessage extends ChatTurn {
  // UI-only, never sent back as conversation history — the filter a given reply was
  // scoped to, if any (see backend's set_ticket_table_filter tool).
  suggestedFilter?: Partial<TicketFilters> | null;
}

/** Model replies often include **bold**, numbered lists, and ticket links — render them
 * properly instead of showing literal markdown syntax. react-markdown never renders raw
 * HTML by default, so this stays safe against anything unusual the model might output. */
function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 [&_a]:font-medium [&_a]:underline [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4">
      <ReactMarkdown
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          p: ({ ...props }) => <p {...props} className="[&:not(:first-child)]:mt-1.5" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

interface Props {
  projectIdentifier: string;
  projectLabel: string;
  onApplyFilter: (patch: Partial<TicketFilters>) => void;
}

/** Read-only Q&A over the current project's tickets (see backend app/chat_tools.py) —
 * scoped to the whole project, not whatever tracker/etc. filters are active elsewhere
 * in the UI. Resets whenever the project changes, since a conversation about one
 * project's tickets doesn't carry meaning for another. */
export default function ChatPanel({ projectIdentifier, projectLabel, onApplyFilter }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // React state (`sending`) is read via closure and can lag behind two submits fired in
  // very quick succession (e.g. double-pressing Enter) before a re-render commits — a
  // ref updates synchronously, so it reliably blocks a second overlapping submit.
  const sendingRef = useRef(false);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setDraft("");
  }, [projectIdentifier]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    const history: ChatTurn[] = messages.map(({ role, text: t }) => ({ role, text: t }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const { reply, suggestedFilter } = await sendChatMessage(projectIdentifier, text, history);
      setMessages((prev) => [...prev, { role: "model", text: reply, suggestedFilter }]);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? "Chat isn't configured on this server yet (missing API key)."
          : err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again."
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask about this project's tickets"
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700"
      >
        <ChatIcon className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-30 flex h-[520px] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ask about tickets</h3>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{projectLabel} · read-only</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Ask things like "how many open bugs are there" or "who has the most tickets" — answers are read-only and scoped to
            this project.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 [&_a]:text-brand-700 dark:[&_a]:text-brand-400"
              }`}
            >
              {m.role === "model" ? <MessageText text={m.text} /> : m.text}
              {m.suggestedFilter && (
                <button
                  onClick={() => onApplyFilter(m.suggestedFilter!)}
                  className="mt-2 block rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
                >
                  See full list in Ticket Table →
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800 dark:text-slate-500">Thinking…</div>
          </div>
        )}
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question…"
          disabled={sending}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendIcon className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
