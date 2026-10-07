import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server, ServerOptions } from "socket.io";

/**
 * Socket.IO adapter that applies the same CORS allow-list as REST
 * (resolveCorsOrigins in startup-config.ts), so ChatGateway doesn't need a
 * hardcoded `cors` in its decorator.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins },
    });
  }
}
