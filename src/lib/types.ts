import type { Timestamp } from "firebase/firestore";
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
  storagePath: string;
  fileName: string;
  contentType: string;
  downloadUrl: string;
  status: "uploading" | "scanning" | "ready";
  scanError?: string;
  ai?: { confidence?: string; summary?: string };
  createdAt?: Timestamp;
}

export interface Income {
  id: string;
  date: string;
  source: string;
  type: string;
  amount: number;
  taxPaid: number | null;
  notes: string;
}

export interface Trip {
  id: string;
  date: string;
  from: string;
  to: string;
  purpose: string;
  distance: number;
}

export interface Reminder {
  id: string;
  date: string;
  title: string;
  done: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { url: string; title: string }[];
  createdAt?: Timestamp;
}

export const INCOME_TYPES = [
  "Self-employment / sales",
  "Employment (salary)",
  "Rental income",
  "Dividends",
  "Interest",
  "Capital gains",
  "Pension",
  "Benefits",
  "Other",
];
