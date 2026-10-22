import React from 'react';
import { LogIn, LogOut, User as UserIcon, Car, Shield } from 'lucide-react';
import { AppRole, useFirebase } from '../context/FirebaseContext';

interface HeaderProps {
  activeRole: AppRole;
  onSelectRole: (role: AppRole) => void;
  onOpenProfileModal: () => void;
  pendingRequestsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeRole,
  onSelectRole,
  onOpenProfileModal,
  pendingRequestsCount,
}) => {
  const {
    currentUser,
    isAuthReady,
    isApprovedDriver,
    isAdminUser,
    userProfile,
    driverProfile,
    authLoading,
    loginWithGoogle,
    logout,
  } = useFirebase();

  const showCaptainPendingBadge =
    pendingRequestsCount > 0 && (isApprovedDriver || isAdminUser);

  const isNonAnonymousUser = Boolean(currentUser && !currentUser.isAnonymous);

  const displayAccountLabel =
    activeRole === 'driver'
      ? driverProfile?.displayName || 'حساب الكابتن'
      : userProfile?.name || currentUser?.displayName || 'حسابي';

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800 text-white shadow-xs">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 md:py-0 md:h-16 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 md:gap-3">
        {/* Top Row on Mobile: Brand Wordmark + Account Controls */}
        <div className="flex items-center justify-between gap-2 min-w-0 w-full md:w-auto">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectRole('customer')}
            className="flex items-center gap-2 text-right whitespace-nowrap shrink-0 cursor-pointer focus:outline-none min-h-[40px]"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 fill-current">
                <path d="M5 16C3.9 16 3 15.1 3 14V10C3 7.8 4.8 6 7 6H13C14.7 6 16.1 7.1 16.7 8.6L18.4 13H20C20.6 13 21 13.4 21 14C21 14.6 20.6 15 20 15H19C19 16.7 17.7 18 16 18C14.3 18 13 15H9C9 16.7 7.7 18 6 18C5.6 18 5.3 17.9 5 17.7V16ZM6 16.5C6.8 16.5 7.5 15.8 7.5 15C7.5 14.2 6.8 13.5 6 13.5C5.2 13.5 4.5 14.2 4.5 15C4.5 15.8 5.2 16.5 6 16.5ZM16 16.5C16.8 16.5 17.5 15.8 17.5 15C17.5 14.2 16.8 13.5 16 13.5C15.2 13.5 14.5 14.2 14.5 15C14.5 15.8 15.2 16.5 16 16.5ZM5 11H9V8H7C5.9 8 5 8.9 5 10V11ZM11 11H16.2L15 8H11V11Z" />
              </svg>
            </div>
            <span className="text-base sm:text-lg font-black tracking-tight text-white">
              الكابتن
            </span>
          </button>

          {/* Mobile Auth / Account Action (Visible on < md for Driver/Admin or signed-in Google users) */}
          <div className="flex md:hidden items-center gap-1.5 min-w-0 shrink-0">
            {!isAuthReady ? null : isNonAnonymousUser ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={onOpenProfileModal}
                  className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center gap-1.5 text-xs font-bold transition-colors min-w-0 cursor-pointer min-h-[40px]"
                  title="بيانات الحساب"
                >
                  <UserIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="max-w-[100px] xs:max-w-[130px] truncate block">
                    {displayAccountLabel}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-300 border border-slate-700 transition-colors cursor-pointer min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : activeRole !== 'customer' ? (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => loginWithGoogle(activeRole)}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>{authLoading ? 'جاري الدخول...' : 'دخول'}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Zone 2: Clean Segmented Role Navigation (Full-width 3-col grid on mobile, inline on desktop) */}
        <nav
          aria-label="التنقل الرئيسي"
          className="grid grid-cols-3 md:flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 w-full md:w-auto"
        >
          <button
            type="button"
            onClick={() => onSelectRole('customer')}
            className={`px-2 sm:px-3.5 py-2 md:py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer min-h-[40px] md:min-h-[36px] ${
              activeRole === 'customer'
                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>اطلب مشوار</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectRole('driver')}
            className={`px-2 sm:px-3.5 py-2 md:py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer min-h-[40px] md:min-h-[36px] ${
              activeRole === 'driver'
                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Car className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span>الكابتن</span>
            {showCaptainPendingBadge && (
              <span
                className={`text-[10px] sm:text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md tabular-nums leading-none ${
                  activeRole === 'driver'
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectRole('admin')}
            className={`px-2 sm:px-3.5 py-2 md:py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer min-h-[40px] md:min-h-[36px] ${
              activeRole === 'admin'
                ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span>الإدارة</span>
          </button>
        </nav>

        {/* Zone 3: Desktop Auth / Account Action (Visible on md+ for Driver/Admin or signed-in Google users) */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {!isAuthReady ? null : isNonAnonymousUser ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenProfileModal}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center gap-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                title="بيانات الحساب"
              >
                <UserIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="max-w-[140px] truncate">
                  {displayAccountLabel}
                </span>
              </button>

              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-300 border border-slate-700 transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : activeRole !== 'customer' ? (
            <button
              type="button"
              disabled={authLoading}
              onClick={() => loginWithGoogle(activeRole)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] disabled:opacity-60"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>{authLoading ? 'جاري الدخول...' : 'دخول'}</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
