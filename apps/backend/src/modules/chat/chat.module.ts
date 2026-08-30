import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatGateway } from "./chat.gateway";
import { WsRateLimiterService } from "./ws-rate-limiter.service";

/**
 * Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8, ADR-004/005 in
 * docs/ARCHITECTURE.md §8.1-8.2). `JwtService`/`ConfigService` (used by
 * ChatGateway's handshake auth) and `PrismaService`/`FileStorageService`
 * (used by ChatService / WsRlsInterceptor) are all registered globally
 * (see CommonModule) — no imports needed here beyond this module's own
 * providers.
 *
 * `ChatService` is exported (ADR-007, docs/ARCHITECTURE.md) so
 * `src/common/files/files.module.ts` can import this module and reuse
 * `assertCanJoin()` — the files-serving endpoint's chat-image authorization
 * must apply the exact same room-membership rule as every other chat
 * action, not a second hand-rolled copy of it.
 */
@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, WsRateLimiterService],
  exports: [ChatService],
})
export class ChatModule {}
