import { Order } from '../types';

export type ChainSoundKind = 'verify_1' | 'release' | 'verify_2' | 'returned' | 'flagged';

const SOUND_PREF_KEY = 'vectos_strict_chain_sound_enabled';

let sharedAudioCtx: AudioContext | null = null;
let autoUnlockAttached = false;

function getAudioConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as any).webkitAudioContext || null;
}

function getOrCreateAudioContext(): AudioContext | null {
  const Ctor = getAudioConstructor();
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try {
      sharedAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

export function getAudioContextState(): 'ready' | 'needs_interaction' | 'unsupported' {
  const Ctor = getAudioConstructor();
  if (!Ctor) return 'unsupported';
  const ctx = getOrCreateAudioContext();
  if (!ctx) return 'unsupported';
  return ctx.state === 'running' ? 'ready' : 'needs_interaction';
}

export async function unlockNotificationAudio(): Promise<boolean> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

export function ensureAudioAutoUnlock(onStateChange?: (ready: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleGesture = () => {
    unlockNotificationAudio().then((ready) => {
      if (ready && onStateChange) onStateChange(true);
    });
  };
  if (!autoUnlockAttached) {
    autoUnlockAttached = true;
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
  } else {
    window.addEventListener('pointerdown', handleGesture, { once: true, passive: true });
    window.addEventListener('keydown', handleGesture, { once: true, passive: true });
  }
  return () => {
    window.removeEventListener('pointerdown', handleGesture);
    window.removeEventListener('keydown', handleGesture);
  };
}

export function getSoundAlertsEnabled(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    const raw = window.localStorage.getItem(SOUND_PREF_KEY);
    if (raw === null) return true;
    return raw !== 'false' && raw !== '0';
  } catch {
    return true;
  }
}

export function setSoundAlertsEnabled(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
    }
  } catch {}
}

interface ToneStep {
  freq: number;
  delay: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SOUND_PATTERNS: Record<ChainSoundKind, ToneStep[]> = {
  // Crisp rising 3-note chime for Verificators (new order incoming for Verify #1)
  verify_1: [
    { freq: 523.25, delay: 0, duration: 0.14, type: 'triangle', gain: 0.22 },
    { freq: 659.25, delay: 0.12, duration: 0.15, type: 'triangle', gain: 0.24 },
    { freq: 783.99, delay: 0.24, duration: 0.28, type: 'sine', gain: 0.28 }
  ],
  // Distinct double-bell chime for Storekeepers & Shop Releasers (authorized items ready to hand out)
  release: [
    { freq: 587.33, delay: 0, duration: 0.16, type: 'sine', gain: 0.26 },
    { freq: 880.0, delay: 0.14, duration: 0.24, type: 'triangle', gain: 0.24 },
    { freq: 880.0, delay: 0.42, duration: 0.26, type: 'sine', gain: 0.22 }
  ],
  // Confirmation chime for Verificator #2 (released items awaiting final #2 sign-off)
  verify_2: [
    { freq: 659.25, delay: 0, duration: 0.13, type: 'sine', gain: 0.22 },
    { freq: 987.77, delay: 0.12, duration: 0.26, type: 'triangle', gain: 0.25 }
  ],
  // Gentle 2-tone downward cue for Seller (order returned for edit)
  returned: [
    { freq: 659.25, delay: 0, duration: 0.16, type: 'triangle', gain: 0.22 },
    { freq: 493.88, delay: 0.17, duration: 0.26, type: 'sine', gain: 0.24 }
  ],
  // Urgent 3-pulse alert for Manager (warehouse discrepancy flagged)
  flagged: [
    { freq: 880.0, delay: 0, duration: 0.14, type: 'triangle', gain: 0.25 },
    { freq: 698.46, delay: 0.16, duration: 0.14, type: 'triangle', gain: 0.25 },
    { freq: 880.0, delay: 0.32, duration: 0.28, type: 'sine', gain: 0.28 }
  ]
};

export async function playChainNotificationSound(
  kind: ChainSoundKind,
  forcePlay = false
): Promise<boolean> {
  if (!forcePlay && !getSoundAlertsEnabled()) return false;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  if (ctx.state !== 'running') return false;

  const steps = SOUND_PATTERNS[kind] || SOUND_PATTERNS.verify_1;
  const startAt = ctx.currentTime + 0.02;

  for (const step of steps) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = step.type;
    osc.frequency.setValueAtTime(step.freq, startAt + step.delay);

    const t0 = startAt + step.delay;
    const tEnd = t0 + step.duration;
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(step.gain, t0 + 0.018);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, tEnd);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(t0);
    osc.stop(tEnd + 0.02);
  }

  return true;
}

export interface ChainNotificationSnapshot {
  initialized: boolean;
  verify1Ids: Set<number>;
  warehouseOrderIds: Set<number>;
  shopReleaseOrderIds: Set<number>;
  verify2LegKeys: Set<string>;
  returnedIds: Set<number>;
  flaggedIds: Set<number>;
}

export function createEmptyNotificationSnapshot(): ChainNotificationSnapshot {
  return {
    initialized: false,
    verify1Ids: new Set<number>(),
    warehouseOrderIds: new Set<number>(),
    shopReleaseOrderIds: new Set<number>(),
    verify2LegKeys: new Set<string>(),
    returnedIds: new Set<number>(),
    flaggedIds: new Set<number>()
  };
}

export interface ChainIncomingAlertEvent {
  kind: ChainSoundKind;
  tab:
    | 'supervisor_1'
    | 'warehouse'
    | 'shop_release'
    | 'supervisor_2'
    | 'returned'
    | 'manager_resolve';
  orderNumbers: string[];
  count: number;
}

export interface EvaluateChainAlertsInput {
  userId?: number | null;
  canCreateOrders: boolean;
  canReleaseStock: boolean;
  canVerifyOrders: boolean;
  canResolveFlagged: boolean;
  allOrders: Order[];
  warehouseOrders: Order[];
  prevSnapshot: ChainNotificationSnapshot;
}

export function evaluateChainIncomingAlerts(input: EvaluateChainAlertsInput): {
  nextSnapshot: ChainNotificationSnapshot;
  alerts: ChainIncomingAlertEvent[];
} {
  const {
    userId,
    canCreateOrders,
    canReleaseStock,
    canVerifyOrders,
    canResolveFlagged,
    allOrders,
    warehouseOrders,
    prevSnapshot
  } = input;

  const verify1Orders = allOrders.filter((o) => o.chain_status === 'pending_supervisor_1');
  const pendingWhOrders = warehouseOrders.filter((o) =>
    (o.items || []).some((it) => it.leg_type === 'warehouse' && it.leg_status === 'pending')
  );
  const pendingShopOrders = allOrders.filter(
    (o) =>
      o.chain_status === 'in_release' &&
      (o.items || []).some((it) => it.leg_type === 'shop' && it.leg_status === 'pending')
  );
  const returnedOrders = allOrders.filter((o) => o.chain_status === 'returned_to_seller');
  const flaggedOrders = allOrders.filter((o) => o.chain_status === 'flagged_for_manager');

  const verify2Keys = new Set<string>();
  const verify2OrderByKey = new Map<string, string>();
  for (const ord of allOrders) {
    if (ord.chain_status !== 'in_release') continue;
    const isMyVerification =
      (userId && Number(ord.first_verified_by) === Number(userId)) || canResolveFlagged;
    if (!isMyVerification) continue;
    for (const it of ord.items || []) {
      if (
        it.leg_status === 'seller_released' ||
        it.leg_status === 'warehouse_released' ||
        it.leg_status === 'partner_released'
      ) {
        const key = `${ord.id}:${it.leg_type || 'shop'}:${it.leg_status}`;
        verify2Keys.add(key);
        verify2OrderByKey.set(key, ord.order_number);
      }
    }
  }

  const nextSnapshot: ChainNotificationSnapshot = {
    initialized: true,
    verify1Ids: new Set(verify1Orders.map((o) => Number(o.id))),
    warehouseOrderIds: new Set(pendingWhOrders.map((o) => Number(o.id))),
    shopReleaseOrderIds: new Set(pendingShopOrders.map((o) => Number(o.id))),
    verify2LegKeys: verify2Keys,
    returnedIds: new Set(returnedOrders.map((o) => Number(o.id))),
    flaggedIds: new Set(flaggedOrders.map((o) => Number(o.id)))
  };

  if (!prevSnapshot.initialized) {
    return { nextSnapshot, alerts: [] };
  }

  const alerts: ChainIncomingAlertEvent[] = [];

  if (canVerifyOrders || canResolveFlagged) {
    const newVerify1 = verify1Orders.filter((o) => !prevSnapshot.verify1Ids.has(Number(o.id)));
    if (newVerify1.length > 0) {
      alerts.push({
        kind: 'verify_1',
        tab: 'supervisor_1',
        orderNumbers: newVerify1.map((o) => o.order_number),
        count: newVerify1.length
      });
    }
  }

  if (canReleaseStock) {
    const newWh = pendingWhOrders.filter((o) => !prevSnapshot.warehouseOrderIds.has(Number(o.id)));
    if (newWh.length > 0) {
      alerts.push({
        kind: 'release',
        tab: 'warehouse',
        orderNumbers: newWh.map((o) => o.order_number),
        count: newWh.length
      });
    }
  }

  if (canCreateOrders || canReleaseStock) {
    const newShop = pendingShopOrders.filter(
      (o) => !prevSnapshot.shopReleaseOrderIds.has(Number(o.id))
    );
    if (newShop.length > 0) {
      alerts.push({
        kind: 'release',
        tab: 'shop_release',
        orderNumbers: newShop.map((o) => o.order_number),
        count: newShop.length
      });
    }
  }

  if (canVerifyOrders || canResolveFlagged) {
    const newV2OrderNums = Array.from(verify2Keys)
      .filter((k) => !prevSnapshot.verify2LegKeys.has(k))
      .map((k) => verify2OrderByKey.get(k) || '')
      .filter(Boolean);
    const uniqueV2Orders = Array.from(new Set(newV2OrderNums));
    if (uniqueV2Orders.length > 0) {
      alerts.push({
        kind: 'verify_2',
        tab: 'supervisor_2',
        orderNumbers: uniqueV2Orders,
        count: uniqueV2Orders.length
      });
    }
  }

  if (canCreateOrders) {
    const newReturned = returnedOrders.filter((o) => !prevSnapshot.returnedIds.has(Number(o.id)));
    if (newReturned.length > 0) {
      alerts.push({
        kind: 'returned',
        tab: 'returned',
        orderNumbers: newReturned.map((o) => o.order_number),
        count: newReturned.length
      });
    }
  }

  if (canResolveFlagged) {
    const newFlagged = flaggedOrders.filter((o) => !prevSnapshot.flaggedIds.has(Number(o.id)));
    if (newFlagged.length > 0) {
      alerts.push({
        kind: 'flagged',
        tab: 'manager_resolve',
        orderNumbers: newFlagged.map((o) => o.order_number),
        count: newFlagged.length
      });
    }
  }

  return { nextSnapshot, alerts };
}
