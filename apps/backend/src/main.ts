import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors(); // TODO(Dev agent): restrict to the admin-web origin(s) before staging.
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
    .setTitle('Village Security & Community API')
    .setDescription('Backend API — see docs/ARCHITECTURE.md and village-security-app-spec.md')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port} (Swagger at /docs)`);
}

bootstrap();
