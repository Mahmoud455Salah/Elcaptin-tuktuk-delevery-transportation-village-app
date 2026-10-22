import React, { useState, useEffect } from 'react';
import { AppRole, useFirebase } from '../context/FirebaseContext';
import {
  Shield,
  CheckCircle2,
  X,
  Save,
  Car,
  Phone,
  User as UserIcon,
  Trash2,
} from 'lucide-react';
import { OFFICIAL_PHONE } from '../utils/whatsapp';

interface AuthAccountBarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRole: (role: AppRole) => void;
}

export const AuthAccountBar: React.FC<AuthAccountBarProps> = ({
  isOpen,
  onClose,
  onSelectRole,
}) => {
  const {
    currentUser,
    activeRole,
    isAdminUser,
    userProfile,
    driverProfile,
    saveUserProfile,
    saveDriverProfile,
    unregisterDriverProfile,
  } = useFirebase();

  const isCaptainSettingsMode = activeRole === 'driver' && Boolean(driverProfile);

  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  const [captainCodeInput, setCaptainCodeInput] = useState('ك-101');
  const [roleTitleInput, setRoleTitleInput] = useState('كابتن معتمد - مركز الزقازيق');
  const [vehicleTypeInput, setVehicleTypeInput] = useState('توكتوك');
  const [vehicleModelInput, setVehicleModelInput] = useState('باجاج حديث');
  const [plateNumberInput, setPlateNumberInput] = useState('قطاع الزقازيق');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [confirmUnregister, setConfirmUnregister] = useState(false);

  useEffect(() => {
    setConfirmUnregister(false);
    if (isCaptainSettingsMode && driverProfile) {
      setNameInput(driverProfile.displayName || '');
      setPhoneInput(
        driverProfile.contactPhone && driverProfile.contactPhone !== OFFICIAL_PHONE
          ? driverProfile.contactPhone
          : ''
      );
      setCaptainCodeInput(driverProfile.captainCode || 'ك-101');
      setRoleTitleInput(driverProfile.roleTitle || 'كابتن معتمد - مركز الزقازيق');
      setVehicleTypeInput(driverProfile.vehicleType || 'توكتوك');
      setVehicleModelInput(driverProfile.vehicleModel || 'باجاج حديث');
      setPlateNumberInput(driverProfile.plateNumber || 'قطاع الزقازيق');
    } else if (userProfile) {
      setNameInput(userProfile.name || currentUser?.displayName || '');
      setPhoneInput(
        userProfile.phone && userProfile.phone !== OFFICIAL_PHONE ? userProfile.phone : ''
      );
    } else if (currentUser) {
      setNameInput(currentUser.displayName || '');
      setPhoneInput('');
    }
  }, [isCaptainSettingsMode, driverProfile, userProfile, currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      const cleanName =
        nameInput.trim() ||
        (isCaptainSettingsMode
          ? driverProfile?.displayName || 'كابتن الكابتن'
          : userProfile?.name || currentUser.displayName || 'عميل الكابتن');
      const cleanPhone =
        phoneInput.trim().length >= 5 ? phoneInput.trim() : OFFICIAL_PHONE;

      if (isCaptainSettingsMode && driverProfile) {
        await saveDriverProfile({
          displayName: cleanName,
          captainCode: captainCodeInput.trim() || 'ك-101',
          contactPhone: cleanPhone,
          roleTitle: roleTitleInput.trim() || 'كابتن معتمد - مركز الزقازيق',
          online: driverProfile.online,
          available: driverProfile.available,
          vehicleType: vehicleTypeInput.trim() || 'توكتوك',
          vehicleModel: vehicleModelInput.trim() || 'باجاج حديث',
          plateNumber: plateNumberInput.trim() || 'قطاع الزقازيق',
        });
      } else {
        // Customer / Admin personal profile update: preserves existing driver accountType if user is also a driver
        await saveUserProfile({
          name: cleanName,
          phone: cleanPhone,
        });
      }

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 650);
    } finally {
      setSaving(false);
    }
  };

  const handleUnregisterDriver = async () => {
    setSaving(true);
    try {
      await unregisterDriverProfile();
      onSelectRole('customer');
      onClose();
    } finally {
      setSaving(false);
      setConfirmUnregister(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 rounded-2xl max-w-md w-full min-w-0 p-4 sm:p-5 border border-slate-200 shadow-xl space-y-4 max-h-[92vh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
              {isCaptainSettingsMode ? (
                <Car className="w-5 h-5" />
              ) : (
                <UserIcon className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-slate-900 truncate">
                {isCaptainSettingsMode ? 'بيانات الكابتن والمركبة' : 'بيانات الحساب الشخصي'}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {isCaptainSettingsMode
                  ? 'تحديث اسم الكابتن ورقم التواصل وبيانات المركبة'
                  : 'تحديث الاسم ورقم الموبايل المسجل في حسابك'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-right w-full min-w-0">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="space-y-1 min-w-0">
              <label className="text-xs font-bold text-slate-700 block">
                {isCaptainSettingsMode ? 'اسم الكابتن:' : 'الاسم:'}
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={isCaptainSettingsMode ? 'اسم الكابتن' : 'الاسم الكامل'}
                className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
              />
            </div>

            <div className="space-y-1 min-w-0">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>رقم الموبايل:</span>
              </label>
              <input
                type="tel"
                required
                minLength={5}
                maxLength={25}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[46px]"
              />
            </div>
          </div>

          {/* Driver Specific Profile Fields (ONLY when editing Captain Vehicle Settings in Driver Mode) */}
          {isCaptainSettingsMode && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 w-full min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                <Car className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>بيانات المركبة والكابتن</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1 min-w-0">
                  <label className="text-[11px] font-bold text-slate-600 block">
                    كود الكابتن:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={captainCodeInput}
                    onChange={(e) => setCaptainCodeInput(e.target.value)}
                    placeholder="ك-101"
                    className="w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs bg-white min-h-[44px]"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[11px] font-bold text-slate-600 block">
                    نوع المركبة:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={vehicleTypeInput}
                    onChange={(e) => setVehicleTypeInput(e.target.value)}
                    placeholder="توكتوك"
                    className="w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs bg-white min-h-[44px]"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[11px] font-bold text-slate-600 block">
                    الموديل:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={vehicleModelInput}
                    onChange={(e) => setVehicleModelInput(e.target.value)}
                    placeholder="باجاج حديث"
                    className="w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs bg-white min-h-[44px]"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[11px] font-bold text-slate-600 block">
                    اللوحة / القطاع:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={plateNumberInput}
                    onChange={(e) => setPlateNumberInput(e.target.value)}
                    placeholder="قطاع الزقازيق"
                    className="w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs bg-white min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}

          {isAdminUser && (
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="truncate">حساب مدير النظام ({currentUser.email})</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[48px] disabled:opacity-60"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>تم الحفظ</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 shrink-0" />
                  <span>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer min-h-[48px] shrink-0"
            >
              إلغاء
            </button>
          </div>

          {isCaptainSettingsMode && isAdminUser && (
            <div className="pt-2 border-t border-slate-100">
              {!confirmUnregister ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnregister(true)}
                  className="w-full py-2.5 px-3 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>إلغاء تسجيل الحساب ككابتن والعودة كعميل فقط</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-xs">
                  <p className="font-bold text-red-900">
                    هل تريد حذف ملف الكابتن الخاص بك والبقاء كعميل فقط؟
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleUnregisterDriver}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg cursor-pointer min-h-[38px]"
                    >
                      تأكيد إلغاء الكابتن
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnregister(false)}
                      className="px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer min-h-[38px]"
                    >
                      تراجع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
