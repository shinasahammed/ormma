import { describe, expect, it } from "vitest";
import { normalizeTheme, resolveTheme } from "./theme";

describe("normalizeTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    ["midnight", "system"],
    ["", "system"],
    [null, "system"],
    [undefined, "system"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeTheme(input)).toBe(expected);
  });
});

describe("resolveTheme", () => {
  it("honors explicit choices and follows the OS for system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
