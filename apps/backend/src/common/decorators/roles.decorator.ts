import { SetMetadata } from '@nestjs/common';
import type { TenantClaims } from '../rls/tenant-context';

export const ROLES_KEY = 'roles';

/**
 * RBAC per spec 3.4 ("จำกัดสิทธิ์ตาม Role-Based Access Control (RBAC) ทุก
 * endpoint"). Usage:
 *
 *   @Roles('RESIDENT')
 *   @Post('visitor-passes')
 *   createPass(...) { ... }
 *
 * Enforced by RolesGuard, which reads the role out of the tenant claims
 * (already verified + decoded by TenantContextMiddleware).
 */
export const Roles = (...roles: TenantClaims['role'][]) => SetMetadata(ROLES_KEY, roles);
