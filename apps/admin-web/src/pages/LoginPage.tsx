/**
 * Login page — phone + OTP, per spec 3.3 (`POST /auth/login`).
 *
 * Dev agent TODO:
 *  - Two-step form: (1) submit phone -> request OTP, (2) submit OTP code ->
 *    call `POST /auth/login`, store the returned JWT via
 *    `setSession()` (src/lib/auth.ts), redirect to `/`.
 *  - Reject non-ADMIN roles at this login screen (this app is admin-only —
 *    Resident/Guard use the mobile app, out of scope here) even though the
 *    backend RBAC is the real enforcement point.
 */
export function LoginPage() {
  return (
    <div>
      <h1>เข้าสู่ระบบ (Admin)</h1>
      <p>TODO: phone + OTP login form — see component doc comment.</p>
    </div>
  );
}
