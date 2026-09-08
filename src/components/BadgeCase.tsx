import {
  groupBadgesByTopic,
  listBadgeCatalog,
  parseBadgeId,
  type BadgeMap,
  type TopicRef,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import TopicMedal from "./TopicMedal";

interface BadgeCaseProps {
  badges: BadgeMap;
  extraEmpires?: string[];
}

/**
 * Full seal catalog on the profile. Every age and empire medal is shown;
 * unearned ones stay grayed out until a perfect score unlocks them.
 */
export default function BadgeCase({
  badges,
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
        Perfect a trial on Discover to light a seal. Higher trials award
        higher ranks.
      </p>

      <h3 className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Ages
      </h3>
      <div className="mt-2 space-y-2">
        {ages.map((group) => (
          <BadgeRow
            key={`${group.topic.kind}:${group.topic.id}`}
            title={group.topic.title}
            badges={group.badges}
            unlocked={badges}
          />
        ))}
      </div>

      <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        Empires
      </h3>
      <div className="mt-2 space-y-2">
        {empires.map((group) => (
          <BadgeRow
            key={`${group.topic.kind}:${group.topic.id}`}
            title={group.topic.title}
            badges={group.badges}
            unlocked={badges}
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
}: {
  title: string;
  badges: ReturnType<typeof listBadgeCatalog>;
  unlocked: BadgeMap;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">
        {title}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {badges.map((badge) => {
          const on = !!unlocked[badge.id];
          return (
            <span
              key={badge.id}
              title={`${badge.label}${on ? " — earned" : " — locked"}`}
            >
              <TopicMedal
                difficulty={badge.difficulty}
                unlocked={on}
                mark={title}
                size={34}
              />
              <span className="sr-only">
                {title} {badge.label}
                {on ? ", earned" : ", locked"}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
