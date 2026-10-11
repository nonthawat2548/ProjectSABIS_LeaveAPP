/** Preserve existing emails/database records; unknown accounts use their email alias. */
export declare function loginUsername(email: string): string;
/** Exact email first; a username must identify exactly one account. */
export declare function findLoginAccount<
  T extends {
    email: string;
  },
>(accounts: readonly T[], identifier: string): T | undefined;
export declare const LOGIN_ERROR =
  '\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49 \u0E2D\u0E35\u0E40\u0E21\u0E25 \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07';
