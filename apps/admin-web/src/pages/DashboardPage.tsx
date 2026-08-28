import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { EntryLog, GuardShift, Paginated, SosAlert } from '../lib/types';

/**
 * Dashboard — spec 1.3: "กราฟสรุปรถเข้า-ออกวันนี้, จำนวนแจ้งเหตุ, ค้างชำระค่าส่วนกลาง".
 * The "ค้างชำระค่าส่วนกลาง" (unpaid bills) widget depends on the Billing
 * module, which is Phase 3 / out of MVP scope (see MVP_BACKLOG.md) — shown
 * as a static "not available yet" note instead of blocking the rest of the
 * dashboard. Entry-count and SOS-count widgets call the real APIs.
 */
export function DashboardPage() {
  const [entryToday, setEntryToday] = useState<number | null>(null);
  const [pendingSos, setPendingSos] = useState<number | null>(null);
  const [onDutyGuards, setOnDutyGuards] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    api
      .get<Paginated<EntryLog>>(`/entry-logs?date=${today}&pageSize=1`)
      .then((res) => setEntryToday(res.total))
      .catch(() => setEntryToday(null));
    api
      .get<SosAlert[]>('/sos-alerts?status=PENDING')
      .then((res) => setPendingSos(res.length))
      .catch(() => setPendingSos(null));
    api
      .get<GuardShift[]>('/guard-shifts?status=ON_DUTY')
      .then((res) => setOnDutyGuards(res.length))
      .catch(() => setOnDutyGuards(null));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard title="รถ/แขกเข้า-ออกวันนี้" value={entryToday} linkTo="/entry-logs" />
        <StatCard title="แจ้งเหตุ SOS ที่รอรับแจ้ง" value={pendingSos} linkTo="/sos" highlight={Boolean(pendingSos)} />
        <StatCard title="รปภ. ที่กำลังปฏิบัติหน้าที่" value={onDutyGuards} linkTo="/guard-shifts" />
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, minWidth: 200, opacity: 0.6 }}>
          <div style={{ fontSize: 13, color: '#666' }}>ค้างชำระค่าส่วนกลาง</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>ยังไม่พร้อมใช้งาน (โมดูลชำระเงิน — เฟส 3)</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  linkTo,
  highlight,
}: {
  title: string;
  value: number | null;
  linkTo: string;
  highlight?: boolean;
}) {
  return (
    <Link
      to={linkTo}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        border: `1px solid ${highlight ? '#c0392b' : '#ddd'}`,
        borderRadius: 8,
        padding: 16,
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 13, color: '#666' }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: highlight ? '#c0392b' : 'inherit' }}>
        {value === null ? '—' : value}
      </div>
    </Link>
  );
}
