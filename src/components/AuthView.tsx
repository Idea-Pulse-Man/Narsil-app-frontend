import { useState } from "react";
import { motion } from "framer-motion";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithProvider,
  type OAuthProvider,
} from "@/lib/auth";
import { GoogleGlyph, AppleGlyph, CloseIcon } from "./Icons";

type Mode = "signin" | "signup";

interface AuthViewProps {
  /** Called after a successful sign-in / sign-up, or when dismissed as guest. */
  onClose: () => void;
}

export default function AuthView({ onClose }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await signInWithEmail(email, password);
        if (error) setError(error.message);
        else onClose();
      } else {
        const { data, error } = await signUpWithEmail(email, password, fullName);
        const session = "session" in data ? data.session : null;
        if (error) setError(error.message);
        else if (data.user && !session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
        } else {
          onClose();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: OAuthProvider) => {
    setError(null);
    setNotice(null);
    try {
      await signInWithProvider(provider);
      // Native flow resolves via the deep-link listener; web redirects away.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const canSubmit = email.trim() !== "" && password.trim() !== "" && !busy;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[80] flex flex-col overflow-y-auto bg-ink px-6 pb-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-[calc(env(safe-area-inset-top)+1.5rem)] flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:text-white"
      >
        <CloseIcon className="h-4 w-4" />
      </button>

      {/* Brand */}
      <div className="flex items-center gap-1.5">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink">
          N
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
          Narsil
        </span>
      </div>

      <h1 className="mt-10 font-serif text-[2rem] leading-tight text-white">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-white/55">
        Sync your saved art, likes, and follows across your devices.
      </p>

      {/* OAuth */}
      <div className="mt-8 space-y-3">
        <button
          onClick={() => oauth("apple")}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98]"
        >
          <AppleGlyph className="h-[18px] w-[18px] -mt-0.5" />
          Continue with Apple
        </button>
        <button
          onClick={() => oauth("google")}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          <GoogleGlyph className="h-[18px] w-[18px]" />
          Continue with Google
        </button>
      </div>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {/* Name (sign-up only) + email + password */}
      <div className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            autoComplete="name"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/35 transition-colors focus:border-white/25 focus:outline-none"
          />
        )}
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/35 transition-colors focus:border-white/25 focus:outline-none"
        />
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && submitEmail()}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/35 transition-colors focus:border-white/25 focus:outline-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}

      <button
        onClick={submitEmail}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:cursor-default disabled:opacity-40"
      >
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
      </button>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="mt-6 text-center text-sm text-white/55 transition-colors hover:text-white/80"
      >
        {mode === "signin" ? (
          <>
            New to Narsil?{" "}
            <span className="font-medium text-white">Create an account</span>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <span className="font-medium text-white">Sign in</span>
          </>
        )}
      </button>

      <button
        onClick={onClose}
        className="mx-auto mt-4 text-center text-[13px] text-white/35 transition-colors hover:text-white/60"
      >
        Continue as guest
      </button>

      <p className="mt-auto pt-8 text-center text-[11px] leading-relaxed text-white/25">
        By continuing you agree to Narsil&apos;s Terms and acknowledge our
        Privacy Policy.
      </p>
    </motion.div>
  );
}
