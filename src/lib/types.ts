import type { CountryCode } from "./countries";

export interface Profile {
  country: CountryCode;
  currency: string;
  situation: string;
  mileageRate: number;
  distanceUnit: "miles" | "km";
}

export interface Receipt {
  id: string;
  merchant: string;
  date: string; // YYYY-MM-DD
  amount: number | null;
  taxAmount: number | null;
  currency: string;
  category: string;
  labels: string[];
  notes: string;
  deductible: boolean | null;
  fileName: string;
  contentType: string;
  status: "scanning" | "ready";
  scanError?: string | null;
  ai?: { confidence?: string; summary?: string };
  createdAt: number;
}

/** The photo/PDF behind a receipt, stored separately so lists stay fast. */
export interface StoredFile {
  id: string;
  contentType: string;
  blob: Blob;
  thumb: Blob | null;
}

export interface Income {
  id: string;
  date: string;
  source: string;
  type: string;
  amount: number;
  taxPaid: number | null;
  notes: string;
  createdAt: number;
}

export interface Trip {
  id: string;
  date: string;
  from: string;
  to: string;
  purpose: string;
  distance: number;
  createdAt: number;
}

export interface Reminder {
  id: string;
  date: string;
  title: string;
  done: boolean;
  createdAt: number;
}
