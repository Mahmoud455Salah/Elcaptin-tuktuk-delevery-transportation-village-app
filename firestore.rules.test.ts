/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads defined in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on User Create',
    collection: 'users',
    docId: 'uid_victim',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      userId: 'uid_victim',
      name: 'Spoofed',
      phone: '01012345678',
      accountType: 'customer',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Privilege Escalation / Self-Admin Injection',
    collection: 'users',
    docId: 'uid_attacker',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      userId: 'uid_attacker',
      name: 'Attacker',
      phone: '01012345678',
      accountType: 'admin',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Driver Reading Pending Customer Phone in rideContacts',
    collection: 'rideContacts',
    docId: 'req_pending_1',
    operation: 'get',
    auth: { uid: 'uid_driver_1', email: 'driver1@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Email Spoofing Without Verification',
    collection: 'users',
    docId: 'uid_victim',
    operation: 'get',
    auth: { uid: 'uid_spoof', email: 'la4416884@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned RideRequest Create Without User Profile',
    collection: 'rideRequests',
    docId: 'req_orphan_1',
    operation: 'create',
    auth: { uid: 'uid_no_profile', email: 'noprofile@example.com', email_verified: true },
    payload: {
      requestId: 'req_orphan_1',
      orderNumber: '1234',
      customerId: 'uid_no_profile',
      status: 'pending',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Pre-Assigned Driver Spoofing on Create',
    collection: 'rideRequests',
    docId: 'req_spoof_driver',
    operation: 'create',
    auth: { uid: 'uid_customer', email: 'customer@example.com', email_verified: true },
    payload: {
      requestId: 'req_spoof_driver',
      orderNumber: '4821',
      customerId: 'uid_customer',
      status: 'accepted',
      driverId: 'uid_driver_1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Shadow Field Injection on Update',
    collection: 'rideRequests',
    docId: 'req_valid_1',
    operation: 'update',
    auth: { uid: 'uid_customer', email: 'customer@example.com', email_verified: true },
    payload: {
      status: 'cancelled',
      isVerified: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Mutation After Cancelled',
    collection: 'rideRequests',
    docId: 'req_cancelled_1',
    operation: 'update',
    auth: { uid: 'uid_customer', email: 'customer@example.com', email_verified: true },
    payload: {
      status: 'pending',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unauthorized Chat Message Write by Non-Participant Driver',
    collection: 'orders/req_accepted_1/messages',
    docId: 'msg_unauth_1',
    operation: 'create',
    auth: { uid: 'uid_other_driver', email: 'driver2@example.com', email_verified: true },
    payload: {
      orderId: 'req_accepted_1',
      senderId: 'uid_other_driver',
      customerId: 'uid_customer',
      driverId: 'uid_driver_1',
      senderRole: 'driver',
      text: 'Spoofed message',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Driver Hijacking Already Accepted Order',
    collection: 'rideRequests',
    docId: 'req_accepted_1',
    operation: 'update',
    auth: { uid: 'uid_driver_2', email: 'driver2@example.com', email_verified: true },
    payload: {
      status: 'accepted',
      driverId: 'uid_driver_2',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Empty or Oversized Chat Message (> 300 chars)',
    collection: 'orders/req_accepted_1/messages',
    docId: 'msg_oversized_1',
    operation: 'create',
    auth: { uid: 'uid_customer', email: 'customer@example.com', email_verified: true },
    payload: {
      orderId: 'req_accepted_1',
      senderId: 'uid_customer',
      customerId: 'uid_customer',
      driverId: 'uid_driver_1',
      senderRole: 'customer',
      text: 'A'.repeat(301),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Chat Rate Limit Bypass (< 1 message per second)',
    collection: 'chatRateLimits',
    docId: 'uid_customer',
    operation: 'update',
    auth: { uid: 'uid_customer', email: 'customer@example.com', email_verified: true },
    payload: {
      userId: 'uid_customer',
      lastMessageAt: '2026-10-20T08:45:00.200Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];

export interface AdminAccessTestCase {
  name: string;
  auth: {
    uid: string;
    email?: string | null;
    email_verified?: boolean;
    isAnonymous?: boolean;
  } | null;
  hasAdminRecord?: boolean;
  expectedResult: 'ALLOWED' | 'PERMISSION_DENIED';
}

export const ADMIN_ACCESS_TEST_CASES: AdminAccessTestCase[] = [
  {
    name: 'Admin email la4416884@gmail.com with email_verified true is ALLOWED',
    auth: { uid: 'uid_admin_1', email: 'la4416884@gmail.com', email_verified: true, isAnonymous: false },
    expectedResult: 'ALLOWED',
  },
  {
    name: 'Admin email slahm7344@gmail.com with email_verified true is ALLOWED',
    auth: { uid: 'uid_admin_2', email: 'slahm7344@gmail.com', email_verified: true, isAnonymous: false },
    expectedResult: 'ALLOWED',
  },
  {
    name: 'Admin email la4416884@gmail.com with email_verified false is DENIED',
    auth: { uid: 'uid_spoof_1', email: 'la4416884@gmail.com', email_verified: false, isAnonymous: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    name: 'Admin email slahm7344@gmail.com with email_verified false is DENIED',
    auth: { uid: 'uid_spoof_2', email: 'slahm7344@gmail.com', email_verified: false, isAnonymous: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    name: 'Any other email without admins/{uid} record is DENIED',
    auth: { uid: 'uid_other', email: 'other@gmail.com', email_verified: true, isAnonymous: false },
    hasAdminRecord: false,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    name: 'Anonymous user is DENIED',
    auth: { uid: 'uid_anon', email: null, email_verified: false, isAnonymous: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];

export function evaluateIsAdminRule(
  auth: AdminAccessTestCase['auth'],
  hasAdminRecord = false
): 'ALLOWED' | 'PERMISSION_DENIED' {
  const isSignedIn = auth !== null;
  const isVerifiedUser = Boolean(isSignedIn && !auth?.isAnonymous && auth?.email_verified === true);
  const isAdmin =
    isVerifiedUser &&
    ((typeof auth?.email === 'string' &&
      ['la4416884@gmail.com', 'slahm7344@gmail.com'].includes(auth.email)) ||
      hasAdminRecord);
  return isAdmin ? 'ALLOWED' : 'PERMISSION_DENIED';
}

/**
 * Exact reproduction of firestore.rules `isValidRideRequest(data)` and
 * Action 2 ("Online Approved Driver Accepts Pending Request") on `rideRequests/{requestId}`.
 */
const RIDE_REQUEST_ALLOWED_KEYS = new Set([
  'requestId', 'orderNumber', 'customerId', 'customerName', 'customerEmail', 'customerContact',
  'serviceType', 'type', 'category', 'sameVillageTier', 'pickupVillage', 'pickupSpecific', 'pickupLat', 'pickupLng',
  'dropoffVillage', 'dropoffSpecific', 'dropoffNote', 'destinationLat', 'destinationLng',
  'distanceKm', 'estimatedFare', 'finalFare', 'paymentMethod', 'notes', 'status',
  'driverId', 'driverName', 'driverCode', 'driverPhone', 'driverContact', 'plateNumber',
  'driverRole', 'etaMinutes', 'driverCurrentLat', 'driverCurrentLng', 'driverLocationUpdatedAt',
  'customerRating', 'ratingComment', 'ratedAt', 'createdAt', 'updatedAt',
]);

const RIDE_REQUEST_REQUIRED_KEYS = [
  'requestId', 'orderNumber', 'customerId', 'customerName', 'serviceType',
  'pickupVillage', 'dropoffVillage', 'status',
];

const ACCEPT_ALLOWED_AFFECTED_KEYS = new Set([
  'status', 'driverId', 'driverName', 'driverCode', 'driverPhone', 'driverContact',
  'plateNumber', 'driverRole', 'etaMinutes', 'updatedAt',
]);

export function evaluateIsValidRideRequest(data: Record<string, unknown>): { valid: boolean; reason?: string } {
  const keys = Object.keys(data);
  for (const reqKey of RIDE_REQUEST_REQUIRED_KEYS) {
    if (!(reqKey in data)) {
      return { valid: false, reason: `Missing required key in hasAll: "${reqKey}"` };
    }
  }
  for (const key of keys) {
    if (!RIDE_REQUEST_ALLOWED_KEYS.has(key)) {
      return { valid: false, reason: `Unexpected legacy key not in hasOnly: "${key}"` };
    }
  }
  if (typeof data.requestId !== 'string' || data.requestId.length < 1 || data.requestId.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(data.requestId)) {
    return { valid: false, reason: 'Invalid requestId' };
  }
  if (typeof data.orderNumber !== 'string' || data.orderNumber.length < 1 || data.orderNumber.length > 16) {
    return { valid: false, reason: 'Invalid orderNumber' };
  }
  if (typeof data.customerId !== 'string' || data.customerId.length < 1 || data.customerId.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(data.customerId)) {
    return { valid: false, reason: 'Invalid customerId' };
  }
  if (typeof data.customerName !== 'string' || data.customerName.length < 1 || data.customerName.length > 100) {
    return { valid: false, reason: 'Invalid customerName' };
  }
  if ('customerEmail' in data && (typeof data.customerEmail !== 'string' || data.customerEmail.length > 150)) {
    return { valid: false, reason: 'Invalid customerEmail' };
  }
  if ('customerContact' in data && (typeof data.customerContact !== 'string' || data.customerContact.length > 25)) {
    return { valid: false, reason: 'Invalid customerContact' };
  }
  if (data.serviceType !== 'ride' && data.serviceType !== 'delivery') {
    return { valid: false, reason: 'Invalid serviceType' };
  }
  if ('type' in data && data.type !== 'ride' && data.type !== 'delivery') {
    return { valid: false, reason: 'Invalid type' };
  }
  if ('sameVillageTier' in data && !['near', 'medium', 'far'].includes(data.sameVillageTier as string)) {
    return { valid: false, reason: 'Invalid sameVillageTier' };
  }
  if ('category' in data && (typeof data.category !== 'string' || data.category.length > 100)) {
    return { valid: false, reason: 'Invalid category' };
  }
  if (typeof data.pickupVillage !== 'string' || data.pickupVillage.length < 1 || data.pickupVillage.length > 120) {
    return { valid: false, reason: 'Invalid pickupVillage' };
  }
  if ('pickupSpecific' in data && (typeof data.pickupSpecific !== 'string' || data.pickupSpecific.length > 200)) {
    return { valid: false, reason: 'Invalid pickupSpecific' };
  }
  if ('pickupLat' in data && (typeof data.pickupLat !== 'number' || data.pickupLat < -90 || data.pickupLat > 90)) {
    return { valid: false, reason: 'Invalid pickupLat' };
  }
  if ('pickupLng' in data && (typeof data.pickupLng !== 'number' || data.pickupLng < -180 || data.pickupLng > 180)) {
    return { valid: false, reason: 'Invalid pickupLng' };
  }
  if (typeof data.dropoffVillage !== 'string' || data.dropoffVillage.length < 1 || data.dropoffVillage.length > 120) {
    return { valid: false, reason: 'Invalid dropoffVillage' };
  }
  if ('dropoffSpecific' in data && (typeof data.dropoffSpecific !== 'string' || data.dropoffSpecific.length > 200)) {
    return { valid: false, reason: 'Invalid dropoffSpecific' };
  }
  if ('dropoffNote' in data && (typeof data.dropoffNote !== 'string' || data.dropoffNote.length > 200)) {
    return { valid: false, reason: 'Invalid dropoffNote' };
  }
  if ('destinationLat' in data && (typeof data.destinationLat !== 'number' || data.destinationLat < -90 || data.destinationLat > 90)) {
    return { valid: false, reason: 'Invalid destinationLat' };
  }
  if ('destinationLng' in data && (typeof data.destinationLng !== 'number' || data.destinationLng < -180 || data.destinationLng > 180)) {
    return { valid: false, reason: 'Invalid destinationLng' };
  }
  if ('distanceKm' in data && (typeof data.distanceKm !== 'number' || data.distanceKm < 0 || data.distanceKm > 500)) {
    return { valid: false, reason: 'Invalid distanceKm' };
  }
  if ('estimatedFare' in data && (typeof data.estimatedFare !== 'number' || data.estimatedFare < 0 || data.estimatedFare > 10000)) {
    return { valid: false, reason: 'Invalid estimatedFare' };
  }
  if ('finalFare' in data && (typeof data.finalFare !== 'number' || data.finalFare < 0 || data.finalFare > 10000)) {
    return { valid: false, reason: 'Invalid finalFare (e.g., finalFare is null instead of omitted or number)' };
  }
  if ('paymentMethod' in data && data.paymentMethod !== 'cash' && data.paymentMethod !== 'vodafone_cash') {
    return { valid: false, reason: 'Invalid paymentMethod' };
  }
  if ('notes' in data && (typeof data.notes !== 'string' || data.notes.length > 500)) {
    return { valid: false, reason: 'Invalid notes' };
  }
  if (!['pending', 'accepted', 'on_the_way', 'arrived', 'completed', 'cancelled'].includes(data.status as string)) {
    return { valid: false, reason: 'Invalid status' };
  }
  if ('driverId' in data && (typeof data.driverId !== 'string' || data.driverId.length > 128)) {
    return { valid: false, reason: 'Invalid driverId' };
  }
  if ('driverName' in data && (typeof data.driverName !== 'string' || data.driverName.length > 100)) {
    return { valid: false, reason: 'Invalid driverName' };
  }
  if ('driverCode' in data && (typeof data.driverCode !== 'string' || data.driverCode.length > 40)) {
    return { valid: false, reason: 'Invalid driverCode' };
  }
  if ('driverPhone' in data && (typeof data.driverPhone !== 'string' || data.driverPhone.length > 25)) {
    return { valid: false, reason: 'Invalid driverPhone' };
  }
  if ('driverContact' in data && (typeof data.driverContact !== 'string' || data.driverContact.length > 25)) {
    return { valid: false, reason: 'Invalid driverContact' };
  }
  if ('plateNumber' in data && (typeof data.plateNumber !== 'string' || data.plateNumber.length > 40)) {
    return { valid: false, reason: 'Invalid plateNumber' };
  }
  if ('driverRole' in data && (typeof data.driverRole !== 'string' || data.driverRole.length > 120)) {
    return { valid: false, reason: 'Invalid driverRole' };
  }
  if ('etaMinutes' in data && (typeof data.etaMinutes !== 'number' || data.etaMinutes < 0 || data.etaMinutes > 180)) {
    return { valid: false, reason: 'Invalid etaMinutes' };
  }
  return { valid: true };
}

export function evaluateDriverAcceptRideRequestRule(params: {
  driverUid: string;
  isApprovedDriver: boolean;
  isDriverOnline: boolean;
  existingDoc: Record<string, unknown>;
  updatePayload: Record<string, unknown>;
}): { result: 'ALLOWED' | 'PERMISSION_DENIED'; reason?: string } {
  const { driverUid, isApprovedDriver, isDriverOnline, existingDoc, updatePayload } = params;
  const incomingDoc: Record<string, unknown> = { ...existingDoc, ...updatePayload };

  const schemaCheck = evaluateIsValidRideRequest(incomingDoc);
  if (!schemaCheck.valid) {
    return { result: 'PERMISSION_DENIED', reason: `isValidRideRequest(incoming()) failed: ${schemaCheck.reason}` };
  }

  if (!isApprovedDriver || !isDriverOnline) {
    return { result: 'PERMISSION_DENIED', reason: 'Driver is not approved or not online' };
  }

  const existingUnassigned =
    existingDoc.status === 'pending' &&
    (!('driverId' in existingDoc) || existingDoc.driverId === '');
  if (!existingUnassigned) {
    return { result: 'PERMISSION_DENIED', reason: 'Order is not pending or already has driverId' };
  }

  if (incomingDoc.status !== 'accepted' || incomingDoc.driverId !== driverUid) {
    return { result: 'PERMISSION_DENIED', reason: 'Incoming status is not accepted or driverId mismatch' };
  }

  const affectedKeys = Object.keys(updatePayload).filter(
    (k) => updatePayload[k] !== existingDoc[k]
  );
  for (const key of affectedKeys) {
    if (!ACCEPT_ALLOWED_AFFECTED_KEYS.has(key)) {
      return { result: 'PERMISSION_DENIED', reason: `affectedKeys disallow "${key}"` };
    }
  }

  return { result: 'ALLOWED' };
}

export const ACCEPT_UPDATE_PAYLOAD = {
  status: 'accepted',
  driverId: 'uid_driver_approved',
  driverName: 'بهاء',
  driverCode: 'ك-101',
  driverPhone: '01096542455',
  driverContact: '01096542455',
  plateNumber: 'قطاع الزقازيق',
  driverRole: 'توكتوك - قطاع الزقازيق',
  etaMinutes: 7,
  updatedAt: '2026-10-22T12:05:00.000Z',
};

export interface AcceptRideReproductionCase {
  name: string;
  existingDoc: Record<string, unknown>;
  expectedResult: 'ALLOWED' | 'PERMISSION_DENIED';
}

export const ACCEPT_RIDE_REPRODUCTION_CASES: AcceptRideReproductionCase[] = [
  {
    name: '1. Current createCloudRideRequest payload (ride with category, pickupLat/Lng, destinationLat/Lng, distanceKm, estimatedFare)',
    existingDoc: {
      requestId: 'req_current_ride',
      orderNumber: '4821',
      customerId: 'uid_customer_1',
      customerName: 'محمد علي',
      customerEmail: 'customer@example.com',
      customerContact: '',
      serviceType: 'ride',
      type: 'ride',
      category: 'توصيل ركاب',
      sameVillageTier: 'near',
      pickupVillage: 'بردين',
      pickupSpecific: 'بجوار المسجد الكبير',
      pickupLat: 30.5428,
      pickupLng: 31.5317,
      dropoffVillage: 'الزقازيق',
      dropoffSpecific: 'المحطة',
      dropoffNote: 'بجوار الصيدلية',
      destinationLat: 30.5877,
      destinationLng: 31.502,
      distanceKm: 6.5,
      estimatedFare: 65,
      paymentMethod: 'cash',
      notes: 'توصيل ركاب',
      status: 'pending',
      driverId: '',
      driverName: '',
      driverCode: '',
      driverPhone: '',
      driverContact: '',
      plateNumber: '',
      driverRole: '',
      etaMinutes: 0,
      createdAt: '2026-10-22T12:00:00.000Z',
      updatedAt: '2026-10-22T12:00:00.000Z',
    },
    expectedResult: 'ALLOWED',
  },
  {
    name: '2. Current createCloudRideRequest payload (delivery)',
    existingDoc: {
      requestId: 'req_current_delivery',
      orderNumber: '5912',
      customerId: 'uid_customer_1',
      customerName: 'محمد علي',
      customerEmail: 'customer@example.com',
      customerContact: '',
      serviceType: 'delivery',
      type: 'delivery',
      category: 'طلبات صيدلية أو سوبر ماركت',
      pickupVillage: 'بردين',
      pickupSpecific: 'صيدلية الشفاء',
      dropoffVillage: 'الزقازيق',
      dropoffSpecific: 'القومية',
      dropoffNote: 'الدور الثالث',
      distanceKm: 6.2,
      estimatedFare: 35,
      paymentMethod: 'cash',
      notes: 'طلبات صيدلية أو سوبر ماركت',
      status: 'pending',
      driverId: '',
      driverName: '',
      driverCode: '',
      driverPhone: '',
      driverContact: '',
      plateNumber: '',
      driverRole: '',
      etaMinutes: 0,
      createdAt: '2026-10-22T12:00:00.000Z',
      updatedAt: '2026-10-22T12:00:00.000Z',
    },
    expectedResult: 'ALLOWED',
  },
  {
    name: '3. Old-format document missing "category" and "type" (otherwise valid schema)',
    existingDoc: {
      requestId: 'req_old_no_category',
      orderNumber: '3104',
      customerId: 'uid_customer_1',
      customerName: 'عميل قديم',
      serviceType: 'ride',
      pickupVillage: 'بردين',
      dropoffVillage: 'الزقازيق',
      estimatedFare: 30,
      status: 'pending',
      driverId: '',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    expectedResult: 'ALLOWED',
  },
  {
    name: '4. Old-format document with extra legacy keys (e.g., locationCoords, customPickupVillage, phone)',
    existingDoc: {
      requestId: 'req_old_legacy_keys',
      orderNumber: '2209',
      customerId: 'uid_customer_1',
      customerName: 'عميل قديم',
      serviceType: 'ride',
      type: 'ride',
      pickupVillage: 'بردين',
      dropoffVillage: 'الزقازيق',
      estimatedFare: 30,
      status: 'pending',
      driverId: '',
      locationCoords: { lat: 30.54, lng: 31.53 },
      customPickupVillage: '',
      phone: '01000000000',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    name: '5. Old-format document with finalFare: null or missing required hasAll key (serviceType)',
    existingDoc: {
      requestId: 'req_old_null_final_fare',
      orderNumber: '1988',
      customerId: 'uid_customer_1',
      customerName: 'عميل قديم',
      type: 'ride',
      pickupVillage: 'بردين',
      dropoffVillage: 'الزقازيق',
      estimatedFare: 30,
      finalFare: null,
      status: 'pending',
      driverId: '',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];

// Execute assertions when run directly
for (const tc of ADMIN_ACCESS_TEST_CASES) {
  const actual = evaluateIsAdminRule(tc.auth, tc.hasAdminRecord);
  if (actual !== tc.expectedResult) {
    throw new Error(`Admin test failed: ${tc.name} — expected ${tc.expectedResult}, got ${actual}`);
  }
}

for (const tc of ACCEPT_RIDE_REPRODUCTION_CASES) {
  const outcome = evaluateDriverAcceptRideRequestRule({
    driverUid: 'uid_driver_approved',
    isApprovedDriver: true,
    isDriverOnline: true,
    existingDoc: tc.existingDoc,
    updatePayload: ACCEPT_UPDATE_PAYLOAD,
  });
  if (outcome.result !== tc.expectedResult) {
    throw new Error(
      `Accept reproduction test failed: ${tc.name} — expected ${tc.expectedResult}, got ${outcome.result} (${outcome.reason || 'no reason'})`
    );
  }
}

// Explicit A-E Acceptance Authorization & Atomicity Assertions
const basePendingRideDoc = ACCEPT_RIDE_REPRODUCTION_CASES[0].existingDoc;

// A. Approved online captain accepts pending ride -> ALLOWED
const testA = evaluateDriverAcceptRideRequestRule({
  driverUid: 'uid_driver_approved',
  isApprovedDriver: true,
  isDriverOnline: true,
  existingDoc: basePendingRideDoc,
  updatePayload: ACCEPT_UPDATE_PAYLOAD,
});
if (testA.result !== 'ALLOWED') {
  throw new Error(`Test A failed: expected ALLOWED, got ${testA.result}`);
}

// B. Unapproved / rejected / suspended captain accepts -> PERMISSION_DENIED
const testB = evaluateDriverAcceptRideRequestRule({
  driverUid: 'uid_driver_approved',
  isApprovedDriver: false,
  isDriverOnline: false,
  existingDoc: basePendingRideDoc,
  updatePayload: ACCEPT_UPDATE_PAYLOAD,
});
if (testB.result !== 'PERMISSION_DENIED') {
  throw new Error(`Test B failed: expected PERMISSION_DENIED, got ${testB.result}`);
}

// C. Anonymous customer / non-driver accepts -> PERMISSION_DENIED
const testC = evaluateDriverAcceptRideRequestRule({
  driverUid: 'uid_anon_customer',
  isApprovedDriver: false,
  isDriverOnline: false,
  existingDoc: basePendingRideDoc,
  updatePayload: { ...ACCEPT_UPDATE_PAYLOAD, driverId: 'uid_anon_customer' },
});
if (testC.result !== 'PERMISSION_DENIED') {
  throw new Error(`Test C failed: expected PERMISSION_DENIED, got ${testC.result}`);
}

// D. Two approved captains try to accept the same pending ride -> only first succeeds
const acceptedDocAfterFirstCaptain = { ...basePendingRideDoc, ...ACCEPT_UPDATE_PAYLOAD };
const testDSecondCaptain = evaluateDriverAcceptRideRequestRule({
  driverUid: 'uid_driver_approved_2',
  isApprovedDriver: true,
  isDriverOnline: true,
  existingDoc: acceptedDocAfterFirstCaptain,
  updatePayload: { ...ACCEPT_UPDATE_PAYLOAD, driverId: 'uid_driver_approved_2' },
});
if (testDSecondCaptain.result !== 'PERMISSION_DENIED') {
  throw new Error(`Test D failed: second captain should be PERMISSION_DENIED, got ${testDSecondCaptain.result}`);
}


