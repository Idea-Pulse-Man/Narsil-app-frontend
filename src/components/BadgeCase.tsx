import {
  groupBadgesByTopic,
  listBadgeCatalog,
  parseBadgeId,
  type BadgeMap,
  type ScoreMap,
  type TopicRef,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import TopicMedal from "./TopicMedal";

interface BadgeCaseProps {
  badges: BadgeMap;
  scores?: ScoreMap;
  extraEmpires?: string[];
}

/**
 * Full seal catalog on the profile. Every age and empire medal is shown;
 * unearned ones stay grayed out. Stars show the best attempt so far.
 */
export default function BadgeCase({
  badges,
  scores = {},
  extraEmpires = [],
}: BadgeCaseProps) {
  const extraTopics: TopicRef[] = [];
  const seen = new Set(extraEmpires);
  for (const id of Object.keys(badges)) {
    const parsed = parseBadgeId(id);
    if (!parsed || parsed.kind !== "empire" || seen.has(parsed.topicId)) continue;
    seen.add(parsed.topicId);
    extraTopics.push({
      kind: "empire",
      id: parsed.topicId,
      title: parsed.topicId,
    });
  }
  const catalog = listBadgeCatalog(extraEmpires, extraTopics);
  const groups = groupBadgesByTopic(catalog);
  const ages = groups.filter((g) => g.topic.kind === "age");
  const empires = groups.filter((g) => g.topic.kind === "empire");
  const earned = catalog.filter((b) => badges[b.id]).length;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-white">{WORLD.seals}</h2>
        <p className="text-[11px] tabular-nums text-white/40">
          {earned} / {catalog.length}
        </p>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Perfect a trial on Discover to light a seal. Numbers are your best
        star score on each rank.
      </p>

      <h3 className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Ages
      </h3>
      <div className="mt-2 space-y-1">
        {ages.map((group) => (
          <BadgeRow
            key={`${group.topic.kind}:${group.topic.id}`}
            title={group.topic.title}
            badges={group.badges}
            unlocked={badges}
            scores={scores}
          />
        ))}
      </div>

      <h3 className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Empires
      </h3>
      <div className="mt-2 space-y-1">
        {empires.map((group) => (
          <BadgeRow
            key={`${group.topic.kind}:${group.topic.id}`}
            title={group.topic.title}
            badges={group.badges}
            unlocked={badges}
            scores={scores}
          />
        ))}
      </div>
    </section>
  );
}

function BadgeRow({
  title,
  badges,
  unlocked,
  scores,
}: {
  title: string;
  badges: ReturnType<typeof listBadgeCatalog>;
  unlocked: BadgeMap;
  scores: ScoreMap;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
      <p className="min-w-0 flex-1 truncate text-[13px] leading-tight text-white/80">
        {title}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {badges.map((badge) => {
          const on = !!unlocked[badge.id];
          const stars = scores[badge.id]?.stars ?? 0;
          return (
            <span
              key={badge.id}
              className="flex items-center gap-0.5"
              title={`${badge.label}${on ? " — earned" : " — locked"} · ${stars}/5 stars`}
            >
              <TopicMedal
                difficulty={badge.difficulty}
                unlocked={on}
                gated={!on}
                mark={title}
                size={26}
              />
              <span
                className={`w-2.5 text-center text-[9px] tabular-nums leading-none ${
                  stars > 0 ? "text-amber-300" : "text-white/20"
                }`}
                aria-hidden
              >
                {stars}
              </span>
              <span className="sr-only">
                {title} {badge.label}
                {on ? ", earned" : ", locked"}, {stars} of 5 stars
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
