import type { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../lib/auth';

/**
 * Shell nav for the admin dashboard, per spec 1.3 sections: Dashboard /
 * จัดการประกาศ / รายงาน (+ SOS view, members, guard shifts, entry logs from
 * MVP_BACKLOG.md Epic 5). Plain inline styles — MVP scope explicitly says
 * "ไม่ต้องสวยมาก แค่ใช้งานได้ครบ flow", not worth pulling in a UI library for.
 */
export function AppLayout({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const session = getSession();

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #ddd',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/announcements">ประกาศ</Link>
          <Link to="/sos">SOS</Link>
          <Link to="/members">สมาชิก/บ้าน</Link>
          <Link to="/guard-shifts">เวรยาม</Link>
          <Link to="/entry-logs">ประวัติเข้า-ออก</Link>
          <Link to="/transport-providers">ทำเนียบรถรับจ้าง</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session && <span>{session.name}</span>}
          <button onClick={handleLogout}>ออกจากระบบ</button>
        </div>
      </nav>
      <main style={{ padding: '0 16px 32px' }}>{children ?? <Outlet />}</main>
    </div>
  );
}
