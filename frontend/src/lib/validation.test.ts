import { describe, expect, it } from "vitest";
import { lines, trimText } from "./text";
import { listError, textError } from "./validation";
import { messages } from "./messages";

describe("Pydantic-compatible text validation", () => {
  it.each([
    [1, 120],
    [1, 8000],
    [1, 200],
    [20, 20000],
  ])("counts trimmed Unicode code points for %i..%i characters", (min, max) => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(textError(`  ${emoji.repeat(max)}  `, min, max)).toBe("");
    expect(textError(emoji.repeat(max + 1), min, max)).not.toBe("");
    expect(textError(`  ${emoji.repeat(min - 1)}  `, min, max)).not.toBe("");
  });

  it("matches Unicode whitespace rather than JavaScript trim semantics", () => {
    expect(trimText("\u0085 x \u0085")).toBe("x");
    expect(trimText("\ufeffx\ufeff")).toBe("\ufeffx\ufeff");
    expect(textError("\u0085", 1, 200)).not.toBe("");
    expect(lines("  cough \r\n\u0085\n fever  ")).toEqual(["cough", "fever"]);
  });

  it("rejects NUL only in persisted text and enforces list limits", () => {
    expect(textError("a\0b", 1, 200)).toBe(messages.invalidNul);
    expect(textError("a\0b", 1, 200, false)).toBe("");
    expect(listError(["a\0b"], 1, messages.invalidList)).toBe(
      messages.invalidNul,
    );
    expect(listError([], 1, messages.invalidList)).toBe(messages.invalidList);
    expect(listError([], 0, messages.invalidAlternatives)).toBe("");
    expect(
      listError(Array(21).fill("a"), 0, messages.invalidAlternatives),
    ).toBe(messages.invalidAlternatives);
    expect(listError(["a".repeat(201)], 1, messages.invalidList)).toBe(
      messages.invalidList,
    );
  });
});
