/**
 * Client-side mirror of the backend's Printful recipient rules
 * (narsil-museum-backend `services/recipient.ts`). Printful needs an ISO
 * country code — and a state code for US/CA/AU — so an address missing those
 * is undeliverable. Checking here means the customer sees the problem while
 * the form is still in front of them, instead of a 400 from
 * /api/checkout/payment-intent after they've picked a size.
 *
 * Keep the maps below in sync with the backend's; the backend stays the
 * authority, this is just the friendlier first pass.
 */

/** Common country spellings → ISO 3166-1 alpha-2 (2-letter input passes through). */
const COUNTRY_CODES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  america: "US",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  ireland: "IE",
  portugal: "PT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  poland: "PL",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  china: "CN",
  india: "IN",
  brazil: "BR",
  mexico: "MX",
  "new zealand": "NZ",
  singapore: "SG",
  "hong kong": "HK",
  taiwan: "TW",
  "united arab emirates": "AE",
  uae: "AE",
};

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
  "puerto rico": "PR",
};

/** Countries whose Printful orders must carry a state_code. */
const STATE_REQUIRED = new Set(["US", "CA", "AU"]);

/** The address fields this module reads — a subset of both form shapes. */
export interface AddressFields {
  line1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export function toCountryCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_CODES[trimmed.toLowerCase()] ?? null;
}

export function toStateCode(value: string, countryCode: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2,3}$/.test(trimmed)) return trimmed.toUpperCase();
  if (countryCode === "US") return US_STATES[trimmed.toLowerCase()] ?? null;
  return null;
}

/**
 * The first reason this address can't be shipped to, or null when it's fine.
 * Wording matches the backend so the same problem reads the same either way.
 */
export function addressProblem(address: AddressFields): string | null {
  if (!address.line1?.trim()) return "The delivery address needs a street line.";
  if (!address.city?.trim()) return "The delivery address needs a city.";

  const countryCode = toCountryCode(address.country ?? "");
  if (!countryCode) {
    return 'Unrecognised delivery country — use a 2-letter code like "US" or "GB".';
  }

  const stateCode = toStateCode(address.region ?? "", countryCode);
  if (STATE_REQUIRED.has(countryCode) && !stateCode) {
    return 'This country needs a state/province — add a 2-letter code (e.g. "NY") to the address.';
  }

  if (!address.postal_code?.trim()) {
    return "The delivery address needs a postal code.";
  }
  return null;
}

/**
 * Rewrite country/region to the codes Printful expects ("United States" → "US",
 * "Arizona" → "AZ") so what we store is what the order will use. Returns the
 * input untouched when the values don't resolve — `addressProblem` reports that.
 */
export function normalizeAddress<T extends AddressFields>(address: T): T {
  const countryCode = toCountryCode(address.country ?? "");
  if (!countryCode) return address;
  const stateCode = toStateCode(address.region ?? "", countryCode);
  return {
    ...address,
    country: countryCode,
    ...(stateCode ? { region: stateCode } : {}),
  };
}
