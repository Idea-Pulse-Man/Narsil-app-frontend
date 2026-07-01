import { motion } from "framer-motion";
import {
  categories,
  type Category,
  type CategoryGroup,
  type CategoryId,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import { screenScrollClass, screenContentClass } from "./artwork-layout";

interface DiscoverViewProps {
  onOpenCategory: (id: CategoryId) => void;
}

const SECTIONS: { group: CategoryGroup; title: string; caption: string }[] = [
  { group: "medium", title: "By medium", caption: "Painting, sculpture, pottery & the printed page" },
  { group: "empire", title: "Sort by empire", caption: "Roman · Greek · Egyptian" },
  { group: "movement", title: "By movement", caption: "Periods & styles across the ages" },
];

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CategoryRow({
  category,
  index,
  onOpen,
}: {
  category: Category;
  index: number;
  onOpen: (id: CategoryId) => void;
}) {
  const { getArtworksByCategory } = useCatalog();
  const works = getArtworksByCategory(category.id);
  const count = works.length;
  const thumb = works[0]?.image;

  return (
    <motion.button
      onClick={() => onOpen(category.id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.28 }}
      whileTap={{ scale: 0.99 }}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      {/* Representative thumbnail — falls back to the category gradient. */}
      <div
        className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"
        style={{ background: `linear-gradient(155deg, ${category.from}, ${category.to})` }}
      >
        {thumb && (
          <BlurImage src={thumb} alt={category.label} accent={category.from} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-serif text-[16px] leading-tight text-white">
          {category.label}
        </h3>
        <p className="mt-0.5 truncate text-[12px] text-white/55">
          {category.blurb}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pr-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
          {count} {count === 1 ? "work" : "works"}
        </span>
        <ChevronRight className="h-4 w-4 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
    </motion.button>
  );
}

export default function DiscoverView({ onOpenCategory }: DiscoverViewProps) {
  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Discover
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Browse by category
        </h1>
        <p className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-white/60">
          Wander through periods, empires, and mediums — from ancient marble to
          modern abstraction.
        </p>

        {SECTIONS.map((section) => {
          const rows = categories.filter((c) => c.group === section.group);
          if (rows.length === 0) return null;

          return (
            <section key={section.group} className="mt-8">
              <h2 className="font-serif text-lg text-white">{section.title}</h2>
              <p className="mt-0.5 text-[12px] text-white/40">{section.caption}</p>
              <div className="mt-3 space-y-2.5">
                {rows.map((category, i) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    index={i}
                    onOpen={onOpenCategory}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
