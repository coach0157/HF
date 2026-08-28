import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { House, MaintenanceCategory, MaintenanceStatus, MaintenanceTicket, Paginated } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { BadgeVariant } from '../components/Badge';
import { colors, radius, spacing } from '../theme';

// Epic 9 — Maintenance (spec 2.4 / docs/PHASE2_BACKLOG.md Epic 9).
// Admin oversight screen: list every ticket in the village (filter by
// status/category), open a ticket's detail (incl. attached photo ref),
// assign a team + scheduled date, and mark a ticket done. Pattern follows
// EntryLogsPage.tsx (filter + paginated table) and TransportProvidersPage.tsx
// (form) — styled via shared Button/Card/Badge components.

const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  ELECTRICAL: 'ไฟฟ้า',
  PLUMBING: 'ประปา',
  ROAD: 'ถนน',
  OTHER: 'อื่นๆ',
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: 'รับเรื่อง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  DONE: 'เสร็จสิ้น',
};

const STATUS_BADGE_VARIANT: Record<MaintenanceStatus, BadgeVariant> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  DONE: 'success',
};

const selectStyle = {
  display: 'block',
  padding: spacing.sm,
  marginTop: spacing.xs,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
};
const labelStyle = { display: 'block', marginBottom: spacing.md, fontSize: 14, color: colors.textPrimary };
const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: spacing.xs,
  padding: spacing.sm,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
};
const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary };

export function MaintenanceTicketsPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<MaintenanceCategory | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [result, setResult] = useState<Paginated<MaintenanceTicket> | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    api.get<House[]>('/houses').then(setHouses).catch(() => setHouses([]));
  }, []);

  async function load() {
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const data = await api.get<Paginated<MaintenanceTicket>>(`/maintenance-tickets?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดรายการแจ้งซ่อมไม่สำเร็จ');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleSearch() {
    setPage(1);
    load();
  }

  function houseNo(id: string): string {
    return houses.find((h) => h.id === id)?.houseNo ?? id;
  }

  const selected = result?.items.find((t) => t.id === selectedId) ?? null;

  function selectTicket(t: MaintenanceTicket) {
    setSelectedId(t.id);
    setAssignedTo(t.assignedTo ?? '');
    setScheduledDate(t.scheduledDate ? t.scheduledDate.slice(0, 10) : '');
    setActionError(null);
  }

  async function handleAssign(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setActionError(null);

    if (!assignedTo.trim()) {
      setActionError('กรุณาระบุทีมช่าง/ผู้รับผิดชอบ');
      return;
    }
    if (!scheduledDate) {
      setActionError('กรุณาเลือกวันนัดหมาย');
      return;
    }

    setActionLoading(true);
    try {
      await api.patch(`/maintenance-tickets/${selected.id}/assign`, {
        assignedTo: assignedTo.trim(),
        scheduledDate: new Date(scheduledDate).toISOString(),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'มอบหมายงานไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkDone() {
    if (!selected) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await api.patch(`/maintenance-tickets/${selected.id}/status`, { status: 'DONE' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setActionLoading(false);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>แจ้งซ่อม</h1>

      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end', marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          สถานะ
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MaintenanceStatus | '')}
            style={selectStyle}
          >
            <option value="">ทั้งหมด</option>
            {(Object.keys(STATUS_LABEL) as MaintenanceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          หมวดหมู่
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MaintenanceCategory | '')}
            style={selectStyle}
          >
            <option value="">ทั้งหมด</option>
            {(Object.keys(CATEGORY_LABEL) as MaintenanceCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={handleSearch}>ค้นหา</Button>
      </div>

      {listError && <p style={{ color: colors.danger }}>{listError}</p>}
      {result === null && !listError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {result !== null && result.items.length === 0 && <p style={{ color: colors.textSecondary }}>ไม่พบใบงานแจ้งซ่อม</p>}

      <div style={{ display: 'flex', gap: spacing.xl, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
        <Card style={{ flex: 1, minWidth: 320, padding: 0, overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>
                <th style={thStyle}>เลขที่ใบงาน</th>
                <th style={thStyle}>บ้าน</th>
                <th style={thStyle}>หมวดหมู่</th>
                <th style={thStyle}>สถานะ</th>
                <th style={thStyle}>ผู้รับผิดชอบ</th>
                <th style={thStyle}>วันนัดหมาย</th>
                <th style={thStyle}>แจ้งเมื่อ</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {result?.items.map((t) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    background: t.id === selectedId ? colors.secondaryLight : undefined,
                  }}
                >
                  <td style={tdStyle}>{t.ticketNumber}</td>
                  <td style={tdStyle}>{houseNo(t.houseId)}</td>
                  <td style={tdStyle}>{CATEGORY_LABEL[t.category]}</td>
                  <td style={tdStyle}>
                    <Badge variant={STATUS_BADGE_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  </td>
                  <td style={tdStyle}>{t.assignedTo ?? '—'}</td>
                  <td style={tdStyle}>{t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString('th-TH') : '—'}</td>
                  <td style={tdStyle}>{new Date(t.createdAt).toLocaleString('th-TH')}</td>
                  <td style={tdStyle}>
                    <Button variant="secondary" onClick={() => selectTicket(t)}>
                      ดูรายละเอียด
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {selected && (
          <Card style={{ minWidth: 320, maxWidth: 360 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: colors.textPrimary }}>ใบงาน {selected.ticketNumber}</h2>
            <p style={{ color: colors.textPrimary }}>
              <strong>บ้าน:</strong> {houseNo(selected.houseId)}
              <br />
              <strong>หมวดหมู่:</strong> {CATEGORY_LABEL[selected.category]}
              <br />
              <strong>สถานะ:</strong> <Badge variant={STATUS_BADGE_VARIANT[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
            </p>
            <p style={{ color: colors.textPrimary }}>
              <strong>คำอธิบาย:</strong>
              <br />
              {selected.description}
            </p>
            <p style={{ color: colors.textPrimary }}>
              <strong>รูปแนบ:</strong>{' '}
              {selected.imageUrl ? (
                // Local-dev file storage returns a "local://bucket/village/file"
                // reference, not a fetchable HTTP URL (see
                // file-storage.service.ts) — shown as text, not <img>, until a
                // real S3/R2 signed-URL backend is wired up.
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{selected.imageUrl}</code>
              ) : (
                'ไม่มีรูปแนบ'
              )}
            </p>

            {selected.status !== 'DONE' && (
              <form onSubmit={handleAssign} style={{ marginTop: spacing.lg, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
                <h3 style={{ marginTop: 0, color: colors.textPrimary }}>มอบหมายงาน</h3>
                <label style={labelStyle}>
                  ทีมช่าง/ผู้รับผิดชอบ
                  <input type="text" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  วันนัดหมาย
                  <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={inputStyle} />
                </label>
                <Button type="submit" loading={actionLoading} loadingText="กำลังบันทึก...">
                  {selected.status === 'OPEN' ? 'มอบหมายงาน (เริ่มดำเนินการ)' : 'บันทึกการมอบหมายใหม่'}
                </Button>
              </form>
            )}

            {selected.status === 'IN_PROGRESS' && (
              <div style={{ marginTop: spacing.lg, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
                <Button onClick={handleMarkDone} loading={actionLoading} loadingText="กำลังบันทึก...">
                  ทำเครื่องหมายเสร็จสิ้น
                </Button>
              </div>
            )}

            {actionError && <p style={{ color: colors.danger, fontSize: 13 }}>{actionError}</p>}

            <Button type="button" variant="secondary" onClick={() => setSelectedId(null)} style={{ marginTop: spacing.lg }}>
              ปิด
            </Button>
          </Card>
        )}
      </div>

      {result && result.total > 0 && (
        <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.md, alignItems: 'center' }}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ก่อนหน้า
          </Button>
          <span style={{ fontSize: 14, color: colors.textPrimary }}>
            หน้า {page} / {totalPages} (ทั้งหมด {result.total} รายการ)
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  );
}
