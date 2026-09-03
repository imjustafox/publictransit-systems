import { describe, it, expect } from "vitest";
import { resolveAuth, type AuthConfig } from "./secrets";

describe("resolveAuth", () => {
  it("returns base url unchanged for none auth", () => {
    const auth: AuthConfig = { type: "none" };
    const result = resolveAuth("https://example.com/gtfs.zip", auth, {});
    expect(result.url).toBe("https://example.com/gtfs.zip");
    expect(result.headers).toEqual({});
  });

  it("appends api key as query param", () => {
    const auth: AuthConfig = { type: "query_param", param: "api_key", value_secret: "MY_KEY" };
    const result = resolveAuth("https://example.com/gtfs.zip", auth, { MY_KEY: "abc123" });
    expect(result.url).toBe("https://example.com/gtfs.zip?api_key=abc123");
    expect(result.headers).toEqual({});
  });

  it("appends api key with existing query string", () => {
    const auth: AuthConfig = { type: "query_param", param: "key", value_secret: "K" };
    const result = resolveAuth("https://example.com/gtfs?foo=1", auth, { K: "v" });
    expect(result.url).toBe("https://example.com/gtfs?foo=1&key=v");
  });

  it("sets header verbatim", () => {
    const auth: AuthConfig = { type: "header", header: "apikey", value_secret: "X_KEY" };
    const result = resolveAuth("https://example.com/", auth, { X_KEY: "secret" });
    expect(result.headers).toEqual({ apikey: "secret" });
  });

  it("substitutes header template", () => {
    const auth: AuthConfig = {
      type: "header",
      header: "Authorization",
      value_template: "Bearer ${SECRET}",
      value_secret: "TOK",
    };
    const result = resolveAuth("https://example.com/", auth, { TOK: "xyz" });
    expect(result.headers).toEqual({ Authorization: "Bearer xyz" });
  });

  it("throws when secret is missing", () => {
    const auth: AuthConfig = { type: "header", header: "apikey", value_secret: "MISSING" };
    expect(() => resolveAuth("https://x", auth, {})).toThrow(/MISSING.*not.*set|secret.*MISSING/i);
  });
});
