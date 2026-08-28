import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { TenantContextMiddleware } from "./common/rls/tenant-context.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { VisitorPassModule } from "./modules/visitor-pass/visitor-pass.module";
import { EntryLogModule } from "./modules/entry-log/entry-log.module";
import { AnnouncementModule } from "./modules/announcement/announcement.module";
import { SosModule } from "./modules/sos/sos.module";
import { GuardShiftModule } from "./modules/guard-shift/guard-shift.module";
import { HouseModule } from "./modules/house/house.module";
import { TransportProviderModule } from "./modules/transport-provider/transport-provider.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";

@Module({
  imports: [
    CommonModule,
    AuthModule,
    VisitorPassModule,
    EntryLogModule,
    AnnouncementModule,
    SosModule,
    GuardShiftModule,
    HouseModule,
    TransportProviderModule,
    MaintenanceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Step 1 of the RLS pattern — see docs/ARCHITECTURE.md. Applied to every
    // route; the middleware itself decides whether a token is present and
    // decodable, it never blocks the request (that's JwtAuthGuard's job).
    consumer.apply(TenantContextMiddleware).forRoutes("*");
  }
}
