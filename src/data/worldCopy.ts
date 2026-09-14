/**
 * World-building / lore copy for user-facing chrome.
 *
 * Screen ids, StoreKit product ids, and APIs stay unchanged — only the words
 * the member sees. Tweak here after client review so tone stays consistent.
 */

export const WORLD = {
  /** Search screen / search bar */
  discover: "Discover",
  discoverPlaceholder: "Discover the archives…",
  collections: "Collections",

  /** Profile tab (screen id `you`) */
  member: "Profile",

  /** Shop tab (screen id `buy`) */
  gallery: "Gallery",

  /** Saved / bookmarks (screen id `saved`) — no cart; Vault is Saved */
  vault: "Vault",
  vaultEmpty:
    "Your vault is currently empty. Discover the archives to secure your next piece.",

  /** Checkout */
  acquire: "Acquire",
  dispatchIncluded: "dispatch included",
  acquisitionSecured: "Acquisition Secured",

  /** Daily quiz */
  royalAssessment: "The Royal Assessment",
  /** Age / empire quizzes on Discover */
  ageTrial: "Trial of the Age",
  empireTrial: "Trial of the Empire",
  trialHint: "Pass each rank to unlock the next",
  trialNeedPerfect: "Only a flawless appraisal claims this seal.",
  trialEarned: "The seal is yours.",
  trialRetry: "Try again",
  trialRetryWait: "Try again in",
  trialNeedPrior: "Pass Apprentice first",
  trialNeedPro: "Subscribe to unlock this trial",
  trialCooldownHint: "Failed a trial? Waiting time grows with each miss.",
  seals: "Seals of the Archive",
  studyBadges: "Badges",
  studyAssessmentBadges: "Assessment",
  studyDiscoverBadges: "Discover",
  studyWearBadge: "Wear this badge",
  studyBadgeLocked: "Earn this badge to wear it",
  studyDiscoverRank: "Discover trials",
  studyNoDiscoverRank: "No Discover seals yet — start with Ancient Egypt.",
  /** Bottom-nav label — short enough for the pill */
  assessmentNav: "Study",
  appraisal: "Appraisal",

  /** Pro subscription display name */
  explorersGuild: "The Explorer's Guild",
  patronsAdvantage: "The Patron's Advantage",
  unchartedArchives: "Uncharted Archives",
  masterFile: "Master File",
  extractFromArchive: "Extract from Archive",

  subscribePitch:
    "Join The Explorer's Guild to access the Uncharted Archives and extract uncompressed Master Files.",
} as const;

export interface AppraisalRank {
  title: string;
  message: string;
}

/** Daily Royal Assessment ranks — keyed by score out of 7. */
export const APPRAISAL_RANKS: Record<number, AppraisalRank> = {
  0: {
    title: "Exiled to the Wastelands",
    message:
      "An absolute disgrace. Your ignorance has deeply offended the court. You have been stripped of your lands and banished from the kingdom.",
  },
  1: {
    title: "Set Ablaze",
    message:
      "A catastrophic failure. Your assessment was deemed heretical, and you have been sentenced to the pyre. May the flames cleanse your terrible taste.",
  },
  2: {
    title: "Imprisoned in the Dungeon",
    message:
      "A dismal performance. The guards have seized you. You are locked in the dampest cell of the royal dungeon to reflect on your lack of culture.",
  },
  3: {
    title: "Placed in the Stocks",
    message:
      "A thoroughly embarrassing display. Your poor eye for the archives is now public knowledge. Prepare to be mocked by the village peasantry.",
  },
  4: {
    title: "Demoted to Peasant",
    message:
      "An utterly mediocre appraisal. You are unworthy of the court, stripped of your noble titles, and returned to the fields to till the earth.",
  },
  5: {
    title: "Granted an Audience",
    message:
      "A highly respectable assessment. You survived the trial and the Sovereign permits you to safely browse the artifacts within The Gallery.",
  },
  6: {
    title: "Knighted by the Crown",
    message:
      "A masterful display of historical knowledge. You are hereby dubbed a true Knight of the Archives.",
  },
  7: {
    title: "Ascended to the Throne",
    message:
      "Flawless perfection. The crown is yours. You rule the Explorer's Guild with absolute authority. Claim your treasure.",
  },
};

/** Practice / non-7 fallbacks when Appraisal ranks don't apply. */
export function practiceVerdict(score: number, total: number): string {
  const ratio = total === 0 ? 0 : score / total;
  if (ratio === 1) return "Flawless. A true connoisseur.";
  if (ratio >= 0.7) return "Sharp eye — well played.";
  if (ratio >= 0.4) return "Not bad. The gallery grows on you.";
  return "Every master started somewhere.";
}

export function appraisalFor(
  score: number,
  total: number,
  isDaily: boolean
): { title: string | null; message: string } {
  if (isDaily && total === 7 && APPRAISAL_RANKS[score]) {
    const rank = APPRAISAL_RANKS[score];
    return { title: rank.title, message: rank.message };
  }
  return { title: null, message: practiceVerdict(score, total) };
}
