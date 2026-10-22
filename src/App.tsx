/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { AuthAccountBar } from './components/AuthAccountBar';
import { MainOrderForm } from './components/MainOrderForm';
import { OrderStatusTracker } from './components/OrderStatusTracker';
import { DriverBroadcastBoard } from './components/DriverBroadcastBoard';
import { AdminDashboard } from './components/AdminDashboard';
import { useFirebase } from './context/FirebaseContext';
import {
  OFFICIAL_PHONE,
  OFFICIAL_WHATSAPP_NUMBER,
  OrderData,
  isPendingOrderExpired,
} from './utils/whatsapp';
import { Phone, MessageCircle } from 'lucide-react';

export default function App() {
  const {
    activeRole,
    setActiveRole,
    pendingCloudOrders,
    activeCustomerOrder,
    setActiveCustomerOrder,
    rejectedRequestIds,
    authError,
    createCloudRideRequest,
    cancelCloudRideRequest,
  } = useFirebase();

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [dismissedOrderId, setDismissedOrderId] = useState<string | null>(null);
  const [heroImageHidden, setHeroImageHidden] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const visiblePendingCount = pendingCloudOrders.filter(
    (o) =>
      !rejectedRequestIds.includes(o.requestId || o.orderNumber || '') &&
      !isPendingOrderExpired(o, nowMs)
  ).length;

  // Show active tracker if customer has an active order that hasn't been dismissed
  const displayedCustomerOrder: OrderData | null =
    activeCustomerOrder &&
    activeCustomerOrder.requestId !== dismissedOrderId
      ? activeCustomerOrder
      : null;

  const handleCreateOrder = async (
    order: OrderData,
    authenticatedUser?: User | null
  ): Promise<OrderData> => {
    setActiveRole('customer');
    setDismissedOrderId(null);
    const createdOrder = await createCloudRideRequest(order, authenticatedUser);
    // Immediately set activeCustomerOrder so OrderStatusTracker displays without waiting for onSnapshot
    setActiveCustomerOrder(createdOrder);
    return createdOrder;
  };

  const handleCancelCustomerOrder = async () => {
    if (displayedCustomerOrder?.requestId) {
      await cancelCloudRideRequest(displayedCustomerOrder.requestId);
    }
  };

  const handleStartNewOrder = () => {
    if (displayedCustomerOrder?.requestId) {
      setDismissedOrderId(displayedCustomerOrder.requestId);
    }
    setActiveCustomerOrder(null);
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Single Clean Sticky Header */}
      <Header
        activeRole={activeRole}
        onSelectRole={setActiveRole}
        onOpenProfileModal={() => setShowProfileModal(true)}
        pendingRequestsCount={visiblePendingCount}
      />

      {/* Profile & Vehicle Settings Modal */}
      <AuthAccountBar
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSelectRole={setActiveRole}
      />

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-7 flex-1 w-full min-w-0 space-y-4 sm:space-y-5">
        {authError && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold break-words">
            {authError}
          </div>
        )}

        {activeRole === 'customer' && (
          <>
            {displayedCustomerOrder ? (
              <OrderStatusTracker
                order={displayedCustomerOrder}
                onCancelOrder={handleCancelCustomerOrder}
                onNewOrder={handleStartNewOrder}
              />
            ) : (
              <div className="space-y-4 w-full min-w-0">
                {/* Welcome Hero Section */}
                <div className="text-center space-y-2.5 sm:space-y-3 px-1">
                  <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      الكابتن
                    </h1>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed">
                      طلبات • دليفري • مدارس • مشاوير .. الكابتن
                    </p>
                  </div>

                  {!heroImageHidden && (
                    <div className="mx-auto w-full max-w-[320px] rounded-[16px] bg-amber-50/90 border border-amber-200/80 p-2 sm:p-2.5 shadow-md">
                      <img
                        src="/images/tuktuk-hero.jpg"
                        loading="eager"
                        decoding="async"
                        width="440"
                        height="322"
                        alt="توكتوك الكابتن"
                        onError={() => setHeroImageHidden(true)}
                        className="w-full h-auto object-contain rounded-xl mx-auto block"
                      />
                    </div>
                  )}
                </div>

                <MainOrderForm
                  onOrderCreated={handleCreateOrder}
                  onEnsureCustomerRole={() => setActiveRole('customer')}
                />
              </div>
            )}
          </>
        )}

        {activeRole === 'driver' && (
          <DriverBroadcastBoard
            onOpenProfileModal={() => setShowProfileModal(true)}
          />
        )}

        {activeRole === 'admin' && (
          <AdminDashboard onSelectRole={setActiveRole} />
        )}
      </main>

      {/* Quiet Minimal Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-3.5 px-3 sm:px-4 w-full">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 text-center sm:text-right">
          <span className="leading-relaxed">
            الكابتن · مشاوير وتوصيل طلبات مركز الزقازيق
          </span>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={`tel:${OFFICIAL_PHONE}`}
              className="text-slate-700 hover:text-slate-900 font-bold flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg hover:bg-slate-100 transition-colors tabular-nums min-h-[38px]"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{OFFICIAL_PHONE}</span>
            </a>
            <span className="text-slate-300">·</span>
            <a
              href={`https://wa.me/${OFFICIAL_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg hover:bg-emerald-50 transition-colors min-h-[38px]"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>واتساب</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
