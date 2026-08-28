import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from "@nestjs/common";
import { Observable, from, lastValueFrom } from "rxjs";
import type { Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantClaims } from "./tenant-context";
import { runInTenantTransaction } from "./tenant-transaction";

/**
 * ADR-005 (docs/ARCHITECTURE.md §8.2, points 2-3) — the WebSocket analogue
 * of `RlsInterceptor`. Applied per `@SubscribeMessage` handler in
 * `ChatGateway` via `@UseInterceptors(WsRlsInterceptor)`.
 *
 * There is no HTTP-style middleware pass for an individual WS event (the
 * handshake already happened once, long before this event arrives), so this
 * interceptor re-reads the claims that `ChatGateway.handleConnection()`
 * verified once at connection time and stashed on `socket.data.claims` —
 * this is the "per-event authorization, cheap because it's just an object
 * read, not a re-verify" step ADR-005 point 2 describes.
 *
 * It then opens a transaction and runs the SAME `SET LOCAL
 * app.current_village_id/current_user_id/current_role` sequence
 * `RlsInterceptor` runs for HTTP, via the one shared helper
 * (`runInTenantTransaction`, `common/rls/tenant-transaction.ts`) — ADR-005
 * point 3 is explicit that this sequence must never be hand-rolled a second
 * time directly in the gateway. Every `@SubscribeMessage` handler this
 * wraps can then call `getTenantPrismaClient()` exactly like a REST
 * controller/service does, and gets the same RLS-filtered Postgres session.
 *
 * NOTE: this only gives village-level isolation (RLS's job). Room-level
 * authorization (is this user actually a `ChatParticipant` of the room
 * they're trying to join/post in) is explicitly NOT covered here — per
 * ADR-005 point 4, that is checked explicitly inside each handler/service
 * method (see ChatService.assertMembership).
 */
@Injectable()
export class WsRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const client = context.switchToWs().getClient<Socket>();
    const claims = client.data?.claims as TenantClaims | undefined;

    if (!claims) {
      // Should be unreachable in practice — handleConnection() disconnects
      // any socket that never got valid claims — but fail closed rather
      // than silently running the handler outside any tenant scope.
      throw new UnauthorizedException(
        "WebSocket connection is not authenticated",
      );
    }

    return from(
      runInTenantTransaction(this.prisma, claims, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
