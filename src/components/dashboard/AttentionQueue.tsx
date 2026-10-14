// REQ-DASH-003 Attention Queue: unresolved items across compliance,
// integrations, incidents and AI alerts, most severe and oldest first (ranked
// by the API). REQ-DASH-007: an item can be dismissed for the current session
// only — dismissals live in sessionStorage and the item's id includes its
// state, so it reappears if it changes.
import { ArrowUpRight, Bell, X } from "lucide-react";
import { SeverityPill } from "@/components/compliance/ui";
import {
  useOpenLink,
  useSessionState,
  timeAgo,
  type AttentionData,
  type Widget,
} from "@/lib/dashboard";
import { WidgetCard } from "./WidgetCard";

const SHOWN = 10;

export function AttentionQueue({
  widget,
  onSetting,
  busy,
}: {
  widget: Widget<AttentionData>;
  onSetting: (name: "period" | "scope", value: string | number) => void;
  busy?: boolean;
}) {
  const [dismissed, setDismissed] = useSessionState<string[]>("rdip_dash_dismissed", []);
  const open = useOpenLink();
  const data = widget.data;
  const hidden = new Set(dismissed);
  const visible = data.items.filter((i) => !hidden.has(i.id));
  const dismissedHere = data.items.length - visible.length;

  return (
    <WidgetCard widget={widget} onSetting={onSetting} busy={busy}>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FFF3DF] text-[#B45309] border border-[#D97706]/30">
          <Bell className="h-3 w-3" />
          {data.total} unresolved
        </span>
        {Object.entries(data.by_kind).map(([kind, n]) => (
          <span
            key={kind}
            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[#526174] dark:text-slate-300"
          >
            {kind} {n}
          </span>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm py-8 text-center text-[#7B8798]">
          {data.items.length
            ? "Every item is dismissed for this session."
            : "Nothing needs attention right now."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.slice(0, SHOWN).map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[#DCE3E8] dark:border-slate-800 p-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1">
                <SeverityPill severity={item.severity} />
                <span className="text-[11px] font-semibold text-[#526174] dark:text-slate-300">
                  {item.kind}
                </span>
                <span className="ml-auto text-[11px] text-[#7B8798]">{timeAgo(item.since)}</span>
              </div>
              <p className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                {item.title}
              </p>
              <p className="text-[11px] text-[#526174] dark:text-slate-400 mt-0.5 line-clamp-2">
                {[item.participant_name, item.detail].filter(Boolean).join(" · ")}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <button
                  onClick={() => open(item.link)}
                  className="text-xs font-semibold text-[#168FA8] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  Investigate <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDismissed([...dismissed, item.id])}
                  className="text-xs text-[#7B8798] hover:text-[#172033] dark:hover:text-slate-100 inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between mt-3 text-[11px] text-[#7B8798]">
        <span>
          {visible.length > SHOWN
            ? `Top ${SHOWN} of ${visible.length} shown`
            : `${visible.length} shown`}
          {data.total > data.items.length &&
            ` · ${data.total - data.items.length} lower-priority not listed`}
        </span>
        {dismissedHere > 0 && (
          <button
            onClick={() =>
              setDismissed(dismissed.filter((id) => !data.items.some((i) => i.id === id)))
            }
            className="font-semibold text-[#168FA8] hover:underline cursor-pointer"
          >
            Restore {dismissedHere} dismissed
          </button>
        )}
      </div>
    </WidgetCard>
  );
}
