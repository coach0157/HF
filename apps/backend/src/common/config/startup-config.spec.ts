import { assertProductionSecrets, resolveCorsOrigins } from "./startup-config";

const strong = (seed: string) => seed.repeat(40);

describe("resolveCorsOrigins", () => {
  it("parses a comma-separated CORS_ORIGINS list", () => {
    expect(
      resolveCorsOrigins({ CORS_ORIGINS: " https://a.example.com , https://b.example.com ,", NODE_ENV: "production" }),
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("falls back to the admin-web dev server outside production", () => {
    expect(resolveCorsOrigins({ NODE_ENV: "development" })).toContain("http://localhost:5173");
  });

  it("throws in production when CORS_ORIGINS is unset", () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: "production" })).toThrow(/CORS_ORIGINS/);
  });
});

describe("assertProductionSecrets", () => {
  const good = {
    NODE_ENV: "production",
    JWT_ACCESS_SECRET: strong("a"),
    JWT_REFRESH_SECRET: strong("b"),
    QR_TOKEN_SECRET: strong("c"),
  };

  it("is a no-op outside production, even with placeholder secrets", () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: "development", JWT_ACCESS_SECRET: "change-me-access-secret" }),
    ).not.toThrow();
  });

  it("accepts long, distinct secrets in production", () => {
    expect(() => assertProductionSecrets(good)).not.toThrow();
  });

  it.each([
    ["placeholder", { JWT_ACCESS_SECRET: "change-me-access-secret" }, /placeholder/],
    ["missing", { QR_TOKEN_SECRET: undefined }, /QR_TOKEN_SECRET is not set/],
    ["too short", { JWT_REFRESH_SECRET: "short" }, /shorter than/],
    ["reused", { QR_TOKEN_SECRET: strong("a") }, /must all be different/],
  ])("rejects a %s secret in production", (_label, override, message) => {
    expect(() => assertProductionSecrets({ ...good, ...override })).toThrow(message);
  });
});
