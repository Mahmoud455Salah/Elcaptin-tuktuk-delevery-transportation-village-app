import { getCategoryDisplay } from '../data/categories';
import { getSameVillageTierDisplay, SameVillageTier } from '../data/fares';

export const OFFICIAL_PHONE = '01123619900';
export const OFFICIAL_WHATSAPP_NUMBER = '201123619900';

export interface OrderLocationCoords {
  latitude: number;
  longitude: number;
}

export interface AcceptedCaptainInfo {
  id?: string;
  name: string;
  code: string;
  phone: string;
  plateNumber?: string;
  role?: string;
  etaMinutes?: number;
  acceptedAt?: string;
}

export interface OrderData {
  requestId?: string;
  customerId?: string;
  customerEmail?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  plateNumber?: string;
  orderNumber?: string;
  serviceType: 'ride' | 'delivery';
  type?: 'ride' | 'delivery';
  sameVillageTier?: SameVillageTier;
  name: string;
  phone: string;
  pickupVillage: string;
  pickupSpecific: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffVillage: string;
  dropoffSpecific: string;
  dropoffNote?: string;
  destinationLat?: number;
  destinationLng?: number;
  category?: string;
  distanceKm?: number;
  estimatedFare?: number;
  finalFare?: number;
  paymentMethod: 'cash' | 'vodafone_cash';
  notes: string;
  locationCoords?: OrderLocationCoords | null;
  destinationCoords?: OrderLocationCoords | null;
  createdAt?: string;
  updatedAt?: string;
  _createdAtMs?: number;
  status?: 'pending' | 'accepted' | 'on_the_way' | 'arrived' | 'completed' | 'cancelled' | string;
  acceptedCaptain?: AcceptedCaptainInfo | null;
}

export const PENDING_FALLBACK_AFTER_MS = 3 * 60 * 1000; // 3 minutes
export const PENDING_EXPIRY_AFTER_MS = 20 * 60 * 1000; // 20 minutes

export function isPendingOrderExpired(order: OrderData, nowMs: number = Date.now()): boolean {
  const status = order.status || 'pending';
  if (status !== 'pending') return false;
  if (typeof order._createdAtMs !== 'number' || !Number.isFinite(order._createdAtMs) || order._createdAtMs <= 0) {
    return false;
  }
  return nowMs - order._createdAtMs >= PENDING_EXPIRY_AFTER_MS;
}

export function getDelayedPendingWhatsAppUrl(order: OrderData): string {
  const orderNum = order.orderNumber || '----';
  const pickup = order.pickupVillage || 'غير محدد';
  const dropoff = order.dropoffVillage || 'غير محدد';
  const msg = `يا كابتن، أنا طالب من شوية ومحدش قبل طلبي لسه.\nرقم الطلب: #${orderNum}\nمن: ${pickup}\nإلى: ${dropoff}`;
  return `https://wa.me/${OFFICIAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

/**
 * Converts an Egyptian mobile number (e.g., 01xxxxxxxxx) to international WhatsApp format (201xxxxxxxxx).
 */
export function toEgyptianWhatsAppNumber(phone: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return OFFICIAL_WHATSAPP_NUMBER;
  if (digits.startsWith('0020')) {
    return digits.slice(2);
  }
  if (digits.startsWith('201')) {
    return digits;
  }
  if (digits.startsWith('01')) {
    return `2${digits}`;
  }
  if (digits.startsWith('1') && digits.length === 10) {
    return `20${digits}`;
  }
  return digits.startsWith('0') ? `2${digits}` : digits;
}

/**
 * Customer -> Driver WhatsApp link:
 * Egyptian number converted from 01xxxxxxxxx to 201xxxxxxxxx
 * Prefilled message: "أنا صاحب الطلب رقم [orderNumber]"
 */
export function getCustomerToDriverWhatsAppUrl(
  driverPhone: string,
  orderNumber: string
): string {
  const target = toEgyptianWhatsAppNumber(driverPhone);
  const msg = `أنا صاحب الطلب رقم ${orderNumber || '----'}`;
  return `https://wa.me/${target}?text=${encodeURIComponent(msg)}`;
}

/**
 * Driver -> Customer WhatsApp link:
 * Egyptian number converted from 01xxxxxxxxx to 201xxxxxxxxx
 * Prefilled message: "أنا كابتن [driverName]، جاي لحضرتك"
 */
export function getDriverToCustomerWhatsAppUrl(
  customerPhone: string,
  driverName: string
): string {
  const target = toEgyptianWhatsAppNumber(customerPhone);
  const msg = `أنا كابتن ${driverName || 'الكابتن'}، جاي لحضرتك`;
  return `https://wa.me/${target}?text=${encodeURIComponent(msg)}`;
}

export function formatWhatsAppMessage(order: OrderData): string {
  const resolvedType = order.type || (order.serviceType === 'delivery' ? 'delivery' : 'ride');
  const serviceLabel =
    resolvedType === 'delivery' ? 'توصيل طلبات' : 'مشوار ركاب بالتوكتوك';
  const paymentLabel =
    order.paymentMethod === 'vodafone_cash' ? 'فودافون كاش' : 'كاش نقداً';
  const dropoffNoteText = (order.dropoffNote ?? order.dropoffSpecific ?? '').trim();

  let msg = `السلام عليكم يا كابتن،\n`;
  msg += `طلب رقم #${order.orderNumber || '----'} من تطبيق الكابتن:\n\n`;
  msg += `• الخدمة: ${serviceLabel}\n`;
  if (order.category) {
    const catDisplay = getCategoryDisplay(order.category);
    msg += `• نوع الطلب: ${catDisplay.fullDisplay || order.category}\n`;
  }
  msg += `• الاسم: ${order.name}\n`;
  msg += `• رقم التليفون: ${order.phone}\n`;
  msg += `• مكان الركوب: ${order.pickupVillage || 'غير محدد'}${
    order.pickupSpecific ? ` - ${order.pickupSpecific}` : ''
  }\n`;

  if (order.locationCoords) {
    msg += `• الموقع على الخريطة: https://www.google.com/maps?q=${order.locationCoords.latitude},${order.locationCoords.longitude}\n`;
  }

  msg += `• الوجهة: ${order.dropoffVillage || 'غير محدد'}${
    dropoffNoteText ? ` - ${dropoffNoteText}` : ''
  }\n`;

  if (dropoffNoteText) {
    msg += `• ملاحظة مكان النزول: ${dropoffNoteText}\n`;
  }

  if (order.sameVillageTier) {
    const tierDisplay = getSameVillageTierDisplay(order.sameVillageTier);
    if (tierDisplay) {
      msg += `• المسافة: ${tierDisplay.fullDisplay}\n`;
    }
  }

  if (typeof order.finalFare === 'number' && order.finalFare > 0) {
    msg += `• الأجرة النهائية: ${order.finalFare} ج.م\n`;
  } else if (typeof order.estimatedFare === 'number' && order.estimatedFare > 0) {
    if (order.distanceKm !== undefined && order.distanceKm > 0) {
      msg += `• المسافة التقريبية: ${order.distanceKm} كم\n`;
    }
    msg += `• الأجرة التقريبية: ${order.estimatedFare} ج.م\n`;
  } else {
    msg += `• الأجرة: بالاتفاق مع الكابتن\n`;
  }

  msg += `• طريقة الدفع: ${paymentLabel}\n`;

  if (order.notes && order.notes.trim()) {
    msg += `• ملاحظات: ${order.notes.trim()}\n`;
  }

  return msg;
}

export function getWhatsAppUrl(order: OrderData): string {
  const message = formatWhatsAppMessage(order);
  return `https://wa.me/${OFFICIAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function getCancelWhatsAppUrl(orderNumber: string, name: string): string {
  const cancelMsg = `السلام عليكم يا كابتن، عايز ألغي الطلب رقم [${orderNumber}] باسم ${name}.`;
  return `https://wa.me/${OFFICIAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(cancelMsg)}`;
}

export function getCaptainAcceptanceWhatsAppUrl(
  order: OrderData,
  captain: AcceptedCaptainInfo
): string {
  return getDriverToCustomerWhatsAppUrl(order.phone, captain.name);
}
