/**
 * Client-side mirror of the backend's Printful recipient rules
 * (narsil-museum-backend `services/recipient.ts`). Printful needs an ISO
 * country code — and a state code for US/CA/AU — so an address missing those
 * is undeliverable. Checking here means the customer sees the problem while
 * the form is still in front of them, instead of a 400 from
 * /api/checkout/payment-intent after they've picked a size.
 *
 * The forms pick codes from `lib/countries.ts`, so new addresses are already
 * correct by construction. The name lookups below exist for rows saved before
 * the dropdowns, and for anything typed by hand.
 */

import {
  COUNTRIES,
  SHIPPING_COUNTRY,
  SUBDIVISIONS,
  isCountryCode,
  subdivisionsFor,
} from "./countries";

/** Country name (as listed) → code, plus the spellings people actually type. */
const COUNTRY_BY_NAME = new Map<string, string>([
  ...COUNTRIES.map((c) => [c.name.toLowerCase(), c.code] as const),
  ["united states of america", "US"],
  ["usa", "US"],
  ["u.s.a.", "US"],
  ["u.s.", "US"],
  ["america", "US"],
  ["uk", "GB"],
  ["u.k.", "GB"],
  ["great britain", "GB"],
  ["britain", "GB"],
  ["england", "GB"],
  ["scotland", "GB"],
  ["wales", "GB"],
  ["northern ireland", "GB"],
  ["russia", "RU"],
  ["south korea", "KR"],
  ["korea", "KR"],
  ["north korea", "KP"],
  ["vietnam", "VN"],
  ["uae", "AE"],
  ["holland", "NL"],
  ["deutschland", "DE"],
  ["czech republic", "CZ"],
  ["turkey", "TR"],
  ["ivory coast", "CI"],
  ["cape verde", "CV"],
  ["swaziland", "SZ"],
  ["macedonia", "MK"],
  ["burma", "MM"],
  ["east timor", "TL"],
  ["vatican", "VA"],
  ["hong kong sar", "HK"],
  ["macau", "MO"],
]);

/** The address fields this module reads — a subset of both form shapes. */
export interface AddressFields {
  line1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/** Resolve a country code or name to ISO 3166-1 alpha-2. */
export function toCountryCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  // A 2-letter input still has to BE a country — "XX" would sail past Printful's
  // validation here and only fail after the customer has paid.
  if (/^[A-Za-z]{2}$/.test(trimmed)) return isCountryCode(upper) ? upper : null;
  return COUNTRY_BY_NAME.get(trimmed.toLowerCase()) ?? null;
}

/** Resolve a state/province code or name for countries that require one. */
export function toStateCode(value: string, countryCode: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const options = subdivisionsFor(countryCode);
  if (!options) {
    // No list for this country — Printful doesn't require one, so pass the
    // customer's own wording through untouched.
    return trimmed;
  }
  const upper = trimmed.toUpperCase();
  const byCode = options.find((s) => s.code === upper);
  if (byCode) return byCode.code;
  const byName = options.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  return byName?.code ?? null;
}

/**
 * The first reason this address can't be shipped to, or null when it's fine.
 * Wording matches the backend so the same problem reads the same either way.
 */
export function addressProblem(address: AddressFields): string | null {
  if (!address.line1?.trim()) return "The delivery address needs a street line.";
  if (!address.city?.trim()) return "The delivery address needs a city.";

  const countryCode = toCountryCode(address.country ?? "");
  if (!countryCode) return "Pick a delivery country from the list.";
  if (countryCode !== SHIPPING_COUNTRY) {
    return "Canvas prints ship to US addresses only.";
  }

  if (countryCode in SUBDIVISIONS && !toStateCode(address.region ?? "", countryCode)) {
    return "Pick a state/province from the list.";
  }

  if (!address.postal_code?.trim()) {
    return "The delivery address needs a postal code.";
  }
  return null;
}

/**
 * Rewrite country/region to the codes Printful expects ("United States" → "US",
 * "Arizona" → "AZ") so what we store is what the order will use. Returns the
 * input untouched when the country doesn't resolve — `addressProblem` reports
 * that.
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
