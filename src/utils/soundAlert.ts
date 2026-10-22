// Shared Web Audio API notification & alert sound utility for OrderChatBox and DriverBroadcastBoard

let globalUserHasTappedPage = false;
let driverExplicitSoundEnabled = false;
let sharedAudioCtx: AudioContext | null = null;
const soundEnableListeners = new Set<(enabled: boolean) => void>();

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    globalUserHasTappedPage = true;
    getOrCreateAudioContext();
  };

  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

export function isDriverSoundEnabled(): boolean {
  return driverExplicitSoundEnabled;
}

export function subscribeDriverSoundEnabled(listener: (enabled: boolean) => void): () => void {
  soundEnableListeners.add(listener);
  return () => {
    soundEnableListeners.delete(listener);
  };
}

/**
 * Explicitly unlocks browser audio on user tap of "🔔 تفعيل التنبيه الصوتي"
 * and plays a brief confirmation chime.
 */
export function enableDriverSoundAlerts(): boolean {
  globalUserHasTappedPage = true;
  driverExplicitSoundEnabled = true;
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    playShortNotificationSound();
  }
  soundEnableListeners.forEach((fn) => fn(true));
  return true;
}

/**
 * Short notification chime used for in-app chat messages and audio confirmation.
 */
export function playShortNotificationSound(): void {
  if (!globalUserHasTappedPage && !driverExplicitSoundEnabled) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.08); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  } catch {
    // Ignore audio playback errors
  }
}

/**
 * Prominent double-bell alert tone for incoming pending orders on the Captain board.
 */
export function playNewOrderAlertTone(): void {
  if (!globalUserHasTappedPage && !driverExplicitSoundEnabled) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.setValueAtTime(880, now + 0.1); // A5
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, now + 0.28); // E5
    osc2.frequency.setValueAtTime(1046.5, now + 0.38); // C6
    gain2.gain.setValueAtTime(0.001, now + 0.28);
    gain2.gain.exponentialRampToValueAtTime(0.26, now + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.28);
    osc2.stop(now + 0.58);
  } catch {
    // Ignore audio playback errors
  }
}

/**
 * Safely triggers device vibration if supported by the browser/device.
 */
export function triggerDeviceVibration(pattern: number | number[] = [250, 120, 250]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore vibration errors on unsupported browsers
  }
}
