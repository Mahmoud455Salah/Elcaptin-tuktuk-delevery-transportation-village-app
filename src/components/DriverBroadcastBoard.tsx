import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  CheckCircle2,
  X,
  Power,
  Settings,
  LogIn,
  AlertCircle,
  Clock,
  Car,
  Phone,
  ArrowRight,
  Loader2,
  ShieldAlert,
  Edit3,
  Bell,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import {
  getDriverToCustomerWhatsAppUrl,
  isPendingOrderExpired,
  OFFICIAL_PHONE,
} from '../utils/whatsapp';
import { OrderChatBox } from './OrderChatBox';
import { getCategoryDisplay } from '../data/categories';
import { getSameVillageTierDisplay } from '../data/fares';
import {
  enableDriverSoundAlerts,
  isDriverSoundEnabled,
  playNewOrderAlertTone,
  subscribeDriverSoundEnabled,
  triggerDeviceVibration,
} from '../utils/soundAlert';

const DEFAULT_DOCUMENT_TITLE = 'الكابتن | اطلب توكتوك بسهولة وسرعة';
const NEW_ORDER_ALERT_TITLE = '🔔 طلب جديد';

// Track acknowledged and previously-seen order IDs across role switches within the session
const sessionAcknowledgedOrderIds = new Set<string>();
let sessionInitialBaselineIds: Set<string> | null = null;

interface DriverBroadcastBoardProps {
  onOpenProfileModal: () => void;
}

export const DriverBroadcastBoard: React.FC<DriverBroadcastBoardProps> = ({
  onOpenProfileModal,
}) => {
  const {
    currentUser,
    isDriverProfileReady,
    isApprovedDriver,
    driverProfile,
    pendingCloudOrders,
    activeDriverOrder,
    myDriverOrders,
    rejectedRequestIds,
    authLoading,
    actionError,
    clearActionError,
    loginWithGoogle,
    saveDriverProfile,
    toggleDriverStatus,
    acceptCloudRideRequest,
    rejectCloudRideRequest,
    updateCloudRideStatus,
    updateCloudFinalFare,
    setActiveRole,
  } = useFirebase();

  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isDriverSoundEnabled());
  const [alertingOrderIds, setAlertingOrderIds] = useState<string[]>([]);
  const knownPendingIdsRef = useRef<Set<string> | null>(null);

  // Explicit Captain Join Application Form State (strictly separated from Customer users/{uid} data)
  const [showRegistrationForm, setShowRegistrationForm] = useState<boolean>(false);
  const [regDisplayName, setRegDisplayName] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regCaptainCode, setRegCaptainCode] = useState<string>('ك-101');
  const [regVehicleType, setRegVehicleType] = useState<string>('توكتوك');
  const [regVehicleModel, setRegVehicleModel] = useState<string>('باجاج حديث');
  const [regPlateNumber, setRegPlateNumber] = useState<string>('قطاع الزقازيق');
  const [regError, setRegError] = useState<string | null>(null);
  const [regSubmitting, setRegSubmitting] = useState<boolean>(false);
  const [regSubmittedBanner, setRegSubmittedBanner] = useState<boolean>(false);
  const [captainOrderTab, setCaptainOrderTab] = useState<'rides' | 'deliveries'>('rides');
  const [editingFareValue, setEditingFareValue] = useState<string>('');
  const [fareUpdating, setFareUpdating] = useState<boolean>(false);
  const [fareUpdateSuccess, setFareUpdateSuccess] = useState<boolean>(false);

  // Subscribe to sound enablement state
  useEffect(() => {
    return subscribeDriverSoundEnabled((enabled) => {
      setSoundEnabled(enabled);
    });
  }, []);

  // Periodic clock tick so pending orders older than 20 minutes expire client-side automatically
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Pre-fill form ONLY when editing an existing pending/rejected/approved driver application (drivers/{uid}).
  // NEVER copy or pre-fill from customer profile (users/{uid}) or Google displayName.
  useEffect(() => {
    if (driverProfile) {
      setRegDisplayName(driverProfile.displayName || '');
      setRegPhone(
        driverProfile.contactPhone && driverProfile.contactPhone !== OFFICIAL_PHONE
          ? driverProfile.contactPhone
          : ''
      );
      setRegCaptainCode(driverProfile.captainCode || 'ك-101');
      setRegVehicleType(driverProfile.vehicleType || 'توكتوك');
      setRegVehicleModel(driverProfile.vehicleModel || 'باجاج حديث');
      setRegPlateNumber(driverProfile.plateNumber || 'قطاع الزقازيق');
    } else {
      setRegDisplayName('');
      setRegPhone('');
      setRegCaptainCode('ك-101');
      setRegVehicleType('توكتوك');
      setRegVehicleModel('باجاج حديث');
      setRegPlateNumber('قطاع الزقازيق');
    }
  }, [driverProfile]);

  useEffect(() => {
    if (activeDriverOrder) {
      if (typeof activeDriverOrder.finalFare === 'number') {
        setEditingFareValue(String(activeDriverOrder.finalFare));
      } else if (
        typeof activeDriverOrder.estimatedFare === 'number' &&
        activeDriverOrder.estimatedFare > 0
      ) {
        setEditingFareValue(String(activeDriverOrder.estimatedFare));
      } else {
        setEditingFareValue('');
      }
    }
  }, [
    activeDriverOrder?.requestId,
    activeDriverOrder?.finalFare,
    activeDriverOrder?.estimatedFare,
  ]);

  const isDriverApprovedAndOnline = Boolean(
    isApprovedDriver && driverProfile && driverProfile.approvalStatus === 'approved' && driverProfile.online
  );

  // Filter out rejected orders AND orders pending for >= 20 minutes (client-side filter by createdAt)
  const visiblePendingOrders = pendingCloudOrders.filter(
    (o) =>
      !rejectedRequestIds.includes(o.requestId || o.orderNumber || '') &&
      !isPendingOrderExpired(o, nowMs)
  );

  const acknowledgeOrderAlert = (reqKey?: string) => {
    if (reqKey) {
      sessionAcknowledgedOrderIds.add(reqKey);
      setAlertingOrderIds((prev) => prev.filter((id) => id !== reqKey));
    } else {
      visiblePendingOrders.forEach((o) => {
        const k = o.requestId || o.orderNumber || '';
        if (k) sessionAcknowledgedOrderIds.add(k);
      });
      setAlertingOrderIds([]);
    }
  };

  // Detect new pending orders arriving while the driver is online
  useEffect(() => {
    const currentVisibleKeys = new Set(
      visiblePendingOrders.map((o) => o.requestId || o.orderNumber || '').filter(Boolean)
    );

    if (!isDriverApprovedAndOnline) {
      knownPendingIdsRef.current = currentVisibleKeys;
      setAlertingOrderIds([]);
      return;
    }

    if (knownPendingIdsRef.current === null) {
      knownPendingIdsRef.current = new Set(currentVisibleKeys);
      if (sessionInitialBaselineIds === null) {
        sessionInitialBaselineIds = new Set(currentVisibleKeys);
      }
      const baselineIds = sessionInitialBaselineIds;
      // Also alert for any brand-new order (< 60s old) that arrived just before switching to the driver board
      const freshOrderIds: string[] = [];
      visiblePendingOrders.forEach((o) => {
        const key = o.requestId || o.orderNumber || '';
        if (!key || sessionAcknowledgedOrderIds.has(key)) return;
        const isBrandNew =
          typeof o._createdAtMs === 'number' &&
          o._createdAtMs > 0 &&
          Date.now() - o._createdAtMs < 60_000;
        const arrivedAfterSessionStart = !baselineIds.has(key);
        if (isBrandNew || arrivedAfterSessionStart) {
          freshOrderIds.push(key);
        }
      });
      if (freshOrderIds.length > 0) {
        setAlertingOrderIds((prev) => Array.from(new Set([...prev, ...freshOrderIds])));
      }
      return;
    }

    const newlyArrivedIds: string[] = [];
    currentVisibleKeys.forEach((key) => {
      if (!knownPendingIdsRef.current!.has(key) && !sessionAcknowledgedOrderIds.has(key)) {
        newlyArrivedIds.push(key);
      }
    });

    knownPendingIdsRef.current = currentVisibleKeys;

    setAlertingOrderIds((prev) => {
      const stillPending = prev.filter(
        (id) => currentVisibleKeys.has(id) && !sessionAcknowledgedOrderIds.has(id)
      );
      if (newlyArrivedIds.length === 0 && stillPending.length === prev.length) {
        return prev;
      }
      return Array.from(new Set([...stillPending, ...newlyArrivedIds]));
    });
  }, [isDriverApprovedAndOnline, visiblePendingOrders]);

  const activeAlertOrders = visiblePendingOrders.filter((o) =>
    alertingOrderIds.includes(o.requestId || o.orderNumber || '')
  );
  const hasActiveNewOrderAlert = isDriverApprovedAndOnline && activeAlertOrders.length > 0;

  // Play repeating alert sound, vibrate, and flash document.title while a new order alert is active
  useEffect(() => {
    if (!hasActiveNewOrderAlert) {
      if (typeof document !== 'undefined' && document.title === NEW_ORDER_ALERT_TITLE) {
        document.title = DEFAULT_DOCUMENT_TITLE;
      }
      return;
    }

    // Immediate alert on arrival
    playNewOrderAlertTone();
    triggerDeviceVibration([300, 150, 300]);
    if (typeof document !== 'undefined') {
      document.title = NEW_ORDER_ALERT_TITLE;
    }

    let showAlertTitle = true;
    const titleInterval = window.setInterval(() => {
      if (typeof document !== 'undefined') {
        showAlertTitle = !showAlertTitle;
        document.title = showAlertTitle ? NEW_ORDER_ALERT_TITLE : DEFAULT_DOCUMENT_TITLE;
      }
    }, 1000);

    const soundInterval = window.setInterval(() => {
      playNewOrderAlertTone();
      triggerDeviceVibration([250, 120, 250]);
    }, 3000);

    return () => {
      window.clearInterval(titleInterval);
      window.clearInterval(soundInterval);
      if (typeof document !== 'undefined') {
        document.title = DEFAULT_DOCUMENT_TITLE;
      }
    };
  }, [hasActiveNewOrderAlert]);

  // Screen Wake Lock while driver is online (re-requested when page becomes visible again)
  useEffect(() => {
    if (!isDriverApprovedAndOnline || typeof navigator === 'undefined') {
      return;
    }

    let wakeLockSentinel: any = null;
    let isCancelledEffect = false;

    const requestWakeLock = async () => {
      if (isCancelledEffect) return;
      try {
        const navWithWakeLock = navigator as unknown as {
          wakeLock?: { request: (type: 'screen') => Promise<any> };
        };
        if (navWithWakeLock.wakeLock && typeof navWithWakeLock.wakeLock.request === 'function') {
          wakeLockSentinel = await navWithWakeLock.wakeLock.request('screen');
        }
      } catch {
        // Ignore Wake Lock errors (e.g. unsupported browser or battery saver)
      }
    };

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isCancelledEffect) {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelledEffect = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        try {
          void wakeLockSentinel.release().catch(() => {});
        } catch {
          // Ignore release errors
        }
      }
    };
  }, [isDriverApprovedAndOnline]);

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto font-black">
          <Car className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-black text-slate-900">
            بوابة الكابتن وطلب الانضمام
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            سجل الدخول بحساب Google للوصول إلى لوحة الكابتن المعتمد أو لتقديم طلب انضمام كابتن جديد للإدارة.
          </p>
        </div>
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={authLoading}
            onClick={() => loginWithGoogle('driver')}
            className="w-full py-3.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px] disabled:opacity-60"
          >
            <LogIn className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{authLoading ? 'جاري التحقق من الهوية...' : 'تسجيل الدخول بحساب Google'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveRole('customer')}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>العودة إلى واجهة العميل (اطلب مشوار)</span>
          </button>
        </div>
      </div>
    );
  }

  if (!isDriverProfileReady) {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center max-w-lg mx-auto space-y-3">
        <Loader2 className="w-7 h-7 animate-spin text-amber-500 mx-auto" />
        <p className="text-xs sm:text-sm font-bold text-slate-700">
          جاري التحقق من حالة حساب الكابتن...
        </p>
      </div>
    );
  }

  const handleRegisterCaptain = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSubmittedBanner(false);

    const cleanName = regDisplayName.trim();
    const cleanPhone = regPhone.trim();

    if (cleanName.length < 2) {
      setRegError('يرجى كتابة اسم الكابتن الثلاثي أو الثنائي كما سيظهر للعملاء.');
      return;
    }
    if (cleanPhone.length < 10 || cleanPhone === OFFICIAL_PHONE) {
      setRegError('يرجى إدخال رقم موبايل الكابتن الصحيح للتواصل والواتساب.');
      return;
    }

    setRegSubmitting(true);
    try {
      await saveDriverProfile({
        displayName: cleanName,
        captainCode: regCaptainCode.trim() || 'ك-101',
        contactPhone: cleanPhone,
        roleTitle: `${regVehicleType.trim() || 'توكتوك'} - ${regPlateNumber.trim() || 'قطاع الزقازيق'}`,
        online: false,
        available: false,
        vehicleType: regVehicleType.trim() || 'توكتوك',
        vehicleModel: regVehicleModel.trim() || 'باجاج حديث',
        plateNumber: regPlateNumber.trim() || 'قطاع الزقازيق',
      });
      setShowRegistrationForm(false);
      setRegSubmittedBanner(true);
    } catch {
      setRegError('حدث خطأ أثناء إرسال طلب الانضمام، يرجى المحاولة مرة أخرى.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const renderApplicationForm = (submitButtonLabel: string) => (
    <form
      onSubmit={handleRegisterCaptain}
      className="pt-4 border-t border-slate-200 space-y-3.5 text-right w-full min-w-0"
    >
      <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-slate-900">
        <Car className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>بيانات طلب الانضمام ككابتن</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 block">
            اسم الكابتن (يظهر للعملاء) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={100}
            value={regDisplayName}
            onChange={(e) => setRegDisplayName(e.target.value)}
            placeholder="مثال: كابتن محمود أحمد"
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          />
        </div>

        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>رقم موبايل الكابتن <span className="text-red-500">*</span></span>
          </label>
          <input
            type="tel"
            required
            minLength={10}
            maxLength={25}
            value={regPhone}
            onChange={(e) => setRegPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-mono text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 block">
            نوع المركبة <span className="text-red-500">*</span>
          </label>
          <select
            value={regVehicleType}
            onChange={(e) => setRegVehicleType(e.target.value)}
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          >
            <option value="توكتوك">توكتوك</option>
            <option value="سيارة ملاكي">سيارة ملاكي</option>
            <option value="موتوسيكل دليفري">موتوسيكل دليفري</option>
          </select>
        </div>

        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 block">
            موديل المركبة
          </label>
          <input
            type="text"
            required
            maxLength={80}
            value={regVehicleModel}
            onChange={(e) => setRegVehicleModel(e.target.value)}
            placeholder="مثال: باجاج حديث"
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          />
        </div>

        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 block">
            القرية / المنطقة / رقم اللوحة <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={40}
            value={regPlateNumber}
            onChange={(e) => setRegPlateNumber(e.target.value)}
            placeholder="مثال: الزنكلون / شيبة / قطاع الزقازيق"
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          />
        </div>

        <div className="space-y-1 min-w-0">
          <label className="text-xs font-bold text-slate-700 block">
            كود الكابتن المفضل
          </label>
          <input
            type="text"
            required
            maxLength={40}
            value={regCaptainCode}
            onChange={(e) => setRegCaptainCode(e.target.value)}
            placeholder="ك-101"
            className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
          />
        </div>
      </div>

      {regError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{regError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={regSubmitting}
        className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[50px] disabled:opacity-60"
      >
        {regSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>جاري إرسال الطلب للإدارة...</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submitButtonLabel}</span>
          </>
        )}
      </button>
    </form>
  );

  // STATE 1: Authenticated user has NOT applied as a Captain yet (`!driverProfile`)
  if (!driverProfile) {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 max-w-lg mx-auto space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto font-black">
            <Car className="w-6 h-6" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            تسجيل طلب انضمام كابتن جديد
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            أدخل بياناتك وبيانات المركبة لتقديم طلب الانضمام ككابتن، وسيتم تفعيل لوحة الكابتن الخاصة بك فور موافقة الإدارة.
          </p>
        </div>

        {renderApplicationForm('إرسال طلب الانضمام لموافقة الإدارة')}

        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveRole('customer')}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>العودة إلى واجهة العميل (اطلب مشوار)</span>
          </button>
        </div>
      </div>
    );
  }

  // STATE 2: Captain Application is PENDING Admin Approval (`approvalStatus === 'pending'`)
  if (driverProfile.approvalStatus === 'pending') {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border-2 border-amber-300 p-4 sm:p-6 max-w-lg mx-auto space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center mx-auto font-black">
            <Clock className="w-6 h-6" />
          </div>
          <span className="inline-block px-3 py-1 rounded-lg bg-amber-100 text-amber-900 font-black text-xs">
            حالة الحساب: قيد المراجعة (Pending Approval)
          </span>
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            طلب انضمامك قيد المراجعة من الإدارة
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            تم استلام بياناتك ككابتن وهي الآن قيد المراجعة في لوحة الإدارة. لا يمكنك الاتصال أو استقبال وقبول الطلبات إلا بعد اعتماد الإدارة لحسابك.
          </p>
        </div>

        {regSubmittedBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>تم حفظ وإرسال بيانات طلب الانضمام بنجاح.</span>
          </div>
        )}

        {/* Summary of submitted Captain data */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
            <span className="font-black text-slate-900">بيانات الطلب المسجلة:</span>
            <span className="font-mono font-bold text-slate-600">{driverProfile.captainCode}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
            <div>
              <span className="text-slate-500">الاسم: </span>
              <strong className="text-slate-900">{driverProfile.displayName}</strong>
            </div>
            <div>
              <span className="text-slate-500">رقم الهاتف: </span>
              <strong className="font-mono text-slate-900" dir="ltr">
                {driverProfile.contactPhone}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">المركبة: </span>
              <strong className="text-slate-900">
                {driverProfile.vehicleType} ({driverProfile.vehicleModel})
              </strong>
            </div>
            <div>
              <span className="text-slate-500">المنطقة / اللوحة: </span>
              <strong className="text-slate-900">{driverProfile.plateNumber}</strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setActiveRole('customer')}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>واجهة العميل (اطلب مشوار)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRegistrationForm((prev) => !prev)}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
          >
            <Edit3 className="w-4 h-4 shrink-0" />
            <span>{showRegistrationForm ? 'إخفاء التعديل' : 'تعديل بيانات الطلب'}</span>
          </button>
        </div>

        {showRegistrationForm &&
          renderApplicationForm('حفظ التعديلات وإعادة الإرسال للمراجعة')}
      </div>
    );
  }

  // STATE 3: Captain Application was REJECTED or SUSPENDED by Admin (`approvalStatus === 'rejected' | 'suspended'`)
  if (
    driverProfile.approvalStatus === 'rejected' ||
    driverProfile.approvalStatus === 'suspended' ||
    !isApprovedDriver
  ) {
    const isSuspended = driverProfile.approvalStatus === 'suspended';
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border-2 border-red-200 p-4 sm:p-6 max-w-lg mx-auto space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 border border-red-200 flex items-center justify-center mx-auto font-black">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <span className="inline-block px-3 py-1 rounded-lg bg-red-100 text-red-900 font-black text-xs">
            {isSuspended
              ? 'حالة الحساب: موقوف مؤقتاً (Suspended)'
              : 'حالة الحساب: غير مفعل / مرفوض (Rejected)'}
          </span>
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            {isSuspended ? 'تم إيقاف حساب الكابتن مؤقتاً' : 'لم تتم الموافقة على طلب الانضمام'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {isSuspended
              ? 'تم إيقاف حساب الكابتن الخاص بك مؤقتاً من قِبل الإدارة. لا يمكنك استقبال الطلبات أو تغيير حالة الإيقاف إلا بعد إعادة التفعيل من قِبل الإدارة.'
              : 'تم رفض طلب انضمامك ككابتن من قِبل الإدارة. يمكنك مراجعة وتحديث بياناتك لإعادة تقديم طلب الانضمام للمراجعة، أو استخدام التطبيق كعميل لطلب مشوار.'}
          </p>
        </div>

        <div className={`grid grid-cols-1 ${!isSuspended ? 'sm:grid-cols-2' : ''} gap-2.5`}>
          <button
            type="button"
            onClick={() => setActiveRole('customer')}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
          >
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>واجهة العميل (اطلب مشوار)</span>
          </button>

          {!isSuspended && (
            <button
              type="button"
              onClick={() => setShowRegistrationForm((prev) => !prev)}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
            >
              <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{showRegistrationForm ? 'إخفاء النموذج' : 'تحديث البيانات وإعادة التقديم'}</span>
            </button>
          )}
        </div>

        {!isSuspended &&
          showRegistrationForm &&
          renderApplicationForm('إعادة تقديم طلب الانضمام للإدارة')}
      </div>
    );
  }

  // STATE 4: APPROVED CAPTAIN (`driverProfile.approvalStatus === 'approved'`)
  const isOnline = driverProfile.online;
  const isAvailable = driverProfile.available;
  const driverDisplayName = driverProfile.displayName || 'كابتن الكابتن';
  const driverCode = driverProfile.captainCode || 'ك-111';
  const driverVehicle = `${driverProfile.vehicleType} (${driverProfile.plateNumber})`;

  const pendingRides = visiblePendingOrders.filter(
    (o) => o.type !== 'delivery' && o.serviceType !== 'delivery'
  );
  const pendingDeliveries = visiblePendingOrders.filter(
    (o) => o.type === 'delivery' || o.serviceType === 'delivery'
  );
  const currentTabOrders = captainOrderTab === 'rides' ? pendingRides : pendingDeliveries;

  const completedOrdersCount = myDriverOrders.filter((o) => o.status === 'completed').length;

  const handleAccept = async (requestId: string) => {
    if (!requestId) return;
    acknowledgeOrderAlert(requestId);
    setBusyRequestId(requestId);
    try {
      await acceptCloudRideRequest(requestId);
    } catch {
      // Error state is handled via actionError in FirebaseContext
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleStatusUpdate = async (
    requestId: string,
    nextStatus: 'on_the_way' | 'arrived' | 'completed'
  ) => {
    if (!requestId) return;
    setBusyRequestId(requestId);
    try {
      await updateCloudRideStatus(requestId, nextStatus);
    } catch {
      // Error state is handled via actionError in FirebaseContext
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleSaveFinalFare = async () => {
    if (!activeDriverOrder?.requestId) return;
    const num = Math.round(Number(editingFareValue));
    if (!Number.isFinite(num) || num < 0 || num > 500) {
      return;
    }
    setFareUpdating(true);
    try {
      await updateCloudFinalFare(activeDriverOrder.requestId, num);
      setFareUpdateSuccess(true);
      setTimeout(() => setFareUpdateSuccess(false), 3000);
    } catch {
      // Error state is handled via actionError in FirebaseContext
    } finally {
      setFareUpdating(false);
    }
  };

  const activeOrderStatus = activeDriverOrder?.status;
  const isActiveOrderTerminal =
    activeOrderStatus === 'completed' || activeOrderStatus === 'cancelled';
  const customerPhoneForActiveOrder = isActiveOrderTerminal
    ? ''
    : activeDriverOrder?.phone || '';
  const activeDropoffNote = (
    activeDriverOrder?.dropoffNote ??
    activeDriverOrder?.dropoffSpecific ??
    ''
  ).trim();
  const latestAlertOrder = activeAlertOrders[0] || null;

  return (
    <div className="space-y-4 sm:space-y-5 w-full min-w-0">
      {/* Sound Alert Enable Button (visible until enabled by user tap) */}
      {!soundEnabled && (
        <button
          type="button"
          onClick={() => enableDriverSoundAlerts()}
          className="w-full py-3 px-4 rounded-2xl bg-[#FFC400] hover:bg-amber-400 text-slate-950 border-2 border-slate-900 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px] shadow-xs"
        >
          <Bell className="w-4 h-4 shrink-0 hidden" />
          <span>🔔 تفعيل التنبيه الصوتي</span>
        </button>
      )}

      {/* Prominent New Order Alert Banner */}
      {hasActiveNewOrderAlert && latestAlertOrder && (
        <div
          role="alert"
          className="w-full min-w-0 rounded-2xl bg-[#FFC400] border-2 border-slate-950 p-4 shadow-md space-y-3 animate-pulse"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-950 text-[#FFC400] font-black text-xs">
                  🔔 طلب جديد
                </span>
                <span className="text-xs font-black text-slate-900">
                  #{latestAlertOrder.orderNumber} ·{' '}
                  {latestAlertOrder.type === 'delivery' ||
                  latestAlertOrder.serviceType === 'delivery'
                    ? '📦 توصيل طلبات'
                    : '🛺 مشوار ركاب'}
                </span>
              </div>
              <p className="text-sm sm:text-base font-black text-slate-950 break-words">
                من {latestAlertOrder.pickupVillage} إلى {latestAlertOrder.dropoffVillage}
              </p>
              {typeof latestAlertOrder.estimatedFare === 'number' &&
                latestAlertOrder.estimatedFare > 0 && (
                  <p className="text-xs sm:text-sm font-black text-slate-900">
                    الأجرة التقريبية: {latestAlertOrder.estimatedFare} جنيه
                  </p>
                )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                const isDeliv =
                  latestAlertOrder.type === 'delivery' ||
                  latestAlertOrder.serviceType === 'delivery';
                setCaptainOrderTab(isDeliv ? 'deliveries' : 'rides');
                acknowledgeOrderAlert(
                  latestAlertOrder.requestId || latestAlertOrder.orderNumber || ''
                );
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-black text-xs sm:text-sm cursor-pointer min-h-[44px]"
            >
              عرض الطلب وإيقاف التنبيه
            </button>

            {latestAlertOrder.requestId && (
              <button
                type="button"
                disabled={busyRequestId === latestAlertOrder.requestId}
                onClick={() => handleAccept(latestAlertOrder.requestId!)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer min-h-[44px] disabled:opacity-60"
              >
                قبول الطلب الآن
              </button>
            )}
          </div>
        </div>
      )}

      {/* Driver Status & Profile Header Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-3.5 sm:p-5 border border-slate-800 space-y-3.5 w-full min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
              <Car className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-base sm:text-lg font-black text-white truncate max-w-full">
                  {driverDisplayName}
                </h1>
                <span className="text-xs text-amber-400 font-bold bg-slate-800 px-2 py-0.5 rounded-md shrink-0">
                  {driverCode}
                </span>
              </div>
              <p className="text-xs text-slate-400 break-words mt-0.5">
                {driverVehicle} · مشاوير مكتملة: {completedOrdersCount}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProfileModal}
            className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[42px] shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>بيانات المركبة</span>
          </button>
        </div>

        {/* Online / Offline & Availability Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-800">
          <button
            type="button"
            onClick={() => toggleDriverStatus(!isOnline, !activeDriverOrder)}
            className={`w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px] ${
              isOnline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Power className="w-4 h-4 shrink-0" />
            <span>
              {isOnline ? 'متصل الآن (تستقبل الطلبات)' : 'غير متصل (اضغط للاتصال)'}
            </span>
          </button>

          {isOnline && (
            <button
              type="button"
              onClick={() => toggleDriverStatus(true, !isAvailable)}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px] border ${
                isAvailable
                  ? 'bg-slate-800 border-emerald-500/40 text-emerald-300 hover:bg-slate-750'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              <span>
                الحالة: {isAvailable ? 'متاح لطلبات جديدة' : 'مشغول بمشوار حالي'}
              </span>
            </button>
          )}
        </div>

        {isOnline && (
          <p className="text-[11px] sm:text-xs font-bold text-amber-300 text-center pt-1">
            سيب الشاشة مفتوحة عشان توصلك الطلبات
          </p>
        )}
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1 break-words">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={clearActionError}
            className="p-1.5 text-red-600 hover:text-red-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. ACTIVE ASSIGNED TRIP (Top Priority when driver has an ongoing trip) */}
      {activeDriverOrder && (
        <div className="w-full min-w-0 bg-white rounded-2xl border-2 border-amber-500 shadow-sm overflow-hidden">
          <div className="bg-slate-900 text-white px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-black text-sm sm:text-base text-amber-400">
                {(activeDriverOrder.type === 'delivery' || activeDriverOrder.serviceType === 'delivery')
                  ? `طلب التوصيل الحالي #${activeDriverOrder.orderNumber}`
                  : `مشوارك الحالي #${activeDriverOrder.orderNumber}`}
              </span>
              {unreadChatCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs tabular-nums">
                  {unreadChatCount} رسالة جديدة
                </span>
              )}
            </div>
            <span className="text-xs font-bold bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg">
              {activeDriverOrder.status === 'accepted'
                ? 'تم القبول — اضغط "في الطريق"'
                : activeDriverOrder.status === 'on_the_way'
                ? 'في الطريق للعميل'
                : 'وصلت لمكان الركوب'}
            </span>
          </div>

          <div className="p-3.5 sm:p-5 space-y-4 w-full min-w-0">
            {/* Customer Name & Two Large Contact Buttons (Hidden after completed/cancelled) */}
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3 w-full min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-slate-600 font-bold block">اسم العميل</span>
                  <h3 className="text-base sm:text-lg font-black text-slate-950 break-words">
                    {activeDriverOrder.name}
                  </h3>
                </div>
                <div className="text-left shrink-0 bg-white/80 px-2.5 py-1 rounded-lg border border-amber-200/80">
                  <span className="text-[11px] text-slate-500 block">
                    {typeof activeDriverOrder.finalFare === 'number'
                      ? 'الأجرة المؤكدة'
                      : 'الأجرة المقدرة'}
                  </span>
                  <span className="font-mono font-black text-base sm:text-lg text-slate-950 tabular-nums">
                    {typeof activeDriverOrder.finalFare === 'number'
                      ? `${activeDriverOrder.finalFare} ج.م`
                      : typeof activeDriverOrder.estimatedFare === 'number' &&
                        activeDriverOrder.estimatedFare > 0
                      ? `${activeDriverOrder.estimatedFare} ج.م`
                      : 'بالاتفاق'}
                  </span>
                </div>
              </div>

              {/* Driver Fare Confirmation / Edit Box */}
              {!isActiveOrderTerminal && (
                <div className="p-3 bg-white/95 rounded-xl border border-amber-300 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-800">
                      💰 تأكيد أو تعديل الأجرة النهائية:
                    </span>
                    {fareUpdateSuccess && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        ✓ تم حفظ وتحديث الأجرة
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="500"
                      value={editingFareValue}
                      onChange={(e) => setEditingFareValue(e.target.value)}
                      placeholder="الأجرة بالجنيه (مثال: 25)"
                      className="flex-1 py-2 px-3 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      disabled={fareUpdating || !editingFareValue.trim()}
                      onClick={handleSaveFinalFare}
                      className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[38px] disabled:opacity-50 shrink-0"
                    >
                      {fareUpdating ? 'جاري الحفظ...' : 'تأكيد الأجرة'}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    تظهر الأجرة المؤكدة فوراً للعميل في تفاصيل الرحلة.
                  </span>
                </div>
              )}

              {!isActiveOrderTerminal && customerPhoneForActiveOrder && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href={`tel:${customerPhoneForActiveOrder}`}
                    className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[50px]"
                  >
                    <span>📞 اتصل بالعميل</span>
                  </a>

                  <a
                    href={getDriverToCustomerWhatsAppUrl(
                      customerPhoneForActiveOrder,
                      activeDriverOrder.driverName || driverDisplayName
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[50px]"
                  >
                    <span>💬 واتساب العميل</span>
                  </a>
                </div>
              )}
            </div>

            {/* Pickup & Drop-off Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs w-full min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 break-words space-y-0.5">
                  <span className="text-slate-500 block">مكان الركوب:</span>
                  <span className="font-bold text-slate-900 text-sm block">
                    {activeDriverOrder.pickupVillage}
                  </span>
                  {activeDriverOrder.pickupSpecific && (
                    <span className="block text-slate-700 font-semibold">
                      ملاحظة مكان الركوب: {activeDriverOrder.pickupSpecific}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 min-w-0">
                <Navigation className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 break-words space-y-0.5">
                  <span className="text-slate-500 block">الوجهة (النزول):</span>
                  <span className="font-bold text-slate-900 text-sm block">
                    {activeDriverOrder.dropoffVillage}
                  </span>
                  {activeDropoffNote && (
                    <span className="block text-slate-700 font-semibold">
                      ملاحظة مكان النزول: {activeDropoffNote}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {activeDriverOrder.category && (
              <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/80">
                <span className="text-slate-500 font-normal">نوع الطلب:</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-200/60 text-amber-950 font-black">
                  {getCategoryDisplay(activeDriverOrder.category).fullDisplay}
                </span>
              </div>
            )}

            {activeDriverOrder.sameVillageTier && (
              <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/80">
                <span className="text-slate-500 font-normal">المسافة:</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-200/60 text-amber-950 font-black">
                  {getSameVillageTierDisplay(activeDriverOrder.sameVillageTier)?.fullDisplay}
                </span>
              </div>
            )}

            {activeDriverOrder.notes && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-slate-800 break-words">
                <span className="font-bold">ملاحظات العميل: </span>
                <span>{activeDriverOrder.notes}</span>
              </div>
            )}

            {/* 2. TRIP STATUS STEP BUTTONS: "في الطريق" → "وصلت" → "تم التوصيل" */}
            <div className="space-y-2 pt-1 w-full min-w-0">
              <span className="text-xs font-black text-slate-700 block">
                تحديث حالة المشوار (يظهر للعميل فوراً):
              </span>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {/* Step 1: في الطريق */}
                <button
                  type="button"
                  disabled={
                    activeDriverOrder.status !== 'accepted' ||
                    busyRequestId === activeDriverOrder.requestId
                  }
                  onClick={() =>
                    activeDriverOrder.requestId &&
                    handleStatusUpdate(activeDriverOrder.requestId, 'on_the_way')
                  }
                  className={`py-3 px-1.5 sm:px-3 rounded-xl font-black text-[11px] sm:text-sm text-center leading-tight transition-colors flex items-center justify-center gap-1 min-h-[48px] ${
                    activeDriverOrder.status === 'accepted'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-80'
                  }`}
                >
                  {activeDriverOrder.status !== 'accepted' && (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                  )}
                  <span>في الطريق</span>
                </button>

                {/* Step 2: وصلت */}
                <button
                  type="button"
                  disabled={
                    activeDriverOrder.status !== 'on_the_way' ||
                    busyRequestId === activeDriverOrder.requestId
                  }
                  onClick={() =>
                    activeDriverOrder.requestId &&
                    handleStatusUpdate(activeDriverOrder.requestId, 'arrived')
                  }
                  className={`py-3 px-1.5 sm:px-3 rounded-xl font-black text-[11px] sm:text-sm text-center leading-tight transition-colors flex items-center justify-center gap-1 min-h-[48px] ${
                    activeDriverOrder.status === 'on_the_way'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs'
                      : activeDriverOrder.status === 'arrived'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-80'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {activeDriverOrder.status === 'arrived' && (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
                  )}
                  <span>وصلت</span>
                </button>

                {/* Step 3: تم التوصيل */}
                <button
                  type="button"
                  disabled={
                    activeDriverOrder.status !== 'arrived' ||
                    busyRequestId === activeDriverOrder.requestId
                  }
                  onClick={() =>
                    activeDriverOrder.requestId &&
                    handleStatusUpdate(activeDriverOrder.requestId, 'completed')
                  }
                  className={`py-3 px-1.5 sm:px-3 rounded-xl font-black text-[11px] sm:text-sm text-center leading-tight transition-colors flex items-center justify-center gap-1 min-h-[48px] ${
                    activeDriverOrder.status === 'arrived'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  <span>تم التوصيل</span>
                </button>
              </div>
            </div>

            {/* 3. SIMPLE IN-APP CHAT (Only while order is "accepted" or "on_the_way") */}
            {(activeDriverOrder.status === 'accepted' ||
              activeDriverOrder.status === 'on_the_way') &&
              activeDriverOrder.requestId &&
              activeDriverOrder.customerId &&
              activeDriverOrder.driverId && (
                <OrderChatBox
                  orderId={activeDriverOrder.requestId}
                  customerId={activeDriverOrder.customerId}
                  driverId={activeDriverOrder.driverId}
                  currentUserId={currentUser.uid}
                  senderRole="driver"
                  orderStatus={activeDriverOrder.status}
                  onUnreadChange={setUnreadChatCount}
                />
              )}
          </div>
        </div>
      )}

      {/* 2. INCOMING PENDING REQUESTS (Customer phone numbers strictly hidden) */}
      <div className="space-y-3 w-full min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-base font-black text-slate-900">
            الطلبات المتاحة الآن ({visiblePendingOrders.length})
          </h2>
          <span className="text-xs text-slate-500">
            تحديث تلقائي فوري
          </span>
        </div>

        {/* Two separate tabs: "🛺 المشاوير" and "📦 الطلبات" */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setCaptainOrderTab('rides')}
            className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
              captainOrderTab === 'rides'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛺 المشاوير</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                captainOrderTab === 'rides'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pendingRides.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCaptainOrderTab('deliveries')}
            className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
              captainOrderTab === 'deliveries'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📦 الطلبات</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                captainOrderTab === 'deliveries'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pendingDeliveries.length}
            </span>
          </button>
        </div>

        {!isOnline ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 text-center space-y-2.5">
            <p className="text-sm font-bold text-slate-700">
              أنت في وضع &quot;غير متصل&quot; حالياً
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              اضغط على زر الاتصال بالأعلى لتبدأ في استقبال طلبات العملاء الجديدة.
            </p>
          </div>
        ) : currentTabOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center space-y-2">
            <Clock className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">
              {captainOrderTab === 'rides'
                ? 'لا توجد مشاوير ركاب منتظرة في هذه اللحظة'
                : 'لا توجد طلبات توصيل منتظرة في هذه اللحظة'}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              ستظهر الطلبات الجديدة هنا تلقائياً فور إرسالها من العملاء دون الحاجة لتحديث الصفحة.
            </p>
          </div>
        ) : (
          <div className="space-y-3 w-full min-w-0">
            {currentTabOrders.map((order) => {
              const reqKey = order.requestId || order.orderNumber || '';
              const isAccepting = busyRequestId === reqKey;
              const isDelivery = order.type === 'delivery' || order.serviceType === 'delivery';
              const pendingDropoffNote = (
                order.dropoffNote ??
                order.dropoffSpecific ??
                ''
              ).trim();

              return (
                <div
                  key={reqKey}
                  onClick={() => acknowledgeOrderAlert(reqKey)}
                  className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 shadow-xs space-y-3.5"
                >
                  {/* Top metadata row (NO customer phone number shown) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 min-w-0">
                      <span className="font-bold text-slate-900">
                        {isDelivery ? '📦 توصيل طلبات' : '🛺 مشوار ركاب'}
                      </span>
                      {order.category && (
                        <>
                          <span>·</span>
                          <span className="font-bold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            {getCategoryDisplay(order.category).fullDisplay}
                          </span>
                        </>
                      )}
                      {order.sameVillageTier && (
                        <>
                          <span>·</span>
                          <span className="font-bold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            المسافة: {getSameVillageTierDisplay(order.sameVillageTier)?.fullDisplay}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>رقم #{order.orderNumber}</span>
                      <span>·</span>
                      <span>{order.createdAt || 'الآن'}</span>
                    </div>

                    <div className="text-left shrink-0">
                      {typeof order.estimatedFare === 'number' &&
                      Number.isFinite(order.estimatedFare) ? (
                        <>
                          <span className="text-base sm:text-lg font-black font-mono text-slate-950 tabular-nums">
                            {order.estimatedFare}
                          </span>
                          <span className="text-xs font-bold text-slate-600 mr-1">ج.م</span>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">غير متوفر</span>
                      )}
                      {typeof order.distanceKm === 'number' &&
                      Number.isFinite(order.distanceKm) ? (
                        <span className="text-xs text-slate-400 mr-1 tabular-nums">
                          ({order.distanceKm} كم)
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Pickup & Destination */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs w-full min-w-0">
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 break-words space-y-0.5">
                        <span className="text-slate-500 block">من (نقطة الركوب):</span>
                        <span className="font-bold text-slate-900 text-sm block">
                          {order.pickupVillage}
                        </span>
                        {order.pickupSpecific && (
                          <span className="block text-slate-700 font-semibold">
                            ملاحظة مكان الركوب: {order.pickupSpecific}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 min-w-0">
                      <Navigation className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 break-words space-y-0.5">
                        <span className="text-slate-500 block">إلى (الوجهة):</span>
                        <span className="font-bold text-slate-900 text-sm block">
                          {order.dropoffVillage}
                        </span>
                        {pendingDropoffNote && (
                          <span className="block text-slate-700 font-semibold">
                            ملاحظة مكان النزول: {pendingDropoffNote}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {order.notes && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 break-words">
                      <span className="font-bold text-slate-900">ملاحظات: </span>
                      <span>{order.notes}</span>
                    </div>
                  )}

                  {/* Accept / Reject Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isAccepting || !order.requestId}
                      onClick={() => order.requestId && handleAccept(order.requestId)}
                      className="flex-1 py-3 px-3 sm:px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px] disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {isAccepting ? 'جاري قبول الطلب...' : 'قبول الطلب'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        acknowledgeOrderAlert(reqKey);
                        rejectCloudRideRequest(reqKey);
                      }}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer min-h-[48px] shrink-0"
                    >
                      تجاهل
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
