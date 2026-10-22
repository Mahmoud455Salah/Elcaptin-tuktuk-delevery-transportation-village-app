import { VILLAGES } from './villages';

export const RATE_PER_KM = 10;
export const MINIMUM_FARE = 10;
export const DISTANCE_BUFFER_KM = 0.5;
export const ROAD_FACTOR = 1.3;

export type SameVillageTier = 'near' | 'medium' | 'far';

export interface SameVillageTierFares {
  near: number;
  medium: number;
  far: number;
}

/**
 * Three tiers of fares for trips within the same village (editable per village).
 * - near (قريب - جوه الحتة)
 * - medium (متوسط)
 * - far (بعيد - من أول القرية لآخرها)
 */
export const SAME_VILLAGE_TIERS: Record<string, SameVillageTierFares> = {
  bardeen: { near: 10, medium: 15, far: 20 },
  kafr_abaza: { near: 10, medium: 15, far: 20 },
  inshas: { near: 10, medium: 15, far: 20 },
  koushaik: { near: 10, medium: 15, far: 20 },
  tahret_hameed: { near: 10, medium: 15, far: 20 },
  el_khees: { near: 10, medium: 15, far: 20 },
  meet_rekab: { near: 10, medium: 15, far: 20 },
  kafr_denwhia: { near: 10, medium: 15, far: 20 },
  shobak: { near: 10, medium: 15, far: 20 },
  zagazig_city: { near: 15, medium: 20, far: 30 },
};

export const DEFAULT_SAME_VILLAGE_TIERS: SameVillageTierFares = { near: 10, medium: 15, far: 20 };

/** Editable maximum final fare allowed for same-village trips */
export const SAME_VILLAGE_MAX_FARE = 50;

export const SAME_VILLAGE_TIER_OPTIONS: Array<{
  id: SameVillageTier;
  label: string;
  emoji: string;
  fullLabel: string;
}> = [
  { id: 'near', label: 'قريب (جوه الحتة)', emoji: '🟢', fullLabel: '🟢 قريب (جوه الحتة)' },
  { id: 'medium', label: 'متوسط', emoji: '🟡', fullLabel: '🟡 متوسط' },
  { id: 'far', label: 'بعيد (من أول القرية لآخرها)', emoji: '🔴', fullLabel: '🔴 بعيد (من أول القرية لآخرها)' },
];

export function getSameVillageTierDisplay(tier?: SameVillageTier | string | null): {
  id: SameVillageTier;
  label: string;
  emoji: string;
  fullDisplay: string;
} | null {
  if (!tier) return null;
  const match = SAME_VILLAGE_TIER_OPTIONS.find((t) => t.id === tier);
  if (match) {
    return {
      id: match.id,
      label: match.label,
      emoji: match.emoji,
      fullDisplay: `${match.emoji} ${match.label}`,
    };
  }
  return null;
}

export function findVillageByNameOrId(nameOrId: string) {
  const clean = (nameOrId || '').trim();
  if (!clean) return null;
  const normClean = normalizeVillageKey(clean);
  return (
    VILLAGES.find(
      (item) =>
        item.id === clean ||
        item.name === clean ||
        normalizeVillageKey(item.name) === normClean
    ) || null
  );
}

export function findVillageId(nameOrId: string): string | null {
  const v = findVillageByNameOrId(nameOrId);
  return v ? v.id : null;
}

export function getSameVillageTiers(villageNameOrId: string): SameVillageTierFares {
  const vid = findVillageId(villageNameOrId);
  if (vid && SAME_VILLAGE_TIERS[vid]) {
    return SAME_VILLAGE_TIERS[vid];
  }
  return DEFAULT_SAME_VILLAGE_TIERS;
}

/**
 * Optional overrides for specific village pairs to set an exact price.
 * Keys can be ordered as "villageA|villageB" or "villageB|villageA".
 */
export const FIXED_FARES: Record<string, number> = {
  // Example overrides (editable by admin/developer):
  // 'قرية بردين|مدينة الزقازيق': 120,
};

/**
 * Optional manual road distance override table (in km) between listed villages.
 * Empty by default — distances between different listed villages are automatically
 * computed from their lat/lng coordinates in villages.ts (Haversine × ROAD_FACTOR).
 * Add an entry here ONLY if you want to manually override the computed distance for a specific pair.
 * Priority: FIXED_FARES > VILLAGE_DISTANCES_KM override > computed coordinate distance.
 */
export const VILLAGE_DISTANCES_KM: Record<string, Record<string, number>> = {
  // Example optional override:
  // 'قرية بردين': { 'مدينة الزقازيق': 12.5 },
};

/**
 * Standard rounding to the nearest 5 EGP (e.g. 12 -> 10, 13 -> 15, 17 -> 15, 18 -> 20).
 * Always respects the minimum fare of 10 EGP.
 */
export function roundToNearest5(amount: number): number {
  const rounded = Math.round(amount / 5) * 5;
  return Math.max(MINIMUM_FARE, rounded);
}

/**
 * Normalizes village names for robust table lookup.
 */
function normalizeVillageKey(name: string): string {
  return (name || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes straight-line Haversine distance in km between two lat/lng points.
 */
export function computeHaversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Retrieves the approximate road distance in km between two listed villages.
 * Priority:
 * 1. Optional VILLAGE_DISTANCES_KM override table (if defined for the pair)
 * 2. Computed from village lat/lng in villages.ts: Haversine × ROAD_FACTOR
 */
export function getVillageDistanceKm(pickup: string, dropoff: string): number | null {
  if (!pickup || !dropoff) return null;
  const pTrim = pickup.trim();
  const dTrim = dropoff.trim();

  // Same village check
  if (pTrim === dTrim || normalizeVillageKey(pTrim) === normalizeVillageKey(dTrim)) {
    return 1.0; // nominal local intra-village distance
  }

  // 1. Check optional manual override table (exact match)
  if (VILLAGE_DISTANCES_KM[pTrim]?.[dTrim] !== undefined) {
    return VILLAGE_DISTANCES_KM[pTrim][dTrim];
  }
  if (VILLAGE_DISTANCES_KM[dTrim]?.[pTrim] !== undefined) {
    return VILLAGE_DISTANCES_KM[dTrim][pTrim];
  }

  // Check optional manual override table (normalized key match)
  const normP = normalizeVillageKey(pTrim);
  const normD = normalizeVillageKey(dTrim);

  for (const [pKey, targets] of Object.entries(VILLAGE_DISTANCES_KM)) {
    const normKey = normalizeVillageKey(pKey);
    if (normKey === normP) {
      for (const [dKey, dist] of Object.entries(targets)) {
        if (normalizeVillageKey(dKey) === normD) {
          return dist;
        }
      }
    } else if (normKey === normD) {
      for (const [dKey, dist] of Object.entries(targets)) {
        if (normalizeVillageKey(dKey) === normP) {
          return dist;
        }
      }
    }
  }

  // 2. Compute from coordinates in villages.ts: Haversine × ROAD_FACTOR
  const vPickup = findVillageByNameOrId(pTrim);
  const vDropoff = findVillageByNameOrId(dTrim);

  if (
    vPickup &&
    vDropoff &&
    typeof vPickup.lat === 'number' &&
    typeof vPickup.lng === 'number' &&
    typeof vDropoff.lat === 'number' &&
    typeof vDropoff.lng === 'number'
  ) {
    const haversine = computeHaversineKm(
      vPickup.lat,
      vPickup.lng,
      vDropoff.lat,
      vDropoff.lng
    );
    return Number((haversine * ROAD_FACTOR).toFixed(2));
  }

  return null;
}

export interface VillageFareOutcome {
  distanceKm: number | null;
  estimatedFare: number;
  isNegotiable: boolean;
  isSameVillage: boolean;
  isFixedOverride: boolean;
  sameVillageTier?: SameVillageTier;
  displayText: string;
}

/**
 * Calculates fare according to business rules:
 * 1. If either pickup or drop-off is typed by hand (custom):
 *    -> "السعر بالاتفاق مع الكابتن" (estimatedFare = 0, isNegotiable = true).
 * 2. If pickup and drop-off are the same village:
 *    -> Uses FIXED_FARES override if present (A|A).
 *    -> Otherwise estimated fare = SAME_VILLAGE_TIERS[villageId][selectedTier] (no buffer added).
 * 3. If FIXED_FARES specifies an exact fare for this pair:
 *    -> Uses fixed fare directly (no buffer added).
 * 4. For trips between two DIFFERENT listed villages:
 *    -> Fare = (distance + DISTANCE_BUFFER_KM) × 10 EGP, minimum 10 EGP, rounded to the nearest 5 EGP.
 */
export function calculateVillageFare(
  pickupVillage: string,
  dropoffVillage: string,
  isCustomPickup = false,
  isCustomDropoff = false,
  sameVillageTier: SameVillageTier = 'near'
): VillageFareOutcome {
  // If either village is hand-typed
  if (isCustomPickup || isCustomDropoff) {
    return {
      distanceKm: null,
      estimatedFare: 0,
      isNegotiable: true,
      isSameVillage: false,
      isFixedOverride: false,
      displayText: 'السعر بالاتفاق مع الكابتن',
    };
  }

  const pClean = (pickupVillage || '').trim();
  const dClean = (dropoffVillage || '').trim();

  if (!pClean || !dClean) {
    return {
      distanceKm: null,
      estimatedFare: 0,
      isNegotiable: false,
      isSameVillage: false,
      isFixedOverride: false,
      displayText: 'حدد مكان الركوب والوجهة لحساب الأجرة',
    };
  }

  // Same village
  if (pClean === dClean || normalizeVillageKey(pClean) === normalizeVillageKey(dClean)) {
    const fixedKeyA = `${pClean}|${dClean}`;
    const fixedKeyB = `${dClean}|${pClean}`;
    const fixed = FIXED_FARES[fixedKeyA] ?? FIXED_FARES[fixedKeyB];
    const isOverride = fixed !== undefined;
    const villageTiers = getSameVillageTiers(pClean);
    const tierFare = villageTiers[sameVillageTier] ?? DEFAULT_SAME_VILLAGE_TIERS[sameVillageTier] ?? 10;
    const fare = isOverride ? fixed : tierFare;

    return {
      distanceKm: 1.0,
      estimatedFare: fare,
      isNegotiable: false,
      isSameVillage: true,
      isFixedOverride: isOverride,
      sameVillageTier: isOverride ? undefined : sameVillageTier,
      displayText: `${fare} جنيه`,
    };
  }

  // Check FIXED_FARES override
  const keyA = `${pClean}|${dClean}`;
  const keyB = `${dClean}|${pClean}`;
  const fixedOverride = FIXED_FARES[keyA] ?? FIXED_FARES[keyB];
  if (fixedOverride !== undefined) {
    const dist = getVillageDistanceKm(pClean, dClean);
    return {
      distanceKm: dist,
      estimatedFare: fixedOverride,
      isNegotiable: false,
      isSameVillage: false,
      isFixedOverride: true,
      displayText: `${fixedOverride} جنيه`,
    };
  }

  // Standard precomputed distance between two different listed villages
  const baseDistanceKm = getVillageDistanceKm(pClean, dClean);
  if (baseDistanceKm === null) {
    return {
      distanceKm: null,
      estimatedFare: 0,
      isNegotiable: true,
      isSameVillage: false,
      isFixedOverride: false,
      displayText: 'السعر بالاتفاق مع الكابتن',
    };
  }

  const distanceKm = Number((baseDistanceKm + DISTANCE_BUFFER_KM).toFixed(2));
  const rawFare = Math.max(MINIMUM_FARE, distanceKm * RATE_PER_KM);
  const roundedFare = roundToNearest5(rawFare);

  return {
    distanceKm,
    estimatedFare: roundedFare,
    isNegotiable: false,
    isSameVillage: false,
    isFixedOverride: false,
    displayText: `${roundedFare} جنيه`,
  };
}
