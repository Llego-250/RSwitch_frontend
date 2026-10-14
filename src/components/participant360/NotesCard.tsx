// REQ-P360-014: Compliance users annotate a participant's profile; every
// role reads the notes. The API enforces who may write.
import { useState } from "react";
import { StickyNote } from "lucide-react";
import { PrimaryButton, SectionCard } from "@/components/AppShell";
import { errorMessage, fieldErrors } from "@/lib/api";
import { fmtDateTime } from "@/lib/compliance";
import { useAddNote, useParticipantNotes } from "@/lib/participant360";
import { Empty, LoadError } from "./ui";

const MAX_CHARS = 4000;

export function NotesCard({
  participantId,
  canWrite,
}: {
  participantId: number;
  canWrite: boolean;
}) {
  const notes = useParticipantNotes(participantId);
  const add = useAddNote(participantId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!text.trim()) {
      setError("Write the note before saving it.");
      return;
    }
    setError(null);
    add.mutate(text.trim(), {
      onSuccess: () => setText(""),
      onError: (e) => setError(fieldErrors(e).note ?? errorMessage(e)),
    });
  }

  return (
    <SectionCard
      title={
        <>
          <StickyNote className="h-5 w-5 text-[#168FA8]" /> Notes
        </>
      }
    >
      <div className="space-y-4">
        {canWrite && (
          <div className="space-y-2">
            <textarea
              value={text}
              maxLength={MAX_CHARS}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Add a note or annotation about this institution…"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#DCE3E8] dark:border-slate-700 text-sm text-[#172033] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#168FA8]/40"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-red-600">{error}</span>
              <PrimaryButton onClick={submit} disabled={add.isPending}>
                {add.isPending ? "Saving…" : "Add note"}
              </PrimaryButton>
            </div>
          </div>
        )}
        {notes.error ? (
          <LoadError error={notes.error} />
        ) : notes.isLoading ? (
          <Empty>Loading…</Empty>
        ) : (notes.data ?? []).length === 0 ? (
          <Empty>No notes yet{canWrite ? "." : " — Compliance users add notes here."}</Empty>
        ) : (
          <ul className="space-y-2.5">
            {notes.data!.map((n) => (
              <li
                key={n.id}
                className="p-3 rounded-xl border border-[#DCE3E8] dark:border-slate-700 text-xs"
              >
                <div className="text-[11px] text-[#7B8798] mb-1">
                  {n.author} · {fmtDateTime(n.created_at)}
                </div>
                <div className="whitespace-pre-wrap text-[#172033] dark:text-slate-100">
                  {n.note}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
