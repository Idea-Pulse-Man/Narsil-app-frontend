import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAudio } from "@/lib/audio/AudioProvider";
import TermsView from "./TermsView";
import MusicPrompt from "./MusicPrompt";
import AdminView from "./AdminView";
import type { Artist, CategoryId } from "@/data";
import { useCatalog } from "@/data/catalog";
import TopTabs from "./TopTabs";
import BottomNav from "./BottomNav";
import { isFeedScreen, type Screen } from "./navigation";
import ArtFeed, { type FeedFilter } from "./ArtFeed";
import HistoryView from "./HistoryView";
import BuyView from "./BuyView";
import CreateView from "./CreateView";
import DiscoverView from "./DiscoverView";
import SearchView from "./SearchView";
import SavedView from "./SavedView";
import YouView from "./YouView";
import ArtistProfileModal from "./ArtistProfileModal";
import ArtworkViewer from "./ArtworkViewer";
import AuthView from "./AuthView";
import PreferenceModal from "./PreferenceModal";
import TutorialCoach from "./TutorialCoach";
import Toast, { type ToastState } from "./Toast";
import { useAppState } from "./AppState";
import { SHARE_ART_PARAM } from "@/lib/download";
import type { TutorialAction } from "./tutorial";

// The gesture each tutorial step teaches, in order (matches STEPS in the coach).
const TUTORIAL_ALLOW: TutorialAction[] = [
  "scroll",
  "placard",
  "artist",
  "fit",
  "clean",
  "actions",
];

export default function MobileShell() {
  const isNative = Capacitor.isNativePlatform();
  const { getArtist, getArtwork, loading: catalogLoading } = useCatalog();
  const {
    ready,
    preferences,
    savePreferences,
    dismissPreferences,
    completeTutorial,
    restartTutorial,
    authSeen,
    markAuthSeen,
    termsAccepted,
    acceptTerms,
    isAdmin,
    isGuest,
  } = useAppState();
  const { promptSeen, markPromptSeen, setEnabled } = useAudio();

  const [toast, setToast] = useState<ToastState | null>(null);
  const [screen, setScreen] = useState<Screen>("for-you");
  // For You source toggle (client sketch: "Mix of historical and freelance → add toggle").
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  // Once a source is chosen the toggle hides; it returns when For You is re-selected.
  const [showFeedToggle, setShowFeedToggle] = useState(true);
  const [activeArtist, setActiveArtist] = useState<Artist | null>(null);
  const [activeArtworkId, setActiveArtworkId] = useState<string | null>(null);
  const [searchCategory, setSearchCategory] = useState<CategoryId | null>(null);
  const [clean, setClean] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sign-in / sign-up screen (full-screen overlay above the shell).
  const [authOpen, setAuthOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsReview, setTermsReview] = useState(false);
  const [musicPromptOpen, setMusicPromptOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  // True when the app opened from an auth redirect (`?code=`) that's still being
  // completed — suppress the first-launch gate so it doesn't flash open.
  const authRedirectPending = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("code")
  );

  // Preference modal ("Personalize your museum").
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsManual, setPrefsManual] = useState(false);
  const prefsTriggered = useRef(false);

  // Interactive, learn-by-doing tutorial. Persists "done" in localStorage so it
  // only runs on first visit (resettable from the You tab).
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);

  // Terms gate first, then auth on first launch.
  useEffect(() => {
    if (ready && !termsAccepted) {
      setTermsOpen(true);
      return;
    }
    if (ready && termsAccepted && !authSeen && isGuest && !authRedirectPending.current) {
      setAuthOpen(true);
    }
  }, [ready, termsAccepted, authSeen, isGuest]);

  // Music prompt after terms (and after auth dismissed or seen).
  useEffect(() => {
    if (
      ready &&
      termsAccepted &&
      authSeen &&
      !promptSeen &&
      !musicPromptOpen
    ) {
      setMusicPromptOpen(true);
    }
  }, [ready, termsAccepted, authSeen, promptSeen, musicPromptOpen]);

  const showToast = useCallback(
    (message: string, variant: ToastState["variant"] = "default") => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ id: Date.now(), message, variant });
      toastTimer.current = setTimeout(() => setToast(null), 2200);
    },
    []
  );

  const openArtist = useCallback(
    (artistId: string) => {
      const artist = getArtist(artistId);
      if (artist) setActiveArtist(artist);
    },
    [getArtist]
  );

  const openArtwork = useCallback((artworkId: string) => {
    setActiveArtworkId(artworkId);
  }, []);

  // Deep link: `?art=<id>` (from a shared link) opens straight into that
  // artwork's viewer. We consume the param once, then strip it from the URL so
  // a refresh or back-navigation doesn't reopen it.
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (deepLinkConsumed.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get(SHARE_ART_PARAM);
    if (!id) {
      deepLinkConsumed.current = true;
      return;
    }
    // Wait for the catalog before deciding the id is unknown.
    if (getArtwork(id)) {
      deepLinkConsumed.current = true;
      openArtwork(id);
    } else if (catalogLoading) {
      return;
    } else {
      deepLinkConsumed.current = true;
    }
    params.delete(SHARE_ART_PARAM);
    const query = params.toString();
    const cleaned = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleaned);
  }, [getArtwork, catalogLoading, openArtwork]);

  const navigate = useCallback(
    (next: Screen) => {
      if (tutorialActive) return;
      setScreen(next);
      setClean(false);
      if (next === "for-you") setShowFeedToggle(true);
      if (next !== "search") setSearchCategory(null);
    },
    [tutorialActive]
  );

  const openCategory = useCallback(
    (id: CategoryId) => {
      setSearchCategory(id);
      setScreen("search");
    },
    []
  );

  // ── Preference modal triggers ──────────────────────────────────────
  const handleViewIndex = useCallback(
    (index: number) => {
      if (
        ready &&
        termsAccepted &&
        authSeen &&
        !preferences.completed &&
        !prefsTriggered.current &&
        index >= 3
      ) {
        prefsTriggered.current = true;
        setPrefsManual(false);
        setPrefsOpen(true);
      }
    },
    [ready, authSeen, preferences.completed]
  );

  const editPreferences = useCallback(() => {
    setPrefsManual(true);
    setPrefsOpen(true);
  }, []);

  const handleSavePrefs = useCallback(
    (prefs: Parameters<typeof savePreferences>[0]) => {
      savePreferences(prefs);
      setPrefsOpen(false);
      showToast("Preferences saved");
    },
    [savePreferences, showToast]
  );

  const handleSkipPrefs = useCallback(() => {
    setPrefsOpen(false);
    if (!prefsManual) dismissPreferences();
  }, [prefsManual, dismissPreferences]);

  // ── Tutorial flow ──────────────────────────────────────────────────
  const endTutorial = useCallback(() => {
    setTutorialActive(false);
    setActiveArtist(null);
    setActiveArtworkId(null);
    setResetToken((t) => t + 1);
    completeTutorial();
  }, [completeTutorial]);

  const reportGesture = useCallback(
    (action: TutorialAction) => {
      if (!tutorialActive || advancingRef.current) return;
      if (action !== TUTORIAL_ALLOW[tutorialStep]) return;

      advancingRef.current = true;
      setAdvancing(true);
      const advance = () => {
        setTutorialStep((s) => s + 1);
        advancingRef.current = false;
        setAdvancing(false);
      };

      switch (action) {
        case "scroll":
          setTimeout(advance, 650);
          break;
        case "placard":
          setTimeout(() => {
            setResetToken((t) => t + 1);
            advance();
          }, 1200);
          break;
        case "artist":
          setTimeout(() => {
            setActiveArtist(null);
            advance();
          }, 1200);
          break;
        case "fit":
          setTimeout(advance, 1000);
          break;
        case "clean":
          setTimeout(advance, 800);
          break;
        case "actions":
          setTimeout(advance, 150);
          break;
      }
    },
    [tutorialActive, tutorialStep]
  );

  const tutorialBridge = {
    active: tutorialActive,
    allow: tutorialActive ? TUTORIAL_ALLOW[tutorialStep] ?? null : null,
    report: reportGesture,
    resetToken,
  };

  const activeArtwork = activeArtworkId ? getArtwork(activeArtworkId) : undefined;
  const activeArtworkArtist = activeArtwork
    ? getArtist(activeArtwork.artistId)
    : undefined;

  const showChrome = !clean && !tutorialActive;

  return (
    <div
      className={`flex min-h-[100dvh] w-full items-center justify-center ${
        isNative ? "bg-ink" : "bg-neutral-950 sm:bg-neutral-900 sm:py-6"
      }`}
    >
      <div
        className={`relative h-[100dvh] w-full overflow-hidden bg-ink ${
          isNative
            ? ""
            : "sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:border-[10px] sm:border-neutral-800 sm:shadow-2xl"
        }`}
      >
        {/* Top tabs — shared across every screen so the active pill animates */}
        <AnimatePresence>
          {showChrome && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <TopTabs active={screen} onChange={navigate} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feed source toggle — mix / museum / freelance */}
        <AnimatePresence>
          {showChrome && isFeedScreen(screen) && showFeedToggle && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-30 flex justify-center"
            >
              <div className="flex items-center rounded-full border border-white/25 bg-black/40 p-1 backdrop-blur-xl">
                {(
                  [
                    { id: "all", label: "Mix" },
                    { id: "museum", label: "Museum" },
                    { id: "freelance", label: "Freelance" },
                  ] as { id: FeedFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setFeedFilter(opt.id);
                      setShowFeedToggle(false);
                    }}
                    className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-all ${
                      feedFilter === opt.id
                        ? "bg-white text-ink shadow-sm"
                        : "text-white/60 hover:text-white/85"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screens */}
        {/* Crossfade screens: the incoming screen mounts immediately (no
            mode="wait") and both layers overlap via `absolute inset-0`, so
            navigation feels instant instead of waiting on the exit animation. */}
        <AnimatePresence>
          <motion.div
            key={screen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-ink"
          >
            {screen === "for-you" && (
              <div className="absolute inset-0 bg-ink">
                <ArtFeed
                  key={`feed-${feedFilter}`}
                  showToast={showToast}
                  onOpenArtist={openArtist}
                  onCleanChange={setClean}
                  onViewIndex={handleViewIndex}
                  filter={feedFilter}
                  tutorial={tutorialBridge}
                />
              </div>
            )}

            {screen === "history" && (
              <HistoryView
                onOpenArtist={openArtist}
                onOpenArtwork={openArtwork}
              />
            )}

            {screen === "buy" && <BuyView showToast={showToast} />}

            {screen === "search" && (
              <SearchView
                initialCategory={searchCategory}
                onOpenArtwork={openArtwork}
                showToast={showToast}
              />
            )}

            {screen === "discover" && (
              <DiscoverView onOpenCategory={openCategory} />
            )}

            {screen === "create" && (
              <CreateView
                showToast={showToast}
                onPublished={() => {
                  // Jump to the feed filtered to freelance originals, where the
                  // freshly-posted (newest) artwork sorts to the front.
                  setFeedFilter("freelance");
                  setShowFeedToggle(true);
                  setScreen("for-you");
                }}
              />
            )}

            {screen === "saved" && (
              <SavedView
                onOpenArtwork={openArtwork}
                onNavigate={navigate}
                showToast={showToast}
              />
            )}

            {screen === "you" && !adminOpen && (
              <YouView
                onOpenArtwork={openArtwork}
                onOpenArtist={openArtist}
                onEditPreferences={editPreferences}
                onRestartTutorial={() => {
                  restartTutorial();
                  setTutorialStep(0);
                  setTutorialActive(true);
                  setScreen("for-you");
                  setResetToken((t) => t + 1);
                }}
                onNavigate={navigate}
                onSignIn={() => setAuthOpen(true)}
                onOpenTerms={() => setTermsReview(true)}
                onOpenAdmin={() => setAdminOpen(true)}
                isAdmin={isAdmin}
                showToast={showToast}
              />
            )}

            {screen === "you" && adminOpen && (
              <AdminView
                onBack={() => setAdminOpen(false)}
                showToast={showToast}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Brand mark — feed only, bottom-left above the nav */}
        <AnimatePresence>
          {showChrome && isFeedScreen(screen) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-4 z-40 flex items-center gap-1.5"
            >
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink">
                N
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
                Narsil
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom navigation */}
        <AnimatePresence>
          {showChrome && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <BottomNav active={screen} onChange={navigate} />
            </motion.div>
          )}
        </AnimatePresence>

        <Toast toast={toast} />

        {/* Shell-level artwork viewer (opened from tiles across screens):
            a zoomable canvas + quick actions + the placard as an info layer. */}
        {activeArtwork && activeArtworkArtist && (
          <ArtworkViewer
            artwork={activeArtwork}
            artist={activeArtworkArtist}
            open={!!activeArtworkId}
            onClose={() => setActiveArtworkId(null)}
            showToast={showToast}
            onOpenArtist={openArtist}
          />
        )}

        <ArtistProfileModal
          artist={activeArtist}
          onClose={() => setActiveArtist(null)}
          onOpenArtwork={openArtwork}
        />

        <AnimatePresence>
          {termsOpen && (
            <TermsView
              onAccept={() => {
                acceptTerms();
                setTermsOpen(false);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {termsReview && (
            <TermsView
              required={false}
              onClose={() => setTermsReview(false)}
              onAccept={() => setTermsReview(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {musicPromptOpen && (
            <MusicPrompt
              onEnable={() => {
                setEnabled(true);
                markPromptSeen();
                setMusicPromptOpen(false);
              }}
              onDecline={() => {
                markPromptSeen();
                setMusicPromptOpen(false);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {authOpen && (
            <AuthView
              onClose={() => {
                setAuthOpen(false);
                markAuthSeen();
              }}
            />
          )}
        </AnimatePresence>

        <PreferenceModal
          open={prefsOpen}
          initial={preferences}
          onSave={handleSavePrefs}
          onSkip={handleSkipPrefs}
        />

        <TutorialCoach
          open={tutorialActive}
          step={tutorialStep}
          advancing={advancing}
          onSkip={endTutorial}
          onStart={endTutorial}
          onAdvance={() => reportGesture("actions")}
        />
      </div>
    </div>
  );
}
