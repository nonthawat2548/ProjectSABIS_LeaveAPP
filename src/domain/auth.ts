/** Personal usernames for the existing demo accounts, independent of job/role. */
const demoUsernames: Readonly<Record<string, string>> = {
    'employee@demo.local': 'pimchanok.w',
    'nat@demo.local': 'natthaphong.s',
    'orn@demo.local': 'orathai.m',
    'manager@demo.local': 'thanawat.k',
    'hr@demo.local': 'siriporn.j',
    'other@demo.local': 'kan.p',
    'sales-manager@demo.local': 'pakorn.r',
    'chutima@demo.local': 'chutima.s',
    'malinee@demo.local': 'malinee.s',
    'weeraphat@demo.local': 'weeraphat.t',
};

/** Preserve existing emails/database records; unknown accounts use their email alias. */
export function loginUsername(email: string): string {
    const key = email.trim().toLowerCase();
    return Object.hasOwn(demoUsernames, key) ? demoUsernames[key] : key.split('@')[0];
}

/** Exact email first; a username must identify exactly one account. */
export function findLoginAccount<T extends { email: string }>(accounts: readonly T[], identifier: string): T | undefined {
    const value = identifier.trim().toLowerCase();
    if (!value) return undefined;
    const matches = accounts.filter(account => value.includes('@')
        ? account.email.toLowerCase() === value
        : loginUsername(account.email).toLowerCase() === value);
    return matches.length === 1 ? matches[0] : undefined;
}

export const LOGIN_ERROR = 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง';
