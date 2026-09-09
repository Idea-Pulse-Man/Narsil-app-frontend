import {
  clampLevelId,
  levelTitle,
  personLevelFrameSrc,
  personLevelNumber,
} from "@/lib/quiz";

interface PersonLevelFrameProps {
  levelId: number;
  /** Frame width/height in px. */
  size?: number;
  /** Show "Lv N · Title" under the frame. */
  showCaption?: boolean;
  className?: string;
}

/**
 * Client circular art for the person ladder (levels 1–7).
 * Not a quiz badge — badges stay in BadgeCase / TopicMedal.
 */
export default function PersonLevelFrame({
  levelId,
  size = 72,
  showCaption = false,
  className = "",
}: PersonLevelFrameProps) {
  const id = clampLevelId(levelId);
  const n = personLevelNumber(id);
  const title = levelTitle(id);
  const src = personLevelFrameSrc(id);

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </span>
      {showCaption && (
        <p className="mt-1.5 text-center text-[11px] text-white/55">
          Lv {n} · {title}
        </p>
      )}
    </div>
  );
}
