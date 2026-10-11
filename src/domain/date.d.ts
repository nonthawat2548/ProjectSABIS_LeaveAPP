/** UI: Buddhist Era d/m/yyyy; storage/API: Gregorian ISO yyyy-mm-dd. */
export declare function isoDate(value: string): boolean;
export declare function formatDate(value: string): string;
export declare function parseThaiDate(value: string): string | null;
export declare function today(now?: Date): string;
export declare function formatDateTime(value: string): string;
export declare function addDays(iso: string, amount: number): string;
export declare function dayDifference(a: string, b: string): number;
export declare function datesBetween(start: string, end: string): string[];
export declare function workingDates(start: string, end: string, holidays?: string[]): string[];
export declare function nextWorkingDay(iso: string, holidays?: string[]): string;
export declare const thaiMonths: string[];
