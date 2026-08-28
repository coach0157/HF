import { Global, Module } from "@nestjs/common";
import { PushController } from "./push.controller";
import { PushTokenService } from "./push-token.service";
import { PushNotificationService } from "./push-notification.service";

/**
 * Epic 11 — Push Notifications (docs/ARCHITECTURE.md ADR-006 §9.2,
 * PHASE2_BACKLOG.md Epic 11). `@Global()`, same pattern as `AuditModule`/
 * `FileStorageModule` (see their doc comments) — entry-log/sos/
 * announcement/chat all need `PushNotificationService`, re-importing this
 * module in each of them would be boilerplate with no isolation benefit
 * since there's only ever one implementation. Wired into
 * `common.module.ts`'s `imports` array alongside `AuditModule`/
 * `FileStorageModule`.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushTokenService, PushNotificationService],
  exports: [PushTokenService, PushNotificationService],
})
export class PushModule {}
