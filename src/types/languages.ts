export const LANGUAGES = ['English', 'Spanish', 'French', 'German'] as const;
export type Language = (typeof LANGUAGES)[number];
