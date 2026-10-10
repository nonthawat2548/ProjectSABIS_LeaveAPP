// Keep the browser form, domain validation and mock HTTP transport in sync.
// The UI uses MB; bytes retain the existing binary (MiB) convention.
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_ATTACHMENT_LABEL = '100 MB';
export const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_ATTACHMENT_BASE64_LENGTH = 4 * Math.ceil(MAX_ATTACHMENT_BYTES / 3);
// Base64 adds about one third; allow room for the command and document metadata.
export const MAX_COMMAND_BODY_BYTES = MAX_ATTACHMENT_BASE64_LENGTH + 1024 * 1024;
// Cloud requests/responses remain below Vercel's 4.5 MB limit, even for a 100 MiB file.
export const CLOUD_PART_CHARACTERS = 2 * 1024 * 1024;
export const MAX_CLOUD_BODY_BYTES = 3 * 1024 * 1024;
