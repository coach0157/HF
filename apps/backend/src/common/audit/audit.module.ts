import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/**
 * Global (like PrismaModule) so any feature module can inject AuditService
 * without re-importing this module everywhere — audit logging is a
 * cross-cutting concern touched by visitor-pass (admin revoking someone
 * else's pass) and entry-log (admin viewing/listing sensitive entry data).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
