import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readJSON, STORAGE_KEYS, writeJSON } from "@/lib/storage";
import {
  CLASSICALS_ATTRIBUTION_URL,
  MUSIC_VOLUME,
  pickRandomTrack,
} from "./tracks";

interface AudioContextValue {
  enabled: boolean;
  promptSeen: boolean;
  unavailable: boolean;
  setEnabled: (on: boolean) => void;
  markPromptSeen: () => void;
  attributionUrl: string;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(
    () => readJSON(STORAGE_KEYS.musicEnabled, false),
  );
  const [promptSeen, setPromptSeen] = useState(
    () => readJSON(STORAGE_KEYS.musicPromptSeen, false),
  );
  const [unavailable, setUnavailable] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef(pickRandomTrack());

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    writeJSON(STORAGE_KEYS.musicEnabled, on);
    if (!on) setUnavailable(false);
  }, []);

  const markPromptSeen = useCallback(() => {
    setPromptSeen(true);
    writeJSON(STORAGE_KEYS.musicPromptSeen, true);
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = MUSIC_VOLUME;
    audio.preload = "none";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!enabled) {
      audio.pause();
      return;
    }

    const track = trackRef.current;
    if (audio.src !== track.url) {
      audio.src = track.url;
    }

    const onError = () => setUnavailable(true);
    audio.addEventListener("error", onError);

    void audio.play().catch(() => {
      setUnavailable(true);
    });

    return () => {
      audio.removeEventListener("error", onError);
    };
  }, [enabled]);

  const value = useMemo(
    () => ({
      enabled,
      promptSeen,
      unavailable,
      setEnabled,
      markPromptSeen,
      attributionUrl: CLASSICALS_ATTRIBUTION_URL,
    }),
    [enabled, promptSeen, unavailable, setEnabled, markPromptSeen],
  );

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
