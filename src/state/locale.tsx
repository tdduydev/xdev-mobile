import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALES, type Locale } from "@/api/config";

const LOCALE_STORAGE_KEY = "xdev:locale";
const DEFAULT_LOCALE: Locale = "vi";

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

type LocaleContextValue = {
  /** The currently selected locale. `DEFAULT_LOCALE` until the persisted value (if any) loads. */
  locale: Locale;
  /** Persists the choice to AsyncStorage (a small value — see cache.ts's index for why the index itself is not there). */
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored !== null && isLocale(stored)) {
          setLocaleState(stored);
        }
      })
      .catch(() => {
        // No persisted locale, or storage unavailable — DEFAULT_LOCALE stands.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {
      // Best-effort persistence: the in-memory selection above already took effect.
    });
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}
