import { messages } from "./messages";
import { trimText } from "./text";

export function textError(
  value: string,
  min: number,
  max: number,
  persisted = true,
): string {
  if (persisted && value.includes("\0")) return messages.invalidNul;
  const length = [...trimText(value)].length;
  return length < min || length > max ? messages.textLength(min, max) : "";
}

export function listError(
  values: string[],
  min: number,
  message: string,
): string {
  if (values.some((value) => value.includes("\0"))) return messages.invalidNul;
  return values.length < min ||
    values.length > 20 ||
    values.some((value) => textError(value, 1, 200))
    ? message
    : "";
}
