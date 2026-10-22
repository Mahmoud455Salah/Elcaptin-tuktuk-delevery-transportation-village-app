import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  BLUEPRINT_CONSTRAINTS,
  sanitizeId,
} from '../firebase';
import { Send, MessageSquare, Volume2 } from 'lucide-react';
import { playShortNotificationSound } from '../utils/soundAlert';

export interface OrderChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  customerId: string;
  driverId: string;
  senderRole: 'customer' | 'driver';
  text: string;
  createdAtMs: number;
  createdAtFormatted: string;
}

interface OrderChatBoxProps {
  orderId: string;
  customerId: string;
  driverId: string;
  currentUserId: string;
  senderRole: 'customer' | 'driver';
  orderStatus?: string;
  onUnreadChange?: (unreadCount: number) => void;
}

const DRIVER_QUICK_REPLIES = ['جاي في الطريق', 'وصلت', 'اتصل بيا'];
const CUSTOMER_QUICK_REPLIES = ['أنا مستنيك', 'أنا في المكان المحدد'];

function formatMessageTime(ts: unknown): { ms: number; label: string } {
  if (
    ts &&
    typeof ts === 'object' &&
    'toDate' in ts &&
    typeof (ts as Timestamp).toDate === 'function'
  ) {
    try {
      const date = (ts as Timestamp).toDate();
      return {
        ms: date.getTime(),
        label: date.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    } catch {
      return { ms: Date.now(), label: 'الآن' };
    }
  }
  return { ms: Date.now(), label: 'الآن' };
}

export const OrderChatBox: React.FC<OrderChatBoxProps> = ({
  orderId,
  customerId,
  driverId,
  currentUserId,
  senderRole,
  orderStatus,
  onUnreadChange,
}) => {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const initialLoadDoneRef = useRef(false);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastSentAtMsRef = useRef<number>(0);

  const cleanOrderId = sanitizeId(orderId || '');
  const cleanUid = sanitizeId(currentUserId || '');
  const cleanCustomerId = sanitizeId(customerId || '');
  const cleanDriverId = sanitizeId(driverId || '');

  // Only allow chat when order is "accepted" or "on_the_way" and currentUser is a participant
  const isParticipant =
    Boolean(cleanUid) &&
    (cleanUid === cleanCustomerId || cleanUid === cleanDriverId);

  const isChatAllowed =
    (orderStatus === 'accepted' || orderStatus === 'on_the_way') &&
    Boolean(orderId && customerId && driverId && currentUserId) &&
    isParticipant;

  useEffect(() => {
    if (!isChatAllowed) {
      setMessages([]);
      setUnreadCount(0);
      onUnreadChange?.(0);
      return;
    }

    // Filter by the participant's field so Firestore `allow list` rule
    // (`resource.data.customerId == request.auth.uid || resource.data.driverId == request.auth.uid`)
    // is satisfied by the query itself while returning 100% of the order's messages.
    const filterField =
      cleanUid === cleanCustomerId
        ? 'customerId'
        : cleanUid === cleanDriverId
        ? 'driverId'
        : senderRole === 'driver'
        ? 'driverId'
        : 'customerId';

    const messagesQuery = query(
      collection(db, 'orders', cleanOrderId, 'messages'),
      where(filterField, '==', cleanUid)
    );

    initialLoadDoneRef.current = false;
    knownMessageIdsRef.current = new Set();

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snap) => {
        const list: OrderChatMessage[] = [];
        let newlyArrivedFromOther = 0;

        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const { ms, label } = formatMessageTime(d.createdAt);
          const msg: OrderChatMessage = {
            id: docSnap.id,
            orderId: String(d.orderId || cleanOrderId),
            senderId: String(d.senderId || ''),
            customerId: String(d.customerId || ''),
            driverId: String(d.driverId || ''),
            senderRole: d.senderRole === 'driver' ? 'driver' : 'customer',
            text: String(d.text || ''),
            createdAtMs: ms,
            createdAtFormatted: label,
          };
          list.push(msg);

          if (!knownMessageIdsRef.current.has(docSnap.id)) {
            knownMessageIdsRef.current.add(docSnap.id);
            if (initialLoadDoneRef.current && msg.senderRole !== senderRole) {
              newlyArrivedFromOther += 1;
            }
          }
        });

        // Sort oldest first so newest is at the bottom
        list.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setMessages(list);

        if (initialLoadDoneRef.current && newlyArrivedFromOther > 0) {
          playShortNotificationSound();
          setUnreadCount((prev) => {
            const next = prev + newlyArrivedFromOther;
            onUnreadChange?.(next);
            return next;
          });
        }

        initialLoadDoneRef.current = true;
      },
      (err: any) => {
        if (err?.code === 'permission-denied') {
          setMessages([]);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, `orders/${cleanOrderId}/messages`);
      }
    );

    return () => unsubscribe();
  }, [
    cleanOrderId,
    cleanCustomerId,
    cleanDriverId,
    cleanUid,
    senderRole,
    isChatAllowed,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const markAllRead = () => {
    if (unreadCount > 0) {
      setUnreadCount(0);
      onUnreadChange?.(0);
    }
  };

  const sendMessage = async (rawText: string) => {
    if (!isChatAllowed || sending || cooldownActive) return;

    const trimmed = rawText.trim();
    if (!trimmed) {
      setChatError('لا يمكن إرسال رسالة فارغة.');
      return;
    }
    if (trimmed.length > BLUEPRINT_CONSTRAINTS.CHAT_MESSAGE_MAX_LEN) {
      setChatError('الحد الأقصى للرسالة 300 حرف.');
      return;
    }

    const nowMs = Date.now();
    if (nowMs - lastSentAtMsRef.current < 1050) {
      setChatError('انتظر ثانية واحدة قبل إرسال رسالة أخرى.');
      return;
    }

    setChatError(null);
    setSending(true);
    markAllRead();

    const msgId = sanitizeId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const msgRef = doc(db, 'orders', cleanOrderId, 'messages', msgId);
    const rateLimitRef = doc(db, 'chatRateLimits', cleanUid);

    try {
      const batch = writeBatch(db);
      batch.set(rateLimitRef, {
        userId: cleanUid,
        lastMessageAt: serverTimestamp(),
      });
      batch.set(msgRef, {
        orderId: cleanOrderId,
        senderId: cleanUid,
        customerId: cleanCustomerId,
        driverId: cleanDriverId,
        senderRole,
        text: trimmed.slice(0, BLUEPRINT_CONSTRAINTS.CHAT_MESSAGE_MAX_LEN),
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      lastSentAtMsRef.current = Date.now();
      setInputText('');
      setCooldownActive(true);
      setTimeout(() => {
        setCooldownActive(false);
      }, 1050);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        setChatError('يرجى الانتظار ثانية واحدة بين كل رسالة وأخرى.');
      } else {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `orders/${cleanOrderId}/messages/${msgId}`
        );
      }
    } finally {
      setSending(false);
    }
  };

  if (!isChatAllowed) {
    return null;
  }

  const quickReplies =
    senderRole === 'driver' ? DRIVER_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;

  return (
    <div
      onClick={markAllRead}
      onFocusCapture={markAllRead}
      className="w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-slate-50 overflow-hidden"
    >
      {/* Chat Box Header */}
      <div className="bg-slate-900 text-white px-3 sm:px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs sm:text-sm font-black">
            محادثة فورية مع {senderRole === 'customer' ? 'الكابتن' : 'العميل'}
          </span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] tabular-nums animate-pulse">
              {unreadCount} جديد
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-300 shrink-0">
          <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>مباشر</span>
        </div>
      </div>

      {/* Messages List (Newest at the bottom) */}
      <div className="p-3 max-h-52 overflow-y-auto space-y-2 bg-white w-full min-w-0">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4 leading-relaxed">
            ابدأ المحادثة أو اضغط على أحد الردود السريعة بالأسفل
          </p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderRole === senderRole;
            return (
              <div
                key={msg.id}
                className={`flex flex-col min-w-0 ${
                  isMine ? 'items-start' : 'items-end'
                }`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-xs sm:text-sm ${
                    isMine
                      ? 'bg-slate-900 text-white rounded-tr-xs'
                      : 'bg-amber-100 text-slate-950 border border-amber-300 rounded-tl-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-0.5">
                    <span
                      className={`text-[10px] font-bold ${
                        isMine ? 'text-amber-400' : 'text-amber-900'
                      }`}
                    >
                      {isMine
                        ? 'أنت'
                        : msg.senderRole === 'driver'
                        ? 'الكابتن'
                        : 'العميل'}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums ${
                        isMine ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {msg.createdAtFormatted}
                    </span>
                  </div>
                  <p className="font-bold leading-relaxed break-words">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reply Buttons */}
      <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center gap-1.5">
        {quickReplies.map((reply) => (
          <button
            key={reply}
            type="button"
            disabled={sending || cooldownActive}
            onClick={() => sendMessage(reply)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-400 text-slate-900 font-bold text-xs transition-colors cursor-pointer min-h-[38px] disabled:opacity-50"
          >
            {reply}
          </button>
        ))}
      </div>

      {/* Error message if any */}
      {chatError && (
        <div className="px-3 py-1.5 bg-red-50 text-red-700 text-[11px] font-bold border-t border-red-200 break-words">
          {chatError}
        </div>
      )}

      {/* Text Input & Send Button */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(inputText);
        }}
        className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2 w-full min-w-0"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value.slice(0, 300))}
          maxLength={300}
          placeholder="اكتب رسالة قصيرة..."
          className="flex-1 min-w-0 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 focus:border-amber-500 focus:outline-none text-base sm:text-sm text-slate-900 font-semibold min-h-[46px]"
        />
        <button
          type="submit"
          disabled={sending || cooldownActive || !inputText.trim()}
          className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px] shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4 shrink-0" />
          <span>إرسال</span>
        </button>
      </form>
    </div>
  );
};
