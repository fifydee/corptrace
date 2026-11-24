export type DataStatus = "verified" | "estimated" | "unavailable";

export type ReportingPeriodType =
  | "annual"
  | "quarterly"
  | "trailing_twelve_months"
  | "instant";

export interface SourceProvenance {
  sourceName: string;
  documentTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  pageOrSection?: string;
}

export interface FinancialMetric {
  companyId: string;
  metric: string;
  value: number | null;
  unit: string;
  originalCurrency?: string;
  periodStart?: string;
  periodEnd?: string;
  periodType: ReportingPeriodType;
  status: DataStatus;
  source?: SourceProvenance;
  estimateMethod?: string;
  limitation?: string;
}

export interface CompanyIdentity {
  id: string;
  legalName: string;
  displayName: string;
  ticker?: string;
  exchange?: string;
  countryCode?: string;
  industry?: string;
}
