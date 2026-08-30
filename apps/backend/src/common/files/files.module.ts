import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { ChatModule } from "../../modules/chat/chat.module";

/**
 * ADR-007 (docs/ARCHITECTURE.md) — file-serving endpoint. Imports
 * ChatModule (which now exports ChatService — see that module's doc
 * comment) so FilesService can reuse `assertCanJoin()` for the
 * chat-image-attachment authorization branch instead of duplicating
 * ChatService's private `assertMembership()` logic.
 *
 * Not `@Global()` — unlike AuditModule/FileStorageModule/PushModule, only
 * this one controller needs FilesService, so there's no cross-module reuse
 * to justify it.
 */
@Module({
  imports: [ChatModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
