export interface OrderCategoryItem {
  id: string;
  label: string;
  emoji: string;
}

export const DELIVERY_CATEGORIES: OrderCategoryItem[] = [
  { id: 'grocery', label: 'بقالة', emoji: '🛒' },
  { id: 'medicine', label: 'علاج', emoji: '💊' },
  { id: 'produce', label: 'خضار وفاكهة', emoji: '🥬' },
  { id: 'food', label: 'أكل', emoji: '🍔' },
  { id: 'parcel', label: 'طرد / شحنة', emoji: '📦' },
  { id: 'personal', label: 'مشوار شخصي', emoji: '🏃' },
  { id: 'other', label: 'أخرى', emoji: '✨' },
];

/**
 * Maps a stored category (either plain Arabic label or id or custom text)
 * to its corresponding emoji + label.
 * Never stores emoji in Firestore; only formats for display.
 */
export function getCategoryDisplay(category?: string | null): {
  id: string;
  label: string;
  emoji: string;
  fullDisplay: string;
} {
  const clean = (category || '').trim();
  if (!clean) {
    return { id: '', label: '', emoji: '', fullDisplay: '' };
  }

  const match = DELIVERY_CATEGORIES.find(
    (c) => c.id === clean || c.label === clean
  );

  if (match) {
    return {
      id: match.id,
      label: match.label,
      emoji: match.emoji,
      fullDisplay: `${match.emoji} ${match.label}`,
    };
  }

  // Unknown or custom category from "أخرى"
  return {
    id: 'other',
    label: clean,
    emoji: '✨',
    fullDisplay: `✨ ${clean}`,
  };
}
