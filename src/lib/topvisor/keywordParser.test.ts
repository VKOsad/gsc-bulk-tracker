import { describe, it, expect } from "vitest";
import { parseKeywords, toImportPayload, MAX_KEYWORD_LENGTH } from "./keywordParser";

describe("parseKeywords", () => {
  it("splits on newlines and drops empty lines", () => {
    const r = parseKeywords("foo\n\n bar \n\n\nbaz");
    expect(r.valid).toEqual(["foo", "bar", "baz"]);
    expect(r.total).toBe(3);
  });

  it("normalizes internal whitespace", () => {
    const r = parseKeywords("hello   world\n\tspaced\tphrase");
    expect(r.valid).toEqual(["hello world", "spaced phrase"]);
  });

  it("collapses exact duplicates (case-insensitive) and counts them", () => {
    const r = parseKeywords("Shoes\nshoes\nSHOES\nboots");
    expect(r.valid).toEqual(["Shoes", "boots"]); // first occurrence's case is kept
    expect(r.duplicates).toBe(2);
  });

  it("supports comma mode as an opt-in second mode", () => {
    expect(parseKeywords("a, b, c").valid).toEqual(["a, b, c"]); // default: no comma split
    expect(parseKeywords("a, b, c", { commaMode: true }).valid).toEqual(["a", "b", "c"]);
  });

  it("handles CSV-style pasted lines", () => {
    const r = parseKeywords("keyword one\nkeyword two\nkeyword three\n");
    expect(r.valid).toHaveLength(3);
  });

  it("preserves Unicode and special characters (no stripping)", () => {
    const r = parseKeywords("café münchen\nвесна 2026\nc++ tutorial");
    expect(r.valid).toEqual(["café münchen", "весна 2026", "c++ tutorial"]);
  });

  it("rejects over-long phrases with a reason", () => {
    const long = "x".repeat(MAX_KEYWORD_LENGTH + 1);
    const r = parseKeywords(`ok\n${long}`);
    expect(r.valid).toEqual(["ok"]);
    expect(r.rejected).toEqual([{ value: long, reason: "too_long" }]);
  });

  it("does not change the displayed case of a valid phrase", () => {
    expect(parseKeywords("BuY iPhone 15").valid).toEqual(["BuY iPhone 15"]);
  });
});

describe("toImportPayload", () => {
  it("builds a header + rows payload with the group name", () => {
    const csv = toImportPayload(["a", "b"], "Основная");
    expect(csv.split("\n")[0]).toBe("name;group_name");
    expect(csv).toContain("a;Основная");
    expect(csv).toContain("b;Основная");
  });

  it("escapes values containing separators", () => {
    const csv = toImportPayload(['buy "shoes", cheap'], "G");
    expect(csv).toContain('"buy ""shoes"", cheap";G');
  });
});
