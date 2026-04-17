/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

/** JDE Executive Dashboard Report */
export interface ExecutiveReport {
  reportType: string;
  summary: string;
  fullReport: string;
  metricsExtracted: boolean;
}

