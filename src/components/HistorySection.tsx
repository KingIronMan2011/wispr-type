import { useMemo, useState } from "react";
import {
  Copy,
  History,
  Pencil,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import type { Settings, Transcript } from "../types";

export default function HistorySection({
  history,
  settings,
  onClear,
  onCopy,
  onPin,
  onEdit,
  historySectionRef,
}: {
  history: Transcript[];
  settings: Settings;
  onClear: () => void;
  onCopy: (item: Transcript) => void;
  onPin: (item: Transcript) => void;
  onEdit: (id: string, text: string) => Promise<boolean>;
  historySectionRef: (node: HTMLElement | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return history.filter(
      (item) =>
        !normalizedQuery ||
        item.text.toLocaleLowerCase().includes(normalizedQuery) ||
        item.language.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [history, query]);

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    if (await onEdit(editingId, editingText)) {
      setEditingId(null);
      setEditingText("");
    }
  };

  return (
    <section ref={historySectionRef} className="history-section" id="history">
      <div className="history-heading">
        <div>
          <History size={18} />
          <h3>Recent transcripts</h3>
          <span>
            {settings.historyRetention === "never"
              ? "Not saved"
              : `Last ${settings.historyRetention}`}
          </span>
        </div>
        {history.length > 0 && <button onClick={onClear}>Clear</button>}
      </div>
      <label className="history-search">
        <Search size={14} />
        <span className="sr-only">Search transcript history</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search transcripts"
        />
      </label>
      {history.length ? (
        <div className="history-list">
          {filteredHistory.map((item) => {
            const editing = editingId === item.id;
            return (
              <article key={item.id} className={item.pinned ? "pinned" : ""}>
                {editing ? (
                  <textarea
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    aria-label="Edit transcript"
                    autoFocus
                  />
                ) : (
                  <p>{item.text}</p>
                )}
                <span>
                  {item.pinned && "Pinned · "}
                  {new Date(item.createdAt).toLocaleString()} ·{" "}
                  {item.language || "Auto"}
                </span>
                <div className="history-actions">
                  {editing ? (
                    <>
                      <button onClick={() => void saveEdit()}>Save</button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditingText("");
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onPin(item)}
                        aria-label={
                          item.pinned ? "Unpin transcript" : "Pin transcript"
                        }
                        title={item.pinned ? "Unpin" : "Pin"}
                      >
                        {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingText(item.text);
                        }}
                        aria-label="Edit transcript"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onCopy(item)}
                        aria-label="Copy transcript"
                        title="Copy"
                      >
                        <Copy size={15} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : settings.historyRetention === "never" ? (
        <div className="history-empty">
          <ShieldCheck size={17} /> Transcript saving is turned off.
        </div>
      ) : (
        <div className="history-empty">
          <Volume2 size={17} /> Your latest transcripts will appear here.
        </div>
      )}
      {history.length > 0 && filteredHistory.length === 0 && (
        <div className="history-empty">No transcripts match that search.</div>
      )}
    </section>
  );
}
