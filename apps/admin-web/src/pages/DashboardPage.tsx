import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { EntryLog, GuardShift, Paginated, SosAlert } from '../lib/types';
import { Card } from '../components/Card';
import { colors, spacing } from '../theme';

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
      <h1 style={{ color: colors.textPrimary }}>Dashboard</h1>
      <div style={{ display: 'flex', gap: spacing.lg, flexWrap: 'wrap' }}>
        <StatCard title="รถ/แขกเข้า-ออกวันนี้" value={entryToday} linkTo="/entry-logs" icon="🚗" iconBg={colors.secondaryLight} iconColor={colors.secondaryDark} />
        <StatCard
          title="แจ้งเหตุ SOS ที่รอรับแจ้ง"
          value={pendingSos}
          linkTo="/sos"
          highlight={Boolean(pendingSos)}
          icon="🚨"
          iconBg={colors.dangerLight}
          iconColor={colors.danger}
        />
        <StatCard title="รปภ. ที่กำลังปฏิบัติหน้าที่" value={onDutyGuards} linkTo="/guard-shifts" icon="🛡️" iconBg={colors.primaryLight} iconColor={colors.primaryDark} />
        <Card style={{ minWidth: 200, opacity: 0.65 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <IconCircle icon="💰" bg={colors.border} color={colors.textSecondary} />
            <div style={{ fontSize: 13, color: colors.textSecondary }}>ค้างชำระค่าส่วนกลาง</div>
          </div>
          <div style={{ fontSize: 13, marginTop: spacing.sm, color: colors.textPrimary }}>
            ยังไม่พร้อมใช้งาน (โมดูลชำระเงิน — เฟส 3)
          </div>
        </Card>
      </div>
    </div>
  );
}

function IconCircle({ icon, bg, color }: { icon: string; bg: string; color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: bg,
        color,
        fontSize: 20,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

function StatCard({
  title,
  value,
  linkTo,
  highlight,
  icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: number | null;
  linkTo: string;
  highlight?: boolean;
  icon: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Link to={linkTo} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card
        style={{
          minWidth: 200,
          border: `1px solid ${highlight ? colors.danger : colors.border}`,
          background: highlight ? colors.dangerLight : colors.surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <IconCircle icon={icon} bg={highlight ? colors.surface : iconBg} color={highlight ? colors.danger : iconColor} />
          <div>
            <div style={{ fontSize: 13, color: highlight ? colors.danger : colors.textSecondary }}>{title}</div>
            <div style={{ fontSize: 30, fontWeight: 'bold', color: highlight ? colors.danger : colors.textPrimary }}>
              {value === null ? '—' : value}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
