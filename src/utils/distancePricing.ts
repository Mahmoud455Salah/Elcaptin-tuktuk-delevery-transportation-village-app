import { VILLAGES } from '../data/villages';

export const RATE_PER_KM = 10; // 10 جنيه مصري لكل كيلومتر

// Default center coordinates (Zagazig City) — used ONLY for driver profile schema initialization when driver GPS is unavailable
export const LEGACY_DEFAULT_LAT = 30.5877;
export const LEGACY_DEFAULT_LNG = 31.502;

export function findVillageIdByName(name: string): string | null {
  if (!name || !name.trim()) return null;
  const clean = name.trim();

  const direct = VILLAGES.find(
    (v) => v.name === clean || clean.includes(v.name) || v.name.includes(clean)
  );
  if (direct) return direct.id;

  if (clean.includes('الزقازيق')) return 'zagazig_city';
  if (clean.includes('بردين')) return 'bardeen';
  if (clean.includes('أباظة') || clean.includes('اباظة')) return 'kafr_abaza';
  if (clean.includes('أنشاص') || clean.includes('انشاص')) return 'inshas';
  if (clean.includes('كشيك')) return 'koushaik';
  if (clean.includes('طهره') || clean.includes('طهرة')) return 'tahret_hameed';
  if (clean.includes('الخيس')) return 'el_khees';
  if (clean.includes('ميت ركاب')) return 'meet_rekab';
  if (clean.includes('الدنوهيا')) return 'kafr_denwhia';
  if (clean.includes('الشوبك')) return 'shobak';

  return null;
}

export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * يستخرج إحداثيات القرية (lat, lng) من جدول VILLAGES لملف الكابتن فقط عند عدم توفر GPS للكابتن.
 */
export function resolveVillageCoordinates(
  villageOrRoleText?: string | null
): { lat: number; lng: number } | null {
  if (!villageOrRoleText || !villageOrRoleText.trim()) return null;
  const villageId = findVillageIdByName(villageOrRoleText);
  if (!villageId) return null;
  const matched = VILLAGES.find((v) => v.id === villageId);
  if (matched && isValidCoordinatePair(matched.lat, matched.lng)) {
    return {
      lat: Number(matched.lat!.toFixed(6)),
      lng: Number(matched.lng!.toFixed(6)),
    };
  }
  return null;
}

/**
 * حساب المسافة المباشرة (Direct Haversine Distance) بالكيلومتر بين نقطتين
 * مخصصة فقط لفحص تحرك الـ GPS للكابتن (50 متر) ولا تُستخدم لتسعير المشاوير.
 */
export function calculateDirectDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

