import { useEffect, useRef, useState } from "react";
import { useCatalog } from "@/data/catalog";
import { WORLD } from "@/data/worldCopy";
import { FEED_MATCH_MODES, FEED_MATCH_COPY } from "@/lib/personalize";
import { useAppState } from "./AppState";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { FlameIcon, PencilIcon, SparkleIcon } from "./Icons";
import {
  effectiveStreak,
  hasPlayedToday,
  loadProgress,
  resetQuizData,
  EMPTY_PROGRESS,
  levelTitle,
  useQuizBadges,
  useQuizScores,
  type QuizProgress,
} from "@/lib/quiz";
import { useAudio } from "@/lib/audio/AudioProvider";
import ArtworkTile from "./ArtworkTile";
import AddressManager from "./AddressManager";
import ContactAdminSheet from "./ContactAdminSheet";
import OrdersSheet from "./OrdersSheet";
import ProStatusSheet from "./ProStatusSheet";
import BadgeCase from "./BadgeCase";
import PersonLevelFrame from "./PersonLevelFrame";
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
  onOpenQuiz: () => void;
  /** Bumped when the quiz overlay closes so the streak re-reads. */
  quizRefresh: number;
  /** Called after the quiz streak is reset so entry cards re-read it. */
  onQuizReset: () => void;
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
  onOpenQuiz,
  quizRefresh,
  onQuizReset,
  showToast,
}: YouViewProps) {
  const {
    saved,
    liked,
    following,
    preferences,
    feedMatchMode,
    setFeedMatchMode,
    user,
    profile,
    isGuest,
    signOut,
    isPro,
    requestPro,
    setAvatar,
  } = useAppState();
  const {
    enabled: musicOn,
    setEnabled: setMusicOn,
    attributionUrl,
    attributionLabel,
    unavailable,
  } = useAudio();
  const { getArtist, getArtwork, searchFacets } = useCatalog();
  const [addressOpen, setAddressOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [quizProgress, setQuizProgress] =
    useState<QuizProgress>(EMPTY_PROGRESS);
  const { badges } = useQuizBadges(user?.id ?? null, quizRefresh);
  const { scores } = useQuizScores(user?.id ?? null, quizRefresh);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuizProgress(loadProgress());
  }, [quizRefresh]);

  const quizStreak = effectiveStreak(quizProgress);
  const quizDoneToday = hasPlayedToday(quizProgress);
  const hasQuizData =
    quizStreak > 0 ||
    quizProgress.lastPlayedDate != null ||
    quizProgress.totalAnswered > 0;

  const handleResetQuiz = async () => {
    await resetQuizData();
    setQuizProgress(EMPTY_PROGRESS); // reflect immediately, don't await the cloud
    onQuizReset(); // bump the shared token so the Discover card re-reads too
    showToast("Quiz streak reset");
  };

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

  const openContact = () => {
    if (isGuest) {
      onSignIn();
      return;
    }
    setContactOpen(true);
  };

  /**
   * Members get their status; everyone else gets the offer. Guests are sent to
   * sign-in first — the entitlement binds to a real account, and an anonymous
   * session is discarded on reinstall, which would leave someone paying Apple
   * for an account that no longer exists.
   */
  const openPro = () => {
    if (isGuest) {
      onSignIn();
      return;
    }
    if (isPro) {
      setProOpen(true);
      return;
    }
    requestPro("settings");
  };

  const email = profile?.email ?? user?.email ?? null;
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  const displayName = isGuest
    ? "Guest"
    : profile?.full_name ??
      meta.full_name ??
      meta.name ??
      email?.split("@")[0] ??
      "Member";
  const avatarUrl =
    profile?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null;
  const initial = (displayName.charAt(0) || "?").toUpperCase();

  const handlePickAvatar = () => {
    if (isGuest) {
      onSignIn();
      return;
    }
    if (avatarBusy) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      await setAvatar(file);
      showToast("Avatar updated");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not update avatar",
        "error",
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    showToast("Signed out");
  };

  const likedArtworks = liked
    .map((id) => getArtwork(id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .slice(0, 4);

  const vaultCount = saved.filter((id) => getArtwork(id)).length;
  const likedCount = liked.filter((id) => getArtwork(id)).length;

  const followedArtists = following
    .map((id) => getArtist(id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const prefTags = [
    ...(preferences.artTypes ?? []),
    ...(preferences.periods ?? []),
    ...(preferences.empires ?? []),
    ...(preferences.artists ?? []),
    ...(preferences.interests ?? []),
  ];

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        {/* Identity */}
        <div className="flex items-center gap-4">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarFile}
            className="hidden"
          />
          <div className="relative h-16 w-16 shrink-0">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-white/20 to-white/5 font-serif text-2xl text-white">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <button
              type="button"
              onClick={handlePickAvatar}
              disabled={avatarBusy}
              aria-label={isGuest ? "Sign in to set avatar" : "Edit avatar"}
              className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-ink shadow-sm disabled:opacity-70"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
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
                Sync your vault across devices
              </span>
            </span>
            <span className="text-white/40">›</span>
          </button>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label={WORLD.vault} value={vaultCount} onClick={() => onNavigate("saved")} />
          <Stat label="Liked" value={likedCount} />
          <Stat label="Following" value={following.length} />
        </div>

        {/* Person level + daily quiz / Royal Assessment */}
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <PersonLevelFrame levelId={quizProgress.levelId} size={64} />
          <button
            onClick={onOpenQuiz}
            className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors"
          >
            <FlameIcon
              filled={quizStreak > 0}
              className={`h-6 w-6 shrink-0 ${
                quizStreak > 0 ? "text-amber-300" : "text-white/30"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {quizStreak > 0
                  ? `${quizStreak} day assessment streak`
                  : WORLD.royalAssessment}
              </p>
              <p className="mt-0.5 text-xs text-white/50">
                {quizProgress.lastDailyScore != null
                  ? `${levelTitle(quizProgress.levelId)} · ${quizProgress.totalPoints.toLocaleString()} pts · last ${quizProgress.lastDailyScore}/${quizProgress.lastDailyTotal}`
                  : `${levelTitle(quizProgress.levelId)} · ${quizProgress.totalPoints.toLocaleString()} pts`}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-emerald-300/90">
              {quizDoneToday ? "Done today" : "Play ›"}
            </span>
          </button>
        </div>

        <BadgeCase
          badges={badges}
          scores={scores}
          extraEmpires={searchFacets.empires}
        />

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

          <div className="mt-5">
            <p className="text-[13px] font-medium text-white/80">For You match</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              {FEED_MATCH_COPY[feedMatchMode].hint}
            </p>
            <div className="mt-3 flex gap-2">
              {FEED_MATCH_MODES.map((mode) => {
                const active = feedMatchMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFeedMatchMode(mode)}
                    className={`flex-1 rounded-full px-2 py-2 text-center text-xs font-medium transition-colors ${
                      active
                        ? "bg-accent text-ink"
                        : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
                    }`}
                  >
                    {FEED_MATCH_COPY[mode].label}
                  </button>
                );
              })}
            </div>
          </div>
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
          {/* First in the list: the only entry point that isn't reached by
              hitting a paywall, so anyone willing to pay without being blocked
              can actually find it. */}
          <Row
            label={WORLD.explorersGuild}
            hint={isPro ? "Active" : "Subscribe"}
            onClick={openPro}
            accent={!isPro}
          />
          <Row label="Terms of Service" onClick={onOpenTerms} />
          <Row
            label="Contact admin"
            hint="Email or live chat"
            onClick={openContact}
          />
          <Row label="Canvas orders" onClick={openOrders} />
          <Row label="Delivery addresses" onClick={openAddresses} />
          <Row label="Replay the tutorial" onClick={onRestartTutorial} />
          {hasQuizData && (
            <Row
              label="Reset assessment streak"
              hint={quizStreak > 0 ? `${quizStreak} days` : undefined}
              onClick={handleResetQuiz}
              destructive
            />
          )}
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
      <ContactAdminSheet
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        showToast={showToast}
      />
      <OrdersSheet open={ordersOpen} onClose={() => setOrdersOpen(false)} />
      <ProStatusSheet
        open={proOpen}
        onClose={() => setProOpen(false)}
        showToast={showToast}
      />
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
  accent = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  destructive?: boolean;
  /** Highlights the row as an offer rather than a setting. */
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-sm transition-colors ${
        accent
          ? "border-amber-300/25 bg-gradient-to-br from-amber-300/12 to-amber-300/[0.04] text-white hover:border-amber-300/45"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      } ${destructive ? "text-red-400" : accent ? "" : "text-white/85"}`}
    >
      <span>{label}</span>
      <span className={accent ? "font-medium text-amber-300" : "text-white/35"}>
        {hint ? hint : "›"}
      </span>
    </button>
  );
}
