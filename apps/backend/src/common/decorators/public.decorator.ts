import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as not requiring a verified JWT. Use on the auth endpoints
 * (`POST /auth/login`, `POST /auth/refresh`) and the visitor QR scan lookup
 * per spec 3.3 ("ทุก endpoint ยกเว้น /auth/* และ path สแกน QR ของแขก").
 *
 * Note: the guard scanning a QR is themselves an authenticated Guard-role
 * user — spec's "path สแกน QR ของแขก" refers to the visitor-facing token
 * lookup only, not the whole visitor-pass module. Double-check per-endpoint
 * in visitor-pass.module.ts when implementing.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
