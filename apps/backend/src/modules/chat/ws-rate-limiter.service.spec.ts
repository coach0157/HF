import { WsRateLimiterService } from "./ws-rate-limiter.service";

describe("WsRateLimiterService", () => {
  it("allows up to `limit` hits within the window, then rejects", () => {
    const limiter = new WsRateLimiterService();
    for (let i = 0; i < 3; i++) {
      expect(limiter.allow("user-1", 3, 10_000)).toBe(true);
    }
    expect(limiter.allow("user-1", 3, 10_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const limiter = new WsRateLimiterService();
    for (let i = 0; i < 3; i++) limiter.allow("user-1", 3, 10_000);

    expect(limiter.allow("user-2", 3, 10_000)).toBe(true);
  });

  it("allows again once old hits fall outside the window", () => {
    const limiter = new WsRateLimiterService();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(0);
    limiter.allow("user-1", 1, 1_000);
    expect(limiter.allow("user-1", 1, 1_000)).toBe(false);

    nowSpy.mockReturnValue(2_000);
    expect(limiter.allow("user-1", 1, 1_000)).toBe(true);
    nowSpy.mockRestore();
  });
});
