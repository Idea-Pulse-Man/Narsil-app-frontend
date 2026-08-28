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
import { useAppState } from "./AppState";
import { SHARE_ART_PARAM } from "@/lib/download";
import type { TutorialAction } from "./tutorial";

const DiscoverView = lazy(() => import("./DiscoverView"));
const BuyView = lazy(() => import("./BuyView"));
const SearchView = lazy(() => import("./SearchView"));
const CreateView = lazy(() => import("./CreateView"));
const SavedView = lazy(() => import("./SavedView"));
const YouView = lazy(() => import("./YouView"));
const AdminView = lazy(() => import("./AdminView"));
const EraScreen = lazy(() => import("./EraScreen"));
const QuizOverlay = lazy(() => import("./QuizOverlay"));
const ArtistProfileModal = lazy(() => import("./ArtistProfileModal"));
const ArtworkViewer = lazy(() => import("./ArtworkViewer"));
const AuthView = lazy(() => import("./AuthView"));
const PreferenceModal = lazy(() => import("./PreferenceModal"));
const TutorialCoach = lazy(() => import("./TutorialCoach"));
const TermsView = lazy(() => import("./TermsView"));
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
    proPrompt,
    dismissPro,
    setSubscription,
    downloadRequest,
    dismissDownload,
  } = useAppState();
  const { promptSeen, markPromptSeen, setEnabled } = useAudio();

  const [toast, setToast] = useState<ToastState | null>(null);
  const [screen, setScreen] = useState<Screen>("for-you");
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
  /** Bumped when the quiz closes so entry cards re-read their streak. */
  const [quizRefresh, setQuizRefresh] = useState(0);
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
    },
    [tutorialActive]
  );

  // Mark the active screen visited (covers navigate + direct setScreen jumps).
  useEffect(() => {
    setVisitedScreens((prev) => {
      if (prev.has(screen)) return prev;
      const next = new Set(prev);
      next.add(screen);
      return next;
    });
  }, [screen]);

  // Preload other top-level tabs during idle time so the first switch stays fast.
  useEffect(() => {
    const preload = () => {
      void import("./DiscoverView");
      void import("./SearchView");
      void import("./SavedView");
      void import("./BuyView");
      void import("./YouView");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = globalThis.setTimeout(preload, 2500);
    return () => globalThis.clearTimeout(timer);
  }, []);

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

        {/* Screens — keep-alive after first visit. Hide inactive tabs with
            `hidden` instead of unmounting so tab switches stay instant and
            For You does not rebuild its feed when you come back. */}
        <div className="absolute inset-0 bg-ink">
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
                  onOpenQuiz={() => setQuizOpen(true)}
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
                <BuyView showToast={showToast} />
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
                screen === "you" && !adminOpen
                  ? "absolute inset-0"
                  : "hidden"
              }
              aria-hidden={screen !== "you" || adminOpen}
              inert={screen !== "you" || adminOpen ? true : undefined}
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
                    setScreen("for-you");
                    setResetToken((t) => t + 1);
                  }}
                  onNavigate={navigate}
                  onSignIn={() => setAuthOpen(true)}
                  onOpenTerms={() => setTermsReview(true)}
                  onOpenAdmin={() => setAdminOpen(true)}
                  onOpenQuiz={() => setQuizOpen(true)}
                  quizRefresh={quizRefresh}
                  onQuizReset={() => setQuizRefresh((t) => t + 1)}
                  isAdmin={isAdmin}
                  showToast={showToast}
                />
              </Suspense>
            </div>
          )}

          {screen === "you" && adminOpen && (
            <div className="absolute inset-0">
              <Suspense fallback={null}>
                <AdminView
                  onBack={() => setAdminOpen(false)}
                  showToast={showToast}
                />
              </Suspense>
            </div>
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
                onOpenQuiz={() => setQuizOpen(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Toast toast={toast} />

        {/* One age in full. Sits under the profile/viewer so anything opened
            from an era's list stacks on top of it. */}
        {activeEraId && (
          <Suspense fallback={null}>
            <EraScreen
              era={historyEras.find((e) => e.id === activeEraId) ?? null}
              onClose={() => setActiveEraId(null)}
              onOpenArtwork={openArtwork}
              onOpenArtist={openArtist}
            />
          </Suspense>
        )}

        {quizOpen && (
          <Suspense fallback={null}>
            <QuizOverlay
              open
              onClose={() => {
                setQuizOpen(false);
                setQuizRefresh((t) => t + 1);
              }}
              onOpenArtwork={openArtwork}
            />
          </Suspense>
        )}

        {activeArtist && (
          <Suspense fallback={null}>
            <ArtistProfileModal
              artist={activeArtist}
              onClose={() => setActiveArtist(null)}
              onOpenArtwork={openArtwork}
            />
          </Suspense>
        )}

        {activeArtwork && activeArtworkArtist && (
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
          {termsOpen && (
            <Suspense fallback={null}>
              <TermsView
                onAccept={() => {
                  acceptTerms();
                  setTermsOpen(false);
                }}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {termsReview && (
            <Suspense fallback={null}>
              <TermsView
                required={false}
                onClose={() => setTermsReview(false)}
                onAccept={() => setTermsReview(false)}
              />
            </Suspense>
          )}
        </AnimatePresence>

        {downloadRequest && (
          <Suspense fallback={null}>
            <DownloadSheet
              artwork={downloadRequest}
              onClose={dismissDownload}
              showToast={showToast}
            />
          </Suspense>
        )}

        {proPrompt && (
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
          {musicPromptOpen && (
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
          {authOpen && (
            <Suspense fallback={null}>
              <AuthView
                onClose={() => {
                  setAuthOpen(false);
                  markAuthSeen();
                }}
              />
            </Suspense>
          )}
        </AnimatePresence>

        <Suspense fallback={null}>
          <PreferenceModal
            open={prefsOpen}
            initial={preferences}
            onSave={handleSavePrefs}
            onSkip={handleSkipPrefs}
          />
        </Suspense>

        <Suspense fallback={null}>
          <TutorialCoach
            open={tutorialActive}
            step={tutorialStep}
            advancing={advancing}
            onSkip={endTutorial}
            onStart={endTutorial}
            onAdvance={() => reportGesture("actions")}
          />
        </Suspense>
      </div>
    </div>
  );
}
