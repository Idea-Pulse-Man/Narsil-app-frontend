import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { SparkleIcon } from "./Icons";
import ArtworkTile from "./ArtworkTile";
import type { Screen } from "./navigation";

interface YouViewProps {
  onOpenArtwork: (artworkId: string) => void;
  onOpenArtist: (artistId: string) => void;
  onEditPreferences: () => void;
  onRestartTutorial: () => void;
  onNavigate: (screen: Screen) => void;
}

export default function YouView({
  onOpenArtwork,
  onOpenArtist,
  onEditPreferences,
  onRestartTutorial,
  onNavigate,
}: YouViewProps) {
  const { saved, liked, following, preferences } = useAppState();
  const { getArtist, getArtwork } = useCatalog();

  const likedArtworks = liked
    .map((id) => getArtwork(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .slice(0, 4);

  const followedArtists = following
    .map((id) => getArtist(id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const prefTags = [
    ...preferences.artTypes,
    ...preferences.periods,
    ...preferences.empires,
    ...preferences.artists,
  ];

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        {/* Identity */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-white/20 to-white/5 font-serif text-2xl text-white">
            G
          </div>
          <div>
            <h1 className="font-serif text-2xl leading-none text-white">Guest</h1>
            <p className="mt-1.5 text-sm text-white/55">
              Narsil member · v1.0 preview
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Saved" value={saved.length} onClick={() => onNavigate("saved")} />
          <Stat label="Liked" value={liked.length} />
          <Stat label="Following" value={following.length} />
        </div>

        {/* Preferences */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <SparkleIcon className="h-4 w-4 text-amber-300" />
              <h2 className="font-serif text-lg text-white">Your taste</h2>
            </div>
            <button
              onClick={onEditPreferences}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:text-white"
            >
              {preferences.completed ? "Edit" : "Set up"}
            </button>
          </div>
          {prefTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {prefTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs text-white/75"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/50">
              Personalize your museum to tune the For You feed.
            </p>
          )}
        </section>

        {/* Following */}
        {followedArtists.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-lg text-white">Following</h2>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {followedArtists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => onOpenArtist(artist.id)}
                  className="flex w-20 shrink-0 flex-col items-center gap-2"
                >
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 text-sm font-semibold text-white"
                    style={{ backgroundColor: artist.accent ?? "rgba(255,255,255,0.1)" }}
                  >
                    {artist.initials}
                  </span>
                  <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/60">
                    {artist.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Liked */}
        {likedArtworks.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-lg text-white">Recently liked</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {likedArtworks.map((art, i) => (
                <ArtworkTile
                  key={art.id}
                  artwork={art}
                  index={i}
                  onOpen={onOpenArtwork}
                  showSave={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* Settings */}
        <section className="mt-8 space-y-2">
          <h2 className="font-serif text-lg text-white">Settings</h2>
          <Row label="Replay the tutorial" onClick={onRestartTutorial} />
          <Row label="About Narsil v1.0" onClick={() => onNavigate("discover")} />
        </section>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-white/30">
          Narsil v1.0 — a product preview. Accounts, sync, and checkout arrive in
          a later version.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.03] py-4 text-center transition-colors enabled:hover:bg-white/[0.06] disabled:cursor-default"
    >
      <p className="font-serif text-2xl text-white">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-white/45">
        {label}
      </p>
    </button>
  );
}

function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.06]"
    >
      {label}
      <span className="text-white/35">›</span>
    </button>
  );
}
