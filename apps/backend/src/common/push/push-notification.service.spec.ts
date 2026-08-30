import type { ConfigService } from "@nestjs/config";
import { PushNotificationService } from "./push-notification.service";
import type { PushTokenService } from "./push-token.service";
import type { TenantClaims } from "../rls/tenant-context";

const mockClaims: TenantClaims = {
  userId: "admin-1",
  villageId: "village-1",
  role: "ADMIN",
  houseId: null,
};

// The mock jest.fn()s are created INSIDE the factory (not as outer `const`s
// referenced from it) because babel-plugin-jest-hoist moves `jest.mock(...)`
// above every other top-level statement in this file, including outer
// `const` declarations — referencing an outer const from inside the factory
// would hit its temporal dead zone. `__mocks` is retrieved afterward via
// `jest.requireMock` so tests can still configure/assert on the same
// function instances the class under test actually calls.
jest.mock("expo-server-sdk", () => {
  const mockChunkPushNotifications = jest.fn();
  const mockSendPushNotificationsAsync = jest.fn();
  const mockIsExpoPushToken = jest.fn();
  const ExpoMock = jest.fn().mockImplementation(() => ({
    chunkPushNotifications: mockChunkPushNotifications,
    sendPushNotificationsAsync: mockSendPushNotificationsAsync,
  }));
  (ExpoMock as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken =
    mockIsExpoPushToken;
  return {
    Expo: ExpoMock,
    __mocks: {
      mockChunkPushNotifications,
      mockSendPushNotificationsAsync,
      mockIsExpoPushToken,
    },
  };
});

const { __mocks } = jest.requireMock("expo-server-sdk") as {
  __mocks: {
    mockChunkPushNotifications: jest.Mock;
    mockSendPushNotificationsAsync: jest.Mock;
    mockIsExpoPushToken: jest.Mock;
  };
};
const {
  mockChunkPushNotifications,
  mockSendPushNotificationsAsync,
  mockIsExpoPushToken,
} = __mocks;

/** Lets pending promise chains inside `send()`'s fire-and-forget dispatch settle before assertions run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("PushNotificationService", () => {
  let service: PushNotificationService;
  let pushTokenService: {
    listTokensForUsers: jest.Mock;
    removeTokenByValue: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
    pushTokenService = {
      listTokensForUsers: jest.fn().mockResolvedValue([]),
      removeTokenByValue: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new PushNotificationService(
      pushTokenService as unknown as PushTokenService,
      config as unknown as ConfigService,
    );
  });

  const payload = {
    title: "Test title",
    body: "Test body",
    data: { type: "sos" as const, id: "alert-1" },
  };

  describe("ADR-006: fire-and-forget contract", () => {
    it("send() returns void synchronously, not a Promise a caller could accidentally await", () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([]);
      const result = service.send(["u1"], payload, mockClaims);
      expect(result).toBeUndefined();
    });

    it("never throws even when the token lookup itself rejects", async () => {
      pushTokenService.listTokensForUsers.mockRejectedValue(
        new Error("db unreachable"),
      );
      expect(() => service.send(["u1"], payload, mockClaims)).not.toThrow();
      await flush();
      // No unhandled rejection — jest would fail the test run if one occurred.
    });

    it("never throws even when Expo's API call rejects", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([
        { userId: "u1", expoPushToken: "ExponentPushToken[abc]" },
      ]);
      mockChunkPushNotifications.mockReturnValue([
        [{ to: "ExponentPushToken[abc]" }],
      ]);
      mockSendPushNotificationsAsync.mockRejectedValue(
        new Error("Expo API timeout"),
      );

      expect(() => service.send(["u1"], payload, mockClaims)).not.toThrow();
      await flush();
      await flush();
    });

    it("does nothing when userIds is empty (no token lookup)", async () => {
      service.send([], payload, mockClaims);
      await flush();
      expect(pushTokenService.listTokensForUsers).not.toHaveBeenCalled();
    });

    it("does nothing when no recipient has a registered token", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([]);
      service.send(["u1"], payload, mockClaims);
      await flush();
      expect(mockChunkPushNotifications).not.toHaveBeenCalled();
    });
  });

  describe("message construction + deep-link data schema (ADR-006)", () => {
    it("builds one ExpoPushMessage per token with the exact {type, id} data payload", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([
        { userId: "u1", expoPushToken: "ExponentPushToken[abc]" },
      ]);
      mockChunkPushNotifications.mockImplementation((msgs: unknown[]) => [
        msgs,
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }]);

      service.send(["u1"], payload, mockClaims);
      await flush();
      await flush();

      expect(mockChunkPushNotifications).toHaveBeenCalledWith([
        expect.objectContaining({
          to: "ExponentPushToken[abc]",
          title: "Test title",
          body: "Test body",
          data: { type: "sos", id: "alert-1" },
          sound: "default",
        }),
      ]);
    });

    it("filters out tokens that aren't well-formed Expo push tokens", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([
        { userId: "u1", expoPushToken: "garbage-token" },
        { userId: "u2", expoPushToken: "ExponentPushToken[valid]" },
      ]);
      mockIsExpoPushToken.mockImplementation(
        (t: string) => t === "ExponentPushToken[valid]",
      );
      mockChunkPushNotifications.mockImplementation((msgs: unknown[]) => [
        msgs,
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }]);

      service.send(["u1", "u2"], payload, mockClaims);
      await flush();
      await flush();

      expect(mockChunkPushNotifications).toHaveBeenCalledWith([
        expect.objectContaining({ to: "ExponentPushToken[valid]" }),
      ]);
    });
  });

  describe("chunking (Expo's own batching helper)", () => {
    it("sends one sendPushNotificationsAsync call per chunk when the recipient list spans multiple chunks", async () => {
      const tokens = Array.from({ length: 5 }, (_, i) => ({
        userId: `u${i}`,
        expoPushToken: `ExponentPushToken[${i}]`,
      }));
      pushTokenService.listTokensForUsers.mockResolvedValue(tokens);
      // Simulate Expo splitting 5 messages into 2 chunks.
      mockChunkPushNotifications.mockImplementation((msgs: any[]) => [
        msgs.slice(0, 3),
        msgs.slice(3),
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r" }]);

      service.send(
        tokens.map((t) => t.userId),
        payload,
        mockClaims,
      );
      await flush();
      await flush();
      await flush();

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(2);
    });

    it("a failure in one chunk does not stop the next chunk from being sent", async () => {
      const tokens = [
        { userId: "u1", expoPushToken: "ExponentPushToken[1]" },
        { userId: "u2", expoPushToken: "ExponentPushToken[2]" },
      ];
      pushTokenService.listTokensForUsers.mockResolvedValue(tokens);
      mockChunkPushNotifications.mockImplementation((msgs: any[]) => [
        [msgs[0]],
        [msgs[1]],
      ]);
      mockSendPushNotificationsAsync
        .mockRejectedValueOnce(new Error("chunk 1 failed"))
        .mockResolvedValueOnce([{ status: "ok", id: "r" }]);

      service.send(["u1", "u2"], payload, mockClaims);
      await flush();
      await flush();
      await flush();

      expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe("dead-token cleanup (ADR-006 §9.1's send-failure sweep, ticket-level half)", () => {
    it("removes a token whose ticket reports DeviceNotRegistered", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([
        { userId: "u1", expoPushToken: "ExponentPushToken[dead]" },
      ]);
      mockChunkPushNotifications.mockImplementation((msgs: unknown[]) => [
        msgs,
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: "error",
          message: "device not registered",
          details: {
            error: "DeviceNotRegistered",
            expoPushToken: "ExponentPushToken[dead]",
          },
        },
      ]);

      service.send(["u1"], payload, mockClaims);
      await flush();
      await flush();
      await flush();

      expect(pushTokenService.removeTokenByValue).toHaveBeenCalledWith(
        "ExponentPushToken[dead]",
        mockClaims,
      );
    });

    it("does not remove a token for a non-DeviceNotRegistered ticket error", async () => {
      pushTokenService.listTokensForUsers.mockResolvedValue([
        { userId: "u1", expoPushToken: "ExponentPushToken[abc]" },
      ]);
      mockChunkPushNotifications.mockImplementation((msgs: unknown[]) => [
        msgs,
      ]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        {
          status: "error",
          message: "rate limited",
          details: { error: "MessageRateExceeded" },
        },
      ]);

      service.send(["u1"], payload, mockClaims);
      await flush();
      await flush();
      await flush();

      expect(pushTokenService.removeTokenByValue).not.toHaveBeenCalled();
    });
  });
});
