import {
  Logger,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Server, Socket } from "socket.io";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { WsRlsInterceptor } from "../../common/rls/ws-rls.interceptor";
import { ChatService } from "./chat.service";
import { WsRateLimiterService } from "./ws-rate-limiter.service";
import { WsJoinRoomDto } from "./dto/ws-join-room.dto";
import { WsSendMessageDto } from "./dto/ws-send-message.dto";
import { WsMarkReadDto } from "./dto/ws-mark-read.dto";
import { WsTypingDto } from "./dto/ws-typing.dto";
import { ChatWsExceptionFilter } from "./chat-ws-exception.filter";

/**
 * Epic 8 — Chat WebSocket transport. Implements ADR-004/005
 * (docs/ARCHITECTURE.md §8.1-8.2) — read those before touching this file.
 *
 * cors: '*' mirrors main.ts's `app.enableCors()` (also unrestricted, also
 * flagged TODO there) — restrict both together before staging, not just
 * this one.
 */
@WebSocketGateway({ cors: { origin: "*" } })
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@UseFilters(ChatWsExceptionFilter)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly rateLimiter: WsRateLimiterService,
  ) {}

  /**
   * ADR-005 point 1 — handshake auth. The client passes the access JWT via
   * `io(url, { auth: { token } })` (never a header or query string — see the
   * ADR for why). Decoded with the SAME `JwtService` config
   * `TenantContextMiddleware` uses for REST (`JWT_ACCESS_SECRET`), so a
   * token issued by `POST /auth/login` works unmodified for both transports.
   *
   * Unlike the HTTP split (middleware decodes without rejecting, JwtAuthGuard
   * rejects), there is no separate "reject" stage here — Socket.io has no
   * per-connection guard pipeline, so decode-and-reject happens in one place:
   * invalid/expired/missing token -> disconnect immediately, no event
   * handler ever runs for this socket.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.debug(
        `WS connection rejected: no auth token (socket ${client.id})`,
      );
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        villageId: string;
        role: TenantClaims["role"];
        houseId?: string | null;
      }>(token, {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      });

      const claims: TenantClaims = {
        userId: payload.sub,
        villageId: payload.villageId,
        role: payload.role,
        houseId: payload.houseId ?? null,
      };
      client.data.claims = claims;
    } catch (err) {
      this.logger.debug(
        `WS connection rejected: invalid/expired token (socket ${client.id}): ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS disconnected: socket ${client.id}`);
  }

  /**
   * ADR-005 point 4 — room-level authorization. Verifies `ChatParticipant`
   * membership (via ChatService, which itself runs inside the RLS-scoped
   * transaction WsRlsInterceptor opened) BEFORE calling `socket.join()` —
   * RLS alone would let a resident query rows in another resident's DIRECT
   * room within the same village, so this check is mandatory, not redundant.
   */
  @UseInterceptors(WsRlsInterceptor)
  @SubscribeMessage("join_room")
  async onJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: WsJoinRoomDto,
  ) {
    await this.chatService.assertCanJoin(dto.chatRoomId, client.data.claims);
    await client.join(dto.chatRoomId);
    // NOTE: deliberately NOT `{ event: ..., data: ... }` — Nest's Socket.io
    // adapter treats a returned object with an `event` key as a `WsResponse`
    // and EMITS it as a separate named event instead of invoking the
    // client's ack callback (see @nestjs/platform-socket.io's io-adapter.js
    // `bindMessageHandlers`: `if (response.event) { return
    // socket.emit(...) }` runs BEFORE the ack-callback branch). Using
    // `event`/`data` here would silently break the ack this handler is
    // meant to send back to `socket.emit('join_room', payload, ackCallback)`.
    return { ok: true, chatRoomId: dto.chatRoomId };
  }

  @UseInterceptors(WsRlsInterceptor)
  @SubscribeMessage("send_message")
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: WsSendMessageDto,
  ) {
    const claims: TenantClaims = client.data.claims;

    // PHASE2_BACKLOG.md Epic 8: "Rate-limit send_message ต่อ user (ป้องกัน
    // spam/flood คล้าย pattern perUserThrottle)". 20 messages / 10s is a
    // generous burst allowance — stops button-mash/script flood without
    // getting in the way of a normal fast-typing conversation.
    if (!this.rateLimiter.allow(`send_message:${claims.userId}`, 20, 10_000)) {
      throw new WsException("Too many messages — slow down");
    }

    const message = await this.chatService.sendMessage(
      dto.chatRoomId,
      { message: dto.message, imageUrl: dto.imageUrl },
      claims,
    );

    // Broadcast to every socket that has joined this room (including the
    // sender, who joined via `join_room` before being able to send here at
    // all) — the room membership check above already guarantees only
    // ChatParticipants of this room ever joined the Socket.io room in the
    // first place.
    this.server.to(dto.chatRoomId).emit("new_message", message);
    return message;
  }

  @UseInterceptors(WsRlsInterceptor)
  @SubscribeMessage("mark_read")
  async onMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: WsMarkReadDto,
  ) {
    const claims: TenantClaims = client.data.claims;
    const participant = await this.chatService.markRead(dto.chatRoomId, claims);
    this.server.to(dto.chatRoomId).emit("read_receipt", {
      chatRoomId: dto.chatRoomId,
      userId: claims.userId,
      lastReadAt: participant.lastReadAt,
    });
    return participant;
  }

  /**
   * Ephemeral, never persisted (PHASE2_BACKLOG.md Epic 8: "typing (optional,
   * ephemeral ไม่ persist)"). Deliberately does NOT go through
   * WsRlsInterceptor/open a transaction — it never touches the database, so
   * paying for a transaction + SET LOCAL round trip on every keystroke would
   * be pure overhead. Room-level authorization here relies on Socket.io's
   * own room membership (`client.rooms`) instead of a DB query: only a
   * socket that passed `join_room`'s membership check is ever in this room,
   * so re-broadcasting to `dto.chatRoomId` cannot reach a non-participant —
   * but a caller who never joined can still emit a harmless no-op typing
   * event to a room they're not in (Socket.io's `.to()` silently does
   * nothing for a room the emitting socket isn't part of when using
   * `client.to()`... actually `.to()` broadcasts regardless of the sender's
   * own membership, so we explicitly check `client.rooms.has()` first).
   */
  @SubscribeMessage("typing")
  onTyping(@ConnectedSocket() client: Socket, @MessageBody() dto: WsTypingDto) {
    if (!client.rooms.has(dto.chatRoomId)) {
      return;
    }
    const claims: TenantClaims | undefined = client.data.claims;
    client.to(dto.chatRoomId).emit("typing", {
      chatRoomId: dto.chatRoomId,
      userId: claims?.userId,
    });
  }
}
