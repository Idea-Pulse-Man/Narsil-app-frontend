import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import BlurImage from "../BlurImage";
import RuneLoader from "../RuneLoader";
import type { Crop, RevealEffect } from "@/lib/quiz/engine/types";
import { hashString, mulberry32, shuffle } from "@/lib/quiz/random";

interface EngineImageProps {
  src: string;
  accent?: string;
  alt: string;
  /** Show only this window (detail match, tiles). Forces `cover`. */
  crop?: Crop;
  flip?: boolean;
  /** Black out this tile (missing piece). Forces `cover`. */
  hole?: Crop;
  reveal?: RevealEffect;
  revealSeconds?: number;
  /** Stop any reveal and show the whole image (after answering). */
  revealed?: boolean;
  /** Stable per-question seed for the reveal origin / tile order. */
  seed: string;
  thumbWidth?: number;
  maxWidth?: number;
  priority?: boolean;
  /** Show the full artwork (letterboxed) instead of filling the frame. */
  contain?: boolean;
}

const TILE_GRID = 3;

/** Grid position of an n×n tile crop (see `Crop`). */
function tileBox(crop: Crop) {
  const n = Math.max(2, Math.round(crop.scale));
  const col = Math.round(crop.x * (n - 1));
  const row = Math.round(crop.y * (n - 1));
  return { left: `${(col / n) * 100}%`, top: `${(row / n) * 100}%`, size: `${100 / n}%` };
}

/**
 * Artwork image for engine questions: crop / flip / hole are plain CSS on top
 * of `BlurImage`; reveal effects animate from hidden to clear over
 * `revealSeconds`, and jump to clear once `revealed`.
 */
export default function EngineImage({
  src,
  accent = "#3a2c1c",
  alt,
  crop,
  flip,
  hole,
  reveal = "none",
  revealSeconds = 10,
  revealed = false,
  seed,
  thumbWidth,
  maxWidth,
  priority = true,
  contain = false,
}: EngineImageProps) {
  const rng = useMemo(() => mulberry32(hashString(seed)), [seed]);
  const origin = useMemo(
    () => `${Math.round(25 + rng() * 50)}% ${Math.round(25 + rng() * 50)}%`,
    [rng],
  );
  const tileOrder = useMemo(
    () => shuffle(Array.from({ length: TILE_GRID * TILE_GRID }, (_, i) => i), rng),
    [rng],
  );
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    if (reveal !== "tiles" || revealed) return;
    setOpened(1);
    const step = (revealSeconds * 1000) / (TILE_GRID * TILE_GRID);
    const timer = setInterval(() => {
      setOpened((n) => Math.min(TILE_GRID * TILE_GRID, n + 1));
    }, step);
    return () => clearInterval(timer);
  }, [reveal, revealed, revealSeconds]);

  const fit = crop || hole || !contain ? "cover" : "contain";
  const transform = [
    crop ? `scale(${crop.scale})` : "",
    flip ? "scaleX(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const image = (
    <div
      className="absolute inset-0"
      style={{
        transform: transform || undefined,
        transformOrigin: crop ? `${crop.x * 100}% ${crop.y * 100}%` : undefined,
      }}
    >
      <BlurImage
        src={src}
        alt={alt}
        accent={accent}
        fit={fit}
        thumbWidth={thumbWidth}
        maxWidth={maxWidth}
        priority={priority}
        placeholder={<RuneLoader size={thumbWidth ? 48 : 120} />}
      />
    </div>
  );

  const duration = revealed ? 0.35 : revealSeconds;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {reveal === "zoom" ? (
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: origin }}
          initial={{ scale: 6 }}
          animate={{ scale: 1 }}
          transition={{ duration, ease: "easeOut" }}
        >
          {image}
        </motion.div>
      ) : reveal === "blur" ? (
        <motion.div
          className="absolute inset-0"
          initial={{ filter: "blur(28px)" }}
          animate={{ filter: "blur(0px)" }}
          transition={{ duration, ease: "linear" }}
        >
          {image}
        </motion.div>
      ) : (
        image
      )}

      {reveal === "tiles" && !revealed && (
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: TILE_GRID * TILE_GRID }).map((_, i) => (
            <div
              key={i}
              className={`border border-black/30 bg-[#1a120c] transition-opacity duration-500 ${
                tileOrder.indexOf(i) < opened ? "opacity-0" : "opacity-100"
              }`}
            />
          ))}
        </div>
      )}

      {hole && (
        <div
          className="absolute border-2 border-dashed border-amber-200/80 bg-[#120c08]"
          style={{
            left: tileBox(hole).left,
            top: tileBox(hole).top,
            width: tileBox(hole).size,
            height: tileBox(hole).size,
          }}
        />
      )}
    </div>
  );
}
