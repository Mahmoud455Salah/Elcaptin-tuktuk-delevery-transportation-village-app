import React, { useState, useEffect } from 'react';
import {
  Shield,
  Car,
  Clock,
  XCircle,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  LogIn,
  Lock,
  ArrowRight,
  UserCheck,
  Ban,
  Loader2,
  AlertCircle,
  X,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  AppRole,
  DriverApprovalStatus,
  DriverProfileDoc,
  isDriverOnlineAndAvailableNow,
  useFirebase,
} from '../context/FirebaseContext';
import { getCategoryDisplay } from '../data/categories';
import { getSameVillageTierDisplay } from '../data/fares';

type FilterTab = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';
type DriverFilterTab = 'all' | 'pending' | 'approved' | 'suspended' | 'rejected';

function formatDriverTimestamp(ts: unknown): string {
  if (!ts) return 'غير مسجل';
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (ts as { toDate: () => Date }).toDate().toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'غير مسجل';
    }
  }
  return 'غير مسجل';
}

interface AdminDashboardProps {
  onSelectRole?: (role: AppRole) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSelectRole }) => {
  const {
    currentUser,
    isAdminUser,
    firestoreOrders,
    allDrivers,
    adminTotalUsersCount,
    adminDataReady,
    adminDataError,
    authLoading,
    actionError,
    clearActionError,
    loginWithGoogle,
    cancelCloudRideRequest,
    approveDriverProfile,
    rejectDriverProfile,
    suspendDriverProfile,
    reactivateDriverProfile,
    deleteAdminDriverProfile,
    deleteAdminRideRequest,
    cleanOldAdminRideRequests,
  } = useFirebase();

  const [orderTypeTab, setOrderTypeTab] = useState<'rides' | 'deliveries'>('rides');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [driverFilter, setDriverFilter] = useState<DriverFilterTab>('all');
  const [busyAction, setBusyAction] = useState<{
    userId: string;
    type: 'approve' | 'reject' | 'suspend' | 'reactivate';
  } | null>(null);
  const [confirmDeleteDriverUid, setConfirmDeleteDriverUid] = useState<string | null>(null);
  const [deletingDriverUid, setDeletingDriverUid] = useState<string | null>(null);
  const [confirmDeleteReqId, setConfirmDeleteReqId] = useState<string | null>(null);
  const [deletingReqId, setDeletingReqId] = useState<string | null>(null);
  const [confirmBulkClean, setConfirmBulkClean] = useState(false);
  const [cleaningOldOrders, setCleaningOldOrders] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center mx-auto font-black">
          <Shield className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900">
            لوحة متابعة النظام (الإدارة)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            سجل الدخول بحساب مدير النظام لمراجعة طلبات انضمام الكباتن ومتابعة الرحلات.
          </p>
        </div>
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={authLoading}
            onClick={() => loginWithGoogle('admin')}
            className="w-full py-3.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[48px] disabled:opacity-60"
          >
            <LogIn className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{authLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول كمدير'}</span>
          </button>

          {onSelectRole && (
            <button
              type="button"
              onClick={() => onSelectRole('customer')}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
            >
              <ArrowRight className="w-4 h-4 shrink-0" />
              <span>العودة إلى واجهة العميل (اطلب مشوار)</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Enforce strict Admin authorization: Google login alone does NOT grant Admin access
  if (!isAdminUser) {
    return (
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto font-black">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900">
            غير مصرح بالدخول
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            هذه اللوحة مخصصة لمدير النظام فقط. يمكنك طلب مشوار كعميل أو الانتقال إلى لوحة الكابتن.
          </p>
        </div>
        {onSelectRole && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onSelectRole('customer')}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition-colors cursor-pointer min-h-[46px]"
            >
              اطلب مشوار
            </button>
            <button
              type="button"
              onClick={() => onSelectRole('driver')}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer min-h-[46px]"
            >
              لوحة الكابتن
            </button>
          </div>
        )}
      </div>
    );
  }

  // Defensive Ride Request Statistics (from rideRequests/{requestId})
  const totalRequestsCount = firestoreOrders.length;
  const pendingOrdersCount = firestoreOrders.filter((o) => o?.status === 'pending').length;
  const acceptedOrdersCount = firestoreOrders.filter((o) => o?.status === 'accepted').length;
  const inProgressOrdersCount = firestoreOrders.filter(
    (o) =>
      o?.status === 'on_the_way' ||
      o?.status === 'arrived' ||
      o?.status === 'in_progress'
  ).length;
  const activeCount = acceptedOrdersCount + inProgressOrdersCount;
  const activeAndPendingCount = pendingOrdersCount + activeCount;
  const completedCount = firestoreOrders.filter((o) => o?.status === 'completed').length;
  const cancelledOnlyCount = firestoreOrders.filter((o) => o?.status === 'cancelled').length;
  const rejectedOrdersCount = firestoreOrders.filter((o) => o?.status === 'rejected').length;
  const cancelledCount = cancelledOnlyCount + rejectedOrdersCount;
  const cleanableOldOrdersCount = firestoreOrders.filter(
    (o) =>
      Boolean(o?.requestId) &&
      (o?.status === 'completed' || o?.status === 'cancelled' || o?.status === 'rejected')
  ).length;

  // Defensive Captain Statistics (from drivers/{uid})
  // Never count rejected/suspended/pending drivers as online or available even if legacy data has inconsistent flags
  const totalDriversCount = allDrivers.length;
  const pendingDriversCount = allDrivers.filter(
    (d) => (d?.approvalStatus || 'pending') === 'pending'
  ).length;
  const approvedDriversCount = allDrivers.filter(
    (d) => d?.approvalStatus === 'approved'
  ).length;
  const suspendedDriversCount = allDrivers.filter(
    (d) => d?.approvalStatus === 'suspended'
  ).length;
  const rejectedDriversCount = allDrivers.filter(
    (d) => d?.approvalStatus === 'rejected'
  ).length;
  const freshOnlineDrivers = allDrivers.filter((d) =>
    isDriverOnlineAndAvailableNow(d, nowMs)
  );
  const onlineApprovedDriversCount = freshOnlineDrivers.length;
  const availableApprovedDriversCount = freshOnlineDrivers.length;

  const rideOrders = firestoreOrders.filter(
    (o) => o.type !== 'delivery' && o.serviceType !== 'delivery'
  );
  const deliveryOrders = firestoreOrders.filter(
    (o) => o.type === 'delivery' || o.serviceType === 'delivery'
  );

  const currentTypeOrders = orderTypeTab === 'rides' ? rideOrders : deliveryOrders;

  const filteredOrders = currentTypeOrders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return o.status === 'pending';
    if (filter === 'active')
      return (
        o.status === 'accepted' ||
        o.status === 'on_the_way' ||
        o.status === 'arrived'
      );
    if (filter === 'completed') return o.status === 'completed';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  // Sort drivers so 'pending' applications appear first for immediate Admin review
  const sortedDrivers = [...allDrivers].sort((a, b) => {
    const orderMap: Record<DriverApprovalStatus, number> = {
      pending: 0,
      approved: 1,
      suspended: 2,
      rejected: 3,
    };
    return (orderMap[a.approvalStatus] ?? 0) - (orderMap[b.approvalStatus] ?? 0);
  });

  const filteredDrivers = sortedDrivers.filter((d) => {
    if (driverFilter === 'all') return true;
    return d.approvalStatus === driverFilter;
  });

  const handleApproveDriver = async (drv: DriverProfileDoc) => {
    setBusyAction({ userId: drv.userId, type: 'approve' });
    setStatusFeedback(null);
    clearActionError();
    try {
      await approveDriverProfile(drv.userId);
      setStatusFeedback(`تم اعتماد الكابتن "${drv.displayName}" بنجاح (الحالة: غير متصل).`);
    } catch {
      // actionError is set by approveDriverProfile
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectDriver = async (drv: DriverProfileDoc) => {
    setBusyAction({ userId: drv.userId, type: 'reject' });
    setStatusFeedback(null);
    clearActionError();
    try {
      await rejectDriverProfile(drv.userId);
      setStatusFeedback(`تم رفض طلب الكابتن "${drv.displayName}".`);
    } catch {
      // actionError is set by rejectDriverProfile
    } finally {
      setBusyAction(null);
    }
  };

  const handleSuspendDriver = async (drv: DriverProfileDoc) => {
    setBusyAction({ userId: drv.userId, type: 'suspend' });
    setStatusFeedback(null);
    clearActionError();
    try {
      await suspendDriverProfile(drv.userId);
      setStatusFeedback(`تم إيقاف الكابتن "${drv.displayName}" مؤقتًا (suspended).`);
    } catch {
      // actionError is set by suspendDriverProfile
    } finally {
      setBusyAction(null);
    }
  };

  const handleReactivateDriver = async (drv: DriverProfileDoc) => {
    setBusyAction({ userId: drv.userId, type: 'reactivate' });
    setStatusFeedback(null);
    clearActionError();
    try {
      await reactivateDriverProfile(drv.userId);
      setStatusFeedback(`تمت إعادة تفعيل الكابتن "${drv.displayName}" بنجاح (الحالة: غير متصل).`);
    } catch {
      // actionError is set by reactivateDriverProfile
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmDeleteDriver = async (drv: DriverProfileDoc) => {
    setDeletingDriverUid(drv.userId);
    setStatusFeedback(null);
    clearActionError();
    try {
      await deleteAdminDriverProfile(drv.userId);
      setConfirmDeleteDriverUid(null);
      setStatusFeedback(
        `تم حذف ملف الكابتن "${drv.displayName}" (${drv.contactPhone}) من النظام بنجاح.`
      );
    } catch {
      // actionError is set by deleteAdminDriverProfile
    } finally {
      setDeletingDriverUid(null);
    }
  };

  const handleConfirmDeleteRequest = async (requestId: string, orderNumber?: string) => {
    if (!requestId) return;
    setDeletingReqId(requestId);
    setStatusFeedback(null);
    clearActionError();
    try {
      await deleteAdminRideRequest(requestId);
      setConfirmDeleteReqId(null);
      setStatusFeedback(
        `تم حذف الطلب #${orderNumber || requestId} وبيانات الاتصال المرتبطة به بنجاح.`
      );
    } catch {
      // actionError is set by deleteAdminRideRequest
    } finally {
      setDeletingReqId(null);
    }
  };

  const handleConfirmBulkCleanup = async () => {
    setCleaningOldOrders(true);
    setStatusFeedback(null);
    clearActionError();
    try {
      const deletedCount = await cleanOldAdminRideRequests();
      setConfirmBulkClean(false);
      setStatusFeedback(`تم تنظيف وحذف ${deletedCount} طلبًا قديمًا (مكتمل / ملغي) بنجاح.`);
    } catch {
      // actionError is set by cleanOldAdminRideRequests
    } finally {
      setCleaningOldOrders(false);
    }
  };

  const statusLabel = (st?: string) => {
    switch (st) {
      case 'pending':
        return 'قيد البحث عن كابتن';
      case 'accepted':
        return 'تم قبول الطلب';
      case 'on_the_way':
        return 'الكابتن في الطريق';
      case 'arrived':
        return 'وصل الكابتن';
      case 'completed':
        return 'مكتمل';
      case 'cancelled':
        return 'ملغي';
      case 'rejected':
        return 'مرفوض';
      default:
        return 'قيد الانتظار';
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full min-w-0">
      {/* Header & Read-Only System Overview (نظرة عامة على النظام) */}
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-base sm:text-lg font-black text-slate-900">
              لوحة الإدارة — نظرة عامة على النظام
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              متابعة فورية لحالة المستخدمين والكباتن والطلبات المسجلة في النظام (للقراءة فقط)
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] shrink-0">
            تحديث لحظي مباشر
          </span>
        </div>

        {/* Listener Error State */}
        {adminDataError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{adminDataError}</span>
          </div>
        )}

        {/* Initial Loading State (prevents misleading zeros while listeners are still loading) */}
        {!adminDataReady ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center gap-2.5 text-xs sm:text-sm font-bold text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            <span>جاري تحميل البيانات...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group 1: نظرة عامة (Users / Captains / Ride Requests) */}
            <div className="space-y-2">
              <h2 className="text-xs font-black text-slate-700">
                ١. نظرة عامة (Users / Captains / Ride Requests)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                  <span className="text-xs font-bold text-slate-600 block truncate">
                    إجمالي المستخدمين (Total Users)
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                    {adminTotalUsersCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                    users/&#123;uid&#125;
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                  <span className="text-xs font-bold text-slate-600 block truncate">
                    إجمالي الكباتن (Total Captains)
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                    {totalDriversCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                    drivers/&#123;uid&#125;
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                  <span className="text-xs font-bold text-slate-600 block truncate">
                    إجمالي الطلبات (Total Ride Requests)
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                    {totalRequestsCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                    rideRequests/&#123;requestId&#125;
                  </span>
                </div>
              </div>
            </div>

            {/* Group 2: الكباتن (Total / Pending / Approved / Suspended / Rejected / Online / Available) */}
            <div className="space-y-2">
              <h2 className="text-xs font-black text-slate-700">
                ٢. إحصائيات الكباتن (Captains)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                  <span className="text-[11px] text-slate-500 block truncate">إجمالي الكباتن</span>
                  <span className="text-lg font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                    {totalDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 min-w-0">
                  <span className="text-[11px] font-bold text-amber-900 block truncate">
                    بانتظار الموافقة (Pending)
                  </span>
                  <span className="text-lg font-black font-mono text-amber-700 tabular-nums mt-0.5 block">
                    {pendingDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 min-w-0">
                  <span className="text-[11px] font-bold text-emerald-900 block truncate">
                    معتمدون (Approved)
                  </span>
                  <span className="text-lg font-black font-mono text-emerald-700 tabular-nums mt-0.5 block">
                    {approvedDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 min-w-0">
                  <span className="text-[11px] font-bold text-orange-900 block truncate">
                    موقوفون (Suspended)
                  </span>
                  <span className="text-lg font-black font-mono text-orange-700 tabular-nums mt-0.5 block">
                    {suspendedDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 min-w-0">
                  <span className="text-[11px] font-bold text-red-900 block truncate">
                    مرفوضون (Rejected)
                  </span>
                  <span className="text-lg font-black font-mono text-red-700 tabular-nums mt-0.5 block">
                    {rejectedDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 min-w-0">
                  <span className="text-[11px] font-bold text-emerald-900 block truncate">
                    متصلون الآن (Online)
                  </span>
                  <span className="text-lg font-black font-mono text-emerald-700 tabular-nums mt-0.5 block">
                    {onlineApprovedDriversCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 min-w-0 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-bold text-emerald-900 block truncate">
                    متاحون للطلب (Available)
                  </span>
                  <span className="text-lg font-black font-mono text-emerald-700 tabular-nums mt-0.5 block">
                    {availableApprovedDriversCount}
                  </span>
                </div>
              </div>

              {/* Online & Available Captains List (matching Customer Waiting Screen freshness rule) */}
              <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-emerald-950">
                    الكباتن المتصلون بالخدمة حالياً ({freshOnlineDrivers.length})
                  </span>
                </div>
                {freshOnlineDrivers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {freshOnlineDrivers.map((drv) => (
                      <div
                        key={drv.userId}
                        className="flex items-center justify-between gap-2 bg-white border border-emerald-200/80 rounded-lg px-2.5 py-1.5 text-xs"
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
                ) : (
                  <p className="text-xs font-bold text-slate-600">
                    لا يوجد كباتن متصلون حالياً
                  </p>
                )}
              </div>
            </div>

            {/* Group 3: الطلبات (Total / Pending / Accepted / Active In-Progress / Completed / Cancelled / Rejected) */}
            <div className="space-y-2">
              <h2 className="text-xs font-black text-slate-700">
                ٣. إحصائيات الطلبات (Ride Requests)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                  <span className="text-[11px] text-slate-500 block truncate">إجمالي الطلبات</span>
                  <span className="text-lg font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                    {totalRequestsCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 min-w-0">
                  <span className="text-[11px] font-bold text-amber-900 block truncate">
                    قيد البحث (Pending)
                  </span>
                  <span className="text-lg font-black font-mono text-amber-700 tabular-nums mt-0.5 block">
                    {pendingOrdersCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 min-w-0">
                  <span className="text-[11px] font-bold text-blue-900 block truncate">
                    مقبولة (Accepted)
                  </span>
                  <span className="text-lg font-black font-mono text-blue-700 tabular-nums mt-0.5 block">
                    {acceptedOrdersCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 min-w-0">
                  <span className="text-[11px] font-bold text-indigo-900 block truncate">
                    جارية (In Progress)
                  </span>
                  <span className="text-lg font-black font-mono text-indigo-700 tabular-nums mt-0.5 block">
                    {inProgressOrdersCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 min-w-0">
                  <span className="text-[11px] font-bold text-emerald-900 block truncate">
                    مكتملة (Completed)
                  </span>
                  <span className="text-lg font-black font-mono text-emerald-700 tabular-nums mt-0.5 block">
                    {completedCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 min-w-0">
                  <span className="text-[11px] font-bold text-red-900 block truncate">
                    ملغاة (Cancelled)
                  </span>
                  <span className="text-lg font-black font-mono text-red-700 tabular-nums mt-0.5 block">
                    {cancelledOnlyCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 min-w-0 col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-bold text-rose-900 block truncate">
                    مرفوضة (Rejected)
                  </span>
                  <span className="text-lg font-black font-mono text-rose-700 tabular-nums mt-0.5 block">
                    {rejectedOrdersCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Firestore Error or Action Feedback Banner */}
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

      {statusFeedback && !actionError && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1 break-words">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="p-1.5 text-emerald-700 hover:text-emerald-950 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start w-full min-w-0">
        {/* Drivers & Approval Requests Column (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-3 w-full min-w-0 order-1 lg:order-2">
          <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>إدارة الكباتن ({filteredDrivers.length})</span>
              </h2>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                إدارة سجلات الكباتن في <span className="font-mono">drivers/&#123;uid&#125;</span> (اعتماد، رفض، إيقاف مؤقت، إعادة تفعيل، أو حذف ملف الكابتن فقط)
              </p>
            </div>

            {/* Driver Approval Filter Tabs */}
            <div className="grid grid-cols-5 gap-1 bg-slate-200/80 p-1 rounded-xl w-full">
              {(
                [
                  { id: 'all', label: `الكل (${allDrivers.length})` },
                  { id: 'pending', label: `انتظار (${pendingDriversCount})` },
                  { id: 'approved', label: `معتمد (${approvedDriversCount})` },
                  { id: 'suspended', label: `موقوف (${suspendedDriversCount})` },
                  { id: 'rejected', label: `مرفوض (${rejectedDriversCount})` },
                ] as { id: DriverFilterTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDriverFilter(tab.id)}
                  className={`px-1 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors truncate cursor-pointer min-h-[36px] ${
                    driverFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
              لا توجد سجلات كباتن مطابقة للتصفية الحالية
            </div>
          ) : (
            <div className="space-y-2.5 w-full min-w-0">
              {filteredDrivers.map((drv) => {
                const isBusy = busyAction?.userId === drv.userId;
                const isApproving = isBusy && busyAction?.type === 'approve';
                const isRejecting = isBusy && busyAction?.type === 'reject';
                const isSuspending = isBusy && busyAction?.type === 'suspend';
                const isReactivating = isBusy && busyAction?.type === 'reactivate';
                const isPending = drv.approvalStatus === 'pending';
                const isApproved = drv.approvalStatus === 'approved';
                const isSuspended = drv.approvalStatus === 'suspended';
                const isRejected = drv.approvalStatus === 'rejected';
                const isOwnDriverProfile = drv.userId === currentUser.uid;
                const isConfirmingDriverDelete = confirmDeleteDriverUid === drv.userId;
                const isDeletingThisDriver = deletingDriverUid === drv.userId;

                return (
                  <div
                    key={drv.userId}
                    className={`w-full min-w-0 bg-white rounded-xl border p-3.5 space-y-2.5 text-xs ${
                      isPending
                        ? 'border-amber-300 bg-amber-50/20'
                        : isSuspended
                        ? 'border-orange-200 bg-orange-50/15'
                        : isRejected
                        ? 'border-red-200 bg-red-50/10'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <Car className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 break-words space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black text-slate-900 text-sm">
                              {drv.displayName}
                            </span>
                            {isOwnDriverProfile && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-400 font-bold text-[10px]">
                                حسابك الحالي
                              </span>
                            )}
                          </div>
                          {drv.email && (
                            <span className="text-[11px] text-slate-400 block truncate">
                              {drv.email}
                            </span>
                          )}
                          <span
                            className="font-mono text-[10px] text-slate-400 block truncate"
                            title={drv.userId}
                          >
                            UID: {drv.userId}
                          </span>
                        </div>
                      </div>

                      {/* Approval Badge */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isPending && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black text-[11px]">
                            pending · بانتظار الموافقة
                          </span>
                        )}
                        {isApproved && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-black text-[11px]">
                            approved · معتمد
                          </span>
                        )}
                        {isSuspended && (
                          <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 font-black text-[11px]">
                            suspended · موقوف مؤقتاً
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-black text-[11px]">
                            rejected · مرفوض
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Full Captain Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-600">
                      <div className="flex items-center justify-between sm:justify-start gap-1">
                        <span className="text-slate-400">الهاتف: </span>
                        <a
                          href={`tel:${drv.contactPhone}`}
                          className="text-slate-900 hover:underline font-mono font-bold inline-flex items-center gap-1 tabular-nums"
                          dir="ltr"
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{drv.contactPhone}</span>
                        </a>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">كود الكابتن: </span>
                        <strong className="font-mono text-slate-800">{drv.captainCode}</strong>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">الاتصال: </span>
                        <strong
                          className={
                            isDriverOnlineAndAvailableNow(drv, nowMs)
                              ? 'text-emerald-700 font-black'
                              : 'text-slate-600'
                          }
                        >
                          {isDriverOnlineAndAvailableNow(drv, nowMs)
                            ? 'متصل (Online)'
                            : 'غير متصل (Offline)'}
                        </strong>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">التوفر: </span>
                        <strong
                          className={
                            isDriverOnlineAndAvailableNow(drv, nowMs)
                              ? 'text-emerald-700 font-black'
                              : 'text-slate-600'
                          }
                        >
                          {isDriverOnlineAndAvailableNow(drv, nowMs)
                            ? 'متاح (Available)'
                            : 'غير متاح (Unavailable)'}
                        </strong>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">المركبة: </span>
                        <strong className="text-slate-800">
                          {drv.vehicleType} ({drv.vehicleModel})
                        </strong>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">المنطقة / اللوحة: </span>
                        <strong className="text-slate-800">{drv.plateNumber}</strong>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">تاريخ التسجيل: </span>
                        <span className="font-semibold text-slate-700">
                          {formatDriverTimestamp(drv.createdAt)}
                        </span>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">آخر تحديث: </span>
                        <span className="font-semibold text-slate-700">
                          {formatDriverTimestamp(drv.updatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Captain Actions: Approve, Reject, Suspend, Reactivate, Delete */}
                    <div className="space-y-2 pt-1">
                      {isPending && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isBusy || isDeletingThisDriver}
                            onClick={() => handleApproveDriver(drv)}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60"
                          >
                            {isApproving ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري الاعتماد...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>قبول واعتماد</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy || isDeletingThisDriver}
                            onClick={() => handleRejectDriver(drv)}
                            className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60"
                          >
                            {isRejecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري الرفض...</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5 shrink-0" />
                                <span>رفض الطلب</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {isApproved && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isBusy || isDeletingThisDriver}
                            onClick={() => handleSuspendDriver(drv)}
                            className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60"
                          >
                            {isSuspending ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري الإيقاف...</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5 shrink-0" />
                                <span>إيقاف مؤقت (Suspend)</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy || isDeletingThisDriver}
                            onClick={() => handleRejectDriver(drv)}
                            className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60"
                          >
                            {isRejecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري الرفض...</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>رفض (Reject)</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {(isSuspended || isRejected) && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isBusy || isDeletingThisDriver}
                            onClick={() => handleReactivateDriver(drv)}
                            className={`w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60 ${
                              isRejected ? 'col-span-2' : ''
                            }`}
                          >
                            {isReactivating ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري التفعيل...</span>
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                <span>إعادة تفعيل (Reactivate)</span>
                              </>
                            )}
                          </button>

                          {isSuspended && (
                            <button
                              type="button"
                              disabled={isBusy || isDeletingThisDriver}
                              onClick={() => handleRejectDriver(drv)}
                              className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-60"
                            >
                              {isRejecting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                  <span>جاري الرفض...</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>رفض نهائي</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Delete Captain Button */}
                      {!isConfirmingDriverDelete && (
                        <button
                          type="button"
                          disabled={isBusy || isDeletingThisDriver}
                          onClick={() => setConfirmDeleteDriverUid(drv.userId)}
                          className="w-full py-2 px-3 bg-white hover:bg-red-50 text-red-600 hover:text-red-800 border border-red-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px] disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>حذف الكابتن</span>
                        </button>
                      )}

                      {/* Confirmation Before Delete Dialog */}
                      {isConfirmingDriverDelete && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-2 text-xs">
                          <p className="font-black text-red-950">
                            هل أنت متأكد من حذف هذا الكابتن؟
                          </p>
                          <div className="text-[11px] font-bold text-red-900">
                            <span>الاسم: {drv.displayName}</span>
                            {drv.contactPhone && (
                              <span className="mr-2 font-mono" dir="ltr">
                                ({drv.contactPhone})
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-red-800 leading-relaxed">
                            سيتم حذف ملف الكابتن من النظام فقط، ولن يتم حذف حساب Google أو بيانات العميل.
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={isDeletingThisDriver}
                              onClick={() => handleConfirmDeleteDriver(drv)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer min-h-[34px] disabled:opacity-60"
                            >
                              {isDeletingThisDriver ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                  <span>جاري الحذف...</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>نعم، حذف الكابتن</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isDeletingThisDriver}
                              onClick={() => setConfirmDeleteDriverUid(null)}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer min-h-[34px]"
                            >
                              تراجع
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {isOwnDriverProfile && isApproved && onSelectRole && (
                      <button
                        type="button"
                        onClick={() => onSelectRole('driver')}
                        className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
                      >
                        <Car className="w-3.5 h-3.5 shrink-0" />
                        <span>فتح لوحة الكابتن الخاصة بك الآن</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Requests Column (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-3.5 w-full min-w-0 order-2 lg:order-1">
          {/* إدارة الطلبات (Ride Request Management & Safe Cleanup Section) */}
          <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <h2 className="text-base font-black text-slate-900">
                  إدارة الطلبات
                </h2>
                <p className="text-[11px] text-slate-500">
                  متابعة جميع الطلبات وتنظيف الطلبات المنتهية فقط (المكتملة والملغاة) مع حماية المشاوير الجارية
                </p>
              </div>

              {!confirmBulkClean && (
                <button
                  type="button"
                  disabled={cleanableOldOrdersCount === 0 || cleaningOldOrders}
                  onClick={() => {
                    setConfirmDeleteReqId(null);
                    setConfirmBulkClean(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>تنظيف الطلبات القديمة ({cleanableOldOrdersCount})</span>
                </button>
              )}
            </div>

            {/* Stats Summary inside إدارة الطلبات */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0">
                <span className="text-[11px] text-slate-500 block truncate">إجمالي الطلبات</span>
                <span className="text-base sm:text-lg font-black font-mono text-slate-900 tabular-nums mt-0.5 block">
                  {totalRequestsCount}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 min-w-0">
                <span className="text-[11px] text-amber-900 font-bold block truncate">
                  طلبات نشطة / جارية
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-amber-700 tabular-nums mt-0.5 block">
                  {activeAndPendingCount}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 min-w-0">
                <span className="text-[11px] text-emerald-900 font-bold block truncate">
                  مكتملة
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-700 tabular-nums mt-0.5 block">
                  {completedCount}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-200 min-w-0">
                <span className="text-[11px] text-red-900 font-bold block truncate">
                  ملغاة
                </span>
                <span className="text-base sm:text-lg font-black font-mono text-red-700 tabular-nums mt-0.5 block">
                  {cancelledCount}
                </span>
              </div>
            </div>

            {/* Bulk Cleanup Confirmation Box */}
            {confirmBulkClean && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-xs">
                <p className="font-black text-red-950 leading-relaxed">
                  سيتم حذف {cleanableOldOrdersCount} طلبًا قديمًا. هل أنت متأكد؟
                </p>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  يشمل التنظيف فقط الطلبات المنتهية (المكتملة والملغاة) مع حذف بيانات الاتصال المرتبطة بها في{' '}
                  <span className="font-mono">rideContacts</span>. لن يتم مساس أي طلب نشط أو قيد البحث أو بيانات الكباتن والمستخدمين.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={cleaningOldOrders || cleanableOldOrdersCount === 0}
                    onClick={handleConfirmBulkCleanup}
                    className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer min-h-[36px] disabled:opacity-60"
                  >
                    {cleaningOldOrders ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>جاري حذف الطلبات القديمة...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>تأكيد حذف ({cleanableOldOrdersCount}) طلب قديم</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={cleaningOldOrders}
                    onClick={() => setConfirmBulkClean(false)}
                    className="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer min-h-[36px]"
                  >
                    إلغاء التنظيف
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Two separate tabs: "🛺 المشاوير" and "📦 الطلبات" */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setOrderTypeTab('rides')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[42px] ${
                orderTypeTab === 'rides'
                  ? 'bg-white text-slate-950 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🛺 المشاوير</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-black ${
                  orderTypeTab === 'rides'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {rideOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOrderTypeTab('deliveries')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[42px] ${
                orderTypeTab === 'deliveries'
                  ? 'bg-white text-slate-950 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📦 الطلبات</span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-black ${
                  orderTypeTab === 'deliveries'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {deliveryOrders.length}
              </span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full min-w-0">
            <h3 className="text-sm sm:text-base font-black text-slate-900">
              {orderTypeTab === 'rides' ? 'سجل المشاوير' : 'سجل الطلبات'} ({filteredOrders.length})
            </h3>

            {/* Filter Tabs */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-200/80 p-1 rounded-xl w-full sm:w-auto max-w-full">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'pending', label: 'قيد البحث' },
                  { id: 'active', label: 'جارية' },
                  { id: 'completed', label: 'مكتملة' },
                  { id: 'cancelled', label: 'ملغاة' },
                ] as { id: FilterTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer min-h-[36px] ${
                    filter === t.id
                      ? 'bg-white text-slate-900 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center space-y-1">
              <Clock className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                لا توجد طلبات مطابقة للتصفية الحالية
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 w-full min-w-0">
              {filteredOrders.map((ord) => {
                const key = ord.requestId || ord.orderNumber || '';
                const canAdminCancel =
                  (isAdminUser || ord.customerId === currentUser.uid) &&
                  (ord.status === 'pending' || ord.status === 'accepted');
                const ordDropoffNote = (ord.dropoffNote ?? ord.dropoffSpecific ?? '').trim();
                const isConfirmingThisDelete =
                  Boolean(ord.requestId) && confirmDeleteReqId === ord.requestId;
                const isDeletingThis =
                  Boolean(ord.requestId) && deletingReqId === ord.requestId;
                const assignedDriverName =
                  ord.acceptedCaptain?.name || ord.driverName || '';
                const assignedDriverPhone =
                  ord.acceptedCaptain?.phone || ord.driverPhone || '';
                const assignedPlate =
                  ord.acceptedCaptain?.plateNumber || ord.plateNumber || '';

                return (
                  <div
                    key={key}
                    className="w-full min-w-0 bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-slate-600 min-w-0">
                        <span className="font-black text-slate-900">
                          #{ord.orderNumber}
                        </span>
                        {ord.requestId && (
                          <span
                            className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[190px] sm:max-w-[240px]"
                            title={ord.requestId}
                          >
                            ID: {ord.requestId}
                          </span>
                        )}
                        <span>·</span>
                        <span>
                          {ord.type === 'delivery' || ord.serviceType === 'delivery'
                            ? '📦 توصيل طلبات'
                            : '🛺 مشوار ركاب'}
                        </span>
                        {ord.category && (
                          <>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                              {getCategoryDisplay(ord.category).fullDisplay}
                            </span>
                          </>
                        )}
                        {ord.sameVillageTier && (
                          <>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 font-bold border border-amber-200">
                              المسافة: {getSameVillageTierDisplay(ord.sameVillageTier)?.fullDisplay}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="font-bold text-slate-800">
                          {statusLabel(ord.status)}
                        </span>
                      </div>

                      <div className="font-mono font-black text-sm text-slate-900 tabular-nums shrink-0">
                        {typeof ord.finalFare === 'number' ? (
                          <span className="text-emerald-700">{ord.finalFare} ج.م (مؤكدة)</span>
                        ) : typeof ord.estimatedFare === 'number' && ord.estimatedFare > 0 ? (
                          `${ord.estimatedFare} ج.م`
                        ) : (
                          <span className="text-amber-800 text-xs">بالاتفاق</span>
                        )}
                        {typeof ord.distanceKm === 'number' &&
                        Number.isFinite(ord.distanceKm) &&
                        ord.distanceKm > 0 ? (
                          <span className="text-xs font-normal text-slate-500 mr-1">
                            ({ord.distanceKm} كم)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Customer & Driver Information Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-600">
                      {ord.category && (
                        <div className="truncate sm:col-span-2">
                          <span className="text-slate-400">نوع الطلب: </span>
                          <strong className="text-amber-900 font-bold">{ord.category}</strong>
                        </div>
                      )}

                      <div className="truncate">
                        <span className="text-slate-400">اسم العميل: </span>
                        <strong className="text-slate-900">{ord.name}</strong>
                      </div>

                      <div className="flex items-center gap-1 truncate">
                        <span className="text-slate-400">هاتف العميل: </span>
                        {ord.phone ? (
                          <a
                            href={`tel:${ord.phone}`}
                            dir="ltr"
                            className="font-mono font-bold text-slate-900 hover:underline inline-flex items-center gap-1 tabular-nums"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{ord.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">غير متاح</span>
                        )}
                      </div>

                      <div className="truncate sm:col-span-2">
                        <span className="text-slate-400">الكابتن المستلم: </span>
                        {assignedDriverName ? (
                          <strong className="text-emerald-700">
                            {assignedDriverName}
                            {assignedPlate ? ` (${assignedPlate})` : ''}
                            {assignedDriverPhone ? ` · ${assignedDriverPhone}` : ''}
                          </strong>
                        ) : (
                          <span className="text-slate-500">لم يتم التعيين بعد</span>
                        )}
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">وقت الإنشاء: </span>
                        <span className="font-semibold text-slate-700">
                          {ord.createdAt || 'الآن'}
                        </span>
                      </div>

                      <div className="truncate">
                        <span className="text-slate-400">آخر تحديث: </span>
                        <span className="font-semibold text-slate-700">
                          {ord.updatedAt || ord.createdAt || 'الآن'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full min-w-0">
                      <div className="flex items-start gap-1.5 min-w-0 break-words">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span>
                            من: <strong className="text-slate-900">{ord.pickupVillage}</strong>
                          </span>
                          {ord.pickupSpecific && (
                            <span className="block text-slate-600 mt-0.5">
                              ملاحظة الركوب: {ord.pickupSpecific}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5 min-w-0 break-words">
                        <Navigation className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span>
                            إلى: <strong className="text-slate-900">{ord.dropoffVillage}</strong>
                          </span>
                          {ordDropoffNote && (
                            <span className="block text-slate-600 mt-0.5">
                              ملاحظة مكان النزول: {ordDropoffNote}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {ord.notes && (
                      <div className="text-slate-600 break-words">
                        <span className="font-bold text-slate-800">ملاحظات: </span>
                        <span>{ord.notes}</span>
                      </div>
                    )}

                    {/* Action Bar: Cancel active request OR Delete single request with confirmation */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-slate-600">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0 break-words text-[11px] text-slate-500">
                        <span>الحالة: {statusLabel(ord.status)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {canAdminCancel && ord.requestId && (
                          <button
                            type="button"
                            onClick={() => cancelCloudRideRequest(ord.requestId!)}
                            className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer min-h-[34px]"
                          >
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>إلغاء الطلب</span>
                          </button>
                        )}

                        {ord.requestId && !isConfirmingThisDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmBulkClean(false);
                              setConfirmDeleteReqId(ord.requestId!);
                            }}
                            className="text-red-600 hover:text-red-800 font-bold flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-50 border border-red-200/80 cursor-pointer min-h-[34px]"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>حذف الطلب</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Single Request Delete Confirmation Box */}
                    {isConfirmingThisDelete && ord.requestId && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-2 text-xs">
                        <p className="font-black text-red-950">
                          هل أنت متأكد من حذف الطلب #{ord.orderNumber} ({ord.requestId})؟
                        </p>
                        <p className="text-[11px] text-red-800">
                          سيتم حذف وثيقة الطلب من <span className="font-mono">rideRequests</span> وبيانات اتصال الطلب من <span className="font-mono">rideContacts</span> فقط دون المساس بحساب العميل أو الكابتن.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() =>
                              handleConfirmDeleteRequest(ord.requestId!, ord.orderNumber)
                            }
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer min-h-[34px] disabled:opacity-60"
                          >
                            {isDeletingThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>جاري الحذف...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>نعم، احذف الطلب</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => setConfirmDeleteReqId(null)}
                            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer min-h-[34px]"
                          >
                            تراجع
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
