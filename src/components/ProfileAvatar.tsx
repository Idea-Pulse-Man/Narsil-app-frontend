import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCatalog } from "@/data/catalog";
import { WORLD } from "@/data/worldCopy";
import {
  extraEmpireTopicsFromBadges,
  findStudyBadge,
  listAssessmentBadges,
  listDiscoverStudyBadges,
  loadSelectedBadgeId,
  sanitizeSelectedBadgeId,
  type BadgeMap,
  type StudyBadge,
} from "@/lib/quiz";
import PersonLevelFrame from "./PersonLevelFrame";
import TopicMedal from "./TopicMedal";
import { CloseIcon, MedalIcon, PencilIcon, UserIcon } from "./Icons";

interface ProfileAvatarProps {
  avatarUrl: string | null;
  initial: string;
  levelId: number;
  seals: BadgeMap;
  /** Outer frame size in px. */
  size?: number;
  busy?: boolean;
  editLabel: string;
  onEditPhoto: () => void;
  /** Opens the Study badge picker so the member can wear a different frame. */
  onChooseBadge: () => void;
  /** Re-read worn badge when the quiz overlay closes. */
  refreshKey?: number;
}

/**
 * Profile photo framed by the member's worn quiz badge.
 * Pencil opens a short menu: change photo, or choose a badge frame.
 */
export default function ProfileAvatar({
  avatarUrl,
  initial,
  levelId,
  seals,
  size = 128,
  busy = false,
  editLabel,
  onEditPhoto,
  onChooseBadge,
  refreshKey = 0,
}: ProfileAvatarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { searchFacets } = useCatalog();
  const catalog = useMemo(() => {
    const extra = extraEmpireTopicsFromBadges(seals);
    return [
      ...listAssessmentBadges(),
      ...listDiscoverStudyBadges(searchFacets.empires, extra),
    ];
  }, [seals, searchFacets.empires]);

  const worn = useMemo(() => {
    void refreshKey;
    const id = sanitizeSelectedBadgeId(
      loadSelectedBadgeId(),
      levelId,
      seals,
      catalog,
    );
    return findStudyBadge(id, catalog);
  }, [levelId, seals, catalog, refreshKey]);

  const frameLevelId =
    worn?.kind === "assessment" ? (worn.levelId ?? levelId) : levelId;
  const seal = worn?.kind === "discover" ? worn : null;
  // Largest circle that stays inside the wreath opening (the ring's
  // thinnest outer edge is about 52% of the frame art).
  const photoSize = Math.round(size * 0.5);

  const openMenu = () => {
    if (busy) return;
    setMenuOpen(true);
  };

  const choosePhoto = () => {
    setMenuOpen(false);
    onEditPhoto();
  };

  const chooseBadge = () => {
    setMenuOpen(false);
    onChooseBadge();
  };

  return (
    <>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="absolute inset-0">
          <span
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-white/20 to-white/5 font-serif text-white"
            style={{
              width: photoSize,
              height: photoSize,
              fontSize: Math.round(photoSize * 0.6),
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </span>

          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <PersonLevelFrame levelId={frameLevelId} size={size} />
          </span>

          {seal && <SealOverlay badge={seal} size={size} />}
        </div>

        <button
          type="button"
          onClick={openMenu}
          disabled={busy}
          aria-label={editLabel}
          className="absolute bottom-1 right-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-ink shadow-sm disabled:opacity-70"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Dismiss"
              className="absolute inset-0 bg-black/55"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label={WORLD.editAvatar}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative w-full max-w-md rounded-t-3xl border border-white/10 bg-[#1b1b1f] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 text-white"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-serif text-lg">{WORLD.editAvatar}</h2>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 text-white/70"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                <EditOption
                  icon={<UserIcon className="h-5 w-5" />}
                  label={WORLD.editAvatarPhoto}
                  onClick={choosePhoto}
                />
                <EditOption
                  icon={<MedalIcon className="h-5 w-5" />}
                  label={WORLD.editAvatarBadge}
                  onClick={chooseBadge}
                />
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="mt-3 w-full rounded-2xl py-3 text-sm text-white/55"
              >
                {WORLD.editAvatarCancel}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function EditOption({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.07]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
        {icon}
      </span>
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="ml-auto text-white/35">›</span>
    </button>
  );
}

function SealOverlay({ badge, size }: { badge: StudyBadge; size: number }) {
  const medal = Math.round(size * 0.28);
  return (
    <span
      className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2"
      style={{ bottom: Math.round(size * 0.02) }}
      aria-hidden
    >
      <TopicMedal
        difficulty={badge.difficulty ?? "apprentice"}
        unlocked
        mark={badge.topicTitle ?? badge.title}
        size={medal}
      />
    </span>
  );
}
