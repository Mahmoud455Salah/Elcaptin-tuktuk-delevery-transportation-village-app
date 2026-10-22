import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  BLUEPRINT_CONSTRAINTS,
  sanitizeString,
  sanitizeId,
} from '../firebase';
import {
  OrderData,
  AcceptedCaptainInfo,
  OFFICIAL_PHONE,
  OrderLocationCoords,
} from '../utils/whatsapp';
import {
  calculateDirectDistanceKm,
  isValidCoordinatePair,
  LEGACY_DEFAULT_LAT,
  LEGACY_DEFAULT_LNG,
  RATE_PER_KM,
  resolveVillageCoordinates,
} from '../utils/distancePricing';
import { calculateVillageFare, SameVillageTier, SAME_VILLAGE_MAX_FARE } from '../data/fares';

export const ADMIN_EMAILS = ['la4416884@gmail.com', 'slahm7344@gmail.com'];

// Editable freshness window (3 minutes): a driver counts as online & available now only if updatedAt is within this window
export const ONLINE_FRESHNESS_MS = 3 * 60 * 1000;
const DRIVER_HEARTBEAT_INTERVAL_MS = 60_000;

export function isDriverOnlineAndAvailableNow(
  driver: Partial<DriverProfileDoc> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!driver) return false;
  if (driver.approvalStatus !== 'approved') return false;
  if (driver.online !== true) return false;
  if (driver.available !== true) return false;
  const ts = driver.updatedAt;
  if (!ts || typeof ts !== 'object' || typeof (ts as Timestamp).toMillis !== 'function') {
    return false;
  }
  try {
    const updatedAtMs = (ts as Timestamp).toMillis();
    if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return false;
    return nowMs - updatedAtMs <= ONLINE_FRESHNESS_MS;
  } catch {
    return false;
  }
}

export const RIDE_STATUS = {
  SEARCHING_DRIVER: 'pending',
  ACCEPTED: 'accepted',
  DRIVER_ARRIVING: 'on_the_way',
  DRIVER_ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type AppRole = 'customer' | 'driver' | 'admin';
export type AuthIntent = 'customer_order' | 'customer' | 'driver' | 'admin' | null;
export type DriverApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// Throttling thresholds for Driver Live GPS updates to Firestore
const DRIVER_GPS_MIN_INTERVAL_MS = 15_000; // Minimum 15 seconds between periodic writes
const DRIVER_GPS_MIN_DISTANCE_KM = 0.05; // Minimum 50 meters movement to trigger an early write

export interface UserProfileDoc {
  userId: string;
  name: string;
  email?: string;
  phone: string;
  role?: AppRole;
  accountType: 'customer' | 'driver';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DriverProfileDoc {
  userId: string;
  displayName: string;
  email?: string;
  captainCode: string;
  contactPhone: string;
  roleTitle: string;
  approvalStatus: DriverApprovalStatus;
  online: boolean;
  available: boolean;
  locationLat: number;
  locationLng: number;
  vehicleType: string;
  vehicleModel: string;
  plateNumber: string;
  rating: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DriverProfileInput {
  displayName: string;
  captainCode: string;
  contactPhone: string;
  roleTitle: string;
  online?: boolean;
  available?: boolean;
  locationLat?: number;
  locationLng?: number;
  vehicleType: string;
  vehicleModel: string;
  plateNumber: string;
}

export interface PendingOrderDraft {
  serviceType: 'ride' | 'delivery';
  sameVillageTier?: SameVillageTier;
  name: string;
  phone: string;
  pickupVillage: string;
  customPickupVillage: string;
  pickupSpecific: string;
  dropoffVillage: string;
  customDropoffVillage: string;
  dropoffNote: string;
  paymentMethod: 'cash' | 'vodafone_cash';
  category?: string;
  notes: string;
  locationCoords: OrderLocationCoords | null;
}

const DRAFT_STORAGE_KEY = 'captain_pending_order_draft_v1';
const INTENT_STORAGE_KEY = 'captain_auth_intent_v1';

function loadDraftFromStorage(): PendingOrderDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as PendingOrderDraft;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function saveDraftToStorage(draft: PendingOrderDraft | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!draft) {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // Ignore storage write errors
  }
}

function loadIntentFromStorage(): AuthIntent {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.sessionStorage.getItem(INTENT_STORAGE_KEY);
    if (
      val === 'customer_order' ||
      val === 'customer' ||
      val === 'driver' ||
      val === 'admin'
    ) {
      return val;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveIntentToStorage(intent: AuthIntent) {
  if (typeof window === 'undefined') return;
  try {
    if (!intent) {
      window.sessionStorage.removeItem(INTENT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(INTENT_STORAGE_KEY, intent);
    }
  } catch {
    // Ignore storage errors
  }
}

interface FirebaseContextValue {
  currentUser: User | null;
  effectiveCustomerId: string;
  isAuthReady: boolean;
  isDriverProfileReady: boolean;
  isApprovedDriver: boolean;
  isAdminUser: boolean;
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
  userProfile: UserProfileDoc | null;
  driverProfile: DriverProfileDoc | null;
  onlineDrivers: DriverProfileDoc[];
  allDrivers: DriverProfileDoc[];
  adminTotalUsersCount: number;
  adminDataReady: boolean;
  adminDataError: string | null;
  firestoreOrders: OrderData[];
  pendingCloudOrders: OrderData[];
  myDriverOrders: OrderData[];
  myCustomerOrders: OrderData[];
  activeCustomerOrder: OrderData | null;
  setActiveCustomerOrder: (order: OrderData | null) => void;
  activeDriverOrder: OrderData | null;
  rejectedRequestIds: string[];
  pendingOrderDraft: PendingOrderDraft | null;
  setPendingOrderDraft: (draft: PendingOrderDraft | null) => void;
  authIntent: AuthIntent;
  setAuthIntent: (intent: AuthIntent) => void;
  authLoading: boolean;
  authError: string | null;
  actionError: string | null;
  clearActionError: () => void;
  loginWithGoogle: (preferredRole?: AppRole) => Promise<User | null>;
  logout: () => Promise<void>;
  saveUserProfile: (data: {
    name: string;
    phone: string;
    accountType?: 'customer' | 'driver';
  }) => Promise<void>;
  saveDriverProfile: (data: DriverProfileInput) => Promise<void>;
  approveDriverProfile: (targetUserId: string) => Promise<void>;
  rejectDriverProfile: (targetUserId: string) => Promise<void>;
  suspendDriverProfile: (targetUserId: string) => Promise<void>;
  reactivateDriverProfile: (targetUserId: string) => Promise<void>;
  deleteAdminDriverProfile: (targetUserId: string) => Promise<void>;
  unregisterDriverProfile: (targetUserId?: string) => Promise<void>;
  toggleDriverStatus: (online: boolean, available?: boolean) => Promise<void>;
  createCloudRideRequest: (order: OrderData, explicitUser?: User | null) => Promise<OrderData>;
  cancelCloudRideRequest: (requestId: string) => Promise<void>;
  acceptCloudRideRequest: (
    requestId: string,
    captain?: Partial<AcceptedCaptainInfo>
  ) => Promise<void>;
  rejectCloudRideRequest: (requestId: string) => void;
  updateCloudRideStatus: (
    requestId: string,
    newStatus: 'on_the_way' | 'arrived' | 'completed'
  ) => Promise<void>;
  updateCloudFinalFare: (requestId: string, finalFare: number) => Promise<void>;
  deleteAdminRideRequest: (requestId: string) => Promise<void>;
  cleanOldAdminRideRequests: () => Promise<number>;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

function formatTimestampToArabic(ts: unknown): string {
  if (!ts) return 'الآن';
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as Timestamp).toDate === 'function'
  ) {
    try {
      return (ts as Timestamp).toDate().toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'الآن';
    }
  }
  return 'الآن';
}

function getTimestampMillis(ts: unknown): number {
  if (!ts) return Date.now();
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as Timestamp).toMillis === 'function'
  ) {
    try {
      return (ts as Timestamp).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

function mapDocToOrderData(data: Record<string, any>): OrderData & { _createdAtMs?: number } {
  const status = (data.status as OrderData['status']) || 'pending';
  const isTerminal = status === 'completed' || status === 'cancelled';
  const hasDriver = Boolean(data.driverId && String(data.driverId).trim().length > 0);
  const rawDriverPhone = String(data.driverPhone || data.driverContact || OFFICIAL_PHONE);
  const plateNumber = String(data.plateNumber || 'زقازيق');
  const resolvedDropoffNote = String(data.dropoffNote ?? data.dropoffSpecific ?? '');
  const pickupVillage = String(data.pickupVillage || '');

  const hasValidStoredPickupCoords = isValidCoordinatePair(data.pickupLat, data.pickupLng);
  const hasValidStoredDestinationCoords = isValidCoordinatePair(
    data.destinationLat,
    data.destinationLng
  );

  const acceptedCaptain: AcceptedCaptainInfo | null = hasDriver
    ? {
        id: String(data.driverId),
        name: String(data.driverName || 'كابتن الكابتن'),
        code: String(data.driverCode || 'ك-111'),
        // Hide driver phone after order is completed or cancelled
        phone: isTerminal ? '' : rawDriverPhone,
        plateNumber,
        role: String(data.driverRole || 'كابتن معتمد'),
        etaMinutes: typeof data.etaMinutes === 'number' ? data.etaMinutes : 7,
        acceptedAt: formatTimestampToArabic(data.updatedAt),
      }
    : null;

  return {
    requestId: String(data.requestId || ''),
    customerId: String(data.customerId || ''),
    customerEmail: String(data.customerEmail || ''),
    driverId: String(data.driverId || ''),
    driverName: String(data.driverName || ''),
    driverPhone: isTerminal ? '' : rawDriverPhone,
    plateNumber,
    orderNumber: String(data.orderNumber || '----'),
    serviceType: data.serviceType === 'delivery' || data.type === 'delivery' ? 'delivery' : 'ride',
    type: data.type === 'delivery' || data.serviceType === 'delivery' ? 'delivery' : 'ride',
    sameVillageTier:
      data.sameVillageTier === 'near' || data.sameVillageTier === 'medium' || data.sameVillageTier === 'far'
        ? data.sameVillageTier
        : undefined,
    name: String(data.customerName || 'عميل الكابتن'),
    // Pending orders have '' on rideRequests; populated from /rideContacts only for accepted driver
    phone: isTerminal || status === 'pending' ? '' : String(data.customerContact || ''),
    pickupVillage,
    pickupSpecific: String(data.pickupSpecific || ''),
    pickupLat: hasValidStoredPickupCoords ? Number(data.pickupLat) : undefined,
    pickupLng: hasValidStoredPickupCoords ? Number(data.pickupLng) : undefined,
    dropoffVillage: String(data.dropoffVillage || ''),
    dropoffSpecific: resolvedDropoffNote,
    dropoffNote: resolvedDropoffNote,
    destinationLat: hasValidStoredDestinationCoords ? Number(data.destinationLat) : undefined,
    destinationLng: hasValidStoredDestinationCoords ? Number(data.destinationLng) : undefined,
    locationCoords: hasValidStoredPickupCoords
      ? {
          latitude: Number(data.pickupLat),
          longitude: Number(data.pickupLng),
        }
      : undefined,
    destinationCoords: hasValidStoredDestinationCoords
      ? {
          latitude: Number(data.destinationLat),
          longitude: Number(data.destinationLng),
        }
      : undefined,
    category:
      typeof data.category === 'string' && data.category.trim()
        ? String(data.category).trim()
        : undefined,
    distanceKm:
      typeof data.distanceKm === 'number' &&
      Number.isFinite(data.distanceKm) &&
      data.distanceKm >= 0
        ? data.distanceKm
        : undefined,
    estimatedFare:
      typeof data.estimatedFare === 'number' &&
      Number.isFinite(data.estimatedFare) &&
      data.estimatedFare >= 0
        ? data.estimatedFare
        : undefined,
    finalFare:
      typeof data.finalFare === 'number' &&
      Number.isFinite(data.finalFare) &&
      data.finalFare >= 0
        ? data.finalFare
        : undefined,
    paymentMethod: data.paymentMethod === 'vodafone_cash' ? 'vodafone_cash' : 'cash',
    notes: String(data.notes || ''),
    createdAt: formatTimestampToArabic(data.createdAt),
    updatedAt: formatTimestampToArabic(data.updatedAt),
    status,
    acceptedCaptain,
    _createdAtMs: getTimestampMillis(data.createdAt),
  };
}

function sortOrdersNewestFirst<T extends { _createdAtMs?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isDriverProfileReady, setIsDriverProfileReady] = useState<boolean>(false);
  const [hasAdminRecord, setHasAdminRecord] = useState<boolean>(false);
  const [activeRole, setActiveRoleState] = useState<AppRole>('customer');
  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfileDoc | null>(null);
  const [rawOnlineDrivers, setRawOnlineDrivers] = useState<DriverProfileDoc[]>([]);
  const [freshnessNowMs, setFreshnessNowMs] = useState<number>(() => Date.now());
  const [adminAllDrivers, setAdminAllDrivers] = useState<DriverProfileDoc[]>([]);
  const [myCustomerOrders, setMyCustomerOrders] = useState<OrderData[]>([]);
  const [immediateCustomerOrder, setImmediateCustomerOrder] = useState<OrderData | null>(null);
  const [pendingCloudOrders, setPendingCloudOrders] = useState<OrderData[]>([]);
  const [myDriverOrders, setMyDriverOrders] = useState<OrderData[]>([]);
  const [adminAllOrders, setAdminAllOrders] = useState<OrderData[]>([]);
  const [adminRideContactsMap, setAdminRideContactsMap] = useState<Record<string, string>>({});
  const [adminTotalUsersCount, setAdminTotalUsersCount] = useState<number>(0);
  const [adminDataReady, setAdminDataReady] = useState<boolean>(false);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [activeDriverCustomerPhone, setActiveDriverCustomerPhone] = useState<string>('');
  const [rejectedRequestIds, setRejectedRequestIds] = useState<string[]>([]);
  const [pendingOrderDraft, setPendingOrderDraftState] = useState<PendingOrderDraft | null>(() =>
    loadDraftFromStorage()
  );
  const [authIntent, setAuthIntentState] = useState<AuthIntent>(() => loadIntentFromStorage());
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Prevents onAuthStateChanged from racing with loginWithGoogle(preferredRole) or createCloudRideRequest
  const pendingLoginRoleRef = useRef<AppRole | null>(null);
  // Holds active Firestore listener unsubscribe callback so logout() can detach before signOut(auth)
  const cleanupActiveListenersRef = useRef<(() => void) | null>(null);

  // Driver GPS tracking refs (single centralized watcher — avoids duplicate listeners)
  const driverWatchIdRef = useRef<number | null>(null);
  const driverHeartbeatIntervalRef = useRef<number | null>(null);
  const driverGpsCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const driverLastSyncedGpsRef = useRef<{
    lat: number;
    lng: number;
    timestampMs: number;
  } | null>(null);
  const driverGpsPermissionDeniedRef = useRef<boolean>(false);
  const prevActiveDriverOrderIdRef = useRef<string | null>(null);

  const setActiveRole = (role: AppRole) => {
    setActiveRoleState(role);
  };

  const setPendingOrderDraft = (draft: PendingOrderDraft | null) => {
    setPendingOrderDraftState(draft);
    saveDraftToStorage(draft);
  };

  const setAuthIntent = (intent: AuthIntent) => {
    setAuthIntentState(intent);
    saveIntentToStorage(intent);
  };

  const effectiveCustomerId = currentUser ? sanitizeId(currentUser.uid) : '';

  const isAdminUser = Boolean(
    currentUser &&
      !currentUser.isAnonymous &&
      currentUser.emailVerified &&
      ((currentUser.email && ADMIN_EMAILS.includes(currentUser.email)) || hasAdminRecord)
  );

  const isApprovedDriver = Boolean(
    driverProfile && driverProfile.approvalStatus === 'approved'
  );

  const clearActionError = () => setActionError(null);

  /**
   * Resolves the best coordinates for a driver profile in strict priority order:
   * Priority 1: Real GPS location (from navigator.geolocation) if available and valid.
   * Priority 2: Explicit input coordinates or existing non-default saved coordinates in driverProfile.
   * Priority 3: Village fallback coordinates inferred from the driver's roleTitle or plateNumber.
   * Priority 4: Legacy default coordinates (30.5877, 31.502) ONLY when nothing else is available.
   */
  const resolveBestDriverCoordinates = (
    inputLat?: number,
    inputLng?: number,
    existingLat?: number,
    existingLng?: number,
    roleTitle?: string,
    plateNumber?: string
  ): { locationLat: number; locationLng: number } => {
    // Priority 1: Live verified GPS fix from navigator.geolocation
    if (
      !driverGpsPermissionDeniedRef.current &&
      driverGpsCoordsRef.current &&
      isValidCoordinatePair(driverGpsCoordsRef.current.lat, driverGpsCoordsRef.current.lng)
    ) {
      return {
        locationLat: driverGpsCoordsRef.current.lat,
        locationLng: driverGpsCoordsRef.current.lng,
      };
    }

    // Priority 2a: Explicit valid coordinates passed in input (if not the static legacy default)
    if (
      isValidCoordinatePair(inputLat, inputLng) &&
      !(inputLat === LEGACY_DEFAULT_LAT && inputLng === LEGACY_DEFAULT_LNG)
    ) {
      return {
        locationLat: Number(inputLat!.toFixed(6)),
        locationLng: Number(inputLng!.toFixed(6)),
      };
    }

    // Priority 2b: Existing saved coordinates on the driver document (if not the static legacy default)
    if (
      isValidCoordinatePair(existingLat, existingLng) &&
      !(existingLat === LEGACY_DEFAULT_LAT && existingLng === LEGACY_DEFAULT_LNG)
    ) {
      return {
        locationLat: Number(existingLat!.toFixed(6)),
        locationLng: Number(existingLng!.toFixed(6)),
      };
    }

    // Priority 3: Village fallback from driver's sector/plateNumber or roleTitle
    const villageFromPlate = resolveVillageCoordinates(plateNumber);
    if (villageFromPlate) {
      return {
        locationLat: villageFromPlate.lat,
        locationLng: villageFromPlate.lng,
      };
    }
    const villageFromRole = resolveVillageCoordinates(roleTitle);
    if (villageFromRole) {
      return {
        locationLat: villageFromRole.lat,
        locationLng: villageFromRole.lng,
      };
    }

    // Priority 4: Existing coordinates or legacy default fallback for schema compatibility
    if (isValidCoordinatePair(existingLat, existingLng)) {
      return {
        locationLat: Number(existingLat!.toFixed(6)),
        locationLng: Number(existingLng!.toFixed(6)),
      };
    }

    return {
      locationLat: LEGACY_DEFAULT_LAT,
      locationLng: LEGACY_DEFAULT_LNG,
    };
  };

  /**
   * Stops the active Driver GPS watchPosition listener cleanly.
   */
  const stopDriverGpsWatcher = () => {
    if (
      driverWatchIdRef.current !== null &&
      typeof window !== 'undefined' &&
      navigator.geolocation
    ) {
      try {
        navigator.geolocation.clearWatch(driverWatchIdRef.current);
      } catch {
        // Ignore geolocation cleanup errors
      }
    }
    driverWatchIdRef.current = null;
  };

  /**
   * Stops the active Driver 60s heartbeat timer cleanly.
   */
  const stopDriverHeartbeat = () => {
    if (driverHeartbeatIntervalRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(driverHeartbeatIntervalRef.current);
    }
    driverHeartbeatIntervalRef.current = null;
  };

  /**
   * Sends a lightweight heartbeat (`{ updatedAt: serverTimestamp() }`) for an online approved driver.
   */
  const sendDriverHeartbeat = async (uid: string) => {
    if (!uid) return;
    try {
      const driverRef = doc(db, 'drivers', uid);
      await updateDoc(driverRef, { updatedAt: serverTimestamp() });
    } catch {
      // Ignore non-critical heartbeat errors
    }
  };

  /**
   * Writes the driver's real GPS coordinates to `drivers/{uid}` (inside `locationLat` and `locationLng`).
   * Strictly checks that `drivers/{uid}` ALREADY exists and `online === true`. Never creates a driver doc.
   */
  const syncDriverGpsToFirestore = async (
    uid: string,
    lat: number,
    lng: number,
    forceImmediate = false
  ) => {
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));
    if (!isValidCoordinatePair(cleanLat, cleanLng)) return;

    driverGpsCoordsRef.current = { lat: cleanLat, lng: cleanLng };
    driverGpsPermissionDeniedRef.current = false;

    const now = Date.now();
    const lastSynced = driverLastSyncedGpsRef.current;

    if (!forceImmediate && lastSynced) {
      const elapsedMs = now - lastSynced.timestampMs;
      const movedKm = calculateDirectDistanceKm(
        lastSynced.lat,
        lastSynced.lng,
        cleanLat,
        cleanLng
      );
      if (
        movedKm < DRIVER_GPS_MIN_DISTANCE_KM &&
        elapsedMs < DRIVER_GPS_MIN_INTERVAL_MS
      ) {
        return;
      }
      if (movedKm < 0.01) {
        driverLastSyncedGpsRef.current = {
          lat: lastSynced.lat,
          lng: lastSynced.lng,
          timestampMs: now,
        };
        return;
      }
    }

    driverLastSyncedGpsRef.current = {
      lat: cleanLat,
      lng: cleanLng,
      timestampMs: now,
    };

    try {
      const driverRef = doc(db, 'drivers', uid);
      const snap = await getDoc(driverRef);
      // NEVER create a driver document from GPS sync; only update if it already exists, is approved, and is online
      if (!snap.exists()) return;
      const currentData = snap.data() as Partial<DriverProfileDoc>;
      if (currentData.approvalStatus !== 'approved' || currentData.online !== true) return;

      await updateDoc(driverRef, {
        online: true,
        available: Boolean(currentData.available ?? true),
        locationLat: cleanLat,
        locationLng: cleanLng,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Do not crash app on background GPS sync error
    }
  };

  /**
   * Normalizes a Firestore `drivers/{uid}` document without ever auto-deleting it.
   * Any legacy `drivers/{uid}` document without an explicit `approvalStatus` defaults to `'pending'`
   * so the Admin Dashboard is the single source of truth for approving or rejecting Captains.
   */
  const normalizeDriverProfileDoc = (raw: Record<string, any>, fallbackUid = ''): DriverProfileDoc => {
    const approvalStatus: DriverApprovalStatus =
      raw.approvalStatus === 'approved'
        ? 'approved'
        : raw.approvalStatus === 'rejected'
        ? 'rejected'
        : raw.approvalStatus === 'suspended'
        ? 'suspended'
        : 'pending';
    const isApproved = approvalStatus === 'approved';
    const rawPhone = String(raw.contactPhone || raw.phone || OFFICIAL_PHONE).trim();
    return {
      userId: String(fallbackUid || raw.userId || ''),
      displayName: String(raw.displayName || raw.name || 'كابتن الكابتن'),
      email: raw.email ? String(raw.email) : undefined,
      captainCode: String(raw.captainCode || raw.code || 'ك-101'),
      contactPhone: rawPhone.length >= 5 ? rawPhone : OFFICIAL_PHONE,
      roleTitle: String(raw.roleTitle || 'كابتن معتمد - مركز الزقازيق'),
      approvalStatus,
      online: isApproved ? Boolean(raw.online) : false,
      available: isApproved && Boolean(raw.online) ? Boolean(raw.available) : false,
      locationLat: typeof raw.locationLat === 'number' ? raw.locationLat : LEGACY_DEFAULT_LAT,
      locationLng: typeof raw.locationLng === 'number' ? raw.locationLng : LEGACY_DEFAULT_LNG,
      vehicleType: String(raw.vehicleType || 'توكتوك'),
      vehicleModel: String(raw.vehicleModel || 'باجاج حديث'),
      plateNumber: String(raw.plateNumber || 'قطاع الزقازيق'),
      rating:
        typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 5
          ? raw.rating
          : 5,
      createdAt: raw.createdAt ?? null,
      updatedAt: raw.updatedAt ?? null,
    };
  };

  /**
   * Builds a strictly valid Firestore write payload for `drivers/{uid}` that satisfies
   * all `isValidDriverProfile` security rule constraints even if the existing document
   * had missing or legacy fields.
   */
  const buildDriverWritePayload = (
    uid: string,
    rawExisting: Record<string, any> | null,
    overrides: {
      displayName?: string;
      email?: string;
      captainCode?: string;
      contactPhone?: string;
      roleTitle?: string;
      approvalStatus: DriverApprovalStatus;
      online: boolean;
      available: boolean;
      locationLat?: number;
      locationLng?: number;
      vehicleType?: string;
      vehicleModel?: string;
      plateNumber?: string;
    }
  ) => {
    const base = normalizeDriverProfileDoc(rawExisting || {}, uid);
    const displayName = sanitizeString(
      overrides.displayName ?? base.displayName,
      BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
      'كابتن الكابتن'
    );
    const cleanEmail = sanitizeString(
      overrides.email ?? base.email ?? '',
      150,
      ''
    );
    const captainCode = sanitizeString(
      overrides.captainCode ?? base.captainCode,
      BLUEPRINT_CONSTRAINTS.CAPTAIN_CODE_MAX_LEN,
      `ك-${uid.slice(0, 3).toUpperCase()}`
    );
    const candidatePhone = sanitizeString(
      overrides.contactPhone ?? base.contactPhone,
      BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
      OFFICIAL_PHONE
    );
    const contactPhone = candidatePhone.length >= 5 ? candidatePhone : OFFICIAL_PHONE;
    const vehicleType = sanitizeString(
      overrides.vehicleType ?? base.vehicleType,
      BLUEPRINT_CONSTRAINTS.VEHICLE_TYPE_MAX_LEN,
      'توكتوك'
    );
    const vehicleModel = sanitizeString(
      overrides.vehicleModel ?? base.vehicleModel,
      BLUEPRINT_CONSTRAINTS.VEHICLE_MODEL_MAX_LEN,
      'باجاج حديث'
    );
    const plateNumber = sanitizeString(
      overrides.plateNumber ?? base.plateNumber,
      BLUEPRINT_CONSTRAINTS.PLATE_NUMBER_MAX_LEN,
      'قطاع الزقازيق'
    );
    const roleTitle = sanitizeString(
      overrides.roleTitle ?? base.roleTitle ?? `${vehicleType} - ${plateNumber}`,
      BLUEPRINT_CONSTRAINTS.ROLE_TITLE_MAX_LEN,
      'كابتن معتمد - مركز الزقازيق'
    );
    const { locationLat, locationLng } = resolveBestDriverCoordinates(
      overrides.locationLat,
      overrides.locationLng,
      base.locationLat,
      base.locationLng,
      roleTitle,
      plateNumber
    );
    const hasValidExistingCreatedAt = Boolean(
      rawExisting &&
        rawExisting.createdAt &&
        typeof rawExisting.createdAt === 'object' &&
        'toMillis' in rawExisting.createdAt
    );
    const isApproved = overrides.approvalStatus === 'approved';
    const resolvedOnline = isApproved ? Boolean(overrides.online) : false;
    const resolvedAvailable = isApproved && resolvedOnline ? Boolean(overrides.available) : false;

    return {
      userId: uid,
      displayName,
      email: cleanEmail,
      captainCode,
      contactPhone,
      roleTitle,
      approvalStatus: overrides.approvalStatus,
      online: resolvedOnline,
      available: resolvedAvailable,
      locationLat,
      locationLng,
      vehicleType,
      vehicleModel,
      plateNumber,
      rating: base.rating,
      createdAt: hasValidExistingCreatedAt ? rawExisting!.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  };

  /**
   * Ensures a `/users/{uid}` identity document exists in Firestore.
   * Fundamental Rule:
   * - Google Authentication is responsible for Identity ONLY.
   * - NEVER creates or auto-deletes `/drivers/{uid}`.
   * - If `/users/{uid}` does NOT exist yet:
   *   Creates `/users/{uid}` as `'customer'` (or `'admin'` if verified admin email), unless explicitly called from `saveDriverProfile`.
   * - If `/users/{uid}` ALREADY exists:
   *   NEVER downgrades or overwrites a Driver (`drivers/{uid}` exists or `accountType === 'driver'`) to `'customer'` when they use "اطلب مشوار".
   */
  const ensureUserProfileExists = async (
    user: User,
    preferredRole: AppRole = 'customer',
    overrideName?: string,
    overridePhone?: string,
    explicitDriverRegistration = false
  ) => {
    const uid = sanitizeId(user.uid);
    const userRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(userRef);
      const cleanEmail = sanitizeString(user.email || '', 150, '');
      const isVerifiedAdminEmail =
        Boolean(user.emailVerified) &&
        !user.isAnonymous &&
        Boolean(user.email && ADMIN_EMAILS.includes(user.email));

      if (!snap.exists()) {
        // New user identity document: only set 'driver' if explicitly submitting Captain registration
        const resolvedAccountType: 'customer' | 'driver' = explicitDriverRegistration
          ? 'driver'
          : 'customer';
        const resolvedRole: AppRole = isVerifiedAdminEmail
          ? 'admin'
          : resolvedAccountType === 'driver'
          ? 'driver'
          : 'customer';

        const cleanName = sanitizeString(
          overrideName || user.displayName || 'عميل الكابتن',
          BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
          'عميل الكابتن'
        );
        const cleanPhone = sanitizeString(
          overridePhone || user.phoneNumber || OFFICIAL_PHONE,
          BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
          OFFICIAL_PHONE
        );

        await setDoc(userRef, {
          userId: uid,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone.length >= 5 ? cleanPhone : OFFICIAL_PHONE,
          role: resolvedRole,
          accountType: resolvedAccountType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = snap.data() as Partial<UserProfileDoc>;
        const driverDocSnap = await getDoc(doc(db, 'drivers', uid));
        const hasDriverDoc = driverDocSnap.exists();

        // CRITICAL: Never overwrite an existing Driver to 'customer' when they use Customer Login or Customer Order!
        const resolvedAccountType: 'customer' | 'driver' =
          explicitDriverRegistration || hasDriverDoc || existingData.accountType === 'driver'
            ? 'driver'
            : 'customer';

        const resolvedRole: AppRole =
          (existingData.role === 'admin' || preferredRole === 'admin') && isVerifiedAdminEmail
            ? 'admin'
            : resolvedAccountType === 'driver'
            ? 'driver'
            : 'customer';

        const hasNewCustomPhone = Boolean(
          overridePhone &&
            overridePhone.trim().length >= 5 &&
            overridePhone.trim() !== OFFICIAL_PHONE &&
            existingData.phone !== overridePhone.trim()
        );
        const hasNewCustomName = Boolean(
          overrideName &&
            overrideName.trim().length > 0 &&
            existingData.name !== overrideName.trim()
        );
        const needsRoleCorrection =
          existingData.accountType !== resolvedAccountType ||
          existingData.role !== resolvedRole;

        if (hasNewCustomPhone || hasNewCustomName || needsRoleCorrection) {
          const updatedPhone = hasNewCustomPhone
            ? sanitizeString(
                overridePhone!.trim(),
                BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
                existingData.phone || OFFICIAL_PHONE
              )
            : existingData.phone || OFFICIAL_PHONE;

          const updatedName = hasNewCustomName
            ? sanitizeString(
                overrideName!.trim(),
                BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
                existingData.name || 'عميل الكابتن'
              )
            : existingData.name || user.displayName || 'عميل الكابتن';

          const hasExistingCreatedAt = Boolean(
            existingData.createdAt &&
              typeof existingData.createdAt === 'object' &&
              ('toMillis' in existingData.createdAt || 'seconds' in existingData.createdAt)
          );

          await setDoc(userRef, {
            userId: uid,
            name: updatedName,
            email: cleanEmail || existingData.email || '',
            phone: updatedPhone.length >= 5 ? updatedPhone : OFFICIAL_PHONE,
            role: resolvedRole,
            accountType: resolvedAccountType,
            createdAt: hasExistingCreatedAt ? existingData.createdAt : serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
      if (user) {
        // Restore user identity in /users/{uid} without creating /drivers/{uid} or overwriting a real driver
        if (!pendingLoginRoleRef.current && !user.isAnonymous) {
          try {
            await ensureUserProfileExists(user, 'customer');
          } catch {
            // Handled by handleFirestoreError
          }
        }
      } else {
        stopDriverGpsWatcher();
        stopDriverHeartbeat();
        driverGpsCoordsRef.current = null;
        driverLastSyncedGpsRef.current = null;
        driverGpsPermissionDeniedRef.current = false;
        setIsDriverProfileReady(false);
        setHasAdminRecord(false);
        setDriverProfile(null);
        setAdminAllDrivers([]);
        setPendingCloudOrders([]);
        setMyDriverOrders([]);
        setAdminAllOrders([]);
        setAdminRideContactsMap({});
        setAdminTotalUsersCount(0);
        setAdminDataReady(false);
        setAdminDataError(null);
        setActiveDriverCustomerPhone('');
      }
    });
    return () => {
      stopDriverGpsWatcher();
      stopDriverHeartbeat();
      unsubscribe();
    };
  }, []);

  // Periodic clock tick so onlineDrivers freshness (ONLINE_FRESHNESS_MS) re-evaluates automatically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setInterval(() => {
      setFreshnessNowMs(Date.now());
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * Approved Online Driver Heartbeat Effect:
   * - While an approved driver is online and the page is open, every 60 seconds calls
   *   `updateDoc(driverRef, { updatedAt: serverTimestamp() })` inside try/catch.
   * - Sends one immediately when the driver goes online, and when the page becomes visible again.
   * - Stops when the driver goes offline or logs out.
   */
  useEffect(() => {
    const isApprovedOnlineDriver = Boolean(
      isAuthReady &&
        currentUser &&
        driverProfile &&
        driverProfile.userId === sanitizeId(currentUser.uid) &&
        driverProfile.approvalStatus === 'approved' &&
        driverProfile.online === true
    );

    if (!isApprovedOnlineDriver || !currentUser || typeof window === 'undefined') {
      stopDriverHeartbeat();
      return;
    }

    const uid = sanitizeId(currentUser.uid);

    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void sendDriverHeartbeat(uid);
    }

    stopDriverHeartbeat();
    driverHeartbeatIntervalRef.current = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void sendDriverHeartbeat(uid);
      }
    }, DRIVER_HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendDriverHeartbeat(uid);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopDriverHeartbeat();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [
    isAuthReady,
    currentUser?.uid,
    driverProfile?.userId,
    driverProfile?.approvalStatus,
    driverProfile?.online,
  ]);

  /**
   * Centralized Driver GPS Lifecycle Effect:
   * - Runs ONLY if:
   *   1) `activeRole === 'driver'`
   *   2) `driverProfile` exists (`drivers/{uid}` exists in Firestore)
   *   3) `driverProfile.approvalStatus === 'approved'`
   *   4) `driverProfile.online === true`
   * - Customer login (`activeRole === 'customer'`) or unapproved drivers NEVER start Driver GPS.
   */
  useEffect(() => {
    const isDriverOnline = Boolean(
      isAuthReady &&
        currentUser &&
        activeRole === 'driver' &&
        driverProfile &&
        driverProfile.userId === currentUser.uid &&
        driverProfile.approvalStatus === 'approved' &&
        driverProfile.online === true
    );

    if (!isDriverOnline || !currentUser) {
      stopDriverGpsWatcher();
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    if (driverWatchIdRef.current !== null) {
      return;
    }

    const uid = sanitizeId(currentUser.uid);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void syncDriverGpsToFirestore(
          uid,
          pos.coords.latitude,
          pos.coords.longitude,
          true
        );
      },
      (err) => {
        if (err && err.code === 1) {
          driverGpsPermissionDeniedRef.current = true;
          driverGpsCoordsRef.current = null;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void syncDriverGpsToFirestore(
          uid,
          pos.coords.latitude,
          pos.coords.longitude,
          false
        );
      },
      (err) => {
        if (err && err.code === 1) {
          driverGpsPermissionDeniedRef.current = true;
          driverGpsCoordsRef.current = null;
          stopDriverGpsWatcher();
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    driverWatchIdRef.current = watchId;

    return () => {
      stopDriverGpsWatcher();
    };
  }, [
    isAuthReady,
    currentUser?.uid,
    activeRole,
    driverProfile?.userId,
    driverProfile?.approvalStatus,
    driverProfile?.online,
  ]);

  useEffect(() => {
    if (!isAuthReady) return;

    // Clean up any previous listeners first
    if (cleanupActiveListenersRef.current) {
      cleanupActiveListenersRef.current();
      cleanupActiveListenersRef.current = null;
    }

    const onlineDriversQuery = query(
      collection(db, 'drivers'),
      where('online', '==', true)
    );
    const unsubOnlineDrivers = onSnapshot(
      onlineDriversQuery,
      (snap) => {
        const list: DriverProfileDoc[] = [];
        snap.forEach((d) => {
          const normalized = normalizeDriverProfileDoc(d.data(), d.id);
          if (normalized.approvalStatus === 'approved' && normalized.online) {
            list.push(normalized);
          }
        });
        setRawOnlineDrivers(list);
        setFreshnessNowMs(Date.now());
      },
      (err) => {
        if (!auth.currentUser) return;
        handleFirestoreError(err, OperationType.LIST, 'drivers');
      }
    );

    // Unauthenticated state (before Anonymous Auth or Google Login): only keep public online drivers listener
    if (!currentUser) {
      const cleanupUnauth = () => {
        unsubOnlineDrivers();
      };
      cleanupActiveListenersRef.current = cleanupUnauth;
      return cleanupUnauth;
    }

    const uid = sanitizeId(currentUser.uid);
    setIsDriverProfileReady(false);

    const isStillCurrentAuthUser = () =>
      Boolean(auth.currentUser && sanitizeId(auth.currentUser.uid) === uid);

    const unsubAdminDoc = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        setHasAdminRecord(snap.exists());
      },
      () => {
        setHasAdminRecord(false);
      }
    );

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfileDoc;
          setUserProfile({
            ...data,
            role: data.role || (data.accountType === 'driver' ? 'driver' : 'customer'),
          });
        }
      },
      (err) => {
        if (!isStillCurrentAuthUser()) return;
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      }
    );

    const unsubDriver = onSnapshot(
      doc(db, 'drivers', uid),
      (snap) => {
        if (snap.exists()) {
          // NEVER auto-delete drivers/{uid}; normalize approvalStatus (defaults to 'pending' if missing)
          setDriverProfile(normalizeDriverProfileDoc(snap.data(), uid));
        } else {
          setDriverProfile(null);
        }
        setIsDriverProfileReady(true);
      },
      (err) => {
        setIsDriverProfileReady(true);
        if (!isStillCurrentAuthUser()) return;
        handleFirestoreError(err, OperationType.GET, `drivers/${uid}`);
      }
    );

    const customerReqQuery = query(
      collection(db, 'rideRequests'),
      where('customerId', '==', uid)
    );
    const unsubCustomerReqs = onSnapshot(
      customerReqQuery,
      (snap) => {
        const orders: Array<OrderData & { _createdAtMs?: number }> = [];
        snap.forEach((d) => orders.push(mapDocToOrderData(d.data())));
        const sorted = sortOrdersNewestFirst(orders);
        setMyCustomerOrders(sorted);
        setImmediateCustomerOrder((prevImm) => {
          if (prevImm?.requestId) {
            const liveMatch = sorted.find((o) => o.requestId === prevImm.requestId);
            return liveMatch || prevImm;
          }
          const activeLive = sorted.find(
            (o) =>
              o.status === 'pending' ||
              o.status === 'accepted' ||
              o.status === 'on_the_way' ||
              o.status === 'arrived'
          );
          return activeLive || null;
        });
      },
      (err) => {
        if (!isStillCurrentAuthUser()) return;
        handleFirestoreError(err, OperationType.LIST, 'rideRequests');
      }
    );

    let unsubPendingReqs: (() => void) | null = null;
    let unsubDriverReqs: (() => void) | null = null;

    if (isApprovedDriver || isAdminUser) {
      const pendingReqQuery = query(
        collection(db, 'rideRequests'),
        where('status', '==', 'pending')
      );
      unsubPendingReqs = onSnapshot(
        pendingReqQuery,
        (snap) => {
          const orders: Array<OrderData & { _createdAtMs?: number }> = [];
          snap.forEach((d) => orders.push(mapDocToOrderData(d.data())));
          setPendingCloudOrders(sortOrdersNewestFirst(orders));
        },
        (err: any) => {
          if (!isStillCurrentAuthUser() || err?.code === 'permission-denied') {
            setPendingCloudOrders([]);
            return;
          }
          handleFirestoreError(err, OperationType.LIST, 'rideRequests');
        }
      );

      const driverReqQuery = query(
        collection(db, 'rideRequests'),
        where('driverId', '==', uid)
      );
      unsubDriverReqs = onSnapshot(
        driverReqQuery,
        (snap) => {
          const orders: Array<OrderData & { _createdAtMs?: number }> = [];
          snap.forEach((d) => orders.push(mapDocToOrderData(d.data())));
          setMyDriverOrders(sortOrdersNewestFirst(orders));
        },
        (err: any) => {
          if (!isStillCurrentAuthUser() || err?.code === 'permission-denied') {
            setMyDriverOrders([]);
            return;
          }
          handleFirestoreError(err, OperationType.LIST, 'rideRequests');
        }
      );
    } else {
      setPendingCloudOrders([]);
      setMyDriverOrders([]);
    }

    let unsubAdminOrders: (() => void) | null = null;
    let unsubAdminDrivers: (() => void) | null = null;
    let unsubAdminContacts: (() => void) | null = null;
    let unsubAdminUsers: (() => void) | null = null;

    if (isAdminUser) {
      setAdminDataReady(false);
      setAdminDataError(null);
      let ordersLoaded = false;
      let driversLoaded = false;
      let usersLoaded = false;
      const checkAdminReady = () => {
        if (ordersLoaded && driversLoaded && usersLoaded) {
          setAdminDataReady(true);
        }
      };

      unsubAdminOrders = onSnapshot(
        collection(db, 'rideRequests'),
        (snap) => {
          const orders: Array<OrderData & { _createdAtMs?: number }> = [];
          snap.forEach((d) => {
            try {
              orders.push(mapDocToOrderData(d.data() || {}));
            } catch {
              // Defensive guard against malformed legacy ride document
            }
          });
          setAdminAllOrders(sortOrdersNewestFirst(orders));
          ordersLoaded = true;
          checkAdminReady();
        },
        (err) => {
          if (!isStillCurrentAuthUser()) return;
          setAdminDataError('تعذر تحميل بيانات الطلبات (rideRequests) في لوحة الإدارة.');
          setAdminDataReady(true);
          handleFirestoreError(err, OperationType.LIST, 'rideRequests');
        }
      );

      unsubAdminDrivers = onSnapshot(
        collection(db, 'drivers'),
        (snap) => {
          const list: DriverProfileDoc[] = [];
          snap.forEach((d) => {
            try {
              // NEVER auto-delete drivers/{uid}; keep all records so Admin can approve or reject them
              list.push(normalizeDriverProfileDoc(d.data() || {}, d.id));
            } catch {
              // Defensive guard against malformed legacy driver document
            }
          });
          setAdminAllDrivers(list);
          driversLoaded = true;
          checkAdminReady();
        },
        (err) => {
          if (!isStillCurrentAuthUser()) return;
          setAdminDataError('تعذر تحميل بيانات الكباتن (drivers) في لوحة الإدارة.');
          setAdminDataReady(true);
          handleFirestoreError(err, OperationType.LIST, 'drivers');
        }
      );

      unsubAdminContacts = onSnapshot(
        collection(db, 'rideContacts'),
        (snap) => {
          const contacts: Record<string, string> = {};
          snap.forEach((d) => {
            const data = d.data() || {};
            const reqId = String(data.requestId || d.id || '');
            const phone = String(data.customerPhone || '').trim();
            if (reqId && phone) {
              contacts[reqId] = phone;
            }
          });
          setAdminRideContactsMap(contacts);
        },
        (err) => {
          if (!isStillCurrentAuthUser()) return;
          handleFirestoreError(err, OperationType.LIST, 'rideContacts');
        }
      );

      unsubAdminUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setAdminTotalUsersCount(snap.size);
          usersLoaded = true;
          checkAdminReady();
        },
        (err) => {
          if (!isStillCurrentAuthUser()) return;
          setAdminDataError('تعذر تحميل إحصائيات المستخدمين (users) في لوحة الإدارة.');
          setAdminDataReady(true);
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      );
    } else {
      setAdminTotalUsersCount(0);
      setAdminDataReady(false);
      setAdminDataError(null);
    }

    const cleanupAll = () => {
      unsubAdminDoc();
      unsubUser();
      unsubDriver();
      unsubOnlineDrivers();
      unsubCustomerReqs();
      if (unsubPendingReqs) unsubPendingReqs();
      if (unsubDriverReqs) unsubDriverReqs();
      if (unsubAdminOrders) unsubAdminOrders();
      if (unsubAdminDrivers) unsubAdminDrivers();
      if (unsubAdminContacts) unsubAdminContacts();
      if (unsubAdminUsers) unsubAdminUsers();
    };

    cleanupActiveListenersRef.current = cleanupAll;
    return () => {
      cleanupAll();
      if (cleanupActiveListenersRef.current === cleanupAll) {
        cleanupActiveListenersRef.current = null;
      }
    };
  }, [isAuthReady, currentUser, isAdminUser, isApprovedDriver]);

  // Raw active driver order before injecting isolated customer phone
  const rawActiveDriverOrder = useMemo(() => {
    return (
      myDriverOrders.find(
        (o) =>
          o.status === 'accepted' ||
          o.status === 'on_the_way' ||
          o.status === 'arrived'
      ) || null
    );
  }, [myDriverOrders]);

  // Fetch isolated customer phone in /rideContacts/{requestId} ONLY when driver has an active accepted order
  useEffect(() => {
    if (
      !isAuthReady ||
      !currentUser ||
      !isApprovedDriver ||
      !rawActiveDriverOrder?.requestId ||
      !(
        rawActiveDriverOrder.status === 'accepted' ||
        rawActiveDriverOrder.status === 'on_the_way' ||
        rawActiveDriverOrder.status === 'arrived'
      )
    ) {
      setActiveDriverCustomerPhone('');
      return;
    }

    let cancelled = false;
    const reqId = sanitizeId(rawActiveDriverOrder.requestId);
    getDoc(doc(db, 'rideContacts', reqId))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setActiveDriverCustomerPhone(String(data.customerPhone || ''));
        } else {
          setActiveDriverCustomerPhone('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveDriverCustomerPhone('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAuthReady,
    currentUser,
    isApprovedDriver,
    rawActiveDriverOrder?.requestId,
    rawActiveDriverOrder?.status,
  ]);

  // Automatically restore Captain availability (available: true) if an assigned active ride was cancelled by the Customer
  useEffect(() => {
    const currentActiveId = rawActiveDriverOrder?.requestId || null;
    const prevActiveId = prevActiveDriverOrderIdRef.current;
    prevActiveDriverOrderIdRef.current = currentActiveId;

    if (
      prevActiveId &&
      !currentActiveId &&
      isAuthReady &&
      currentUser &&
      isApprovedDriver &&
      driverProfile?.online &&
      !driverProfile?.available
    ) {
      const prevOrderInList = myDriverOrders.find((o) => o.requestId === prevActiveId);
      if (prevOrderInList && prevOrderInList.status === 'cancelled') {
        const uid = sanitizeId(currentUser.uid);
        const driverRef = doc(db, 'drivers', uid);
        const { locationLat, locationLng } = resolveBestDriverCoordinates(
          undefined,
          undefined,
          driverProfile.locationLat,
          driverProfile.locationLng,
          driverProfile.roleTitle,
          driverProfile.plateNumber
        );
        updateDoc(driverRef, {
          online: true,
          available: true,
          locationLat,
          locationLng,
          updatedAt: serverTimestamp(),
        })
          .then(() => {
            setDriverProfile((prev) =>
              prev ? { ...prev, online: true, available: true } : prev
            );
          })
          .catch(() => {
            // Ignore background availability recovery error
          });
      }
    }
  }, [
    rawActiveDriverOrder?.requestId,
    myDriverOrders,
    isAuthReady,
    currentUser,
    isApprovedDriver,
    driverProfile?.online,
    driverProfile?.available,
    driverProfile?.locationLat,
    driverProfile?.locationLng,
    driverProfile?.roleTitle,
    driverProfile?.plateNumber,
  ]);

  const activeDriverOrder = useMemo(() => {
    if (!rawActiveDriverOrder) return null;
    const isTerminal =
      rawActiveDriverOrder.status === 'completed' ||
      rawActiveDriverOrder.status === 'cancelled';
    return {
      ...rawActiveDriverOrder,
      phone: isTerminal
        ? ''
        : activeDriverCustomerPhone || rawActiveDriverOrder.phone || '',
    };
  }, [rawActiveDriverOrder, activeDriverCustomerPhone]);

  const firestoreOrders = useMemo(() => {
    if (isAdminUser) {
      return adminAllOrders.map((o) => {
        const contactPhone = o.requestId ? adminRideContactsMap[o.requestId] : '';
        return {
          ...o,
          phone: contactPhone || o.phone || '',
        };
      });
    }
    const map = new Map<string, OrderData & { _createdAtMs?: number }>();
    for (const o of [...pendingCloudOrders, ...myDriverOrders, ...myCustomerOrders]) {
      const key = o.requestId || o.orderNumber || Math.random().toString();
      map.set(key, o);
    }
    return sortOrdersNewestFirst(Array.from(map.values()));
  }, [
    isAdminUser,
    adminAllOrders,
    adminRideContactsMap,
    pendingCloudOrders,
    myDriverOrders,
    myCustomerOrders,
  ]);

  const onlineDrivers = useMemo(() => {
    return rawOnlineDrivers.filter((d) =>
      isDriverOnlineAndAvailableNow(d, freshnessNowMs)
    );
  }, [rawOnlineDrivers, freshnessNowMs]);

  const allDrivers = useMemo(() => {
    const map = new Map<string, DriverProfileDoc>();
    for (const d of rawOnlineDrivers) {
      map.set(d.userId, d);
    }
    if (isAdminUser) {
      for (const d of adminAllDrivers) {
        map.set(d.userId, d);
      }
    }
    if (driverProfile) {
      map.set(driverProfile.userId, driverProfile);
    }
    return Array.from(map.values());
  }, [isAdminUser, adminAllDrivers, driverProfile, rawOnlineDrivers]);

  // Active customer order combines immediateCustomerOrder (for instant transition) with live in-progress orders.
  // Never unmounts MainOrderForm while a customer is in the middle of submitting a new order (authIntent === 'customer_order'),
  // and never resurrects old completed/cancelled orders from previous sessions.
  const activeCustomerOrder = useMemo(() => {
    if (immediateCustomerOrder) {
      const matchingLive = myCustomerOrders.find(
        (o) => o.requestId === immediateCustomerOrder.requestId
      );
      const chosenImmediate = matchingLive || immediateCustomerOrder;
      const isTerminal =
        chosenImmediate.status === 'completed' || chosenImmediate.status === 'cancelled';
      return {
        ...chosenImmediate,
        phone: isTerminal ? '' : userProfile?.phone || chosenImmediate.phone || '',
      };
    }

    // While submitting a new order draft right after Google Login, keep MainOrderForm mounted until createCloudRideRequest finishes
    if (authIntent === 'customer_order') {
      return null;
    }

    const liveInProgress = myCustomerOrders.find(
      (o) =>
        o.status === 'pending' ||
        o.status === 'accepted' ||
        o.status === 'on_the_way' ||
        o.status === 'arrived'
    );

    if (!liveInProgress) return null;
    return {
      ...liveInProgress,
      phone: userProfile?.phone || liveInProgress.phone || '',
    };
  }, [myCustomerOrders, immediateCustomerOrder, authIntent, userProfile?.phone]);

  /**
   * Google Authentication = Identity ONLY.
   * - Authenticates with Google (`signInWithPopup`).
   * - Ensures `/users/{uid}` identity document exists (preserving any existing real driver/admin role).
   * - NEVER creates `/drivers/{uid}` and NEVER uses `user.displayName` to create a Captain automatically!
   * - Sets the active UI view (`activeRole`), keeping `'customer'` whenever `authIntent === 'customer_order'`.
   */
  const loginWithGoogle = async (
    preferredRole: AppRole = 'customer'
  ): Promise<User | null> => {
    setAuthLoading(true);
    setAuthError(null);
    const currentIntent = loadIntentFromStorage() || authIntent;
    const targetView: AppRole =
      currentIntent === 'customer_order' ? 'customer' : preferredRole;
    pendingLoginRoleRef.current = targetView;

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const draft = loadDraftFromStorage() || pendingOrderDraft;

      setActiveRoleState(targetView);

      await ensureUserProfileExists(
        result.user,
        targetView,
        targetView === 'customer' ? draft?.name : undefined,
        targetView === 'customer' ? draft?.phone : undefined,
        false
      );

      setCurrentUser(result.user);
      return result.user;
    } catch (err: any) {
      const msg =
        err?.code === 'auth/popup-closed-by-user'
          ? 'تم إغلاق نافذة تسجيل الدخول قبل الإتمام.'
          : 'تعذر تسجيل الدخول عبر جوجل، حاول مرة أخرى.';
      setAuthError(msg);
      return null;
    } finally {
      pendingLoginRoleRef.current = null;
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    stopDriverGpsWatcher();
    stopDriverHeartbeat();
    // Unsubscribe all authenticated Firestore listeners BEFORE calling signOut(auth)
    // to prevent Firestore from firing permission-denied errors on active listeners during sign-out
    if (cleanupActiveListenersRef.current) {
      cleanupActiveListenersRef.current();
      cleanupActiveListenersRef.current = null;
    }
    setImmediateCustomerOrder(null);
    setMyCustomerOrders([]);
    setMyDriverOrders([]);
    setPendingCloudOrders([]);
    setAdminAllOrders([]);
    setAdminAllDrivers([]);
    setAdminRideContactsMap({});
    setAdminTotalUsersCount(0);
    setAdminDataReady(false);
    setAdminDataError(null);
    setDriverProfile(null);
    setUserProfile(null);
    setHasAdminRecord(false);
    setAuthIntent(null);
    setActiveRoleState('customer');
    await signOut(auth);
  };

  const saveUserProfile = async (data: {
    name: string;
    phone: string;
    accountType?: 'customer' | 'driver';
  }) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    const uid = sanitizeId(activeUser.uid);
    const cleanName = sanitizeString(data.name, BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN, 'عميل الكابتن');
    const cleanEmail = sanitizeString(activeUser.email || '', 150, '');
    const rawPhone = sanitizeString(data.phone, BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN, OFFICIAL_PHONE);
    const cleanPhone = rawPhone.length >= 5 ? rawPhone : OFFICIAL_PHONE;

    const userRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(userRef);
      const driverDocSnap = await getDoc(doc(db, 'drivers', uid));
      const existingUser = snap.exists() ? (snap.data() as Partial<UserProfileDoc>) : null;
      const hasDriverDoc = driverDocSnap.exists();
      const isVerifiedAdminEmail =
        Boolean(activeUser.emailVerified) &&
        !activeUser.isAnonymous &&
        Boolean(activeUser.email && ADMIN_EMAILS.includes(activeUser.email));

      // Preserve 'driver' accountType if user has a driver profile or existing driver accountType
      const accountType: 'customer' | 'driver' =
        hasDriverDoc || existingUser?.accountType === 'driver' ? 'driver' : 'customer';
      const role: AppRole = isVerifiedAdminEmail
        ? 'admin'
        : accountType === 'driver'
        ? 'driver'
        : 'customer';

      if (!snap.exists()) {
        await setDoc(userRef, {
          userId: uid,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role,
          accountType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role,
          accountType,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  /**
   * Submits a Captain Join Application or updates an existing Captain's vehicle/profile info.
   * - When creating a new `drivers/{uid}` or resubmitting a pending/rejected application:
   *   Sets `approvalStatus: 'pending'`, `online: false`, `available: false`, `updatedAt: serverTimestamp()`.
   * - When an already `'approved'` Captain updates their vehicle/profile info:
   *   Preserves `approvalStatus: 'approved'` and their current `online`/`available` status.
   */
  const saveDriverProfile = async (data: DriverProfileInput) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    setActionError(null);
    const uid = sanitizeId(activeUser.uid);
    const driverRef = doc(db, 'drivers', uid);

    try {
      const snap = await getDoc(driverRef);
      const existingRaw = snap.exists() ? (snap.data() as Record<string, any>) : null;
      if (existingRaw?.approvalStatus === 'suspended' && !isAdminUser) {
        const msg =
          'حساب الكابتن موقوف مؤقتاً من الإدارة. لا يمكن تجاوز الإيقاف بدون إعادة تفعيل من الإدارة.';
        setActionError(msg);
        throw new Error(msg);
      }
      const isAlreadyApproved = existingRaw?.approvalStatus === 'approved';

      const targetApprovalStatus: DriverApprovalStatus = isAlreadyApproved
        ? 'approved'
        : 'pending';
      const targetOnline = isAlreadyApproved
        ? Boolean(data.online ?? existingRaw?.online ?? false)
        : false;
      const targetAvailable =
        isAlreadyApproved && targetOnline
          ? Boolean(data.available ?? existingRaw?.available ?? true)
          : false;

      const payload = buildDriverWritePayload(uid, existingRaw, {
        displayName: data.displayName,
        email: activeUser.email || existingRaw?.email || '',
        captainCode: data.captainCode,
        contactPhone: data.contactPhone,
        roleTitle: data.roleTitle,
        approvalStatus: targetApprovalStatus,
        online: targetOnline,
        available: targetAvailable,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        vehicleType: data.vehicleType,
        vehicleModel: data.vehicleModel,
        plateNumber: data.plateNumber,
      });

      await setDoc(driverRef, payload);
    } catch (error) {
      setActionError('حدث خطأ أثناء حفظ بيانات الكابتن في قاعدة البيانات.');
      handleFirestoreError(error, OperationType.WRITE, `drivers/${uid}`);
    }
  };

  /**
   * Admin Action: Approves a Captain profile:
   * Updates `drivers/{uid}` with:
   * `approvalStatus: 'approved'`, `online: false`, `available: false`, `updatedAt: serverTimestamp()`.
   */
  const approveDriverProfile = async (targetUserId: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser || !targetUserId) {
      setActionError('غير مصرح بتنفيذ هذا الإجراء. يرجى تسجيل الدخول بحساب مدير النظام.');
      return;
    }
    setActionError(null);
    const uid = sanitizeId(targetUserId);
    const driverRef = doc(db, 'drivers', uid);
    try {
      const snap = await getDoc(driverRef);
      if (!snap.exists()) {
        const msg = 'لم يتم العثور على طلب الكابتن المطلوب في قاعدة البيانات.';
        setActionError(msg);
        throw new Error(msg);
      }
      const existingRaw = snap.data() as Record<string, any>;
      const payload = buildDriverWritePayload(uid, existingRaw, {
        approvalStatus: 'approved',
        online: false,
        available: false,
      });

      await setDoc(driverRef, payload);

      // Immediately update local state while onSnapshot listeners also sync in real time
      setAdminAllDrivers((prev) =>
        prev.map((d) =>
          d.userId === uid
            ? { ...d, approvalStatus: 'approved', online: false, available: false }
            : d
        )
      );
      if (uid === activeUser.uid) {
        setDriverProfile((prev) =>
          prev
            ? { ...prev, approvalStatus: 'approved', online: false, available: false }
            : prev
        );
      }
    } catch (error) {
      setActionError('تعذر اعتماد الكابتن في Firestore. يرجى التحقق من الصلاحيات والمحاولة مرة أخرى.');
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${uid}`);
    }
  };

  /**
   * Admin Action: Rejects a Captain profile:
   * Updates `drivers/{uid}` with:
   * `approvalStatus: 'rejected'`, `online: false`, `available: false`, `updatedAt: serverTimestamp()`.
   */
  const rejectDriverProfile = async (targetUserId: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser || !targetUserId) {
      const msg = 'غير مصرح بتنفيذ هذا الإجراء. يرجى تسجيل الدخول بحساب مدير النظام.';
      setActionError(msg);
      throw new Error(msg);
    }
    setActionError(null);
    const uid = sanitizeId(targetUserId);
    if (uid === activeUser.uid) {
      stopDriverGpsWatcher();
    }
    const driverRef = doc(db, 'drivers', uid);
    try {
      const snap = await getDoc(driverRef);
      if (!snap.exists()) {
        const msg = 'لم يتم العثور على ملف الكابتن المطلوب في قاعدة البيانات.';
        setActionError(msg);
        throw new Error(msg);
      }
      const existingRaw = snap.data() as Record<string, any>;
      const payload = buildDriverWritePayload(uid, existingRaw, {
        approvalStatus: 'rejected',
        online: false,
        available: false,
      });

      await setDoc(driverRef, payload);

      setAdminAllDrivers((prev) =>
        prev.map((d) =>
          d.userId === uid
            ? { ...d, approvalStatus: 'rejected', online: false, available: false }
            : d
        )
      );
      if (uid === activeUser.uid) {
        setDriverProfile((prev) =>
          prev
            ? { ...prev, approvalStatus: 'rejected', online: false, available: false }
            : prev
        );
      }
    } catch (error) {
      setActionError('تعذر رفض حساب الكابتن في Firestore.');
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${uid}`);
    }
  };

  /**
   * Admin Action: Suspends an approved Captain profile:
   * Updates `drivers/{uid}` with:
   * `approvalStatus: 'suspended'`, `online: false`, `available: false`, `updatedAt: serverTimestamp()`.
   */
  const suspendDriverProfile = async (targetUserId: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser || !targetUserId) {
      const msg = 'غير مصرح بتنفيذ هذا الإجراء. يرجى تسجيل الدخول بحساب مدير النظام.';
      setActionError(msg);
      throw new Error(msg);
    }
    setActionError(null);
    const uid = sanitizeId(targetUserId);
    if (uid === activeUser.uid) {
      stopDriverGpsWatcher();
    }
    const driverRef = doc(db, 'drivers', uid);
    try {
      const snap = await getDoc(driverRef);
      if (!snap.exists()) {
        const msg = 'لم يتم العثور على ملف الكابتن المطلوب في قاعدة البيانات.';
        setActionError(msg);
        throw new Error(msg);
      }
      const existingRaw = snap.data() as Record<string, any>;
      const payload = buildDriverWritePayload(uid, existingRaw, {
        approvalStatus: 'suspended',
        online: false,
        available: false,
      });

      await setDoc(driverRef, payload);

      setAdminAllDrivers((prev) =>
        prev.map((d) =>
          d.userId === uid
            ? { ...d, approvalStatus: 'suspended', online: false, available: false }
            : d
        )
      );
      setRawOnlineDrivers((prev) => prev.filter((d) => d.userId !== uid));
      if (uid === activeUser.uid) {
        setDriverProfile((prev) =>
          prev
            ? { ...prev, approvalStatus: 'suspended', online: false, available: false }
            : prev
        );
      }
    } catch (error) {
      setActionError('تعذر إيقاف حساب الكابتن مؤقتًا في Firestore.');
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${uid}`);
    }
  };

  /**
   * Admin Action: Reactivates a suspended or rejected Captain profile:
   * Sets `approvalStatus: 'approved'`, `online: false`, `available: false`.
   * Does NOT automatically put the captain online.
   */
  const reactivateDriverProfile = async (targetUserId: string) => {
    await approveDriverProfile(targetUserId);
  };

  /**
   * Admin Action: Deletes ONLY `drivers/{uid}` from Firestore.
   * NEVER deletes `users/{uid}`, `rideRequests`, `rideContacts`, or the user's Google Auth account.
   */
  const deleteAdminDriverProfile = async (targetUserId: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser || !targetUserId) {
      const msg = 'غير مصرح بحذف ملف الكابتن. هذه الصلاحية مخصصة لمدير النظام فقط.';
      setActionError(msg);
      throw new Error(msg);
    }
    setActionError(null);
    const uid = sanitizeId(targetUserId);
    if (uid === activeUser.uid) {
      stopDriverGpsWatcher();
      stopDriverHeartbeat();
    }
    const driverRef = doc(db, 'drivers', uid);
    try {
      await deleteDoc(driverRef);
      setAdminAllDrivers((prev) => prev.filter((d) => d.userId !== uid));
      setRawOnlineDrivers((prev) => prev.filter((d) => d.userId !== uid));
      if (uid === activeUser.uid) {
        setDriverProfile(null);
      }
    } catch (error: any) {
      const detail = error?.message || 'رفضت قاعدة البيانات حذف ملف الكابتن.';
      setActionError(`تعذر حذف ملف الكابتن (${uid}): ${detail}`);
      handleFirestoreError(error, OperationType.DELETE, `drivers/${uid}`);
    }
  };

  /**
   * Explicitly removes `/drivers/{uid}` ONLY when requested by the admin.
   */
  const unregisterDriverProfile = async (targetUserId?: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    const uid = sanitizeId(targetUserId || activeUser.uid);
    await deleteAdminDriverProfile(uid);
  };

  const toggleDriverStatus = async (online: boolean, available = true) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser) return;
    setActionError(null);
    const uid = sanitizeId(activeUser.uid);
    const driverRef = doc(db, 'drivers', uid);

    if (!online) {
      stopDriverGpsWatcher();
      stopDriverHeartbeat();
    } else {
      driverGpsPermissionDeniedRef.current = false;
    }

    try {
      const snap = await getDoc(driverRef);
      if (!snap.exists()) {
        setActionError('يرجى تقديم طلب انضمام ككابتن أولاً وانتظار موافقة الإدارة.');
        return;
      }
      const existingData = snap.data() as Partial<DriverProfileDoc>;
      if (existingData.approvalStatus !== 'approved') {
        setActionError(
          'حساب الكابتن غير معتمد بعد من الإدارة. لا يمكنك الاتصال أو استقبال الطلبات قبل الموافقة.'
        );
        return;
      }
      const { locationLat, locationLng } = resolveBestDriverCoordinates(
        undefined,
        undefined,
        existingData.locationLat ?? driverProfile?.locationLat,
        existingData.locationLng ?? driverProfile?.locationLng,
        existingData.roleTitle ?? driverProfile?.roleTitle,
        existingData.plateNumber ?? driverProfile?.plateNumber
      );

      const nextOnline = Boolean(online);
      const nextAvailable = Boolean(online ? available : false);
      const payload = buildDriverWritePayload(uid, existingData as Record<string, any>, {
        approvalStatus: 'approved',
        online: nextOnline,
        available: nextAvailable,
        locationLat,
        locationLng,
      });

      await setDoc(driverRef, payload);
      if (nextOnline) {
        try {
          await updateDoc(driverRef, { updatedAt: serverTimestamp() });
        } catch {
          // Ignore non-critical immediate heartbeat error
        }
      }
      setDriverProfile((prev) =>
        prev
          ? {
              ...prev,
              online: nextOnline,
              available: nextAvailable,
              locationLat,
              locationLng,
              updatedAt: Timestamp.now(),
            }
          : prev
      );
    } catch (error) {
      setActionError('تعذر تحديث حالة الاتصال للكابتن. يرجى المحاولة مرة أخرى.');
      handleFirestoreError(error, OperationType.UPDATE, `drivers/${uid}`);
    }
  };

  const createCloudRideRequest = async (
    order: OrderData,
    explicitUser?: User | null
  ): Promise<OrderData> => {
    setActionError(null);
    // Strictly keep activeRole as 'customer' when creating a customer ride request
    setActiveRoleState('customer');

    // In simplified flow: calculate fare via calculateVillageFare or use order.estimatedFare
    const fareInfo = calculateVillageFare(
      order.pickupVillage,
      order.dropoffVillage,
      false,
      false,
      order.sameVillageTier || 'near'
    );
    const resolvedEstimatedFare =
      typeof order.estimatedFare === 'number' && Number.isFinite(order.estimatedFare)
        ? Math.round(order.estimatedFare)
        : fareInfo.estimatedFare;
    const resolvedDistanceKm =
      typeof order.distanceKm === 'number' && Number.isFinite(order.distanceKm) && order.distanceKm >= 0
        ? Number(order.distanceKm.toFixed(1))
        : (fareInfo.distanceKm !== null ? Number(fareInfo.distanceKm.toFixed(1)) : 0);

    const hasPrecisePickup = Boolean(
      (order.locationCoords &&
        isValidCoordinatePair(order.locationCoords.latitude, order.locationCoords.longitude)) ||
        isValidCoordinatePair(order.pickupLat, order.pickupLng)
    );
    const hasPreciseDestination = Boolean(
      (order.destinationCoords &&
        isValidCoordinatePair(
          order.destinationCoords.latitude,
          order.destinationCoords.longitude
        )) ||
        isValidCoordinatePair(order.destinationLat, order.destinationLng)
    );

    let activeUser = explicitUser || currentUser || auth.currentUser;
    if (!activeUser) {
      pendingLoginRoleRef.current = 'customer';
      try {
        const anonymousCred = await signInAnonymously(auth);
        activeUser = anonymousCred.user;
        setCurrentUser(activeUser);
      } catch (err: any) {
        const msg =
          err?.code === 'auth/admin-restricted-operation' ||
          err?.code === 'auth/operation-not-allowed'
            ? 'خدمة الطلب السريع للعميل (Anonymous Authentication) غير مفعلة حالياً في إعدادات Firebase. يرجى تفعيل مزود Anonymous في Firebase Console.'
            : 'تعذر التحقق من جلسة العميل لإرسال الطلب. يرجى المحاولة مرة أخرى.';
        setActionError(msg);
        throw new Error(msg);
      } finally {
        pendingLoginRoleRef.current = null;
      }
    }

    const uid = sanitizeId(activeUser.uid);
    await ensureUserProfileExists(activeUser, 'customer', order.name, order.phone);

    const orderNum = sanitizeString(
      order.orderNumber || Math.floor(1000 + Math.random() * 9000).toString(),
      BLUEPRINT_CONSTRAINTS.ORDER_NUMBER_MAX_LEN,
      '1000'
    );
    const requestId = sanitizeId(`req_${orderNum}_${Date.now()}`);
    const reqRef = doc(db, 'rideRequests', requestId);
    const contactRef = doc(db, 'rideContacts', requestId);

    const customerName = sanitizeString(
      order.name || userProfile?.name || activeUser?.displayName || 'عميل الكابتن',
      BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
      'عميل الكابتن'
    );
    const customerEmail = sanitizeString(activeUser?.email || '', 150, '');
    const rawContact = sanitizeString(
      order.phone || userProfile?.phone || OFFICIAL_PHONE,
      BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
      OFFICIAL_PHONE
    );
    const customerPhone = rawContact.length >= 5 ? rawContact : OFFICIAL_PHONE;

    const pickupVillage = sanitizeString(
      order.pickupVillage,
      BLUEPRINT_CONSTRAINTS.VILLAGE_MAX_LEN,
      'مركز الزقازيق'
    );
    const pickupSpecific = sanitizeString(
      order.pickupSpecific,
      BLUEPRINT_CONSTRAINTS.SPECIFIC_MAX_LEN,
      ''
    );

    const pickupLat = hasPrecisePickup
      ? (order.locationCoords &&
        isValidCoordinatePair(order.locationCoords.latitude, order.locationCoords.longitude)
          ? Number(order.locationCoords.latitude.toFixed(6))
          : Number(order.pickupLat!.toFixed(6)))
      : undefined;
    const pickupLng = hasPrecisePickup
      ? (order.locationCoords &&
        isValidCoordinatePair(order.locationCoords.latitude, order.locationCoords.longitude)
          ? Number(order.locationCoords.longitude.toFixed(6))
          : Number(order.pickupLng!.toFixed(6)))
      : undefined;

    const destinationLat = hasPreciseDestination
      ? (order.destinationCoords &&
        isValidCoordinatePair(order.destinationCoords.latitude, order.destinationCoords.longitude)
          ? Number(order.destinationCoords.latitude.toFixed(6))
          : Number(order.destinationLat!.toFixed(6)))
      : undefined;
    const destinationLng = hasPreciseDestination
      ? (order.destinationCoords &&
        isValidCoordinatePair(order.destinationCoords.latitude, order.destinationCoords.longitude)
          ? Number(order.destinationCoords.longitude.toFixed(6))
          : Number(order.destinationLng!.toFixed(6)))
      : undefined;

    const dropoffVillage = sanitizeString(
      order.dropoffVillage,
      BLUEPRINT_CONSTRAINTS.VILLAGE_MAX_LEN,
      'مدينة الزقازيق'
    );
    const rawDropoffNote = order.dropoffNote ?? order.dropoffSpecific ?? '';
    const dropoffNote = sanitizeString(
      rawDropoffNote,
      BLUEPRINT_CONSTRAINTS.SPECIFIC_MAX_LEN,
      ''
    );
    const category = sanitizeString(
      order.category || 'مشوار شخصي',
      100,
      'مشوار شخصي'
    );
    const notes = sanitizeString(order.notes, BLUEPRINT_CONSTRAINTS.NOTES_MAX_LEN, '');
    const distanceKm = resolvedDistanceKm;
    const estimatedFare = resolvedEstimatedFare;

    try {
      const batch = writeBatch(db);
      const rideDocPayload: Record<string, any> = {
        requestId,
        orderNumber: orderNum,
        customerId: uid,
        customerName,
        customerEmail,
        customerContact: '',
        serviceType: order.serviceType === 'delivery' || order.type === 'delivery' ? 'delivery' : 'ride',
        type: order.type === 'delivery' || order.serviceType === 'delivery' ? 'delivery' : 'ride',
        category,
        pickupVillage,
        pickupSpecific,
        dropoffVillage,
        dropoffSpecific: dropoffNote,
        dropoffNote,
        distanceKm,
        estimatedFare,
        paymentMethod: order.paymentMethod === 'vodafone_cash' ? 'vodafone_cash' : 'cash',
        notes,
        status: 'pending',
        driverId: '',
        driverName: '',
        driverCode: '',
        driverPhone: '',
        driverContact: '',
        plateNumber: '',
        driverRole: '',
        etaMinutes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (order.sameVillageTier) {
        rideDocPayload.sameVillageTier = order.sameVillageTier;
      }

      if (pickupLat !== undefined && pickupLng !== undefined) {
        rideDocPayload.pickupLat = pickupLat;
        rideDocPayload.pickupLng = pickupLng;
      }
      if (destinationLat !== undefined && destinationLng !== undefined) {
        rideDocPayload.destinationLat = destinationLat;
        rideDocPayload.destinationLng = destinationLng;
      }

      batch.set(reqRef, rideDocPayload);

      batch.set(contactRef, {
        requestId,
        customerId: uid,
        customerPhone,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      const createdOrder: OrderData & { _createdAtMs?: number } = {
        ...order,
        requestId,
        customerId: uid,
        customerEmail,
        orderNumber: orderNum,
        serviceType: order.serviceType === 'delivery' || order.type === 'delivery' ? 'delivery' : 'ride',
        type: order.type === 'delivery' || order.serviceType === 'delivery' ? 'delivery' : 'ride',
        sameVillageTier: order.sameVillageTier,
        name: customerName,
        phone: customerPhone,
        pickupVillage,
        pickupSpecific,
        pickupLat,
        pickupLng,
        dropoffVillage,
        dropoffSpecific: dropoffNote,
        dropoffNote,
        destinationLat,
        destinationLng,
        locationCoords:
          pickupLat !== undefined && pickupLng !== undefined
            ? {
                latitude: pickupLat,
                longitude: pickupLng,
              }
            : undefined,
        destinationCoords:
          destinationLat !== undefined && destinationLng !== undefined
            ? {
                latitude: destinationLat,
                longitude: destinationLng,
              }
            : undefined,
        category,
        distanceKm,
        estimatedFare,
        notes,
        driverId: '',
        driverName: '',
        driverPhone: '',
        plateNumber: '',
        acceptedCaptain: null,
        createdAt: 'الآن',
        status: 'pending',
        _createdAtMs: Date.now(),
      };

      setImmediateCustomerOrder(createdOrder);
      setMyCustomerOrders((prev) => {
        const exists = prev.some((o) => o.requestId === requestId);
        return exists ? prev : [createdOrder, ...prev];
      });
      setPendingOrderDraft(null);
      setAuthIntent(null);

      return createdOrder;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rideRequests/${requestId}`);
    }
  };

  const cancelCloudRideRequest = async (requestId: string) => {
    if (!requestId) return;
    setActionError(null);
    const cleanReqId = sanitizeId(requestId);
    const reqRef = doc(db, 'rideRequests', cleanReqId);
    try {
      await updateDoc(reqRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      setImmediateCustomerOrder((prev) =>
        prev?.requestId === cleanReqId ? { ...prev, status: 'cancelled' } : prev
      );
      setMyCustomerOrders((prev) =>
        prev.map((o) => (o.requestId === cleanReqId ? { ...o, status: 'cancelled' } : o))
      );
    } catch (error) {
      setActionError('تعذر إلغاء الطلب حالياً. قد يكون الكابتن قد وصل بالفعل أو انتهت الرحلة.');
      handleFirestoreError(error, OperationType.UPDATE, `rideRequests/${cleanReqId}`);
    }
  };

  /**
   * Atomic Request Acceptance via Firestore Transaction
   * Guarantees only ONE online/available registered driver (`drivers/{uid}` exists) can accept a pending request.
   * NEVER auto-creates a driver profile for a customer.
   */
  const acceptCloudRideRequest = async (
    requestId: string,
    captain?: Partial<AcceptedCaptainInfo>
  ) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !requestId) return;
    setActionError(null);
    const uid = sanitizeId(activeUser.uid);
    const cleanReqId = sanitizeId(requestId);

    const fallbackName = sanitizeString(
      captain?.name || driverProfile?.displayName || activeUser.displayName || 'كابتن الكابتن',
      BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
      'كابتن الكابتن'
    );
    const fallbackCode = sanitizeString(
      captain?.code || driverProfile?.captainCode || `ك-${uid.slice(0, 3).toUpperCase()}`,
      BLUEPRINT_CONSTRAINTS.CAPTAIN_CODE_MAX_LEN,
      'ك-111'
    );
    const rawContact = sanitizeString(
      captain?.phone || driverProfile?.contactPhone || OFFICIAL_PHONE,
      BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
      OFFICIAL_PHONE
    );
    const fallbackPhone = rawContact.length >= 5 ? rawContact : OFFICIAL_PHONE;
    const fallbackPlate = sanitizeString(
      captain?.plateNumber || driverProfile?.plateNumber || 'زقازيق',
      BLUEPRINT_CONSTRAINTS.PLATE_NUMBER_MAX_LEN,
      'زقازيق'
    );
    const fallbackRole = sanitizeString(
      captain?.role ||
        (driverProfile ? `${driverProfile.vehicleType} - ${driverProfile.plateNumber}` : 'كابتن معتمد'),
      BLUEPRINT_CONSTRAINTS.ROLE_TITLE_MAX_LEN,
      'كابتن معتمد'
    );
    const etaMinutes =
      typeof captain?.etaMinutes === 'number' && captain.etaMinutes >= 1 && captain.etaMinutes <= 180
        ? captain.etaMinutes
        : 7;

    const reqRef = doc(db, 'rideRequests', cleanReqId);
    const driverRef = doc(db, 'drivers', uid);
    const stepTracker: { current: 'قراءة الطلب' | 'قراءة الكابتن' | 'تحديث الطلب' } = {
      current: 'قراءة الطلب',
    };

    try {
      let acceptedOrderSnapshot: (OrderData & { _createdAtMs?: number }) | null = null;

      await runTransaction(db, async (transaction) => {
        stepTracker.current = 'قراءة الطلب';
        const reqSnap = await transaction.get(reqRef);
        if (!reqSnap.exists()) {
          throw new Error('REQUEST_NOT_FOUND');
        }
        const reqData = reqSnap.data();
        if (reqData.status !== 'pending' || (reqData.driverId && reqData.driverId !== '')) {
          throw new Error('ALREADY_ACCEPTED');
        }

        stepTracker.current = 'قراءة الكابتن';
        const drvSnap = await transaction.get(driverRef);
        if (!drvSnap.exists()) {
          throw new Error('NOT_REGISTERED_DRIVER');
        }

        const drvData = drvSnap.data();
        if (drvData.approvalStatus !== 'approved') {
          throw new Error('DRIVER_NOT_APPROVED');
        }
        if (drvData.online !== true) {
          throw new Error('DRIVER_OFFLINE');
        }

        const driverName = sanitizeString(
          drvData.displayName || fallbackName,
          BLUEPRINT_CONSTRAINTS.NAME_MAX_LEN,
          fallbackName
        );
        const drvPhoneCandidate = sanitizeString(
          drvData.contactPhone || fallbackPhone,
          BLUEPRINT_CONSTRAINTS.PHONE_MAX_LEN,
          fallbackPhone
        );
        const driverPhone = drvPhoneCandidate.length >= 5 ? drvPhoneCandidate : fallbackPhone;
        const plateNumber = sanitizeString(
          drvData.plateNumber || fallbackPlate,
          BLUEPRINT_CONSTRAINTS.PLATE_NUMBER_MAX_LEN,
          fallbackPlate
        );
        const driverCode = sanitizeString(
          drvData.captainCode || fallbackCode,
          BLUEPRINT_CONSTRAINTS.CAPTAIN_CODE_MAX_LEN,
          fallbackCode
        );
        const driverRole = sanitizeString(
          drvData.roleTitle || fallbackRole,
          BLUEPRINT_CONSTRAINTS.ROLE_TITLE_MAX_LEN,
          fallbackRole
        );

        stepTracker.current = 'تحديث الطلب';
        transaction.update(reqRef, {
          status: 'accepted',
          driverId: uid,
          driverName,
          driverCode,
          driverPhone,
          driverContact: driverPhone,
          plateNumber,
          driverRole,
          etaMinutes,
          updatedAt: serverTimestamp(),
        });

        acceptedOrderSnapshot = mapDocToOrderData({
          ...reqData,
          requestId: cleanReqId,
          status: 'accepted',
          driverId: uid,
          driverName,
          driverCode,
          driverPhone,
          driverContact: driverPhone,
          plateNumber,
          driverRole,
          etaMinutes,
        });
      });

      // Immediately sync local Captain state while real-time listeners also update
      setPendingCloudOrders((prev) => prev.filter((o) => o.requestId !== cleanReqId));
      if (acceptedOrderSnapshot) {
        const snapshotOrder: OrderData & { _createdAtMs?: number } = acceptedOrderSnapshot;
        setMyDriverOrders((prev) => {
          const rest: Array<OrderData & { _createdAtMs?: number }> = prev.filter(
            (o) => o.requestId !== cleanReqId
          );
          return sortOrdersNewestFirst([snapshotOrder, ...rest]);
        });
      }
      setDriverProfile((prev) =>
        prev ? { ...prev, online: true, available: false } : prev
      );

      // Separate non-blocking update for driver availability
      try {
        await updateDoc(driverRef, {
          available: false,
          updatedAt: serverTimestamp(),
        });
      } catch (drvErr) {
        console.warn('Non-blocking driver availability update failed after accepting order:', {
          orderId: cleanReqId,
          driverId: uid,
          error: drvErr,
        });
      }

      // Immediately fetch customer contact phone for the accepted active trip
      try {
        const contactSnap = await getDoc(doc(db, 'rideContacts', cleanReqId));
        if (contactSnap.exists()) {
          setActiveDriverCustomerPhone(String(contactSnap.data().customerPhone || ''));
        }
      } catch {
        // Ignored; useEffect also fetches rideContacts
      }
    } catch (error: any) {
      if (error?.message === 'REQUEST_NOT_FOUND') {
        setPendingCloudOrders((prev) => prev.filter((o) => o.requestId !== cleanReqId));
        setActionError('عذراً، لم يعد هذا الطلب موجوداً أو تم إلغاؤه.');
        return;
      }
      if (error?.message === 'ALREADY_ACCEPTED') {
        setPendingCloudOrders((prev) => prev.filter((o) => o.requestId !== cleanReqId));
        setActionError('عذراً، تم قبول هذا الطلب بواسطة كابتن آخر للتو.');
        return;
      }
      if (error?.message === 'NOT_REGISTERED_DRIVER') {
        setActionError('يجب تقديم طلب انضمام ككابتن أولاً قبل قبول الطلبات.');
        return;
      }
      if (error?.message === 'DRIVER_NOT_APPROVED') {
        setActionError('لا يمكنك قبول الطلبات قبل موافقة الإدارة على طلب انضمامك ككابتن.');
        return;
      }
      if (error?.message === 'DRIVER_OFFLINE') {
        setActionError('يجب تفعيل حالة "متصل (Online)" أولاً لقبول الطلبات.');
        return;
      }

      const failingStep = stepTracker.current;
      const errorCode = String(error?.code || 'unknown-error');
      console.error('acceptCloudRideRequest failed:', {
        orderId: cleanReqId,
        driverId: uid,
        failingStep,
        errorCode,
        error,
      });

      const isPermissionDenied =
        errorCode.includes('permission-denied') ||
        String(error?.message || '').includes('Missing or insufficient permissions');

      if (failingStep === 'تحديث الطلب' && isPermissionDenied) {
        setPendingCloudOrders((prev) => prev.filter((o) => o.requestId !== cleanReqId));
        setActionError(
          `الطلب ده ممكن يكون قديم، اعمل طلب جديد وجرّب\n(${errorCode} — ${failingStep})`
        );
      } else {
        setActionError(
          `تعذر قبول الطلب. قد يكون الطلب قد تم قبوله أو إلغاؤه للتو.\n(${errorCode} — ${failingStep})`
        );
      }
    }
  };

  const rejectCloudRideRequest = (requestId: string) => {
    if (!requestId) return;
    setRejectedRequestIds((prev) => (prev.includes(requestId) ? prev : [...prev, requestId]));
  };

  const updateCloudRideStatus = async (
    requestId: string,
    newStatus: 'on_the_way' | 'arrived' | 'completed'
  ) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !requestId) return;
    if (!isApprovedDriver) {
      setActionError('لا يمكنك تحديث حالة الرحلة لأن حساب الكابتن غير معتمد حالياً.');
      return;
    }
    setActionError(null);
    const uid = sanitizeId(activeUser.uid);
    const cleanReqId = sanitizeId(requestId);
    const reqRef = doc(db, 'rideRequests', cleanReqId);
    try {
      await updateDoc(reqRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Immediately reflect status transition in Captain & Customer state
      setMyDriverOrders((prev) =>
        prev.map((o) =>
          o.requestId === cleanReqId
            ? {
                ...o,
                status: newStatus,
                phone: newStatus === 'completed' ? '' : o.phone,
              }
            : o
        )
      );

      if (newStatus === 'completed') {
        setActiveDriverCustomerPhone('');
        const driverRef = doc(db, 'drivers', uid);
        const snap = await getDoc(driverRef);
        if (snap.exists()) {
          const existingData = snap.data() as Partial<DriverProfileDoc>;
          if (existingData.approvalStatus === 'approved') {
            const { locationLat, locationLng } = resolveBestDriverCoordinates(
              undefined,
              undefined,
              existingData.locationLat ?? driverProfile?.locationLat,
              existingData.locationLng ?? driverProfile?.locationLng,
              existingData.roleTitle ?? driverProfile?.roleTitle,
              existingData.plateNumber ?? driverProfile?.plateNumber
            );

            const payload = buildDriverWritePayload(
              uid,
              existingData as Record<string, any>,
              {
                approvalStatus: 'approved',
                online: true,
                available: true,
                locationLat,
                locationLng,
              }
            );
            await setDoc(driverRef, payload);
            setDriverProfile((prev) =>
              prev
                ? {
                    ...prev,
                    online: true,
                    available: true,
                    locationLat,
                    locationLng,
                  }
                : prev
            );
          }
        }
      }
    } catch (error) {
      setActionError('تعذر تحديث حالة المشوار. قد يكون العميل قد ألغى الطلب أو تغيرت حالته.');
      handleFirestoreError(error, OperationType.UPDATE, `rideRequests/${cleanReqId}`);
    }
  };

  /**
   * Assigned Captain Action: Sets or confirms the final ride fare (max 500 EGP).
   */
  const updateCloudFinalFare = async (requestId: string, finalFare: number) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !requestId) return;
    if (!isApprovedDriver) {
      setActionError('لا يمكنك تعديل الأجرة لأن حساب الكابتن غير معتمد حالياً.');
      return;
    }
    const cleanReqId = sanitizeId(requestId);
    const targetOrder =
      myDriverOrders.find((o) => o.requestId === cleanReqId) ||
      pendingCloudOrders.find((o) => o.requestId === cleanReqId);
    const isSameVillage = Boolean(
      targetOrder &&
      (targetOrder.sameVillageTier ||
       (targetOrder.pickupVillage &&
        targetOrder.dropoffVillage &&
        targetOrder.pickupVillage === targetOrder.dropoffVillage))
    );
    const maxAllowed = isSameVillage ? SAME_VILLAGE_MAX_FARE : 500;

    const cleanFare = Math.round(Number(finalFare));
    if (!Number.isFinite(cleanFare) || cleanFare < 0 || cleanFare > maxAllowed) {
      if (isSameVillage) {
        setActionError(`الحد الأقصى لأجرة المشوار الداخلي بالقرية هو ${SAME_VILLAGE_MAX_FARE} جنيه.`);
      } else {
        setActionError('قيمة الأجرة يجب أن تكون رقماً بين 0 و 500 جنيه.');
      }
      return;
    }
    setActionError(null);
    const reqRef = doc(db, 'rideRequests', cleanReqId);
    try {
      await updateDoc(reqRef, {
        finalFare: cleanFare,
        updatedAt: serverTimestamp(),
      });

      setMyDriverOrders((prev) =>
        prev.map((o) =>
          o.requestId === cleanReqId
            ? { ...o, finalFare: cleanFare }
            : o
        )
      );

      setImmediateCustomerOrder((prev) =>
        prev && prev.requestId === cleanReqId
          ? { ...prev, finalFare: cleanFare }
          : prev
      );
    } catch (error) {
      setActionError('تعذر تحديث الأجرة النهائية في قاعدة البيانات.');
      handleFirestoreError(error, OperationType.UPDATE, `rideRequests/${cleanReqId}`);
    }
  };

  /**
   * Admin Action A: Safely delete ONE ride request (`rideRequests/{requestId}`)
   * and its corresponding contact document (`rideContacts/{requestId}`) when it exists.
   * NEVER deletes `users/{uid}` or `drivers/{uid}`.
   */
  const deleteAdminRideRequest = async (requestId: string) => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser || !requestId) {
      const msg = 'غير مصرح بتنفيذ هذا الإجراء. هذه الصلاحية مخصصة لمدير النظام فقط.';
      setActionError(msg);
      throw new Error(msg);
    }
    setActionError(null);
    const cleanReqId = sanitizeId(requestId);
    const reqRef = doc(db, 'rideRequests', cleanReqId);
    const contactRef = doc(db, 'rideContacts', cleanReqId);

    try {
      const batch = writeBatch(db);
      batch.delete(reqRef);
      batch.delete(contactRef);
      await batch.commit();

      // Immediate local state update alongside real-time onSnapshot listener
      setAdminAllOrders((prev) => prev.filter((o) => o.requestId !== cleanReqId));
      setAdminRideContactsMap((prev) => {
        const next = { ...prev };
        delete next[cleanReqId];
        return next;
      });
    } catch (error: any) {
      const detail = error?.message || 'رفضت قاعدة البيانات حذف الطلب.';
      setActionError(`فشل حذف الطلب (${cleanReqId}): ${detail}`);
      handleFirestoreError(error, OperationType.DELETE, `rideRequests/${cleanReqId}`);
    }
  };

  /**
   * Admin Action B: Controlled bulk cleanup for old terminal ride requests ONLY (`completed`, `cancelled`, `rejected`).
   * Strictly NEVER deletes active or live rides (`pending`, `accepted`, `on_the_way`, `arrived`, `in_progress`).
   * Safely deletes matching `rideContacts/{requestId}` documents and NEVER touches `users/{uid}` or `drivers/{uid}`.
   */
  const cleanOldAdminRideRequests = async (): Promise<number> => {
    const activeUser = currentUser || auth.currentUser;
    if (!activeUser || !isAdminUser) {
      const msg = 'غير مصرح بتنفيذ تنظيف الطلبات. هذه الصلاحية مخصصة لمدير النظام فقط.';
      setActionError(msg);
      throw new Error(msg);
    }
    setActionError(null);

    const SAFE_CLEANUP_STATUSES = new Set(['completed', 'cancelled', 'rejected']);
    const cleanableOrders = adminAllOrders.filter(
      (o) => Boolean(o.requestId) && SAFE_CLEANUP_STATUSES.has(String(o.status || ''))
    );

    if (cleanableOrders.length === 0) {
      return 0;
    }

    const cleanReqIds = cleanableOrders
      .map((o) => sanitizeId(o.requestId || ''))
      .filter((id) => id.length > 0);

    try {
      // Each request deletes 2 docs (rideRequests + rideContacts); chunk by 200 (400 ops < 500 Firestore batch limit)
      const CHUNK_SIZE = 200;
      for (let i = 0; i < cleanReqIds.length; i += CHUNK_SIZE) {
        const slice = cleanReqIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const reqId of slice) {
          batch.delete(doc(db, 'rideRequests', reqId));
          batch.delete(doc(db, 'rideContacts', reqId));
        }
        await batch.commit();
      }

      const deletedSet = new Set(cleanReqIds);
      setAdminAllOrders((prev) => prev.filter((o) => !deletedSet.has(o.requestId || '')));
      setAdminRideContactsMap((prev) => {
        const next = { ...prev };
        for (const id of cleanReqIds) {
          delete next[id];
        }
        return next;
      });

      return cleanReqIds.length;
    } catch (error: any) {
      const detail = error?.message || 'رفضت قاعدة البيانات عملية تنظيف الطلبات القديمة.';
      setActionError(`فشل تنظيف الطلبات القديمة: ${detail}`);
      handleFirestoreError(error, OperationType.DELETE, 'rideRequests');
    }
  };

  // Only approved Captains and Admins receive pending broadcast orders
  const exposedPendingOrders = useMemo(() => {
    if (isApprovedDriver || isAdminUser) {
      return pendingCloudOrders;
    }
    return [];
  }, [isApprovedDriver, isAdminUser, pendingCloudOrders]);

  return (
    <FirebaseContext.Provider
      value={{
        currentUser,
        effectiveCustomerId,
        isAuthReady,
        isDriverProfileReady,
        isApprovedDriver,
        isAdminUser,
        activeRole,
        setActiveRole,
        userProfile,
        driverProfile,
        onlineDrivers,
        allDrivers,
        adminTotalUsersCount,
        adminDataReady,
        adminDataError,
        firestoreOrders,
        pendingCloudOrders: exposedPendingOrders,
        myDriverOrders,
        myCustomerOrders,
        activeCustomerOrder,
        setActiveCustomerOrder: setImmediateCustomerOrder,
        activeDriverOrder,
        rejectedRequestIds,
        pendingOrderDraft,
        setPendingOrderDraft,
        authIntent,
        setAuthIntent,
        authLoading,
        authError,
        actionError,
        clearActionError,
        loginWithGoogle,
        logout,
        saveUserProfile,
        saveDriverProfile,
        approveDriverProfile,
        rejectDriverProfile,
        suspendDriverProfile,
        reactivateDriverProfile,
        deleteAdminDriverProfile,
        unregisterDriverProfile,
        toggleDriverStatus,
        createCloudRideRequest,
        cancelCloudRideRequest,
        acceptCloudRideRequest,
        rejectCloudRideRequest,
        updateCloudRideStatus,
        updateCloudFinalFare,
        deleteAdminRideRequest,
        cleanOldAdminRideRequests,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return ctx;
}
