import { useEffect, useState, useSyncExternalStore } from 'react';
import { store } from '@/database/store';
import { syncStatusStore } from '@/services/sync';
import { vaultStore } from '@/services/vault';
import { DEFAULT_ENGLISH, DEFAULT_APPEARANCE, DEFAULT_HOME, DEFAULT_POMODORO_SETTINGS, DEFAULT_SETTINGS, PREF, normalizeHome } from '@/services/prefs';
import { pomoState } from '@/services/pomodoro';
import type { EnglishSettings, Appearance, HomeLayout, PomodoroSettings, Settings } from '@/types';
import { todayISO } from '@/utils/date';

export const useStore = () => useSyncExternalStore(store.subscribe, store.getSnapshot);
export const useSync = () => useSyncExternalStore(syncStatusStore.subscribe, syncStatusStore.getSnapshot);
export const useVault = () => useSyncExternalStore(vaultStore.subscribe, vaultStore.getSnapshot);

function usePref<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => Promise<void>] {
  const snap = useStore();
  const value = { ...defaults, ...((snap.prefs[key] as Partial<T>) ?? {}) } as T;
  const set = (patch: Partial<T>) => store.setPref(key, { ...defaults, ...store.pref<Partial<T>>(key, {}), ...patch });
  return [value, set];
}

export const useAppearance = () => usePref<Appearance>(PREF.appearance, DEFAULT_APPEARANCE);
export const useSettings = () => usePref<Settings>(PREF.settings, DEFAULT_SETTINGS);
export const useEnglishSettings = () => usePref<EnglishSettings>(PREF.english, DEFAULT_ENGLISH);
export const usePomodoroSettings = () => usePref<PomodoroSettings>(PREF.pomodoroSettings, DEFAULT_POMODORO_SETTINGS);

export function useHome(): [HomeLayout, (l: HomeLayout) => Promise<void>] {
  const snap = useStore();
  const value = normalizeHome({ ...DEFAULT_HOME, ...((snap.prefs[PREF.home] as Partial<HomeLayout>) ?? {}) } as HomeLayout);
  return [value, (l) => store.setPref(PREF.home, l)];
}

export function usePomodoro() {
  useStore();
  return pomoState();
}

/** Reloj que se actualiza cada `ms` (para temporizadores y "hoy"). */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Día local actual; cambia a medianoche o al volver a la app. */
export function useToday() {
  const [day, setDay] = useState(todayISO());
  useEffect(() => {
    const check = () => setDay(todayISO());
    const t = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return day;
}
