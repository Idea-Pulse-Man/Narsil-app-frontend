import { useState } from "react";
import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { SparkleIcon } from "./Icons";
import { useAudio } from "@/lib/audio/AudioProvider";
import ArtworkTile from "./ArtworkTile";
import AddressManager from "./AddressManager";
import OrdersSheet from "./OrdersSheet";
import type { ToastState } from "./Toast";
import type { Screen } from "./navigation";

interface YouViewProps {
  onOpenArtwork: (artworkId: string) => void;
  onOpenArtist: (artistId: string) => void;
  onEditPreferences: () => void;
  onRestartTutorial: () => void;
  onNavigate: (screen: Screen) => void;
  onSignIn: () => void;
  onOpenTerms: () => void;
  onOpenAdmin: () => void;
  isAdmin: boolean;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function YouView({
  onOpenArtwork,
  onOpenArtist,
  onEditPreferences,
  onRestartTutorial,
  onNavigate,
  onSignIn,
  onOpenTerms,
  onOpenAdmin,
  isAdmin,
  showToast,
}: YouViewProps) {
  const { saved, liked, following, preferences, user, profile, isGuest, signOut } =
    useAppState();
  const {
    enabled: musicOn,
    setEnabled: setMusicOn,
    attributionUrl,
    attributionLabel,
    unavailable,
  } = useAudio();
  const { getArtist, getArtwork } = useCatalog();
  const [addressOpen, setAddressOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const openAddresses = () => {
    if (isGuest) {
      onSignIn();
      return;
    }
    setAddressOpen(true);
  };

  const openOrders = () => {
    if (isGuest) {
      onSignIn();
      return;
    }
    setOrdersOpen(true);
  };

  const email = profile?.email ?? user?.email ?? null;
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
  };
  const displayName = isGuest
    ? "Guest"
    : profile?.full_name ??
      meta.full_name ??
      meta.name ??
      email?.split("@")[0] ??
      "Member";
  const avatarUrl = profile?.avatar_url ?? null;
  const initial = (displayName.charAt(0) || "?").toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    showToast("Signed out");
  };

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
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-white/20 to-white/5 font-serif text-2xl text-white">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl leading-none text-white">
              {displayName}
            </h1>
            <p className="mt-1.5 truncate text-sm text-white/55">
              {isGuest ? "Narsil member · v1.0 preview" : email}
            </p>
          </div>
        </div>

        {/* Sign in prompt */}
        {isGuest && (
          <button
            onClick={onSignIn}
            className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-4 text-left transition-colors hover:bg-white/[0.08]"
          >
            <span>
              <span className="block text-sm font-medium text-white">
                Sign in or create an account
              </span>
              <span className="mt-0.5 block text-xs text-white/50">
                Sync your saved art across devices
              </span>
            </span>
            <span className="text-white/40">›</span>
          </button>
        )}

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
          <Row
            label="Background music"
            hint={unavailable ? "Unavailable" : musicOn ? "On" : "Off"}
            onClick={() => {
              setMusicOn(!musicOn);
              if (!musicOn && unavailable) {
                showToast("Music unavailable right now", "error");
              }
            }}
          />
          <Row label="Terms of Service" onClick={onOpenTerms} />
          <Row label="Canvas orders" onClick={openOrders} />
          <Row label="Delivery addresses" onClick={openAddresses} />
          <Row label="Replay the tutorial" onClick={onRestartTutorial} />
          {isAdmin && <Row label="Admin dashboard" onClick={onOpenAdmin} />}
          {!isGuest && (
            <Row label="Sign out" onClick={handleSignOut} destructive />
          )}
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/30">
          Music from{" "}
          <a
            href={attributionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            {attributionLabel}
          </a>
          .
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-white/30">
          Narsil v1.0 — a product preview.
        </p>
      </div>

      <AddressManager
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        showToast={showToast}
      />
      <OrdersSheet open={ordersOpen} onClose={() => setOrdersOpen(false)} />
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

function Row({
  label,
  hint,
  onClick,
  destructive = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
        destructive ? "text-red-400" : "text-white/85"
      }`}
    >
      <span>{label}</span>
      <span className="text-white/35">{hint ? hint : "›"}</span>
    </button>
  );
}
