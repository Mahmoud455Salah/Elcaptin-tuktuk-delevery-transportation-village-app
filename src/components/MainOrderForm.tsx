import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';
import { VILLAGES } from '../data/villages';
import {
  OFFICIAL_PHONE,
  OrderData,
  OrderLocationCoords,
} from '../utils/whatsapp';
import {
  calculateVillageFare,
  SameVillageTier,
  SAME_VILLAGE_TIER_OPTIONS,
  getSameVillageTiers,
  DEFAULT_SAME_VILLAGE_TIERS,
} from '../data/fares';
import { DELIVERY_CATEGORIES } from '../data/categories';
import {
  MapPin,
  Navigation,
  ArrowUpDown,
  Car,
  Package,
  Phone,
  User as UserIcon,
  AlertCircle,
  Loader2,
  X,
  CreditCard,
  Banknote,
  FileText,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';

interface MainOrderFormProps {
  onOrderCreated: (order: OrderData, authenticatedUser?: User | null) => Promise<OrderData>;
  onEnsureCustomerRole?: () => void;
}

export const OTHER_VILLAGE_OPTION = 'قرية تانية (اكتب اسمها)';

interface VillageCustomDropdownProps {
  id: string;
  label: string;
  placeholder: string;
  selectedValue: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (villageName: string) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

const VillageCustomDropdown: React.FC<VillageCustomDropdownProps> = ({
  id,
  label,
  placeholder,
  selectedValue,
  isOpen,
  onToggle,
  onClose,
  onSelect,
  dropdownRef,
}) => {
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const optionsCount = VILLAGES.length + 1;

  useEffect(() => {
    if (isOpen) {
      if (selectedValue === OTHER_VILLAGE_OPTION) {
        setHighlightedIndex(VILLAGES.length);
      } else {
        const idx = VILLAGES.findIndex((v) => v.name === selectedValue);
        setHighlightedIndex(idx >= 0 ? idx : 0);
      }
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, selectedValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % optionsCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + optionsCount) % optionsCount);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < VILLAGES.length) {
        onSelect(VILLAGES[highlightedIndex].name);
        onClose();
      } else if (highlightedIndex === VILLAGES.length) {
        onSelect(OTHER_VILLAGE_OPTION);
        onClose();
      }
    }
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className={`w-full py-2.5 px-3.5 bg-white border rounded-xl text-right flex items-center justify-between gap-2 transition-all cursor-pointer min-h-[44px] ${
          isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <span
          className={`text-xs sm:text-sm truncate ${
            selectedValue ? 'font-bold text-slate-900' : 'text-slate-400 font-medium'
          }`}
        >
          {selectedValue || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-[60vh] overflow-y-auto divide-y divide-slate-100 focus:outline-none"
        >
          {VILLAGES.map((v, idx) => {
            const isSelected = selectedValue === v.name;
            const isHighlighted = highlightedIndex === idx;
            return (
              <button
                key={v.id}
                role="option"
                type="button"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(v.name);
                  onClose();
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full text-right p-3 sm:px-3.5 sm:py-3 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-amber-50/90 text-amber-950 font-black'
                    : isHighlighted
                    ? 'bg-amber-50/50 text-slate-900'
                    : 'hover:bg-amber-50/50 text-slate-900'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <span className="text-xs sm:text-sm font-bold block">
                    {v.name}
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-tight">
                    {v.description}
                  </span>
                </div>
                {isSelected && (
                  <Check className="w-4 h-4 text-amber-600 shrink-0" />
                )}
              </button>
            );
          })}

          {/* The last option: قرية تانية (اكتب اسمها) */}
          <button
            role="option"
            type="button"
            aria-selected={selectedValue === OTHER_VILLAGE_OPTION}
            onClick={() => {
              onSelect(OTHER_VILLAGE_OPTION);
              onClose();
            }}
            onMouseEnter={() => setHighlightedIndex(VILLAGES.length)}
            className={`w-full text-right p-3 sm:px-3.5 sm:py-3 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
              selectedValue === OTHER_VILLAGE_OPTION
                ? 'bg-amber-50/90 text-amber-950 font-black'
                : highlightedIndex === VILLAGES.length
                ? 'bg-amber-50/50 text-slate-900'
                : 'hover:bg-amber-50/50 text-slate-900'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <span className="text-xs sm:text-sm font-bold block text-amber-950">
                {OTHER_VILLAGE_OPTION}
              </span>
              <span className="text-[11px] text-slate-500 block leading-tight">
                اكتب اسم قريتك لو مش موجودة في القايمة
              </span>
            </div>
            {selectedValue === OTHER_VILLAGE_OPTION && (
              <Check className="w-4 h-4 text-amber-600 shrink-0" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export const MainOrderForm: React.FC<MainOrderFormProps> = ({
  onOrderCreated,
  onEnsureCustomerRole,
}) => {
  const {
    currentUser,
    userProfile,
    pendingOrderDraft,
    setPendingOrderDraft,
    setAuthIntent,
    setActiveRole,
  } = useFirebase();

  const [serviceType, setServiceType] = useState<'ride' | 'delivery'>(
    () => pendingOrderDraft?.serviceType ?? 'ride'
  );

  // Delivery Category state
  const [deliveryCategoryId, setDeliveryCategoryId] = useState<string>(() => {
    if (pendingOrderDraft?.category) {
      const match = DELIVERY_CATEGORIES.find(
        (c) => c.label === pendingOrderDraft.category || c.id === pendingOrderDraft.category
      );
      if (match) return match.id;
      return 'other';
    }
    return 'grocery';
  });

  const [customCategoryText, setCustomCategoryText] = useState<string>(() => {
    if (pendingOrderDraft?.category) {
      const match = DELIVERY_CATEGORIES.find(
        (c) => c.label === pendingOrderDraft.category || c.id === pendingOrderDraft.category
      );
      if (!match) return pendingOrderDraft.category.slice(0, 60);
    }
    return '';
  });

  const [name, setName] = useState(() => pendingOrderDraft?.name ?? '');
  const [phone, setPhone] = useState(() => pendingOrderDraft?.phone ?? '');

  // Custom Dropdown Open State: only one dropdown open at a time
  const [openDropdown, setOpenDropdown] = useState<'pickup' | 'dropoff' | null>(null);
  const pickupDropdownRef = useRef<HTMLDivElement | null>(null);
  const dropoffDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click/touch outside or Escape key
  useEffect(() => {
    if (!openDropdown) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        openDropdown === 'pickup' &&
        pickupDropdownRef.current &&
        !pickupDropdownRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      } else if (
        openDropdown === 'dropoff' &&
        dropoffDropdownRef.current &&
        !dropoffDropdownRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  // Pickup selection: Custom Dropdown + Optional Custom Village + Optional Landmark
  const [pickupVillage, setPickupVillage] = useState(
    () => pendingOrderDraft?.pickupVillage ?? ''
  );
  const [customPickupVillage, setCustomPickupVillage] = useState(
    () => pendingOrderDraft?.customPickupVillage ?? ''
  );
  const [pickupSpecific, setPickupSpecific] = useState(
    () => pendingOrderDraft?.pickupSpecific ?? ''
  );

  // Drop-off selection: Custom Dropdown + Optional Custom Village + Optional Landmark
  const [dropoffVillage, setDropoffVillage] = useState(
    () => pendingOrderDraft?.dropoffVillage ?? ''
  );
  const [customDropoffVillage, setCustomDropoffVillage] = useState(
    () => pendingOrderDraft?.customDropoffVillage ?? ''
  );
  const [dropoffNote, setDropoffNote] = useState(
    () => pendingOrderDraft?.dropoffNote ?? ''
  );
  const [sameVillageTier, setSameVillageTier] = useState<SameVillageTier>(
    () => pendingOrderDraft?.sameVillageTier ?? 'near'
  );

  // Optional GPS
  const [locationCoords, setLocationCoords] = useState<OrderLocationCoords | null>(
    () => pendingOrderDraft?.locationCoords ?? null
  );
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(() =>
    pendingOrderDraft?.locationCoords ? 'success' : 'idle'
  );
  const [gpsMessage, setGpsMessage] = useState<string>(() =>
    pendingOrderDraft?.locationCoords ? 'تم تحديد موقعك بدقة 📍' : ''
  );

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'vodafone_cash'>(
    () => pendingOrderDraft?.paymentMethod ?? 'cash'
  );
  const [notes, setNotes] = useState(() => pendingOrderDraft?.notes ?? '');

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Auto-fill user profile info if logged in
  useEffect(() => {
    if (userProfile?.name && !name) {
      setName(userProfile.name);
    }
    if (
      userProfile?.phone &&
      userProfile.phone !== OFFICIAL_PHONE &&
      !phone
    ) {
      setPhone(userProfile.phone);
    }
  }, [userProfile]);

  // Derived Effective Names
  const isCustomPickup = pickupVillage === OTHER_VILLAGE_OPTION;
  const isCustomDropoff = dropoffVillage === OTHER_VILLAGE_OPTION;

  const effectivePickupVillage = isCustomPickup
    ? customPickupVillage.trim()
    : pickupVillage;

  const effectiveDropoffVillage = isCustomDropoff
    ? customDropoffVillage.trim()
    : dropoffVillage;

  // Real-time Pricing calculation from precomputed symmetric table (+ DISTANCE_BUFFER_KM or same-village tiers)
  const fareResult = useMemo(() => {
    if (!effectivePickupVillage || !effectiveDropoffVillage) return null;
    return calculateVillageFare(
      effectivePickupVillage,
      effectiveDropoffVillage,
      isCustomPickup,
      isCustomDropoff,
      sameVillageTier
    );
  }, [effectivePickupVillage, effectiveDropoffVillage, isCustomPickup, isCustomDropoff, sameVillageTier]);

  // Handle GPS location request (completely optional, never blocks order)
  const handleGetGps = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error');
      setGpsMessage('المتصفح لا يدعم تحديد الموقع، المشوار شغال عادي بدونه');
      return;
    }

    setGpsStatus('loading');
    setGpsMessage('جاري تحديد موقعك الحالي...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: OrderLocationCoords = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        };
        setLocationCoords(coords);
        setGpsStatus('success');
        setGpsMessage('تم تحديد موقعك بدقة وسيرسل للكابتن 📍');
      },
      (err) => {
        setGpsStatus('error');
        setGpsMessage('تعذر الحصول على الموقع تلقائياً، يمكنك إكمال المشوار باختيار قريتك');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleClearGps = () => {
    setLocationCoords(null);
    setGpsStatus('idle');
    setGpsMessage('');
  };

  // Swap pickup & dropoff
  const handleSwapLocations = () => {
    setOpenDropdown(null);
    const prevPickupV = pickupVillage;
    const prevCustomPickupV = customPickupVillage;
    const prevPickupSpec = pickupSpecific;

    setPickupVillage(dropoffVillage);
    setCustomPickupVillage(customDropoffVillage);
    setPickupSpecific(dropoffNote);

    setDropoffVillage(prevPickupV);
    setCustomDropoffVillage(prevCustomPickupV);
    setDropoffNote(prevPickupSpec);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    setOpenDropdown(null);
    setFormError(null);

    if (!pickupVillage) {
      setFormError('يرجى اختيار مكان الركوب (هتركب منين؟).');
      return;
    }
    if (isCustomPickup && !customPickupVillage.trim()) {
      setFormError('يرجى كتابة اسم القرية أو المكان الذي هتركب منه.');
      return;
    }

    if (!dropoffVillage) {
      setFormError('يرجى اختيار مكان النزول (رايح فين؟).');
      return;
    }
    if (isCustomDropoff && !customDropoffVillage.trim()) {
      setFormError('يرجى كتابة اسم القرية أو المكان الذي رايح له.');
      return;
    }

    // Determine category based on service type
    let resolvedCategory = 'مشوار شخصي';
    if (serviceType === 'delivery') {
      if (deliveryCategoryId === 'other') {
        const cleanCustom = customCategoryText.trim();
        if (!cleanCustom) {
          setFormError('يرجى كتابة نوع الطلب (بحد أقصى 60 حرفاً).');
          return;
        }
        resolvedCategory = cleanCustom;
      } else {
        const found = DELIVERY_CATEGORIES.find((c) => c.id === deliveryCategoryId);
        resolvedCategory = found ? found.label : 'توصيل طلبات';
      }
    }

    const finalName = name.trim();
    if (!finalName) {
      setFormError('يرجى كتابة الاسم للتواصل مع الكابتن.');
      return;
    }

    const finalPhone = phone.trim();
    if (!finalPhone || finalPhone.length < 8) {
      setFormError('يرجى إدخال رقم موبايل صحيح (8 أرقام على الأقل) للتواصل.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setActiveRole('customer');
    onEnsureCustomerRole?.();

    try {
      let activeUser: User | null = currentUser || auth.currentUser;
      if (!activeUser) {
        try {
          const anonymousCredential = await signInAnonymously(auth);
          activeUser = anonymousCredential.user;
        } catch {
          // If anonymous login fails, continue; createCloudRideRequest handles fallback
        }
      }

      const shortOrderNum = Math.floor(1000 + Math.random() * 9000).toString();
      const distanceKm = fareResult?.distanceKm ?? 0;
      const estimatedFare = fareResult?.estimatedFare ?? 0;
      const isSameVillage = Boolean(
        fareResult?.isSameVillage && !fareResult?.isFixedOverride
      );

      const order: OrderData = {
        orderNumber: shortOrderNum,
        serviceType,
        type: serviceType,
        sameVillageTier: isSameVillage ? sameVillageTier : undefined,
        name: finalName,
        phone: finalPhone,
        pickupVillage: effectivePickupVillage,
        pickupSpecific: pickupSpecific.trim(),
        pickupLat: locationCoords?.latitude,
        pickupLng: locationCoords?.longitude,
        dropoffVillage: effectiveDropoffVillage,
        dropoffSpecific: dropoffNote.trim(),
        dropoffNote: dropoffNote.trim(),
        category: resolvedCategory,
        distanceKm,
        estimatedFare,
        paymentMethod,
        notes: notes.trim(),
        locationCoords: locationCoords || undefined,
        createdAt: 'الآن',
        status: 'pending',
      };

      await onOrderCreated(order, activeUser);
      setPendingOrderDraft(null);
      setAuthIntent(null);
    } catch (err: any) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.';
      setFormError(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 shadow-xs">
      {/* Header & Service Type Selector */}
      <div className="p-3.5 sm:p-5 bg-slate-900 text-white rounded-t-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-xl font-black text-white">
              {serviceType === 'ride' ? '🛺 طلب مشوار بالتوكتوك' : '📦 توصيل طلبات وأغراض'}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {serviceType === 'ride'
                ? 'خدمة ركاب سريعة ومريحة بين القرى والمدن'
                : 'توصيل البقالة والعلاج والطلبات إلى باب بيتك'}
            </p>
          </div>
          <span className="text-xs text-amber-400 font-bold bg-slate-800 px-2.5 py-1 rounded-lg">
            خدمة سريعة وأمينة ⚡
          </span>
        </div>

        {/* Ride vs Delivery Toggle Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-800/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setServiceType('ride')}
            className={`py-2 px-3 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              serviceType === 'ride'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Car className="w-4 h-4 shrink-0" />
            <span>مشوار ركاب</span>
          </button>

          <button
            type="button"
            onClick={() => setServiceType('delivery')}
            className={`py-2 px-3 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              serviceType === 'delivery'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>توصيل طلبات</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-3.5 sm:p-5 space-y-4">
        {/* Form Error Banner */}
        {formError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="flex-1">{formError}</span>
          </div>
        )}

        {/* DELIVERY-ONLY: Category Cards Grid (Part 3) */}
        {serviceType === 'delivery' && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-900 block">
                اختر نوع الطلب للتوصيل:
              </label>
              <span className="text-[11px] font-bold text-amber-950 bg-amber-200/70 px-2 py-0.5 rounded-md">
                {DELIVERY_CATEGORIES.find((c) => c.id === deliveryCategoryId)?.label || 'حدد النوع'}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="نوع طلب التوصيل"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5"
            >
              {DELIVERY_CATEGORIES.map((cat) => {
                const isSelected = deliveryCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    role="radio"
                    type="button"
                    aria-checked={isSelected}
                    onClick={() => {
                      setDeliveryCategoryId(cat.id);
                      if (cat.id !== 'other') {
                        setCustomCategoryText('');
                      }
                    }}
                    className={`relative p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 min-h-[76px] ${
                      isSelected
                        ? 'bg-[#FFC400] text-slate-950 border-slate-900 border-2 shadow-sm font-black scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 shadow-2xs hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-slate-900 text-[#FFC400] flex items-center justify-center text-[10px] font-black">
                        ✓
                      </span>
                    )}
                    <span className="text-2xl sm:text-3xl select-none leading-none">
                      {cat.emoji}
                    </span>
                    <span className="text-xs sm:text-sm font-bold block truncate max-w-full">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {deliveryCategoryId === 'other' && (
              <div className="pt-1.5 space-y-1">
                <label className="text-xs font-bold text-slate-800 block">
                  اكتب نوع الطلب (مطلوب):
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={customCategoryText}
                  onChange={(e) => setCustomCategoryText(e.target.value.slice(0, 60))}
                  placeholder="اكتب نوع الطلب (مثال: مستندات، قطع غيار)..."
                  className="w-full py-2.5 px-3 bg-white border border-amber-400 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[11px] text-slate-500 block text-left" dir="ltr">
                  {customCategoryText.length}/60
                </span>
              </div>
            )}
          </div>
        )}

        {/* 2. PICKUP SECTION ("هتركب منين؟" / مكان الاستلام) */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="pickup-dropdown-btn"
              className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {serviceType === 'ride' ? 'هتركب منين؟ (مكان الركوب)' : 'مكان استلام الطلب:'}
              </span>
            </label>

            {/* Optional Small GPS Button */}
            {!locationCoords ? (
              <button
                type="button"
                onClick={handleGetGps}
                disabled={gpsStatus === 'loading'}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                {gpsStatus === 'loading' ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                ) : (
                  <span>📍 ابعت موقعي للكابتن (اختياري)</span>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-lg border border-emerald-300">
                <span>📍 موقعك محدد</span>
                <button
                  type="button"
                  onClick={handleClearGps}
                  title="إلغاء مشاركة الموقع"
                  className="p-0.5 hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* GPS Status Message if active or failed */}
          {gpsMessage && (
            <p
              className={`text-[11px] font-semibold leading-tight ${
                gpsStatus === 'success'
                  ? 'text-emerald-700'
                  : gpsStatus === 'error'
                  ? 'text-amber-800'
                  : 'text-slate-600'
              }`}
            >
              {gpsMessage}
            </p>
          )}

          {/* Custom Village Dropdown for Pickup */}
          <VillageCustomDropdown
            id="pickup-dropdown-btn"
            label="مكان الركوب أو الاستلام"
            placeholder="اختر مكان الركوب (القرية أو المنطقة)..."
            selectedValue={pickupVillage}
            isOpen={openDropdown === 'pickup'}
            onToggle={() =>
              setOpenDropdown((prev) => (prev === 'pickup' ? null : 'pickup'))
            }
            onClose={() => setOpenDropdown(null)}
            onSelect={(selectedName) => {
              setPickupVillage(selectedName);
              if (selectedName !== OTHER_VILLAGE_OPTION) {
                setCustomPickupVillage('');
              }
            }}
            dropdownRef={pickupDropdownRef}
          />

          {/* Custom Village Input if selected */}
          {isCustomPickup && (
            <div className="pt-1">
              <input
                type="text"
                value={customPickupVillage}
                onChange={(e) => setCustomPickupVillage(e.target.value)}
                placeholder="اكتب اسم القرية أو المنطقة هنا..."
                className="w-full py-2 px-3 bg-white border border-amber-400 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Optional Landmark / Note */}
          <div>
            <input
              type="text"
              value={pickupSpecific}
              onChange={(e) => setPickupSpecific(e.target.value)}
              placeholder="مثال: جنب المدرسة، قدام الصيدلية (اختياري)"
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* SWAP BUTTON */}
        <div className="flex justify-center -my-1">
          <button
            type="button"
            onClick={handleSwapLocations}
            title="تبديل نقطة الركوب والوجهة"
            className="p-1.5 rounded-full bg-slate-100 hover:bg-amber-100 border border-slate-200 hover:border-amber-400 text-slate-600 hover:text-amber-900 transition-all cursor-pointer shadow-2xs"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        {/* 3. DROPOFF SECTION ("رايح فين؟" / مكان التسليم) */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
          <label
            htmlFor="dropoff-dropdown-btn"
            className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5"
          >
            <Navigation className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              {serviceType === 'ride' ? 'رايح فين؟ (مكان النزول / الوجهة)' : 'مكان تسليم وتوصيل الطلب:'}
            </span>
          </label>

          {/* Custom Village Dropdown for Drop-off */}
          <VillageCustomDropdown
            id="dropoff-dropdown-btn"
            label="مكان النزول أو التسليم"
            placeholder="اختر مكان النزول (القرية أو الوجهة)..."
            selectedValue={dropoffVillage}
            isOpen={openDropdown === 'dropoff'}
            onToggle={() =>
              setOpenDropdown((prev) => (prev === 'dropoff' ? null : 'dropoff'))
            }
            onClose={() => setOpenDropdown(null)}
            onSelect={(selectedName) => {
              setDropoffVillage(selectedName);
              if (selectedName !== OTHER_VILLAGE_OPTION) {
                setCustomDropoffVillage('');
              }
            }}
            dropdownRef={dropoffDropdownRef}
          />

          {/* Custom Village Input if selected */}
          {isCustomDropoff && (
            <div className="pt-1">
              <input
                type="text"
                value={customDropoffVillage}
                onChange={(e) => setCustomDropoffVillage(e.target.value)}
                placeholder="اكتب اسم المكان أو القرية هنا..."
                className="w-full py-2 px-3 bg-white border border-amber-400 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Optional Landmark / Note */}
          <div>
            <input
              type="text"
              value={dropoffNote}
              onChange={(e) => setDropoffNote(e.target.value)}
              placeholder="مثال: جنب المدرسة، قدام الصيدلية (اختياري)"
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Same-Village Distance Tier Selector (ONLY when pickup & drop-off are the same listed village without fixed override) */}
        {fareResult && fareResult.isSameVillage && !fareResult.isFixedOverride && (
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-900 block">
                المسافة جوه القرية:
              </label>
              <span className="text-[11px] text-amber-900 font-bold bg-amber-200/60 px-2 py-0.5 rounded-md">
                مشوار داخلي بـ {effectivePickupVillage}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="المسافة جوه القرية"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5"
              dir="rtl"
            >
              {SAME_VILLAGE_TIER_OPTIONS.map((tier) => {
                const isSelected = sameVillageTier === tier.id;
                const villageTiers = getSameVillageTiers(effectivePickupVillage);
                const tierPrice = villageTiers[tier.id] ?? DEFAULT_SAME_VILLAGE_TIERS[tier.id];

                return (
                  <button
                    key={tier.id}
                    role="radio"
                    type="button"
                    aria-checked={isSelected}
                    onClick={() => setSameVillageTier(tier.id)}
                    className={`relative p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[72px] ${
                      isSelected
                        ? 'bg-[#FFC400] text-[#0f172a] border-[#0f172a] border-2 shadow-sm font-black scale-[1.01]'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 shadow-2xs hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-[#0f172a] text-[#FFC400] flex items-center justify-center text-[10px] font-black">
                        ✓
                      </span>
                    )}
                    <span className="text-xs sm:text-sm font-bold block leading-tight">
                      {tier.fullLabel}
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono">
                      {tierPrice} جنيه
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. PRICE DISPLAY CARD */}
        <div className="rounded-2xl border overflow-hidden transition-all">
          {fareResult ? (
            fareResult.isNegotiable ? (
              <div className="p-3.5 bg-amber-50/90 border-amber-300 text-amber-950 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-sm sm:text-base">
                  <span>الأجرة: بالاتفاق مع الكابتن 🤝</span>
                </div>
                <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                  لأن إحدى القرى بالاسم اليدوي، يمكنك الاتفاق مباشرة على السعر مع الكابتن عند التواصل.
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-50/90 border-emerald-300 text-emerald-950 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-black text-emerald-900">
                    الأجرة التقريبية:
                  </span>
                  <div className="flex items-baseline gap-1 font-mono font-black text-lg sm:text-xl text-emerald-950 tabular-nums">
                    <span>{fareResult.estimatedFare}</span>
                    <span className="text-xs font-bold">جنيه</span>
                  </div>
                </div>

                {fareResult.distanceKm !== null && !fareResult.isSameVillage && (
                  <div className="text-[11px] font-bold text-emerald-800">
                    المسافة التقريبية: {fareResult.distanceKm} كم
                  </div>
                )}

                <div className="text-[11px] text-emerald-700 font-semibold pt-0.5">
                  السعر النهائي يتأكد مع الكابتن قبل الركوب
                </div>
              </div>
            )
          ) : (
            <div className="p-3 bg-slate-50 border-slate-200 text-slate-500 text-xs text-center font-bold">
              اختر مكان الركوب والوجهة لمعرفة الأجرة التقريبية 🚕
            </div>
          )}
        </div>

        {/* 5. CUSTOMER INFORMATION */}
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Customer Name */}
            <div className="space-y-1">
              <label
                htmlFor="cust-name"
                className="text-xs font-black text-slate-700 flex items-center gap-1"
              >
                <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>الاسم:</span>
              </label>
              <input
                id="cust-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك الكريم"
                className="w-full py-2.5 px-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Customer Phone */}
            <div className="space-y-1">
              <label
                htmlFor="cust-phone"
                className="text-xs font-black text-slate-700 flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>رقم الموبايل:</span>
              </label>
              <input
                id="cust-phone"
                type="tel"
                dir="ltr"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                className="w-full py-2.5 px-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Payment Method Toggle */}
          <div className="space-y-1">
            <label className="text-xs font-black text-slate-700 block">
              طريقة الدفع:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-950'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>كاش (نقدي)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('vodafone_cash')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'vodafone_cash'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-950'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-red-600 shrink-0" />
                <span>فودافون كاش</span>
              </button>
            </div>
          </div>

          {/* Extra Notes (Optional) */}
          <div className="space-y-1">
            <label
              htmlFor="cust-notes"
              className="text-xs font-black text-slate-700 flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>ملاحظات إضافية للكابتن (اختياري):</span>
            </label>
            <input
              id="cust-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: معايا شنط، مستعجل، تفاصيل الطلب، إلخ"
              className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* 6. SUBMIT BUTTON */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[50px] shadow-sm disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <span>جاري إرسال الطلب للكباتن...</span>
              </>
            ) : (
              <>
                {serviceType === 'ride' ? (
                  <>
                    <Car className="w-5 h-5 shrink-0" />
                    <span>اطلب مشوار الآن 🛺</span>
                  </>
                ) : (
                  <>
                    <Package className="w-5 h-5 shrink-0" />
                    <span>اطلب التوصيل الآن 📦</span>
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
