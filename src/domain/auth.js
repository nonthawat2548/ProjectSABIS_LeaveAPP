/** First-name usernames for the existing demo accounts, independent of job/role. */
const demoUsernames = {
  'employee@demo.local': 'pimchanok',
  'nat@demo.local': 'natthaphong',
  'orn@demo.local': 'orathai',
  'manager@demo.local': 'thanawat',
  'hr@demo.local': 'siriporn',
  'other@demo.local': 'kan',
  'sales-manager@demo.local': 'pakorn',
  'chutima@demo.local': 'chutima',
  'malinee@demo.local': 'malinee',
  'weeraphat@demo.local': 'weeraphat',
};

/** Preserve existing emails/database records; unknown accounts use their email alias. */
export function loginUsername(email) {
  const key = email.trim().toLowerCase();
  return Object.hasOwn(demoUsernames, key) ? demoUsernames[key] : key.split('@')[0];
}

/** Exact email first; a username must identify exactly one account. */
export function findLoginAccount(accounts, identifier) {
  const value = identifier.trim().toLowerCase();
  if (!value) return undefined;
  const matches = accounts.filter((account) =>
    value.includes('@')
      ? account.email.toLowerCase() === value
      : loginUsername(account.email).toLowerCase() === value,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export const LOGIN_ERROR = 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง';
