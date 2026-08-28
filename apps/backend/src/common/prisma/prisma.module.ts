import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so every feature module can `@Injectable()`-inject PrismaService
 * without re-importing PrismaModule everywhere. Registered once from
 * CommonModule (see src/common/common.module.ts).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
