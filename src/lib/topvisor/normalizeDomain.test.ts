import { describe, it, expect } from "vitest";
import { normalizeGscProperty, domainKey, sameDomain } from "./normalizeDomain";

describe("normalizeGscProperty", () => {
  it("handles sc-domain properties", () => {
    const n = normalizeGscProperty("sc-domain:example.com");
    expect(n).toMatchObject({ host: "example.com", path: "", isDomainProperty: true });
  });

  it("strips protocol, www and trailing slash for URL-prefix", () => {
    expect(normalizeGscProperty("https://www.example.com/").host).toBe("example.com");
    expect(normalizeGscProperty("https://www.example.com/").path).toBe("");
    expect(normalizeGscProperty("http://example.com/").host).toBe("example.com");
  });

  it("keeps the subfolder path for URL-prefix properties", () => {
    const n = normalizeGscProperty("https://example.com/subfolder/");
    expect(n.host).toBe("example.com");
    expect(n.path).toBe("/subfolder");
  });

  it("keeps a significant subdomain", () => {
    expect(normalizeGscProperty("https://blog.example.com/").host).toBe("blog.example.com");
    expect(normalizeGscProperty("sc-domain:shop.example.com").host).toBe("shop.example.com");
  });

  it("drops the port", () => {
    expect(normalizeGscProperty("http://example.com:8080/path").host).toBe("example.com");
  });

  it("lowercases the host", () => {
    expect(normalizeGscProperty("https://EXAMPLE.com/").host).toBe("example.com");
  });

  it("converts IDN to punycode", () => {
    expect(normalizeGscProperty("https://пример.рф/").host).toBe("xn--e1afmkfd.xn--p1ai");
    expect(domainKey("sc-domain:пример.рф")).toBe("xn--e1afmkfd.xn--p1ai");
  });

  it("accepts a bare host", () => {
    expect(normalizeGscProperty("example.com").host).toBe("example.com");
    expect(normalizeGscProperty("www.example.com").host).toBe("example.com");
  });

  it("treats sc-domain and url-prefix of the same host as the same domain", () => {
    expect(sameDomain("sc-domain:example.com", "https://www.example.com/")).toBe(true);
    expect(sameDomain("https://example.com/a", "https://example.com/b")).toBe(true);
    expect(sameDomain("example.com", "other.com")).toBe(false);
    expect(sameDomain("blog.example.com", "example.com")).toBe(false); // subdomain is significant
  });
});
