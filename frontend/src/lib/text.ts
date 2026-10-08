// Pydantic uses Unicode White_Space, which differs from JavaScript trim (FEFF/0085).
export const trimText = (value: string) =>
  value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");

export const lines = (value: string) =>
  value.split(/\r?\n/).map(trimText).filter(Boolean);
