import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';

/**
 * Shell nav for the admin dashboard, per spec 1.3 sections:
 * Dashboard / จัดการประกาศ / รายงาน (+ SOS view, members, guard shifts from
 * MVP_BACKLOG.md Epic 5). Dev agent TODO: replace with real styling/UI
 * library of choice; this is layout scaffolding only.
 */
export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <div>
      <nav>
        <Link to="/">Dashboard</Link> | <Link to="/announcements">ประกาศ</Link> |{' '}
        <Link to="/sos">SOS</Link> | <Link to="/members">สมาชิก/บ้าน</Link> |{' '}
        <Link to="/guard-shifts">Guard Shifts</Link> | <Link to="/entry-logs">ประวัติเข้า-ออก</Link>
      </nav>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}
