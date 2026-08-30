import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { FilesService } from "./files.service";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { TenantClaims } from "../rls/tenant-context";

/**
 * ADR-007 (docs/ARCHITECTURE.md) — the file-serving endpoint every client's
 * `<img>`/RN `<Image>` now points at (via each app's `resolveImageUrl()`
 * helper) instead of the raw, unfetchable `local://bucket/village/filename`
 * ref stored on `photoUrl`/`imageUrl`/`avatarUrl` columns.
 *
 * No `@Roles()` here — unlike most endpoints in this app, authorization
 * isn't a flat role check; it depends on which bucket AND (for the shared
 * "entry-logs" bucket) which specific row the file belongs to. All of that
 * logic lives in FilesService.resolveFilePath(), which throws
 * Forbidden/NotFound itself when the caller isn't allowed to see it.
 *
 * `@CurrentUser()` still requires SOME authenticated caller (JwtAuthGuard is
 * global — see CommonModule) — the token can arrive either as the normal
 * `Authorization: Bearer` header, or (this route only) as a `?token=` query
 * param, since an `<img>`/`<Image>` request can't attach a custom header.
 * See TenantContextMiddleware.tryDecodeClaims() for that query-param
 * fallback.
 */
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get(":bucket/:villageId/:filename")
  async getFile(
    @Param("bucket") bucket: string,
    @Param("villageId") villageId: string,
    @Param("filename") filename: string,
    @CurrentUser() user: TenantClaims,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.filesService.resolveFilePath(
      bucket,
      villageId,
      filename,
      user,
    );
    res.sendFile(filePath, (err) => {
      // A TOCTOU race (file removed between resolveFilePath()'s fs.access()
      // check and this send) or any other send-time failure — respond with
      // a plain 404 rather than letting Express's default error handler
      // (which doesn't know about Nest's JSON error shape) take over. Only
      // when headers haven't already gone out, since sendFile may fail
      // mid-stream after starting to write the response.
      if (err && !res.headersSent) {
        res.status(404).json({ statusCode: 404, message: "File not found" });
      }
    });
  }
}
