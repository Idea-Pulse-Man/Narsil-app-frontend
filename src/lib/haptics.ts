/**
 * Small, native-feeling taps (iPhone Taptic Engine via @capacitor/haptics).
 * Every call is fire-and-forget and a no-op on the web or when the device /
 * the user's iOS settings turn system haptics off.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const native = Capacitor.isNativePlatform();

const run = (fn: () => Promise<void>) => {
  if (!native) return;
  void fn().catch(() => {});
};

/** A light tick — selections, likes, saves, tab changes. */
export const tapHaptic = () => run(() => Haptics.impact({ style: ImpactStyle.Light }));

/** Something worked — a right answer, a purchase, a save that matters. */
export const successHaptic = () =>
  run(() => Haptics.notification({ type: NotificationType.Success }));

/** Something didn't — a wrong answer, a failed action. */
export const errorHaptic = () =>
  run(() => Haptics.notification({ type: NotificationType.Error }));
