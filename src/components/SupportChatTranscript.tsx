/**
 * Shared support chat bubbles with WhatsApp-style day chips + per-message time.
 */

import {
  formatSupportChatDay,
  formatSupportChatTime,
  supportChatDayKey,
  type SupportMessage,
} from "@/lib/support";

interface SupportChatTranscriptProps {
  messages: SupportMessage[];
  /** Who is viewing — flips bubble side / colors. */
  perspective: "member" | "admin";
}

export default function SupportChatTranscript({
  messages,
  perspective,
}: SupportChatTranscriptProps) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : null;
        const showDay =
          !prev ||
          supportChatDayKey(m.created_at) !==
            supportChatDayKey(prev.created_at);
        const mine =
          perspective === "member" ? !m.from_admin : m.from_admin;
        const time = formatSupportChatTime(m.created_at);
        const bubble =
          perspective === "member"
            ? mine
              ? "bg-accent text-ink"
              : "border border-white/10 bg-white/[0.06] text-white/85"
            : mine
              ? "bg-white text-ink"
              : "border border-white/10 bg-white/[0.06] text-white/85";
        const timeClass = mine ? "text-ink/45" : "text-white/50";

        return (
          <div key={m.id} className="space-y-2">
            {showDay && (
              <div className="flex justify-center py-1">
                <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white/70">
                  {formatSupportChatDay(m.created_at)}
                </span>
              </div>
            )}
            <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${bubble}`}>
                <p className="whitespace-pre-wrap break-words leading-snug">
                  {m.body}
                </p>
                {time ? (
                  <p className={`mt-1 text-right text-[11px] leading-none ${timeClass}`}>
                    {time}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
