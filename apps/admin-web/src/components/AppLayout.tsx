import type { ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../lib/auth';
import { Button } from './Button';
import { colors, font, spacing } from '../theme';

/**
 * Shell nav for the admin dashboard, per spec 1.3 sections: Dashboard /
 * จัดการประกาศ / รายงาน (+ SOS view, members, guard shifts, entry logs from
 * MVP_BACKLOG.md Epic 5). Styled per docs/DESIGN_SYSTEM.md tokens (visual
 * only — same routes/behavior as before).
 */
const NAV_ITEMS: { to: string; label: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/announcements', label: 'ประกาศ' },
  { to: '/sos', label: 'SOS' },
  { to: '/members', label: 'สมาชิก/บ้าน' },
  { to: '/guard-shifts', label: 'เวรยาม' },
  { to: '/entry-logs', label: 'ประวัติเข้า-ออก' },
  { to: '/transport-providers', label: 'ทำเนียบรถรับจ้าง' },
  { to: '/maintenance-tickets', label: 'แจ้งซ่อม' },
  { to: '/chat', label: 'แชท' },
];

export function AppLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ fontFamily: font.family, background: colors.background, minHeight: '100vh' }}>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.md}px ${spacing.lg}px`,
          background: colors.primary,
          marginBottom: spacing.lg,
          flexWrap: 'wrap',
          gap: spacing.sm,
          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontWeight: 800, color: '#FFFFFF', fontSize: 16 }}>
            <span aria-hidden>🏘️</span>
            <span>HF Admin</span>
          </div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            {NAV_ITEMS.map((item) => {
              const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    textDecoration: 'none',
                    padding: `${spacing.xs + 2}px ${spacing.md}px`,
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)',
                    background: active ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                    boxShadow: active ? 'inset 0 -2px 0 #FFFFFF' : undefined,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          {session && <span style={{ fontSize: 14, color: '#FFFFFF' }}>{session.name}</span>}
          <Button
            variant="danger"
            onClick={handleLogout}
            style={{ padding: `6px ${spacing.md}px`, fontSize: 13, border: '1px solid rgba(255,255,255,0.6)' }}
          >
            ออกจากระบบ
          </Button>
        </div>
      </nav>
      <main style={{ padding: `0 ${spacing.lg}px ${spacing.xxl}px` }}>{children ?? <Outlet />}</main>
    </div>
  );
}
