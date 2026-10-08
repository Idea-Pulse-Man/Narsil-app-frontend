import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Artwork } from "@/data";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import {
  hasTastePreferences,
  type FeedMatchMode,
} from "@/lib/personalize";
import { supabase } from "@/lib/supabase";
import {
  initNativeAuthListener,
  completeAuthFromUrl,
  signOut as authSignOut,
} from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import {
  ensureSession,
  fetchUserData,
  fetchProfile,
  fetchSeen,
  markSeenRemote,
  setCollection,
  setFollow,
  acceptTermsRemote,
  syncOnboardingRemote,
  setAvatarRemote,
  type CollectionKind,
  type Profile,
} from "@/lib/userData";
import {
  fetchSubscription,
  NO_SUBSCRIPTION,
  type PaywallReason,
  type SubscriptionState,
} from "@/lib/subscription";
import { tapHaptic } from "@/lib/haptics";

/** User preferences captured by the "Personalize your museum" modal. */
export interface Preferences {
  artTypes: string[];
  periods: string[];
  empires: string[];
  artists: string[];
  interests: string[];
  /** Set once the user has answered (or dismissed) the modal. */
  completed: boolean;
}

const EMPTY_PREFS: Preferences = {
  artTypes: [],
  periods: [],
  empires: [],
  artists: [],
  interests: [],
  completed: false,
};

/** Fill missing preference fields from older localStorage shapes. */
function normalizePreferences(raw: Partial<Preferences> | null | undefined): Preferences {
  return {
    artTypes: Array.isArray(raw?.artTypes) ? raw.artTypes : [],
    periods: Array.isArray(raw?.periods) ? raw.periods : [],
    empires: Array.isArray(raw?.empires) ? raw.empires : [],
    artists: Array.isArray(raw?.artists) ? raw.artists : [],
    interests: Array.isArray(raw?.interests) ? raw.interests : [],
    completed: Boolean(raw?.completed),
  };
}

function readFeedMatchMode(): FeedMatchMode {
  const stored = readJSON<FeedMatchMode | null>(STORAGE_KEYS.feedMatchMode, null);
  if (stored === "normal" || stored === "strong" || stored === "aggressive") {
    return stored;
  }
  return "normal";
}

interface AppStateValue {
  /** True after localStorage has hydrated — guard UI that depends on persisted state. */
  ready: boolean;

  saved: string[];
  liked: string[];
  following: string[];
  isSaved: (id: string) => boolean;
  isLiked: (id: string) => boolean;
  isFollowing: (id: string) => boolean;
  toggleSaved: (id: string) => void;
  toggleLiked: (id: string) => void;
  toggleFollowing: (id: string) => void;
  /** Drop collection ids that no longer exist in the catalog. */
  forgetArtworks: (ids: string[]) => void;

  /** Artwork ids the user has already viewed in the feed. */
  seen: string[];
  isSeen: (id: string) => boolean;
  /** Record that an artwork has been viewed (idempotent, mirrored to cloud). */
  markSeen: (id: string) => void;

  preferences: Preferences;
  savePreferences: (prefs: Omit<Preferences, "completed">) => void;
  dismissPreferences: () => void;

  /** How strongly For You boosts saved taste. Default is Normal. */
  feedMatchMode: FeedMatchMode;
  /** Persist a profile choice. Marks the mode as user-selected. */
  setFeedMatchMode: (mode: FeedMatchMode) => void;

  tutorialDone: boolean;
  completeTutorial: () => void;
  restartTutorial: () => void;

  /** True once the full onboarding flow (personalization + tutorial + paywall) is done. */
  onboardingDone: boolean;
  completeOnboarding: () => void;
  restartOnboarding: () => void;

  /** True once the sign-in gate has been shown (and signed in or dismissed). */
  authSeen: boolean;
  /** Mark the sign-in gate as handled so it won't auto-open again. */
  markAuthSeen: () => void;
  /** True when the sign-in overlay was opened from a gated action (not first launch). */
  authPrompt: boolean;
  /** Open the sign-in screen from a guest tap. Does not hide the museum. */
  requestSignIn: () => void;
  /** Dismiss a requested sign-in overlay (Continue as guest / close). */
  dismissSignIn: () => void;

  /** True once the user accepted the current Terms of Service version. */
  termsAccepted: boolean;
  acceptTerms: () => void;
  isAdmin: boolean;

  /** The current Supabase user (null when auth is disabled or not loaded). */
  user: User | null;
  /** The current user's profile row (name/avatar), when loaded. */
  profile: Profile | null;
  /** Upload a photo and persist it as the signed-in user's avatar. */
  setAvatar: (file: File) => Promise<void>;
  /** True when there is no real (non-anonymous) account signed in. */
  isGuest: boolean;
  /** Sign the current user out. */
  signOut: () => Promise<void>;

  /**
   * Narsil Pro entitlement, as reported by the backend. Use `isPro` to decide
   * what the UI OFFERS; never to decide what it delivers — every paid perk is
   * re-checked server-side, so a stale or tampered value here can only change
   * which buttons appear, never what the user actually receives.
   */
  subscription: SubscriptionState;
  isPro: boolean;
  /** Adopt a freshly purchased or restored entitlement without a round trip. */
  setSubscription: (subscription: SubscriptionState) => void;
  /** Re-read entitlement from the backend (after a purchase, or on resume). */
  refreshSubscription: () => Promise<void>;

  /**
   * The paywall lives here rather than being prop-drilled: the things that
   * trigger it (the action rail inside the feed, the quiz overlay) sit several
   * levels below the shell that renders it. `null` means closed.
   */
  proPrompt: PaywallReason | null;
  requestPro: (reason: PaywallReason) => void;
  dismissPro: () => void;

  /**
   * The download resolution picker, raised from the action rail. Held here for
   * the same reason as the paywall, plus a positioning one: the rail's own root
   * is an `absolute` 44px-wide column, so a sheet rendered inside it would size
   * itself to the rail rather than the screen.
   */
  downloadRequest: Artwork | null;
  requestDownload: (artwork: Artwork) => void;
  dismissDownload: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFS);
  const [feedMatchMode, setFeedMatchModeState] =
    useState<FeedMatchMode>("normal");
  const [feedMatchModeManual, setFeedMatchModeManual] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [authSeen, setAuthSeen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionState>(NO_SUBSCRIPTION);
  const [proPrompt, setProPrompt] = useState<PaywallReason | null>(null);
  const [downloadRequest, setDownloadRequest] = useState<Artwork | null>(null);
  const [authPrompt, setAuthPrompt] = useState(false);

  // True once a Supabase (anonymous) session exists — gates cloud writes.
  const cloudReady = useRef(false);
  /** Skip duplicate cloud pulls when ensureSession and INITIAL_SESSION race. */
  const hydratedUserIdRef = useRef<string | null>(null);
  /** Paywall to reopen after a guest signs in from a Pro-gated tap. */
  const pendingProReason = useRef<PaywallReason | null>(null);

  // Union incoming ids into the local seen set (and cache) without dropping any.
  const mergeSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSeen((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      if (next.length === prev.length) return prev;
      writeJSON(STORAGE_KEYS.seen, next);
      return next;
    });
  }, []);

  const applyRemoteUserData = useCallback((remote: Awaited<ReturnType<typeof fetchUserData>>) => {
    if (!remote) return;
    setSaved(remote.saved);
    setLiked(remote.liked);
    setFollowing(remote.following);
    writeJSON(STORAGE_KEYS.saved, remote.saved);
    writeJSON(STORAGE_KEYS.liked, remote.liked);
    writeJSON(STORAGE_KEYS.following, remote.following);
  }, []);

  /** Restore terms / onboarding / prefs from the signed-in profile. */
  const applyProfileOnboarding = useCallback((profile: Profile) => {
    if (profile.terms_version === TERMS_VERSION && profile.terms_accepted_at) {
      setTermsAccepted(true);
      writeJSON(STORAGE_KEYS.termsAccepted, true);
      writeJSON(STORAGE_KEYS.termsVersion, TERMS_VERSION);
    }
    if (profile.auth_seen) {
      setAuthSeen(true);
      writeJSON(STORAGE_KEYS.authSeen, true);
    }
    if (profile.tutorial_done) {
      setTutorialDone(true);
      writeJSON(STORAGE_KEYS.tutorialDone, true);
    }
    if (profile.onboarding_done) {
      setOnboardingDone(true);
      writeJSON(STORAGE_KEYS.onboardingDone, true);
    }
    if (profile.preferences && typeof profile.preferences === "object") {
      const next = normalizePreferences(profile.preferences);
      // Cloud prefs win when marked completed so a returning member skips the gate.
      if (next.completed) {
        setPreferences(next);
        writeJSON(STORAGE_KEYS.preferences, next);
        if (!profile.onboarding_done) {
          // Prefs already finished elsewhere — don't force personalization again.
          setOnboardingDone(true);
          writeJSON(STORAGE_KEYS.onboardingDone, true);
        }
      }
    }
  }, []);

  const hydrateFromCloud = useCallback(
    async (userId: string, opts?: { includeProfile?: boolean; user?: User | null }) => {
      if (hydratedUserIdRef.current === userId) return;
      hydratedUserIdRef.current = userId;
      cloudReady.current = true;
      const [remote, remoteSeen, profile] = await Promise.all([
        fetchUserData(),
        fetchSeen(),
        // Always try — signed-in members restore terms/prefs/onboarding;
        // guests get null or an empty row and we no-op.
        fetchProfile(),
      ]);
      mergeSeen(remoteSeen);
      applyRemoteUserData(remote);
      if (profile) {
        setProfile(profile);
        applyProfileOnboarding(profile);
      } else if (opts?.includeProfile && opts.user && !opts.user.is_anonymous) {
        setProfile(null);
      }
    },
    [applyRemoteUserData, applyProfileOnboarding, mergeSeen],
  );

  // Hydrate from localStorage immediately (instant + offline cache), then, if
  // Supabase is configured, sign in anonymously and replace with cloud data.
  useEffect(() => {
    setSaved(readJSON<string[]>(STORAGE_KEYS.saved, []));
    setLiked(readJSON<string[]>(STORAGE_KEYS.liked, []));
    setFollowing(readJSON<string[]>(STORAGE_KEYS.following, []));
    setSeen(readJSON<string[]>(STORAGE_KEYS.seen, []));
    setPreferences(
      normalizePreferences(
        readJSON<Partial<Preferences>>(STORAGE_KEYS.preferences, EMPTY_PREFS),
      ),
    );
    setFeedMatchModeState(readFeedMatchMode());
    setFeedMatchModeManual(
      readJSON<boolean>(STORAGE_KEYS.feedMatchModeManual, false),
    );
    setTutorialDone(readJSON<boolean>(STORAGE_KEYS.tutorialDone, false));
    setOnboardingDone(readJSON<boolean>(STORAGE_KEYS.onboardingDone, false));
    setAuthSeen(readJSON<boolean>(STORAGE_KEYS.authSeen, false));
    const localTermsVersion = readJSON<string | null>(STORAGE_KEYS.termsVersion, null);
    const localTermsAccepted = readJSON<boolean>(STORAGE_KEYS.termsAccepted, false);
    setTermsAccepted(localTermsAccepted && localTermsVersion === TERMS_VERSION);
    setReady(true);

    let cancelled = false;
    (async () => {
      const userId = await ensureSession();
      if (cancelled || !userId) return;
      await hydrateFromCloud(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateFromCloud]);

  // Track the Supabase auth session so the UI can reflect who's signed in and
  // re-pull cloud data when a real account logs in (or out). Native OAuth is
  // completed by the deep-link listener registered here.
  useEffect(() => {
    if (!supabase) return;

    initNativeAuthListener();

    let cancelled = false;
    void (async () => {
      try {
        // Finish any redirect sign-in (OAuth / email confirmation) before we
        // read the current user, so a fresh confirmation lands as signed-in.
        await completeAuthFromUrl();

        // `getUser()` validates the token over the network, so it throws
        // `TypeError: Failed to fetch` when offline or behind a blocking proxy.
        // Fall back to the cached session (read locally, no network) so the user
        // still appears signed in and the app keeps working instead of crashing.
        let currentUser: User | null = null;
        try {
          const { data } = await supabase.auth.getUser();
          currentUser = data.user ?? null;
        } catch {
          const { data } = await supabase.auth.getSession();
          currentUser = data.session?.user ?? null;
        }

        if (cancelled) return;
        setUser(currentUser);
        if (currentUser && !currentUser.is_anonymous) {
          const p = await fetchProfile();
          if (!cancelled) {
            setProfile(p);
            if (p) applyProfileOnboarding(p);
          }
        }
      } catch (err) {
        // Never let an auth/network failure surface as an uncaught rejection —
        // the app runs fine on localStorage until connectivity returns.
        if (!cancelled) {
          console.warn("Auth: could not load current user (offline?).", err);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (!nextUser) {
        cloudReady.current = false;
        hydratedUserIdRef.current = null;
        setProfile(null);
        setSaved([]);
        setLiked([]);
        setFollowing([]);
        writeJSON(STORAGE_KEYS.saved, []);
        writeJSON(STORAGE_KEYS.liked, []);
        writeJSON(STORAGE_KEYS.following, []);
        return;
      }
      cloudReady.current = true;
      if (event === "INITIAL_SESSION" && hydratedUserIdRef.current === nextUser.id) {
        return;
      }
      void hydrateFromCloud(nextUser.id, {
        includeProfile: true,
        user: nextUser,
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateFromCloud, applyProfileOnboarding]);

  const requestSignIn = useCallback(() => {
    setAuthPrompt(true);
  }, []);

  const dismissSignIn = useCallback(() => {
    pendingProReason.current = null;
    setAuthPrompt(false);
  }, []);

  const signOut = useCallback(async () => {
    pendingProReason.current = null;
    setAuthPrompt(false);
    // Stay in the museum as a guest — do not re-open the first-launch auth gate.
    setAuthSeen(true);
    writeJSON(STORAGE_KEYS.authSeen, true);
    await authSignOut();
    await ensureSession();
  }, []);

  const setAvatar = useCallback(async (file: File) => {
    const avatarUrl = await setAvatarRemote(file);
    setProfile((prev) => {
      if (prev) return { ...prev, avatar_url: avatarUrl };
      if (!user) return prev;
      const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
      return {
        id: user.id,
        full_name: meta.full_name ?? meta.name ?? null,
        email: user.email ?? null,
        avatar_url: avatarUrl,
      };
    });
  }, [user]);

  const markAuthSeen = useCallback(() => {
    setAuthSeen(true);
    writeJSON(STORAGE_KEYS.authSeen, true);
    if (cloudReady.current) void syncOnboardingRemote({ auth_seen: true });
  }, []);

  const acceptTerms = useCallback(() => {
    setTermsAccepted(true);
    writeJSON(STORAGE_KEYS.termsAccepted, true);
    writeJSON(STORAGE_KEYS.termsVersion, TERMS_VERSION);
    if (cloudReady.current) void acceptTermsRemote(TERMS_VERSION);
  }, []);

  const isAdmin = profile?.role === "admin";

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeJSON(STORAGE_KEYS.seen, next);
      if (cloudReady.current) void markSeenRemote(id);
      return next;
    });
  }, []);

  // Build a toggle that updates state, mirrors to localStorage, and (when a
  // cloud session exists) persists the change to Supabase.
  const makeToggle = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<string[]>>,
      key: string,
      persist: (id: string, on: boolean) => void
    ) =>
      (id: string) => {
        // A light tick for like / save / follow — the iPhone's own feel.
        tapHaptic();
        setter((prev) => {
          const on = !prev.includes(id);
          const next = on ? [...prev, id] : prev.filter((x) => x !== id);
          writeJSON(key, next);
          if (cloudReady.current) persist(id, on);
          return next;
        });
      },
    []
  );

  const toggleSaved = useMemo(
    () =>
      makeToggle(setSaved, STORAGE_KEYS.saved, (id, on) =>
        setCollection("saved", id, on)
      ),
    [makeToggle]
  );
  const toggleLiked = useMemo(
    () =>
      makeToggle(setLiked, STORAGE_KEYS.liked, (id, on) =>
        setCollection("liked", id, on)
      ),
    [makeToggle]
  );
  const toggleFollowing = useMemo(
    () =>
      makeToggle(setFollowing, STORAGE_KEYS.following, (id, on) =>
        setFollow(id, on)
      ),
    [makeToggle]
  );

  const forgetArtworks = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    const drop = (
      setter: React.Dispatch<React.SetStateAction<string[]>>,
      key: string,
      kind: CollectionKind,
    ) => {
      setter((prev) => {
        const next = prev.filter((id) => !gone.has(id));
        if (next.length === prev.length) return prev;
        writeJSON(key, next);
        if (cloudReady.current) {
          for (const id of ids) {
            if (prev.includes(id)) void setCollection(kind, id, false);
          }
        }
        return next;
      });
    };
    drop(setSaved, STORAGE_KEYS.saved, "saved");
    drop(setLiked, STORAGE_KEYS.liked, "liked");
  }, []);

  const refreshSubscription = useCallback(async () => {
    setSubscription(await fetchSubscription());
  }, []);

  const requestPro = useCallback((reason: PaywallReason) => {
    if (!user || user.is_anonymous) {
      pendingProReason.current = reason;
      setAuthPrompt(true);
      return;
    }
    setProPrompt(reason);
  }, [user]);

  const dismissPro = useCallback(() => setProPrompt(null), []);

  const requestDownload = useCallback((artwork: Artwork) => {
    setDownloadRequest(artwork);
  }, []);

  const dismissDownload = useCallback(() => setDownloadRequest(null), []);

  /**
   * A real account (email/OAuth) counts as having passed the sign-in gate, even
   * when AuthView never called onClose (OAuth redirects away). Signing out must
   * not send them back through first-launch auth.
   */
  useEffect(() => {
    if (!user || user.is_anonymous) return;
    setAuthSeen(true);
    writeJSON(STORAGE_KEYS.authSeen, true);
    if (cloudReady.current) void syncOnboardingRemote({ auth_seen: true });
    setAuthPrompt(false);
    if (pendingProReason.current) {
      const reason = pendingProReason.current;
      pendingProReason.current = null;
      setProPrompt(reason);
    }
  }, [user]);

  /**
   * One-shot backfill: members who finished onboarding on this device before
   * profiles gained these columns push local flags up so the next login skips
   * Terms / personalization.
   */
  const onboardingBackfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!user || user.is_anonymous) return;
    if (onboardingBackfilled.current === user.id) return;
    onboardingBackfilled.current = user.id;
    if (!cloudReady.current) return;
    const localOnboarding = readJSON<boolean>(STORAGE_KEYS.onboardingDone, false);
    const localTutorial = readJSON<boolean>(STORAGE_KEYS.tutorialDone, false);
    const localPrefs = normalizePreferences(
      readJSON<Partial<Preferences>>(STORAGE_KEYS.preferences, EMPTY_PREFS),
    );
    if (!localOnboarding && !localPrefs.completed && !localTutorial) return;
    void syncOnboardingRemote({
      onboarding_done: localOnboarding || localPrefs.completed,
      tutorial_done: localTutorial,
      auth_seen: true,
      ...(localPrefs.completed ? { preferences: localPrefs } : {}),
    });
  }, [user]);

  /**
   * Re-read entitlement whenever the signed-in user changes. Signing out must
   * clear it immediately — leaving a stale `isPro` behind would show the next
   * user of the device a Pro badge that checkout then refuses to honour.
   */
  useEffect(() => {
    if (!user || user.is_anonymous) {
      setSubscription(NO_SUBSCRIPTION);
      return;
    }
    let cancelled = false;
    void fetchSubscription().then((state) => {
      if (!cancelled) setSubscription(state);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const applyFeedMatchMode = useCallback(
    (mode: FeedMatchMode, manual: boolean) => {
      setFeedMatchModeState(mode);
      writeJSON(STORAGE_KEYS.feedMatchMode, mode);
      if (manual) {
        setFeedMatchModeManual(true);
        writeJSON(STORAGE_KEYS.feedMatchModeManual, true);
      }
    },
    [],
  );

  const setFeedMatchMode = useCallback(
    (mode: FeedMatchMode) => {
      applyFeedMatchMode(mode, true);
    },
    [applyFeedMatchMode],
  );

  const savePreferences = useCallback(
    (prefs: Omit<Preferences, "completed">) => {
      const next: Preferences = normalizePreferences({ ...prefs, completed: true });
      setPreferences(next);
      writeJSON(STORAGE_KEYS.preferences, next);
      // First personalization → Strong, unless the user already picked a mode.
      if (hasTastePreferences(next) && !feedMatchModeManual) {
        applyFeedMatchMode("strong", false);
      }
      if (cloudReady.current) {
        void syncOnboardingRemote({ preferences: next });
      }
    },
    [applyFeedMatchMode, feedMatchModeManual],
  );

  const dismissPreferences = useCallback(() => {
    setPreferences((prev) => {
      const next = normalizePreferences({ ...prev, completed: true });
      writeJSON(STORAGE_KEYS.preferences, next);
      if (cloudReady.current) {
        void syncOnboardingRemote({ preferences: next });
      }
      return next;
    });
  }, []);

  const completeTutorial = useCallback(() => {
    setTutorialDone(true);
    writeJSON(STORAGE_KEYS.tutorialDone, true);
    if (cloudReady.current) void syncOnboardingRemote({ tutorial_done: true });
  }, []);

  const restartTutorial = useCallback(() => {
    setTutorialDone(false);
    writeJSON(STORAGE_KEYS.tutorialDone, false);
    if (cloudReady.current) void syncOnboardingRemote({ tutorial_done: false });
  }, []);

  const completeOnboarding = useCallback(() => {
    setOnboardingDone(true);
    writeJSON(STORAGE_KEYS.onboardingDone, true);
    if (cloudReady.current) {
      void syncOnboardingRemote({ onboarding_done: true, auth_seen: true });
    }
  }, []);

  const restartOnboarding = useCallback(() => {
    setOnboardingDone(false);
    writeJSON(STORAGE_KEYS.onboardingDone, false);
    if (cloudReady.current) void syncOnboardingRemote({ onboarding_done: false });
  }, []);

  const savedSet = useMemo(() => new Set(saved), [saved]);
  const likedSet = useMemo(() => new Set(liked), [liked]);
  const followingSet = useMemo(() => new Set(following), [following]);
  const seenSet = useMemo(() => new Set(seen), [seen]);

  const isSaved = useCallback((id: string) => savedSet.has(id), [savedSet]);
  const isLiked = useCallback((id: string) => likedSet.has(id), [likedSet]);
  const isFollowing = useCallback(
    (id: string) => followingSet.has(id),
    [followingSet],
  );
  const isSeen = useCallback((id: string) => seenSet.has(id), [seenSet]);

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      saved,
      liked,
      following,
      isSaved,
      isLiked,
      isFollowing,
      toggleSaved,
      toggleLiked,
      toggleFollowing,
      forgetArtworks,
      seen,
      isSeen,
      markSeen,
      preferences,
      savePreferences,
      dismissPreferences,
      feedMatchMode,
      setFeedMatchMode,
      tutorialDone,
      completeTutorial,
      restartTutorial,
      onboardingDone,
      completeOnboarding,
      restartOnboarding,
      authSeen,
      markAuthSeen,
      authPrompt,
      requestSignIn,
      dismissSignIn,
      termsAccepted,
      acceptTerms,
      isAdmin,
      user,
      profile,
      setAvatar,
      isGuest: !user || user.is_anonymous === true,
      signOut,
      subscription,
      isPro: subscription.active,
      setSubscription,
      refreshSubscription,
      proPrompt,
      requestPro,
      dismissPro,
      downloadRequest,
      requestDownload,
      dismissDownload,
    }),
    [
      ready,
      saved,
      liked,
      following,
      isSaved,
      isLiked,
      isFollowing,
      toggleSaved,
      toggleLiked,
      toggleFollowing,
      forgetArtworks,
      seen,
      isSeen,
      markSeen,
      preferences,
      savePreferences,
      dismissPreferences,
      feedMatchMode,
      setFeedMatchMode,
      tutorialDone,
      completeTutorial,
      restartTutorial,
      onboardingDone,
      completeOnboarding,
      restartOnboarding,
      authSeen,
      markAuthSeen,
      authPrompt,
      requestSignIn,
      dismissSignIn,
      termsAccepted,
      acceptTerms,
      isAdmin,
      user,
      profile,
      setAvatar,
      signOut,
      subscription,
      setSubscription,
      refreshSubscription,
      proPrompt,
      requestPro,
      dismissPro,
      downloadRequest,
      requestDownload,
      dismissDownload,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
