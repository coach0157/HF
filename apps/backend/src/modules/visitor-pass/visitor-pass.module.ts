import { Module } from "@nestjs/common";
import { VisitorPassController } from "./visitor-pass.controller";
import { VisitorPassService } from "./visitor-pass.service";
import { QrTokenService } from "./qr-token.service";
import { BlockedVisitorModule } from "../blocked-visitor/blocked-visitor.module";

/**
 * Epic 2 — Visitor QR + Entry/Exit Log. See MVP_BACKLOG.md Epic 2 and spec
 * 2.1/3.3/3.4. Implementation in visitor-pass.service.ts / qr-token.service.ts.
 *
 * VisitorPassService is exported so EntryLogModule can call it for pass
 * status transitions (unused -> entered -> exited) instead of duplicating
 * that state machine — see ARCHITECTURE.md's module boundary table.
 *
 * BlockedVisitorModule imported so create() can reject a blocklisted
 * phone/plate before a QR is ever issued.
 */
@Module({
  imports: [BlockedVisitorModule],
  controllers: [VisitorPassController],
  providers: [VisitorPassService, QrTokenService],
  exports: [VisitorPassService],
})
export class VisitorPassModule {}
