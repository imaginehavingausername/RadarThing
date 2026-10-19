import { getCompactAircraftType, normalizeAircraftType } from "./utils";

export const AIRCRAFT_CATEGORY_VALUES = [
  "airbus",
  "boeing",
  "commercial",
  "military",
  "helicopter",
  "turboprop",
  "general_aviation",
] as const;

export type AircraftCategory = (typeof AIRCRAFT_CATEGORY_VALUES)[number];

export const AIRCRAFT_CATEGORY_LABELS: Record<AircraftCategory, string> = {
  airbus: "Airbus",
  boeing: "Boeing",
  commercial: "Commercial airliner",
  military: "Military",
  helicopter: "Helicopter",
  turboprop: "Turboprop",
  general_aviation: "GA aircraft",
};

const AIRBUS_TYPE =
  /^(A(220|221|223|300|306|30B|310|318|319|320|321|20N|21N|330|332|333|338|339|340|342|343|345|346|350|359|35K|380|388|400M)|BCS[13])$/;
const BOEING_TYPE =
  /^(B(707|717|720|727|73[2-9]|737|74[2-8]|747|75[2-7]|757|76[2-7]|767|77[2-9]|777|78[7-9]|787|37M|38M|39M|744|748|752|753|762|763|764|772|773|77F|77L|77W|788|789|78X)|P8|KC(46|135))$/;
const COMMERCIAL_TYPE =
  /^(A(220|221|223|300|306|30B|310|318|319|320|321|20N|21N|330|332|333|338|339|340|342|343|345|346|350|359|35K|380|388)|BCS[13]|B(707|717|720|727|73[2-9]|737|74[2-8]|747|75[2-7]|757|76[2-7]|767|77[2-9]|777|78[7-9]|787|37M|38M|39M|77F|77L|77W|78X)|E(135|140|145|170|175|190|195)|ERJ\d{3}|CRJ\d{0,4}|CL65|ATR?\d{2}|AT[47]\d|DH8[A-D]?|DHC8|Q400|SF34|SW4|F(70|100)|MD\d{2,3}|DC\d{1,2}|L1011|IL(62|86|96)|TU(134|154|204)|SSJ\d*|D328|J328)$/;
const MILITARY_TYPE =
  /^(F\d+|SU\d+|MIG\d+|TU(22|95|160)|B(1|2|21|52)|A(4|6|7|10)|AV8|T\d+|C(2|5|17|130)|KC\d+|P8|E(3|7)|A400M|IL76|SR71|AH\d+|UH\d+|CH\d+|MH\d+|HH\d+)$/;
const TURBOPROP_TYPE =
  /^(ATR?\d{2}|AT[47]\d|DH8[A-D]?|DHC8|Q400|SF34|SW4|C208|PC12|B(190|200|350)|BE(20|30|35)|AN(24|26|28|32|38|140)|A140|D228|D328)$/;
const GENERAL_AVIATION_TYPE =
  /^(C(1\d{2}|2\d{2}|3\d{2}|4\d{2})|PA\d{2,3}|SR\d{2}|DA\d{2}|BE\d{2}|M20\w*|BN2|PC(6|12|24)|LJ\d{0,2}|C(25\w*|56X)|CL(30|35|60)|H25B|GLF\d|FA[789]X)$/;

/**
 * Classifies the aircraft name/type already stored on a recorded flight.
 * Categories intentionally overlap so rules can be combined predictably.
 */
export function getAircraftCategories(
  aircraftType: string | undefined,
): AircraftCategory[] {
  const raw = aircraftType?.trim().toUpperCase() ?? "";
  if (!raw) return [];

  const normalized = normalizeAircraftType(raw) ?? raw;
  const compact = getCompactAircraftType(raw) ?? normalized;
  const candidates = new Set([normalized, compact]);
  const matches = (pattern: RegExp) =>
    [...candidates].some((candidate) => pattern.test(candidate));
  const categories = new Set<AircraftCategory>();

  if (/\bAIRBUS\b/.test(raw) || matches(AIRBUS_TYPE)) {
    categories.add("airbus");
  }
  if (/\bBOEING\b/.test(raw) || matches(BOEING_TYPE)) {
    categories.add("boeing");
  }
  if (
    /\b(AIRLINER|COMMERCIAL|REGIONAL JET|PASSENGER)\b/.test(raw) ||
    matches(COMMERCIAL_TYPE)
  ) {
    categories.add("commercial");
  }
  if (
    /\b(MILITARY|FIGHTER|BOMBER|ATTACK|INTERCEPTOR|GUNSHIP)\b/.test(raw) ||
    matches(MILITARY_TYPE)
  ) {
    categories.add("military");
  }
  if (
    /\b(HELICOPTER|HELI|ROTOR|ROTARY)\b/.test(raw) ||
    /^(AH|UH|CH|MH|HH)\d+$/.test(normalized)
  ) {
    categories.add("helicopter");
  }
  if (/\b(TURBOPROP|TURBO PROP)\b/.test(raw) || matches(TURBOPROP_TYPE)) {
    categories.add("turboprop");
  }
  if (
    /\b(GA|GENERAL AVIATION|CESSNA|PIPER|CIRRUS|DIAMOND|MOONEY|BONANZA|BARON|BEECHCRAFT|BUSINESS|CORPORATE|LEARJET|GULFSTREAM|FALCON)\b/.test(
      raw,
    ) ||
    matches(GENERAL_AVIATION_TYPE)
  ) {
    categories.add("general_aviation");
  }

  return AIRCRAFT_CATEGORY_VALUES.filter((category) =>
    categories.has(category),
  );
}
