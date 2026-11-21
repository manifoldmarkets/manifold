// Postal-code requirements for Printful shipping. Most countries require a
// postal code in the recipient address, but a handful either don't have one
// (UAE, Hong Kong) or treat it as optional in practice (Ireland's Eircode,
// Vietnam's 6-digit codes). Printful accepts orders without zip for these.
//
// Add to this set if a user reports a country where Printful is rejecting
// orders specifically because of the zip requirement.
//
// Future: if merch operations grows, replace this hard-coded set with a
// scheduled sync from Printful's GET /countries endpoint (it exposes
// state_required + postal_code_required flags per country). Cache the
// result in a `printful_countries` table and read it from here. Until
// then, this list works because Printful's coverage changes maybe once
// every couple of years.
const POSTAL_CODE_OPTIONAL_COUNTRIES = new Set<string>([
  'HK', // Hong Kong — no postal codes
  'AE', // United Arab Emirates — no postal codes
  'IE', // Ireland — Eircode exists but adoption/enforcement is patchy
  'VN', // Vietnam — codes exist but rarely required by carriers
])

// True when the given ISO-2 country code requires a postal code in the
// shipping address. Used to gate both the client form and the server-side
// purchase/rates handlers.
export const requiresPostalCode = (countryCode: string): boolean =>
  !POSTAL_CODE_OPTIONAL_COUNTRIES.has(countryCode.toUpperCase())

// Countries where the destination's customs authority uses the recipient's
// email to notify them about duties/documents needed to release the parcel.
// Without an email, packages can be delayed, returned, or cancelled — so we
// make the form field mandatory. Printful's API accepts orders without email
// (the requirement is enforced downstream by customs/carriers), and the
// public /countries endpoint doesn't expose per-field requirement flags, so
// this list is curated from Printful's help center documentation.
//
// Canary Islands also require email per Printful, but they ship under
// Spain's ES code; distinguishing them requires a state-code check
// (GC/TF) which we don't currently do. Spanish customers can still type
// an email — it's just not enforced by this list.
const EMAIL_REQUIRED_COUNTRIES = new Set<string>([
  'BR', // Brazil — Receita Federal emails recipient about CPF/import duties
])

// True when the given ISO-2 country code requires a recipient email for
// customs notifications. The email is always forwarded to Printful when
// supplied; this flag only controls whether the client form treats it as
// mandatory.
export const requiresRecipientEmail = (countryCode: string): boolean =>
  EMAIL_REQUIRED_COUNTRIES.has(countryCode.toUpperCase())
