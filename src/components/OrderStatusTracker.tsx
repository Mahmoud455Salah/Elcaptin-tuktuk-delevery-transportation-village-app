import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Navigation,
  MapPin,
  RotateCcw,
  MessageCircle,
  Car,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import {
  OrderData,
  OFFICIAL_PHONE,
  OFFICIAL_WHATSAPP_NUMBER,
  getCustomerToDriverWhatsAppUrl,
  getCancelWhatsAppUrl,
  getDelayedPendingWhatsAppUrl,
  PENDING_FALLBACK_AFTER_MS,
  PENDING_EXPIRY_AFTER_MS,
} from '../utils/whatsapp';
import { isDriverOnlineAndAvailableNow, useFirebase } from '../context/FirebaseContext';
import { OrderChatBox } from './OrderChatBox';
import { getCategoryDisplay } from '../data/categories';
import { getSameVillageTierDisplay } from '../data/fares';

export type OrderStatusStep =
  | 'pending'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'completed'
  | 'cancelled';

interface OrderStatusTrackerProps {
  order: OrderData;
  onCancelOrder: () => Promise<void>;
  onNewOrder: () => void;
}

const STEPS: {
  id: OrderStatusStep;
  label: string;
  shortLabel: string;
  desc: string;
}[] = [
  {
    id: 'pending',
    label: 'جاري البحث عن كابتن',
    shortLabel: 'البحث',
    desc: 'تم إرسال طلبك للكباتن المتاحين في منطقتك',
  },
  {
    id: 'accepted',
    label: 'تم قبول الطلب',
    shortLabel: 'مقبول',
    desc: 'الكابتن قبل طلبك ويستعد للتحرك إليك',
  },
  {
    id: 'on_the_way',
    label: 'في الطريق',
    shortLabel: 'بالطريق',
    desc: 'الكابتن يتحرك الآن في الطريق لمكان الركوب',
  },
  {
    id: 'arrived',
    label: 'وصلت',
    shortLabel: 'وصلت',
    desc: 'الكابتن وصل لمكان الركوب وبانتظارك الآن',
  },
  {
    id: 'completed',
    label: 'تم التوصيل',
    shortLabel: 'تم التوصيل',
    desc: 'تم توصيل المشوار بنجاح، حمداً لله على سلامتك',
  },
];

export const OrderStatusTracker: React.FC<OrderStatusTrackerProps> = ({
  order,
  onCancelOrder,
  onNewOrder,
}) => {
  const { currentUser, effectiveCustomerId, onlineDrivers, actionError, clearActionError } =
    useFirebase();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    mountedAtRef.current = Date.now();
    setNowMs(Date.now());
  }, [order.requestId, order.orderNumber]);

  const status: OrderStatusStep = (order.status as OrderStatusStep) || 'pending';

  useEffect(() => {
    if (status !== 'pending') return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, order._createdAtMs]);

  const availableOnlineCaptains = onlineDrivers.filter((d) =>
    isDriverOnlineAndAvailableNow(d, nowMs)
  );

  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const isTerminal = isCompleted || isCancelled;
  const canCancel = status === 'pending' || status === 'accepted';

  const orderCreatedAtMs =
    typeof order._createdAtMs === 'number' &&
    Number.isFinite(order._createdAtMs) &&
    order._createdAtMs > 0
      ? order._createdAtMs
      : mountedAtRef.current;

  const elapsedPendingMs =
    status === 'pending' ? Math.max(0, nowMs - orderCreatedAtMs) : 0;
  const isExpiredPending =
    status === 'pending' && elapsedPendingMs >= PENDING_EXPIRY_AFTER_MS;
  const showPendingFallbackCard =
    status === 'pending' &&
    !isExpiredPending &&
    elapsedPendingMs >= PENDING_FALLBACK_AFTER_MS;

  const currentStepIndex = STEPS.findIndex((s) => s.id === status);
  const activeStep = STEPS[currentStepIndex] || STEPS[0];
  const captain = order.acceptedCaptain;

  const driverName = order.driverName || captain?.name || 'الكابتن';
  // Hide phone numbers after order is completed or cancelled
  const driverPhone = isTerminal ? '' : order.driverPhone || captain?.phone || '';
  const plateNumber = order.plateNumber || captain?.plateNumber || 'زقازيق';
  const dropoffNoteText = (order.dropoffNote ?? order.dropoffSpecific ?? '').trim();

  const handleConfirmCancel = async () => {
    clearActionError();
    setCancelling(true);
    try {
      await onCancelOrder();
    } catch {
      // Action error banner displayed via actionError
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  return (
    <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Status Banner */}
      <div
        className={`p-3.5 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isCancelled
            ? 'bg-red-700'
            : isCompleted
            ? 'bg-emerald-700'
            : 'bg-slate-900'
        }`}
      >
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center justify-between sm:justify-start gap-2 text-xs text-slate-300 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-white">
                طلب #{order.orderNumber || '----'}
              </span>
              <span>·</span>
              <span className="font-bold">
                {order.type === 'delivery' || order.serviceType === 'delivery'
                  ? '📦 توصيل طلبات'
                  : '🛺 مشوار ركاب'}
              </span>
            </div>

            {unreadChatCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] tabular-nums">
                رسائل غير مقروءة ({unreadChatCount})
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-black text-white leading-snug break-words">
                {isCancelled
                  ? 'تم إلغاء الطلب'
                  : isExpiredPending
                  ? 'انتهى وقت الطلب، اطلب تاني'
                  : activeStep.label}
              </h2>
              <p className="text-xs sm:text-sm font-bold text-amber-300 leading-relaxed break-words">
                {isCancelled
                  ? 'تم إلغاء هذا المشوار بناءً على طلبك.'
                  : isExpiredPending
                  ? 'مر أكثر من 20 دقيقة على الطلب دون قبول. يمكنك طلب المشوار مرة أخرى الآن.'
                  : activeStep.desc}
              </p>
            </div>

            {/* Mobile Fare Badge */}
            <div className="sm:hidden text-left shrink-0 bg-white/10 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] text-slate-200 block">
                {typeof order.finalFare === 'number'
                  ? 'الأجرة المؤكدة'
                  : 'الأجرة'}
              </span>
              {typeof order.finalFare === 'number' ? (
                <>
                  <span className="text-lg font-black font-mono tabular-nums text-emerald-300">
                    {order.finalFare}
                  </span>
                  <span className="text-[11px] font-bold text-white mr-0.5">ج.م</span>
                </>
              ) : typeof order.estimatedFare === 'number' && order.estimatedFare > 0 ? (
                <>
                  <span className="text-lg font-black font-mono tabular-nums text-amber-400">
                    {order.estimatedFare}
                  </span>
                  <span className="text-[11px] font-bold text-white mr-0.5">ج.م</span>
                </>
              ) : (
                <span className="text-xs font-bold text-amber-300">بالاتفاق</span>
              )}
            </div>
          </div>
        </div>

        {/* Desktop/Tablet Fare Badge */}
        <div className="hidden sm:block text-left shrink-0 bg-white/10 px-3.5 py-2 rounded-xl">
          <span className="text-[11px] text-slate-200 block">
            {typeof order.finalFare === 'number'
              ? 'الأجرة المؤكدة'
              : 'الأجرة'}
          </span>
          {typeof order.finalFare === 'number' ? (
            <>
              <span className="text-xl font-black font-mono tabular-nums text-emerald-300">
                {order.finalFare}
              </span>
              <span className="text-xs font-bold text-white mr-1">ج.م</span>
            </>
          ) : typeof order.estimatedFare === 'number' && order.estimatedFare > 0 ? (
            <>
              <span className="text-xl font-black font-mono tabular-nums text-amber-400">
                {order.estimatedFare}
              </span>
              <span className="text-xs font-bold text-white mr-1">ج.م</span>
            </>
          ) : (
            <span className="text-xs font-bold text-amber-300">بالاتفاق مع الكابتن</span>
          )}
        </div>
      </div>

      <div className="p-3.5 sm:p-5 space-y-4 sm:space-y-5 w-full min-w-0">
        {actionError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-center justify-between gap-2 break-words">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={clearActionError}
              className="text-red-700 hover:text-red-950 font-black px-2 py-0.5 rounded-lg cursor-pointer shrink-0"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Progress Steps */}
        {!isCancelled && !isExpiredPending && (
          <div className="grid grid-cols-5 gap-1 sm:gap-1.5 w-full">
            {STEPS.map((step, idx) => {
              const isDone = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div key={step.id} className="space-y-1.5 text-center min-w-0">
                  <div
                    className={`h-2 rounded-full transition-colors ${
                      isDone ? 'bg-amber-500' : 'bg-slate-200'
                    }`}
                  />
                  <span
                    className={`block text-[10px] sm:text-[11px] leading-tight truncate sm:whitespace-normal ${
                      isCurrent
                        ? 'font-black text-slate-950'
                        : isDone
                        ? 'font-bold text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="sm:hidden">{step.shortLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 1. CONTACT AFTER ACCEPTANCE CARD / PENDING STATUS / TIMEOUT FALLBACK */}
        {!isCancelled && (captain || order.driverId) ? (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/80 border-2 border-amber-400 space-y-3.5 w-full min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="space-y-1.5 min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-black text-slate-950 break-words leading-snug">
                  ✅ كابتن {driverName} قبل طلبك
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800">
                  <Car className="w-4 h-4 text-slate-900 shrink-0" />
                  <span>رقم اللوحة / المركبة:</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-amber-400 font-black break-words">
                    {plateNumber}
                  </span>
                </div>
              </div>

              {unreadChatCount > 0 && (
                <span className="px-2.5 py-1 rounded-xl bg-red-600 text-white font-black text-xs tabular-nums shrink-0">
                  {unreadChatCount} رسالة جديدة
                </span>
              )}
            </div>

            {/* Two Large Contact Buttons (Hidden after order is completed or cancelled) */}
            {!isTerminal && driverPhone && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <a
                  href={`tel:${driverPhone}`}
                  className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[50px] shadow-xs"
                >
                  <span>📞 اتصل بالكابتن</span>
                </a>

                <a
                  href={getCustomerToDriverWhatsAppUrl(
                    driverPhone,
                    order.orderNumber || '----'
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[50px] shadow-xs"
                >
                  <span>💬 واتساب الكابتن</span>
                </a>
              </div>
            )}
          </div>
        ) : !isCancelled && isExpiredPending ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-400 space-y-3.5 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black text-slate-950">
                انتهى وقت الطلب، اطلب تاني
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-relaxed">
                مر أكتر من ٢٠ دقيقة ومحدش قبل الطلب. تقدر تطلب مشوارك من تاني دلوقتي بضغطة واحدة.
              </p>
            </div>
            <button
              type="button"
              onClick={onNewOrder}
              className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[50px] shadow-xs"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>انتهى وقت الطلب، اطلب تاني</span>
            </button>
          </div>
        ) : !isCancelled ? (
          <div className="space-y-3.5">
            <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex items-start sm:items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs sm:text-sm min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-slate-900">
                      جاري البحث عن كابتن متاح...
                    </span>
                    <span className="text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-lg tabular-nums">
                      الكباتن المتاحون الآن: {availableOnlineCaptains.length}
                    </span>
                  </div>
                  <span className="text-slate-600 font-semibold block leading-relaxed">
                    ستظهر بيانات الكابتن وأزرار الاتصال والواتساب فور قبوله للطلب.
                  </span>
                </div>
              </div>

              {availableOnlineCaptains.length > 0 ? (
                <div className="pt-2.5 border-t border-amber-200/70 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    الكباتن المتصلون بالخدمة حالياً:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {availableOnlineCaptains.slice(0, 4).map((drv) => (
                      <div
                        key={drv.userId}
                        className="flex items-center justify-between gap-2 bg-white/90 border border-amber-200/80 rounded-lg px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Car className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 truncate">
                            {drv.displayName}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {drv.vehicleType} · {drv.plateNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2.5 border-t border-amber-200/70 space-y-2.5">
                  <p className="text-xs sm:text-sm font-black text-slate-900 leading-relaxed">
                    مفيش كباتن متصلين دلوقتي، ممكن تكلّم الكابتن مباشرة
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <a
                      href={`tel:${OFFICIAL_PHONE}`}
                      className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[46px] shadow-xs"
                    >
                      <span>📞 اتصل بالكابتن</span>
                    </a>

                    <a
                      href={`https://wa.me/${OFFICIAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(
                        `السلام عليكم يا كابتن، أنا صاحب الطلب رقم #${order.orderNumber || '----'}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[46px] shadow-xs"
                    >
                      <span>💬 واتساب</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* 3-Minute Pending Fallback Card */}
            {showPendingFallbackCard && (
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 space-y-3 w-full min-w-0">
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-black text-slate-950">
                    لسه ما حدش قبل طلبك؟
                  </h3>
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                    تقدر تكلم الكابتن مباشرة بالتليفون أو تبعتله تفاصيل طلبك على واتساب عشان يتحركلك فوراً:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href={`tel:${OFFICIAL_PHONE}`}
                    className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[48px] shadow-xs"
                  >
                    <Phone className="w-4 h-4 shrink-0 hidden" />
                    <span>📞 اتصل بالكابتن</span>
                  </a>

                  <a
                    href={getDelayedPendingWhatsAppUrl(order)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[48px] shadow-xs"
                  >
                    <span>💬 كلّم الكابتن على واتساب</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* 2. SIMPLE IN-APP CHAT (Only while order is "accepted" or "on_the_way") */}
        {(status === 'accepted' || status === 'on_the_way') &&
          order.requestId &&
          order.customerId &&
          order.driverId &&
          (currentUser?.uid || effectiveCustomerId) && (
            <OrderChatBox
              orderId={order.requestId}
              customerId={order.customerId}
              driverId={order.driverId}
              currentUserId={currentUser?.uid || effectiveCustomerId}
              senderRole="customer"
              orderStatus={status}
              onUnreadChange={setUnreadChatCount}
            />
          )}

        {/* Route Details Summary (Phone numbers hidden when completed or cancelled) */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs w-full min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 break-words space-y-0.5">
              <span className="text-slate-500 block">نقطة الركوب:</span>
              <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                {order.pickupVillage}
              </span>
              {order.pickupSpecific && (
                <span className="text-slate-700 font-semibold block">
                  ملاحظة مكان الركوب: {order.pickupSpecific}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200/70" />

          <div className="flex items-start gap-2 min-w-0">
            <Navigation className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 break-words space-y-0.5">
              <span className="text-slate-500 block">الوجهة (مكان النزول):</span>
              <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                {order.dropoffVillage}
              </span>
              {dropoffNoteText && (
                <span className="text-slate-700 font-semibold block">
                  ملاحظة مكان النزول: {dropoffNoteText}
                </span>
              )}
            </div>
          </div>

          {order.category && (
            <>
              <div className="border-t border-slate-200/70" />
              <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                <span className="text-slate-500 font-normal">نوع الطلب:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-950 font-black">
                  {getCategoryDisplay(order.category).fullDisplay || order.category}
                </span>
              </div>
            </>
          )}

          {order.sameVillageTier && (
            <>
              <div className="border-t border-slate-200/70" />
              <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                <span className="text-slate-500 font-normal">المسافة:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-950 font-black">
                  المسافة: {getSameVillageTierDisplay(order.sameVillageTier)?.fullDisplay}
                </span>
              </div>
            </>
          )}

          {order.notes && (
            <>
              <div className="border-t border-slate-200/70" />
              <div className="text-slate-700 break-words">
                <span className="text-slate-500">ملاحظات إضافية: </span>
                <span className="font-semibold">{order.notes}</span>
              </div>
            </>
          )}
        </div>

        {/* Bottom Actions: Cancel (when allowed) or Start New Order */}
        {canCancel && !confirmingCancel && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>إلغاء الطلب</span>
            </button>

            <button
              type="button"
              onClick={onNewOrder}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>طلب مشوار آخر</span>
            </button>
          </div>
        )}

        {confirmingCancel && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-3">
            <p className="text-xs font-bold text-red-900">
              هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancel}
                className="w-full sm:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] disabled:opacity-60"
              >
                {cancelling ? 'جاري الإلغاء...' : 'نعم، إلغاء الطلب'}
              </button>

              <a
                href={getCancelWhatsAppUrl(order.orderNumber || '----', order.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-3.5 py-2.5 bg-white border border-red-200 text-red-700 hover:bg-red-100 font-bold text-xs rounded-xl min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>إبلاغ عبر واتساب</span>
              </a>

              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="w-full sm:w-auto px-3.5 py-2.5 text-slate-700 hover:text-slate-950 font-bold text-xs rounded-xl hover:bg-red-100/50 cursor-pointer min-h-[44px]"
              >
                تراجع
              </button>
            </div>
          </div>
        )}

        {isTerminal && (
          <button
            type="button"
            onClick={onNewOrder}
            className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[50px]"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>طلب مشوار جديد</span>
          </button>
        )}
      </div>
    </div>
  );
};
