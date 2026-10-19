import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function normalizeCallsign(callsign: string | undefined): string {
  return String(callsign || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeBombardierAircraftType(cleaned: string): string | null {
  const learjetMatch =
    /\b(?:LEARJET|LEAR\s+JET)\s*(\d{2})\b/.exec(cleaned) ||
    /\bLJ[-\s]?(\d{2})\b/.exec(cleaned);
  if (learjetMatch) {
    return `LJ${learjetMatch[1]}`;
  }

  if (
    /\bCHALLENGER\b.*\b6(?:00|01|04|05|50)\b/.test(cleaned) ||
    /\bCL[-\s]?6(?:00|01|04|05|50)\b/.test(cleaned)
  ) {
    return "CL60";
  }

  return null;
}

function normalizeAntonovAircraftType(cleaned: string): string | null {
  const antonovMatch =
    /\bANTONOV\b(?:\s+AN)?[-\s]?(\d{2,3})\b/.exec(cleaned) ||
    /\bAN[-\s]?(\d{2,3})\b/.exec(cleaned);
  if (antonovMatch) {
    const model = antonovMatch[1];
    if (!model) return null;
    return /^(124|140|148|158|225)$/.test(model) ? `A${model}` : `AN${model}`;
  }

  if (cleaned === "ANTONOV") return "A124";

  return null;
}

function normalizeDornierAircraftType(cleaned: string): string | null {
  if (/\b(?:DORNIER\s+)?(?:DO[-\s]?)?328[-\s]?JET\b|\bJ328\b/.test(cleaned)) {
    return "J328";
  }

  const dornierMatch =
    /\bDORNIER\b(?:\s+DO)?[-\s]?(\d{2,3})\b/.exec(cleaned) ||
    /\bDO[-\s]?(\d{2,3})\b/.exec(cleaned) ||
    /\bD(228|328)\b/.exec(cleaned);
  if (dornierMatch) {
    const model = dornierMatch[1];
    if (!model) return null;
    return /^(228|328)$/.test(model) ? `D${model}` : `DO${model}`;
  }

  if (cleaned === "DORNIER") return "D328";

  return null;
}

/** Normalize aircraft type (e.g., "Boeing 777-300ER" -> "B777", "Airbus A350-900" -> "A350") */
export function normalizeAircraftType(type: string | undefined): string | null {
  if (!type) return null;
  const cleaned = type.trim().toUpperCase();

  const normalizedAntonov = normalizeAntonovAircraftType(cleaned);
  if (normalizedAntonov) return normalizedAntonov;

  const bombardierMatch = normalizeBombardierAircraftType(cleaned);
  if (bombardierMatch) return bombardierMatch;

  const dornierMatch = normalizeDornierAircraftType(cleaned);
  if (dornierMatch) return dornierMatch;

  const poseidonMatch = /\bP-?8(?:I)?\b/.exec(cleaned);
  if (poseidonMatch) return "P8";
  const ilyushinMatch = /\bIL-?76(?:[A-Z0-9-]*)/.exec(cleaned);
  if (ilyushinMatch) return "IL76";
  const shuttleOrbiterMatch = /\bOV-?(\d{3})\b/.exec(cleaned);
  if (shuttleOrbiterMatch) return `OV${shuttleOrbiterMatch[1]}`;
  if (/\bSPACE\s+SHUTTLE\b/.test(cleaned)) return "SHUTTLE";

  if (
    /\bA223\b/.test(cleaned) ||
    /\bA220[- ]?300\b/.test(cleaned) ||
    /\bA220$/.test(cleaned)
  ) {
    return "BCS3";
  }

  const airbusMatch = /A\d{3}/.exec(cleaned);
  if (airbusMatch) return airbusMatch[0];

  const boeingManufacturerMatch = /\bBOEING\s+(\d{3})(?!\d)/.exec(cleaned);
  if (boeingManufacturerMatch) return `B${boeingManufacturerMatch[1]}`;

  const boeingMatch = /B\d{3}/.exec(cleaned);
  if (boeingMatch) return boeingMatch[0];

  const boeingNameMatch = /\b(7\d{2})\b/.exec(cleaned);
  if (boeingNameMatch) return `B${boeingNameMatch[1]}`;

  const embraerMatch = /E\d{3}|ERJ\d{3}|CRJ\d{3}/.exec(cleaned);
  if (embraerMatch) return embraerMatch[0];

  // ATR aliases: "ATR 72-600", "ATR72", "ATR-42", "AT72" -> "ATR72", "ATR42"
  const atrMatch = /\bATR?[\s-]?(\d{2})\b/.exec(cleaned);
  if (atrMatch) return `ATR${atrMatch[1]}`;

  // GA: Piper "PA-28", "PA-44", etc. -> "PA28", "PA44"
  const piperMatch = /PA-?(\d{2,3})/.exec(cleaned);
  if (piperMatch) return `PA${piperMatch[1]}`;

  // GA: Cessna "172", "152", "182", "206", "210" -> "C172", "C152", etc.
  const cessnaMatch = /\bCESSNA\s+(\d{3})/.exec(cleaned);
  if (cessnaMatch) return `C${cessnaMatch[1]}`;
  // Already short format "C172"
  const cessnaShort = /\bC(\d{3})\b/.exec(cleaned);
  if (cessnaShort) return `C${cessnaShort[1]}`;

  // GA: Cirrus "SR20", "SR22" -> "SR20", "SR22"
  const cirrusMatch = /SR\d{2}/.exec(cleaned);
  if (cirrusMatch) return cirrusMatch[0];

  // GA: Diamond "DA40", "DA42", "DA62" -> "DA40", "DA42", "DA62"
  const diamondMatch = /DA\d{2}/.exec(cleaned);
  if (diamondMatch) return diamondMatch[0];

  // GA: Beechcraft "BE36", "BE58", "King Air 350" etc.
  const beechMatch = /BE\d{2}/.exec(cleaned);
  if (beechMatch) return beechMatch[0];

  // McDonnell Douglas: "MD-11", "MD-80", "MD-90" -> "MD11", "MD80", "MD90"
  const mdMatch = /MD-?(\d{2,3})/.exec(cleaned);
  if (mdMatch) return `MD${mdMatch[1]}`;

  // Douglas: "DC-10", "DC-8", "DC-9" -> "DC10", "DC8", "DC9"
  const dcMatch = /DC-?(\d{1,2})/.exec(cleaned);
  if (dcMatch) return `DC${dcMatch[1]}`;

  // Lockheed: "L-1011", "L1011" -> "L1011"
  const lockheedMatch = /L-?(1011)\b/.exec(cleaned);
  if (lockheedMatch) return `L${lockheedMatch[1]}`;
  const sr71Match = /SR-?(71)([A-Z])?\b/.exec(cleaned);
  if (sr71Match) return `SR${sr71Match[1]}`;

  // Military: Sukhoi "SU-35", "SU-27", "SU-57" -> "SU35", "SU27", "SU57"
  const suMatch = /SU-?(\d{2,3})/.exec(cleaned);
  if (suMatch) return `SU${suMatch[1]}`;

  // Military: Mikoyan "MIG-29", "MIG-21", "MIG-31" -> "MIG29", "MIG21", "MIG31"
  const migMatch = /MIG-?(\d{2})/.exec(cleaned);
  if (migMatch) return `MIG${migMatch[1]}`;

  // Military: Tupolev "TU-95", "TU-160", "TU-22" -> "TU95", "TU160", "TU22"
  const tuMatch = /TU-?(\d{2,3})/.exec(cleaned);
  if (tuMatch) return `TU${tuMatch[1]}`;

  // Military: US designations "F-16", "F-22", "F-35", "F-35B", "B-2", "B-52", "C-17", "KC-135", "AH-64", "UH-60"
  const milMatch = /\b(KC|AH|UH|CH|MH|HH|[FBTCA])-?(\d{1,3})\b/.exec(cleaned);
  if (milMatch) return `${milMatch[1]}${milMatch[2]}`;

  // Military suffix variants should normalize to the base airframe for lookup
  // while still allowing callers to try the full variant separately.
  const milVariantMatch =
    /\b(KC|AH|UH|CH|MH|HH|[FBTCA])-?(\d{1,3})([A-Z])\b/.exec(cleaned);
  if (milVariantMatch) return `${milVariantMatch[1]}${milVariantMatch[2]}`;

  const firstWord = cleaned.split(/[\s-]/)[0];
  return firstWord || null;
}

export function getCompactAircraftType(
  type: string | undefined,
): string | null {
  if (!type) return null;

  const cleaned = type.trim().toUpperCase();
  if (!cleaned) return null;

  if (/\bB77W\b/.test(cleaned)) return "B77W";
  if (/\bB77L\b/.test(cleaned)) return "B77L";
  if (/\bB77F\b/.test(cleaned)) return "B77F";
  if (/\bB773\b/.test(cleaned) || /\b777[- ]?300\b/.test(cleaned)) {
    return "B773";
  }
  if (/\bB772\b/.test(cleaned) || /\b777[- ]?200(ER)?\b/.test(cleaned)) {
    return "B772";
  }
  if (/\b777[- ]?300ER\b/.test(cleaned)) return "B77W";
  if (/\b777[- ]?200LR\b/.test(cleaned)) return "B77L";
  if (/\b777[- ]?(FREIGHTER|200F)\b/.test(cleaned)) return "B77F";

  if (/\bB78X\b/.test(cleaned) || /\b787[- ]?10\b/.test(cleaned)) {
    return "B78X";
  }
  if (/\bB789\b/.test(cleaned) || /\b787[- ]?9\b/.test(cleaned)) {
    return "B789";
  }
  if (/\bB788\b/.test(cleaned) || /\b787[- ]?8\b/.test(cleaned)) {
    return "B788";
  }

  if (/\bB748\b/.test(cleaned) || /\b747[- ]?8\b/.test(cleaned)) {
    return "B748";
  }
  if (/\bB744\b/.test(cleaned) || /\b747[- ]?400\b/.test(cleaned)) {
    return "B744";
  }

  if (/\bB764\b/.test(cleaned) || /\b767[- ]?400\b/.test(cleaned)) {
    return "B764";
  }
  if (/\bB763\b/.test(cleaned) || /\b767[- ]?300\b/.test(cleaned)) {
    return "B763";
  }
  if (/\bB762\b/.test(cleaned) || /\b767[- ]?200\b/.test(cleaned)) {
    return "B762";
  }

  if (/\bB753\b/.test(cleaned) || /\b757[- ]?300\b/.test(cleaned)) {
    return "B753";
  }
  if (/\bB752\b/.test(cleaned) || /\b757[- ]?200\b/.test(cleaned)) {
    return "B752";
  }

  if (/\bB38M\b/.test(cleaned) || /\b737[- ]?8(MAX)?\b/.test(cleaned)) {
    return "B38M";
  }
  if (/\bB39M\b/.test(cleaned) || /\b737[- ]?9(MAX)?\b/.test(cleaned)) {
    return "B39M";
  }
  if (/\bB739\b/.test(cleaned) || /\b737[- ]?900\b/.test(cleaned)) {
    return "B739";
  }
  if (/\bB738\b/.test(cleaned) || /\b737[- ]?800\b/.test(cleaned)) {
    return "B738";
  }
  if (/\bB737\b/.test(cleaned) || /\b737[- ]?700\b/.test(cleaned)) {
    return "B737";
  }
  if (/\bB734\b/.test(cleaned) || /\b737[- ]?400\b/.test(cleaned)) {
    return "B734";
  }
  if (/\bB733\b/.test(cleaned) || /\b737[- ]?300\b/.test(cleaned)) {
    return "B733";
  }
  if (/\bB732\b/.test(cleaned) || /\b737[- ]?200\b/.test(cleaned)) {
    return "B732";
  }

  if (/\bA388\b/.test(cleaned) || /\bA380\b/.test(cleaned)) return "A388";
  if (/\bA35K\b/.test(cleaned) || /\bA350[- ]?1000\b/.test(cleaned)) {
    return "A35K";
  }
  if (/\bA359\b/.test(cleaned) || /\bA350[- ]?900\b/.test(cleaned)) {
    return "A359";
  }
  if (/\bA346\b/.test(cleaned) || /\bA340[- ]?600\b/.test(cleaned)) {
    return "A346";
  }
  if (/\bA345\b/.test(cleaned) || /\bA340[- ]?500\b/.test(cleaned)) {
    return "A345";
  }
  if (/\bA343\b/.test(cleaned) || /\bA340[- ]?300\b/.test(cleaned)) {
    return "A343";
  }
  if (/\bA342\b/.test(cleaned) || /\bA340[- ]?200\b/.test(cleaned)) {
    return "A342";
  }
  if (/\bA339\b/.test(cleaned) || /\bA330[- ]?900\b/.test(cleaned)) {
    return "A339";
  }
  if (/\bA338\b/.test(cleaned) || /\bA330[- ]?800\b/.test(cleaned)) {
    return "A338";
  }
  if (/\bA333\b/.test(cleaned) || /\bA330[- ]?300\b/.test(cleaned)) {
    return "A333";
  }
  if (/\bA332\b/.test(cleaned) || /\bA330[- ]?200\b/.test(cleaned)) {
    return "A332";
  }
  if (/\bA21N\b/.test(cleaned) || /\bA321NEO\b/.test(cleaned)) {
    return "A21N";
  }
  if (/\bA20N\b/.test(cleaned) || /\bA320NEO\b/.test(cleaned)) {
    return "A20N";
  }
  if (/\bA321\b/.test(cleaned)) return "A321";
  if (/\bA320\b/.test(cleaned)) return "A320";
  if (/\bA319\b/.test(cleaned)) return "A319";
  if (/\bA318\b/.test(cleaned)) return "A318";
  if (/\bA310\b/.test(cleaned)) return "A310";
  if (/\bA306\b|\bA30B\b|\bA300\b/.test(cleaned)) return "A306";

  if (
    /\bA223\b/.test(cleaned) ||
    /\bA220[- ]?300\b/.test(cleaned) ||
    /\bA220$/.test(cleaned)
  ) {
    return "BCS3";
  }
  if (/\bA221\b/.test(cleaned) || /\bA220[- ]?100\b/.test(cleaned)) {
    return "A221";
  }

  if (/\bE195\b|\bE95[LS]?\b/.test(cleaned)) return "E195";
  if (/\bE190\b|\bE90[LS]?\b/.test(cleaned)) return "E190";
  if (/\bE175\b|\bE75[LS]?\b/.test(cleaned)) return "E175";
  if (/\bE170\b/.test(cleaned)) return "E170";
  if (/\bERJ[- ]?145\b|\bE145\b/.test(cleaned)) return "E145";
  if (/\bCRJ[- ]?[1279]\d{2}\b|\bCRJ\b|\bCL65\b/.test(cleaned)) return "CRJ";
  if (/\bAT7[26]\b|\bATR[- ]?72\b/.test(cleaned)) return "AT76";
  if (/\bAT4[26]\b|\bATR[- ]?42\b/.test(cleaned)) return "AT46";
  if (/\bDH8[ABCD]?\b|\bQ400\b/.test(cleaned)) return "DH8D";

  const compactAntonov = normalizeAntonovAircraftType(cleaned);
  if (compactAntonov) return compactAntonov;

  const compactDornier = normalizeDornierAircraftType(cleaned);
  if (compactDornier) return compactDornier;

  if (/^[A-Z0-9]{3,5}$/.test(cleaned)) return cleaned;

  return normalizeAircraftType(type);
}

export function getAircraftTypeLookupCandidates(
  type: string | undefined,
): string[] {
  if (!type) return [];

  const cleaned = type.trim().toUpperCase();
  if (!cleaned) return [];

  const candidates = new Set<string>();
  const compact = getCompactAircraftType(type);
  const normalized = normalizeAircraftType(type);
  const antonovMatch = /\bAN-?(\d{2,3})\b/.exec(cleaned);

  if (antonovMatch) {
    candidates.add(`AN${antonovMatch[1]}`);
  }

  if (compact) {
    candidates.add(compact);
  }

  if (normalized) {
    candidates.add(normalized);
  }

  // Some environments have KC-135 records stored as K135.
  if (normalized === "KC135" || /\bKC-?135[A-Z]?\b/.test(cleaned)) {
    candidates.add("K135");
  }
  if (normalized === "K135" || /\bK135\b/.test(cleaned)) {
    candidates.add("KC135");
  }

  // Preserve military suffix variants such as F-35B when available,
  // while still trying the base model first (F35).
  const militaryVariantMatch =
    /\b(KC|AH|UH|CH|MH|HH|[FBTCA])-?(\d{1,3})([A-Z])\b/.exec(cleaned);
  if (militaryVariantMatch) {
    candidates.add(`${militaryVariantMatch[1]}${militaryVariantMatch[2]}`);
    candidates.add(
      `${militaryVariantMatch[1]}${militaryVariantMatch[2]}${militaryVariantMatch[3]}`,
    );
  }

  return Array.from(candidates);
}
