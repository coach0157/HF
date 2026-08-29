import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());
  app.enableCors(); // TODO(Dev agent): restrict to the admin-web origin(s) before staging.
  // Dev-agent change (avatar upload feature): the default body-parser JSON
  // limit (100kb) is too small for a base64-encoded photo — this same
  // constraint already silently affected entry-log/chat/maintenance's
  // base64 photo uploads (FileStorageService.savePhoto's callers), it just
  // hadn't been hit yet since nothing e2e-tested a real-sized image. 8mb
  // comfortably covers a resized/compressed profile photo or gate snapshot
  // with headroom, without opening the door to huge uploads on this
  // local-disk-backed MVP storage.
  app.useBodyParser("json", { limit: "8mb" });
  app.useBodyParser("urlencoded", { limit: "8mb", extended: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API docs for the mobile team to build against later (backlog DoD item:
  // "API มีเอกสาร (OpenAPI/Swagger) พร้อมให้ทีม mobile ต่อยอด").
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Village Security & Community API")
    .setDescription(
      "Backend API — see docs/ARCHITECTURE.md and village-security-app-spec.md",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log(
    `Backend listening on http://localhost:${port} (Swagger at /docs)`,
  );
}

bootstrap();
