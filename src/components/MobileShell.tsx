import { Capacitor } from "@capacitor/core";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAudio } from "@/lib/audio/AudioProvider";
import type { Artist } from "@/data";
import { historyEras } from "@/data/history";
import { useCatalog } from "@/data/catalog";
import TopTabs from "./TopTabs";
import BottomNav from "./BottomNav";
import { type Screen } from "./navigation";
import ArtFeed from "./ArtFeed";
import Toast, { type ToastState } from "./Toast";
import OfflineBanner from "./OfflineBanner";
import RuneLoader from "./RuneLoader";
import RoyalGoldLoader from "./RoyalGoldLoader";
import TermsView from "./TermsView";
import { useAppState } from "./AppState";
import { App as CapacitorApp } from "@capacitor/app";
import { SHARE_ART_PARAM, artworkIdFromShareUrl } from "@/lib/download";
import { WORLD } from "@/data/worldCopy";
import type { TutorialAction } from "./tutorial";
import type { TopicQuizLaunch } from "@/lib/quiz";
import { track } from "@/lib/telemetry";
import { initPush } from "@/lib/push";
import { tapHaptic } from "@/lib/haptics";

const DiscoverView = lazy(() => import("./DiscoverView"));
const BuyView = lazy(() => import("./BuyView"));
const SearchView = lazy(() => import("./SearchView"));
const CreateView = lazy(() => import("./CreateView"));
const SavedView = lazy(() => import("./SavedView"));
const YouView = lazy(() => import("./YouView"));
const AdminView = lazy(() => import("./AdminView"));
const EraScreen = lazy(() => import("./EraScreen"));
const QuizOverlay = lazy(() => import("./QuizOverlay"));
const TopicQuizOverlay = lazy(() => import("./TopicQuizOverlay"));
const ArtistProfileModal = lazy(() => import("./ArtistProfileModal"));
const ArtworkViewer = lazy(() => import("./ArtworkViewer"));
const AuthView = lazy(() => import("./AuthView"));
const PreferenceModal = lazy(() => import("./PreferenceModal"));
const TutorialCoach = lazy(() => import("./TutorialCoach"));
const MusicPrompt = lazy(() => import("./MusicPrompt"));
const ProPaywall = lazy(() => import("./ProPaywall"));
const DownloadSheet = lazy(() => import("./DownloadSheet"));

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
  const { getArtist, getArtwork, loading: catalogLoading, ensureArtworks } = useCatalog();
  const {
    ready,
    saved,
    liked,
    forgetArtworks,
    preferences,
    savePreferences,
    dismissPreferences,
    completeTutorial,
    restartTutorial,
    onboardingDone,
    completeOnboarding,
    authSeen,
    markAuthSeen,
    authPrompt,
    requestSignIn,
    dismissSignIn,
    termsAccepted,
    acceptTerms,
    isAdmin,
    isGuest,
    profile,
    proPrompt,
    requestPro,
    dismissPro,
    setSubscription,
    downloadRequest,
    dismissDownload,
    user,
  } = useAppState();
  const { promptSeen, markPromptSeen, setEnabled } = useAudio();

  const [toast, setToast] = useState<ToastState | null>(null);
  const [screen, setScreen] = useState<Screen>("for-you");
  useEffect(() => {
    track("screen_view", { screen });
  }, [screen]);
  /** Guest tapped Discover — keep them off the page and offer the Guild. */
  const [discoverGate, setDiscoverGate] = useState(false);
  // Keep each tab mounted after first visit so switching (For You ↔ Discover,
  // Gallery, Search, etc.) is instant — no remount, no feed rebuild, scroll kept.
  const [visitedScreens, setVisitedScreens] = useState<ReadonlySet<Screen>>(
    () => new Set<Screen>(["for-you"]),
  );
  const [activeArtist, setActiveArtist] = useState<Artist | null>(null);
  const [activeArtworkId, setActiveArtworkId] = useState<string | null>(null);
  /** The age opened to its own full-screen list from the Discover timeline. */
  const [activeEraId, setActiveEraId] = useState<string | null>(null);
  /** Daily quiz overlay (stacked above Discover, like EraScreen). */
  const [quizOpen, setQuizOpen] = useState(false);
  /** Open quiz hub or straight to badge picker (from profile avatar). */
  const [quizInitialStage, setQuizInitialStage] = useState<"hub" | "badges">(
    "hub",
  );
  /** Age / empire trial launched from Discover. */
  const [topicQuiz, setTopicQuiz] = useState<TopicQuizLaunch | null>(null);
  /** Bumped when the quiz closes so entry cards re-read their streak. */
  const [quizRefresh, setQuizRefresh] = useState(0);
  const [clean, setClean] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sign-in / sign-up screen (full-screen overlay above the shell).
  const [termsReview, setTermsReview] = useState(false);
  const [musicPromptOpen, setMusicPromptOpen] = useState(false);
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

  // First-launch gates — derived on render so Terms/Auth never flash after the feed.
  // Admins skip member onboarding and land in the admin-only shell after Terms.
  const firstLaunchTerms = ready && !termsAccepted;
  const firstLaunchAuth =
    ready &&
    termsAccepted &&
    !authSeen &&
    isGuest &&
    !isAdmin &&
    !authRedirectPending.current;
  const firstLaunchOnboarding =
    ready &&
    termsAccepted &&
    authSeen &&
    !onboardingDone &&
    !preferences.completed &&
    !isAdmin;
  // Hide the museum through Terms / Auth / personalization. The tutorial is
  // learn-by-doing on the live feed, so it must stay visible and interactive
  // even though onboarding is not marked done until the coach finishes.
  const onboardingGate =
    firstLaunchTerms || firstLaunchAuth || (firstLaunchOnboarding && !tutorialActive);
  const showAuthOverlay = authPrompt || firstLaunchAuth;
  /**
   * Signed-in members load `profiles.role` async. Until it arrives, avoid
   * flashing the museum UI for an account that may turn out to be admin.
   */
  const rolePending = ready && !isGuest && profile === null;
  /** Admin accounts never see Narsil / Discover / Profile — only the dashboard. */
  const adminMode = ready && isAdmin && termsAccepted;
  const memberApp = ready && !isAdmin && !rolePending;

  // Auto-open the onboarding preference flow after auth is done.
  const onboardingPrefsTriggered = useRef(false);
  useEffect(() => {
    if (
      firstLaunchOnboarding &&
      !preferences.completed &&
      !onboardingPrefsTriggered.current &&
      !tutorialActive
    ) {
      onboardingPrefsTriggered.current = true;
      setPrefsManual(false);
      setPrefsOpen(true);
    }
  }, [firstLaunchOnboarding, preferences.completed, tutorialActive]);

  // Music prompt after the full onboarding is done (members only).
  useEffect(() => {
    if (
      ready &&
      termsAccepted &&
      authSeen &&
      onboardingDone &&
      !isAdmin &&
      !promptSeen &&
      !musicPromptOpen
    ) {
      setMusicPromptOpen(true);
    }
  }, [ready, termsAccepted, authSeen, onboardingDone, isAdmin, promptSeen, musicPromptOpen]);

  useEffect(() => {
    const ids = [...saved, ...liked];
    if (ids.length === 0) return;
    let cancelled = false;
    void ensureArtworks(ids).then((result) => {
      if (cancelled || !result?.notFound.length) return;
      forgetArtworks(result.notFound);
    });
    return () => {
      cancelled = true;
    };
  }, [saved, liked, ensureArtworks, forgetArtworks]);

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

  /** Open a shared artwork, fetching it by id if it isn't loaded yet. */
  const openSharedArtwork = useCallback(
    (id: string) => {
      if (isAdmin) return;
      if (getArtwork(id)) {
        openArtwork(id);
        return;
      }
      void ensureArtworks([id]).then((result) => {
        if (!result) showToast("Couldn't open the shared artwork — try again");
        else if (result.notFound.length === 0) openArtwork(id);
        else showToast("This artwork is no longer in the collection");
      });
    },
    [isAdmin, getArtwork, openArtwork, ensureArtworks, showToast],
  );

  // Deep link: `?art=<id>` (from a shared link) opens straight into that
  // artwork's viewer. We consume the param once, then strip it from the URL so
  // a refresh or back-navigation doesn't reopen it. The catalog streams in
  // batches, so a work outside the loaded pages is fetched by id before we
  // give up on it.
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (deepLinkConsumed.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get(SHARE_ART_PARAM);
    if (!id) {
      deepLinkConsumed.current = true;
      return;
    }
    // Wait for the first catalog page before looking the id up.
    if (!getArtwork(id) && catalogLoading) return;
    deepLinkConsumed.current = true;

    params.delete(SHARE_ART_PARAM);
    const query = params.toString();
    const cleaned = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleaned);

    openSharedArtwork(id);
  }, [getArtwork, catalogLoading, openSharedArtwork]);

  // A tapped push notification opens the screen it is about. Re-run when the
  // account changes so the device token follows the signed-in user.
  useEffect(() => {
    void initPush((tap) => {
      if (tap.type === "artwork" && tap.id) openSharedArtwork(tap.id);
      else if (tap.type === "quiz") {
        setQuizInitialStage("hub");
        setQuizOpen(true);
      } else if (tap.type === "orders") setScreen("you");
    }).catch(() => {});
  }, [openSharedArtwork, user?.id]);

  // Universal Links: a /share/<id> link tapped while the iPhone app is
  // installed opens here instead of in Safari (cold start or running).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = (url: string | undefined) => {
      const id = url ? artworkIdFromShareUrl(url) : null;
      if (id) openSharedArtwork(id);
    };
    void CapacitorApp.getLaunchUrl()
      .then((launch) => handle(launch?.url))
      .catch(() => {});
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => handle(url));
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [openSharedArtwork]);

  const navigate = useCallback(
    (next: Screen) => {
      if (tutorialActive) return;
      if (next === "discover" && isGuest) {
        setDiscoverGate(true);
        return;
      }
      if (next !== screen) tapHaptic();
      setScreen(next);
      setClean(false);
    },
    [tutorialActive, isGuest, screen]
  );

  // A guest must never land on Discover (sign-out while that tab is open).
  useEffect(() => {
    if (!isGuest || screen !== "discover") return;
    setScreen("for-you");
    setDiscoverGate(true);
  }, [isGuest, screen]);

  // Mark the active screen visited (covers navigate + direct setScreen jumps).
  useEffect(() => {
    setVisitedScreens((prev) => {
      if (prev.has(screen)) return prev;
      const next = new Set(prev);
      next.add(screen);
      return next;
    });
  }, [screen]);

  // Preload other top-level tabs once the first feed batch has landed so idle
  // work does not compete with the opening card image.
  useEffect(() => {
    if (!ready || catalogLoading) return;

    const preload = () => {
      void import("./DiscoverView");
      void import("./SearchView");
      void import("./SavedView");
      void import("./BuyView");
      void import("./YouView");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 6000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = globalThis.setTimeout(preload, 3500);
    return () => globalThis.clearTimeout(timer);
  }, [ready, catalogLoading]);

  // ── Preference modal triggers ──────────────────────────────────────
  const handleViewIndex = useCallback(
    (index: number) => {
      // Only auto-show preferences after 3 swipes for returning users who
      // completed onboarding but never set preferences (edge case).
      if (
        ready &&
        termsAccepted &&
        authSeen &&
        onboardingDone &&
        !preferences.completed &&
        !prefsTriggered.current &&
        index >= 3
      ) {
        prefsTriggered.current = true;
        setPrefsManual(false);
        setPrefsOpen(true);
      }
    },
    [ready, termsAccepted, authSeen, onboardingDone, preferences.completed]
  );

  const editPreferences = useCallback(() => {
    setPrefsManual(true);
    setPrefsOpen(true);
  }, []);

  const startTutorialAfterOnboarding = useCallback(() => {
    setTutorialStep(0);
    setTutorialActive(true);
    setClean(false);
    setResetToken((t) => t + 1);
    setScreen("for-you");
  }, []);

  const handleSavePrefs = useCallback(
    (prefs: Parameters<typeof savePreferences>[0]) => {
      savePreferences(prefs);
      setPrefsOpen(false);
      // During onboarding, auto-start the tutorial instead of just toasting.
      if (!prefsManual && !onboardingDone) {
        startTutorialAfterOnboarding();
      } else {
        showToast("Preferences saved");
      }
    },
    [savePreferences, showToast, prefsManual, onboardingDone, startTutorialAfterOnboarding]
  );

  const handleSkipPrefs = useCallback(() => {
    setPrefsOpen(false);
    if (!prefsManual) {
      dismissPreferences();
      // During onboarding, auto-start tutorial even when prefs are skipped.
      if (!onboardingDone) {
        startTutorialAfterOnboarding();
      }
    }
  }, [prefsManual, dismissPreferences, onboardingDone, startTutorialAfterOnboarding]);

  // ── Tutorial flow ──────────────────────────────────────────────────
  const endTutorial = useCallback(() => {
    setTutorialActive(false);
    setActiveArtist(null);
    setActiveArtworkId(null);
    setResetToken((t) => t + 1);
    completeTutorial();
    if (!onboardingDone) completeOnboarding();
  }, [completeTutorial, onboardingDone, completeOnboarding]);

  const handleUnlockPro = useCallback(() => {
    endTutorial();
    requestPro("settings");
  }, [endTutorial, requestPro]);

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
          // Exit clean before the actions step so the right rail is visible
          // immediately — otherwise the user must tap once to unhide chrome.
          setTimeout(() => {
            setClean(false);
            advance();
          }, 800);
          break;
        case "actions":
          setTimeout(advance, 150);
          break;
      }
    },
    [tutorialActive, tutorialStep]
  );

  const advanceTutorialCard = useCallback(() => {
    if (!tutorialActive || advancingRef.current) return;
    if (TUTORIAL_ALLOW[tutorialStep] === "actions") {
      reportGesture("actions");
      return;
    }
    // Steps after the live feed gestures are short app-room explanations.
    // Their Next button advances directly; no gesture is required.
    if (tutorialStep >= TUTORIAL_ALLOW.length) {
      setTutorialStep((step) => step + 1);
    }
  }, [tutorialActive, tutorialStep, reportGesture]);

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

  const showChrome =
    memberApp &&
    !adminMode &&
    !clean &&
    !tutorialActive &&
    termsAccepted &&
    !onboardingGate &&
    onboardingDone;

  return (
    <div
      className={`flex min-h-[100dvh] w-full items-center justify-center ${
        isNative ? "bg-ink" : "bg-[#0c0a09] sm:bg-[#1a1512] sm:py-6"
      }`}
    >
      <div
        className={`relative h-[100dvh] w-full overflow-hidden bg-ink ${
          isNative
            ? ""
            : "sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:border-[10px] sm:border-umber sm:shadow-2xl"
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

        {/* Screens — admins get the dashboard only; members get the museum. */}
        <div
          className={`absolute inset-0 bg-ink ${onboardingGate ? "invisible pointer-events-none" : ""}`}
          aria-hidden={onboardingGate}
          inert={onboardingGate ? true : undefined}
        >
          {/* App-state boot (and a signed-in member's role lookup) — picks
              up the Royal Gold bar from the static splash in index.html. */}
          {(!ready || rolePending) && <RoyalGoldLoader />}

          {ready && adminMode && (
            <div className="absolute inset-0">
              <Suspense fallback={null}>
                <AdminView showToast={showToast} />
              </Suspense>
            </div>
          )}

          {ready && memberApp && !adminMode && (
            <>
          {visitedScreens.has("for-you") && (
            <div
              className={
                screen === "for-you" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "for-you"}
              inert={screen !== "for-you" ? true : undefined}
            >
              <ArtFeed
                showToast={showToast}
                onOpenArtist={openArtist}
                onOpenEra={setActiveEraId}
                clean={clean}
                onCleanChange={setClean}
                onViewIndex={handleViewIndex}
                tutorial={tutorialBridge}
                active={screen === "for-you"}
              />
            </div>
          )}

          {visitedScreens.has("discover") && (
            <div
              className={
                screen === "discover" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "discover"}
              inert={screen !== "discover" ? true : undefined}
            >
              <Suspense fallback={null}>
                <DiscoverView
                  onOpenArtist={openArtist}
                  onOpenArtwork={openArtwork}
                  onOpenEra={setActiveEraId}
                  onOpenQuiz={() => {
                    setQuizInitialStage("hub");
                    setQuizOpen(true);
                  }}
                  onOpenTopicQuiz={setTopicQuiz}
                  quizRefresh={quizRefresh}
                />
              </Suspense>
            </div>
          )}

          {visitedScreens.has("buy") && (
            <div
              className={screen === "buy" ? "absolute inset-0" : "hidden"}
              aria-hidden={screen !== "buy"}
              inert={screen !== "buy" ? true : undefined}
            >
              <Suspense fallback={null}>
                <BuyView showToast={showToast} active={screen === "buy"} />
              </Suspense>
            </div>
          )}

          {visitedScreens.has("search") && (
            <div
              className={
                screen === "search" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "search"}
              inert={screen !== "search" ? true : undefined}
            >
              <Suspense fallback={null}>
                <SearchView
                  active={screen === "search"}
                  onOpenArtwork={openArtwork}
                  showToast={showToast}
                />
              </Suspense>
            </div>
          )}

          {visitedScreens.has("create") && (
            <div
              className={
                screen === "create" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "create"}
              inert={screen !== "create" ? true : undefined}
            >
              <Suspense fallback={null}>
                <CreateView
                  showToast={showToast}
                  onPublished={() => {
                    setScreen("for-you");
                  }}
                />
              </Suspense>
            </div>
          )}

          {visitedScreens.has("saved") && (
            <div
              className={
                screen === "saved" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "saved"}
              inert={screen !== "saved" ? true : undefined}
            >
              <Suspense fallback={null}>
                <SavedView
                  onOpenArtwork={openArtwork}
                  onNavigate={navigate}
                  showToast={showToast}
                />
              </Suspense>
            </div>
          )}

          {visitedScreens.has("you") && (
            <div
              className={
                screen === "you" ? "absolute inset-0" : "hidden"
              }
              aria-hidden={screen !== "you"}
              inert={screen !== "you" ? true : undefined}
            >
              <Suspense fallback={null}>
                <YouView
                  onOpenArtwork={openArtwork}
                  onOpenArtist={openArtist}
                  onEditPreferences={editPreferences}
                  onRestartTutorial={() => {
                    restartTutorial();
                    setTutorialStep(0);
                    setTutorialActive(true);
                    setClean(false);
                    setScreen("for-you");
                    setResetToken((t) => t + 1);
                  }}
                  onNavigate={navigate}
                  onSignIn={requestSignIn}
                  onOpenTerms={() => setTermsReview(true)}
                  onOpenQuiz={() => {
                    setQuizInitialStage("hub");
                    setQuizOpen(true);
                  }}
                  onOpenQuizBadges={() => {
                    setQuizInitialStage("badges");
                    setQuizOpen(true);
                  }}
                  quizRefresh={quizRefresh}
                  onQuizReset={() => setQuizRefresh((t) => t + 1)}
                  showToast={showToast}
                />
              </Suspense>
            </div>
          )}
            </>
          )}
        </div>

        {/* Bottom navigation */}
        <AnimatePresence>
          {showChrome && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <BottomNav
                active={screen}
                onChange={navigate}
                onOpenQuiz={() => {
                  setQuizInitialStage("hub");
                  setQuizOpen(true);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showChrome && isGuest && discoverGate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] flex items-end justify-center bg-black/60 p-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] backdrop-blur-sm"
              onClick={() => setDiscoverGate(false)}
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="discover-guild-title"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl border border-accent/30 bg-ink-soft p-6 text-white shadow-2xl"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {WORLD.explorersGuild}
                </p>
                <h2
                  id="discover-guild-title"
                  className="mt-2 font-serif text-xl leading-snug"
                >
                  {WORLD.discoverGuildTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  {WORLD.discoverGuildLead}
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscoverGate(false)}
                    className="flex-1 rounded-full border border-white/15 py-3 text-sm font-medium text-white/70"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoverGate(false);
                      requestPro("discover");
                    }}
                    className="flex-1 rounded-full bg-accent py-3 text-sm font-semibold text-ink"
                  >
                    Join the Guild
                  </button>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        <Toast toast={toast} />
        <OfflineBanner />

        {/* One age in full. Sits under the profile/viewer so anything opened
            from an era's list stacks on top of it. */}
        {!adminMode && memberApp && activeEraId && (
          <Suspense fallback={null}>
            <EraScreen
              era={historyEras.find((e) => e.id === activeEraId) ?? null}
              onClose={() => setActiveEraId(null)}
              onOpenArtwork={openArtwork}
              onOpenArtist={openArtist}
              onOpenTopicQuiz={setTopicQuiz}
              quizRefresh={quizRefresh}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && quizOpen && (
          <Suspense fallback={<RuneLoader overlay label="Opening the Hall" className="z-[65]" />}>
            <QuizOverlay
              open
              initialStage={quizInitialStage}
              onClose={() => {
                setQuizOpen(false);
                setQuizInitialStage("hub");
                setQuizRefresh((t) => t + 1);
              }}
              onOpenArtwork={openArtwork}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && topicQuiz && (
          <Suspense fallback={<RuneLoader overlay label="Preparing the trial" className="z-[70]" />}>
            <TopicQuizOverlay
              launch={topicQuiz}
              onClose={() => {
                setTopicQuiz(null);
                setQuizRefresh((t) => t + 1);
              }}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && activeArtist && (
          <Suspense fallback={null}>
            <ArtistProfileModal
              artist={activeArtist}
              onClose={() => setActiveArtist(null)}
              onOpenArtwork={openArtwork}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && activeArtwork && activeArtworkArtist && (
          <Suspense fallback={null}>
            <ArtworkViewer
              artwork={activeArtwork}
              artist={activeArtworkArtist}
              open={!!activeArtworkId}
              onClose={() => setActiveArtworkId(null)}
              showToast={showToast}
              onOpenArtist={openArtist}
            />
          </Suspense>
        )}

        <AnimatePresence>
          {firstLaunchTerms && (
            <TermsView
              onAccept={() => {
                acceptTerms();
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

        {!adminMode && memberApp && downloadRequest && (
          <Suspense fallback={null}>
            <DownloadSheet
              artwork={downloadRequest}
              onClose={dismissDownload}
              showToast={showToast}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && proPrompt && (
          <Suspense fallback={null}>
            <ProPaywall
              reason={proPrompt}
              onClose={dismissPro}
              onSubscribed={setSubscription}
              onShowTerms={() => {
                dismissPro();
                setTermsReview(true);
              }}
              showToast={showToast}
            />
          </Suspense>
        )}

        <AnimatePresence>
          {!adminMode && memberApp && musicPromptOpen && (
            <Suspense fallback={null}>
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
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAuthOverlay && (
            <Suspense fallback={null}>
              <AuthView
                onClose={() => {
                  dismissSignIn();
                  markAuthSeen();
                }}
              />
            </Suspense>
          )}
        </AnimatePresence>

        {!adminMode && memberApp && (
          <Suspense fallback={null}>
            <PreferenceModal
              open={prefsOpen}
              onboarding={!prefsManual && !onboardingDone}
              initial={preferences}
              onSave={handleSavePrefs}
              onSkip={handleSkipPrefs}
            />
          </Suspense>
        )}

        {!adminMode && memberApp && (
          <Suspense fallback={null}>
            <TutorialCoach
              open={tutorialActive}
              step={tutorialStep}
              advancing={advancing}
              onSkip={endTutorial}
              onStart={endTutorial}
              onAdvance={advanceTutorialCard}
              onUnlockPro={handleUnlockPro}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
