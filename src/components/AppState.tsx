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
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
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
  type Profile,
} from "@/lib/userData";
import {
  fetchSubscription,
  NO_SUBSCRIPTION,
  type PaywallReason,
  type SubscriptionState,
} from "@/lib/subscription";

/** User preferences captured by the "Personalize your museum" modal. */
export interface Preferences {
  artTypes: string[];
  periods: string[];
  empires: string[];
  artists: string[];
  /** Set once the user has answered (or dismissed) the modal. */
  completed: boolean;
}

const EMPTY_PREFS: Preferences = {
  artTypes: [],
  periods: [],
  empires: [],
  artists: [],
  completed: false,
};

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

  /** Artwork ids the user has already viewed in the feed. */
  seen: string[];
  isSeen: (id: string) => boolean;
  /** Record that an artwork has been viewed (idempotent, mirrored to cloud). */
  markSeen: (id: string) => void;

  preferences: Preferences;
  savePreferences: (prefs: Omit<Preferences, "completed">) => void;
  dismissPreferences: () => void;

  tutorialDone: boolean;
  completeTutorial: () => void;
  restartTutorial: () => void;

  /** True once the sign-in gate has been shown (and signed in or dismissed). */
  authSeen: boolean;
  /** Mark the sign-in gate as handled so it won't auto-open again. */
  markAuthSeen: () => void;

  /** True once the user accepted the current Terms of Service version. */
  termsAccepted: boolean;
  acceptTerms: () => void;
  isAdmin: boolean;

  /** The current Supabase user (null when auth is disabled or not loaded). */
  user: User | null;
  /** The current user's profile row (name/avatar), when loaded. */
  profile: Profile | null;
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
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFS);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [authSeen, setAuthSeen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionState>(NO_SUBSCRIPTION);
  const [proPrompt, setProPrompt] = useState<PaywallReason | null>(null);

  // True once a Supabase (anonymous) session exists — gates cloud writes.
  const cloudReady = useRef(false);

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

  // Hydrate from localStorage immediately (instant + offline cache), then, if
  // Supabase is configured, sign in anonymously and replace with cloud data.
  useEffect(() => {
    setSaved(readJSON<string[]>(STORAGE_KEYS.saved, []));
    setLiked(readJSON<string[]>(STORAGE_KEYS.liked, []));
    setFollowing(readJSON<string[]>(STORAGE_KEYS.following, []));
    setSeen(readJSON<string[]>(STORAGE_KEYS.seen, []));
    setPreferences(readJSON<Preferences>(STORAGE_KEYS.preferences, EMPTY_PREFS));
    setTutorialDone(readJSON<boolean>(STORAGE_KEYS.tutorialDone, false));
    setAuthSeen(readJSON<boolean>(STORAGE_KEYS.authSeen, false));
    const localTermsVersion = readJSON<string | null>(STORAGE_KEYS.termsVersion, null);
    const localTermsAccepted = readJSON<boolean>(STORAGE_KEYS.termsAccepted, false);
    setTermsAccepted(localTermsAccepted && localTermsVersion === TERMS_VERSION);
    setReady(true);

    let cancelled = false;
    (async () => {
      const userId = await ensureSession();
      if (cancelled || !userId) return;
      cloudReady.current = true;
      const [remote, remoteSeen] = await Promise.all([
        fetchUserData(),
        fetchSeen(),
      ]);
      if (cancelled) return;
      // Seen is a union of local + cloud so nothing already-viewed reappears.
      mergeSeen(remoteSeen);
      if (!remote) return;
      // Cloud is the source of truth once available; mirror to local cache.
      setSaved(remote.saved);
      setLiked(remote.liked);
      setFollowing(remote.following);
      writeJSON(STORAGE_KEYS.saved, remote.saved);
      writeJSON(STORAGE_KEYS.liked, remote.liked);
      writeJSON(STORAGE_KEYS.following, remote.following);
    })();

    return () => {
      cancelled = true;
    };
  }, [mergeSeen]);

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
            if (p?.terms_version === TERMS_VERSION && p.terms_accepted_at) {
              setTermsAccepted(true);
              writeJSON(STORAGE_KEYS.termsAccepted, true);
              writeJSON(STORAGE_KEYS.termsVersion, TERMS_VERSION);
            }
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      cloudReady.current = Boolean(nextUser);
      if (!nextUser) {
        setProfile(null);
        return;
      }
      void (async () => {
        const [remote, remoteSeen, p] = await Promise.all([
          fetchUserData(),
          fetchSeen(),
          nextUser.is_anonymous ? Promise.resolve(null) : fetchProfile(),
        ]);
        if (cancelled) return;
        if (p) setProfile(p);
        mergeSeen(remoteSeen);
        if (!remote) return;
        setSaved(remote.saved);
        setLiked(remote.liked);
        setFollowing(remote.following);
        writeJSON(STORAGE_KEYS.saved, remote.saved);
        writeJSON(STORAGE_KEYS.liked, remote.liked);
        writeJSON(STORAGE_KEYS.following, remote.following);
      })();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [mergeSeen]);

  const signOut = useCallback(async () => {
    await authSignOut();
  }, []);

  const markAuthSeen = useCallback(() => {
    setAuthSeen(true);
    writeJSON(STORAGE_KEYS.authSeen, true);
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
      (id: string) =>
        setter((prev) => {
          const on = !prev.includes(id);
          const next = on ? [...prev, id] : prev.filter((x) => x !== id);
          writeJSON(key, next);
          if (cloudReady.current) persist(id, on);
          return next;
        }),
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

  const refreshSubscription = useCallback(async () => {
    setSubscription(await fetchSubscription());
  }, []);

  const requestPro = useCallback((reason: PaywallReason) => {
    setProPrompt(reason);
  }, []);

  const dismissPro = useCallback(() => setProPrompt(null), []);

  /**
   * Re-read entitlement whenever the signed-in user changes. Signing out must
   * clear it immediately — leaving a stale `isPro` behind would show the next
   * user of the device a 20% discount that checkout then refuses to honour.
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

  const savePreferences = useCallback(
    (prefs: Omit<Preferences, "completed">) => {
      const next: Preferences = { ...prefs, completed: true };
      setPreferences(next);
      writeJSON(STORAGE_KEYS.preferences, next);
    },
    []
  );

  const dismissPreferences = useCallback(() => {
    setPreferences((prev) => {
      const next = { ...prev, completed: true };
      writeJSON(STORAGE_KEYS.preferences, next);
      return next;
    });
  }, []);

  const completeTutorial = useCallback(() => {
    setTutorialDone(true);
    writeJSON(STORAGE_KEYS.tutorialDone, true);
  }, []);

  const restartTutorial = useCallback(() => {
    setTutorialDone(false);
    writeJSON(STORAGE_KEYS.tutorialDone, false);
  }, []);

  const value: AppStateValue = {
    ready,
    saved,
    liked,
    following,
    isSaved: (id) => saved.includes(id),
    isLiked: (id) => liked.includes(id),
    isFollowing: (id) => following.includes(id),
    toggleSaved,
    toggleLiked,
    toggleFollowing,
    seen,
    isSeen: (id) => seen.includes(id),
    markSeen,
    preferences,
    savePreferences,
    dismissPreferences,
    tutorialDone,
    completeTutorial,
    restartTutorial,
    authSeen,
    markAuthSeen,
    termsAccepted,
    acceptTerms,
    isAdmin,
    user,
    profile,
    isGuest: !user || user.is_anonymous === true,
    signOut,
    subscription,
    isPro: subscription.active,
    setSubscription,
    refreshSubscription,
    proPrompt,
    requestPro,
    dismissPro,
  };

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
