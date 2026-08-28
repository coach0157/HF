import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Plain infra health check — not part of any spec module. Useful for
 * `docker compose up` smoke-testing and later for a container orchestrator
 * liveness/readiness probe. Deliberately bypasses RLS (uses PrismaService
 * directly) since it just needs to prove the DB connection works, not read
 * tenant data.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'connected' };
  }
}
