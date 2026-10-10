import { collection, doc, onSnapshot, orderBy, query, QueryConstraint, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { COUNTRIES, taxYearBounds } from "./countries";
import { db } from "./firebase";
import type { Profile } from "./types";

export const DEFAULT_PROFILE: Profile = {
  country: "UK",
  currency: "GBP",
  situation: "",
  mileageRate: 0.45,
  distanceUnit: "miles",
};

export interface TaxYear {
  start: string;
  end: string;
  label: string;
}

export interface AppState {
  user: User;
  profile: Profile;
  taxYear: TaxYear;
  setTaxYear: (y: TaxYear) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}

export function useProfile(uid: string): { profile: Profile; loaded: boolean } {
  const [state, setState] = useState<{ profile: Profile; loaded: boolean }>({ profile: DEFAULT_PROFILE, loaded: false });
  useEffect(
    () =>
      onSnapshot(
        doc(db, "users", uid),
        (snap) => setState({ profile: { ...DEFAULT_PROFILE, ...(snap.data() as Partial<Profile>) }, loaded: true }),
        () => setState((s) => ({ ...s, loaded: true })),
      ),
    [uid],
  );
  return state;
}

export function currentTaxYear(profile: Profile): TaxYear {
  return taxYearBounds(profile.country in COUNTRIES ? profile.country : "UK");
}

/** Live-subscribes to a sub-collection under the signed-in user. */
export function useUserCollection<T extends { id: string }>(
  uid: string,
  name: string,
  constraints: QueryConstraint[],
  deps: unknown[],
): { items: T[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null });
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query(collection(db, "users", uid, name), ...constraints),
      (snap) => setState({ items: snap.docs.map((d) => ({ ...(d.data() as Omit<T, "id">), id: d.id }) as T), loading: false, error: null }),
      (err) => setState({ items: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, name, ...deps]);
  return state;
}

/** Records dated within the selected tax year, newest first. */
export function useYearCollection<T extends { id: string }>(name: string) {
  const { user, taxYear } = useApp();
  return useUserCollection<T>(
    user.uid,
    name,
    [where("date", ">=", taxYear.start), where("date", "<=", taxYear.end), orderBy("date", "desc")],
    [taxYear.start, taxYear.end],
  );
}
