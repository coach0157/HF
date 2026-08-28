import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseWsExceptionFilter, WsException } from "@nestjs/websockets";
import type { Socket } from "socket.io";

/**
 * Epic 8 — Chat. Nest's default `BaseWsExceptionFilter` only unwraps
 * `WsException` into a readable `{status:'error', message}` payload on the
 * `exception` event — any other thrown error (including a plain NestJS
 * `HttpException`, which is what `ChatService`'s `ForbiddenException` /
 * `BadRequestException` / `NotFoundException` all are) falls through to
 * `handleUnknownError()` and is flattened into a generic "Internal server
 * error" message client-side (the real message is only logged server-side).
 *
 * That would hide exactly the messages a chat client needs to show the user
 * ("You are not a participant of this chat room", "This group is
 * broadcast-only", etc.) — so this filter re-maps any `HttpException` thrown
 * inside a `@SubscribeMessage` handler (or anything it calls, e.g.
 * ChatService/WsRlsInterceptor) to the same `exception` event shape, with
 * the real message and status code preserved. Registered on `ChatGateway`
 * via `@UseFilters(ChatWsExceptionFilter)`.
 */
@Catch()
export class ChatWsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) {
      const client = host.switchToWs().getClient<Socket>();
      const response = exception.getResponse();
      const message =
        typeof response === "string"
          ? response
          : ((response as { message?: string | string[] })?.message ??
            exception.message);
      client.emit("exception", {
        status: "error",
        statusCode: exception.getStatus(),
        message,
      });
      return;
    }
    super.catch(exception, host);
  }
}
