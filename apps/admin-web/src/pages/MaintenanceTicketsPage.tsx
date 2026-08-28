import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { House, MaintenanceCategory, MaintenanceStatus, MaintenanceTicket, Paginated } from '../lib/types';

// Epic 9 — Maintenance (spec 2.4 / docs/PHASE2_BACKLOG.md Epic 9).
// Admin oversight screen: list every ticket in the village (filter by
// status/category), open a ticket's detail (incl. attached photo ref),
// assign a team + scheduled date, and mark a ticket done. Pattern follows
// EntryLogsPage.tsx (filter + paginated table) and TransportProvidersPage.tsx
// (inline form) — no UI library, matching the rest of admin-web.

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

const STATUS_COLOR: Record<MaintenanceStatus, string> = {
  OPEN: '#b45309',
  IN_PROGRESS: '#1d4ed8',
  DONE: '#15803d',
};

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
      <h1>แจ้งซ่อม</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
        <label>
          สถานะ
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MaintenanceStatus | '')}
            style={{ display: 'block', padding: 6 }}
          >
            <option value="">ทั้งหมด</option>
            {(Object.keys(STATUS_LABEL) as MaintenanceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          หมวดหมู่
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MaintenanceCategory | '')}
            style={{ display: 'block', padding: 6 }}
          >
            <option value="">ทั้งหมด</option>
            {(Object.keys(CATEGORY_LABEL) as MaintenanceCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <button onClick={handleSearch}>ค้นหา</button>
      </div>

      {listError && <p style={{ color: 'crimson' }}>{listError}</p>}
      {result === null && !listError && <p>กำลังโหลด...</p>}
      {result !== null && result.items.length === 0 && <p>ไม่พบใบงานแจ้งซ่อม</p>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>เลขที่ใบงาน</th>
              <th style={{ padding: 8 }}>บ้าน</th>
              <th style={{ padding: 8 }}>หมวดหมู่</th>
              <th style={{ padding: 8 }}>สถานะ</th>
              <th style={{ padding: 8 }}>ผู้รับผิดชอบ</th>
              <th style={{ padding: 8 }}>วันนัดหมาย</th>
              <th style={{ padding: 8 }}>แจ้งเมื่อ</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((t) => (
              <tr
                key={t.id}
                style={{
                  borderBottom: '1px solid #eee',
                  background: t.id === selectedId ? '#f5f5f5' : undefined,
                }}
              >
                <td style={{ padding: 8 }}>{t.ticketNumber}</td>
                <td style={{ padding: 8 }}>{houseNo(t.houseId)}</td>
                <td style={{ padding: 8 }}>{CATEGORY_LABEL[t.category]}</td>
                <td style={{ padding: 8, color: STATUS_COLOR[t.status], fontWeight: 600 }}>
                  {STATUS_LABEL[t.status]}
                </td>
                <td style={{ padding: 8 }}>{t.assignedTo ?? '—'}</td>
                <td style={{ padding: 8 }}>
                  {t.scheduledDate ? new Date(t.scheduledDate).toLocaleDateString('th-TH') : '—'}
                </td>
                <td style={{ padding: 8 }}>{new Date(t.createdAt).toLocaleString('th-TH')}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => selectTicket(t)}>ดูรายละเอียด</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {selected && (
          <div style={{ border: '1px solid #ddd', padding: 16, minWidth: 320, maxWidth: 360 }}>
            <h2 style={{ marginTop: 0 }}>ใบงาน {selected.ticketNumber}</h2>
            <p>
              <strong>บ้าน:</strong> {houseNo(selected.houseId)}
              <br />
              <strong>หมวดหมู่:</strong> {CATEGORY_LABEL[selected.category]}
              <br />
              <strong>สถานะ:</strong>{' '}
              <span style={{ color: STATUS_COLOR[selected.status], fontWeight: 600 }}>
                {STATUS_LABEL[selected.status]}
              </span>
            </p>
            <p>
              <strong>คำอธิบาย:</strong>
              <br />
              {selected.description}
            </p>
            <p>
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
              <form onSubmit={handleAssign} style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>มอบหมายงาน</h3>
                <label style={{ display: 'block', marginBottom: 10 }}>
                  ทีมช่าง/ผู้รับผิดชอบ
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6 }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 10 }}>
                  วันนัดหมาย
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 6 }}
                  />
                </label>
                <button type="submit" disabled={actionLoading}>
                  {selected.status === 'OPEN' ? 'มอบหมายงาน (เริ่มดำเนินการ)' : 'บันทึกการมอบหมายใหม่'}
                </button>
              </form>
            )}

            {selected.status === 'IN_PROGRESS' && (
              <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
                <button onClick={handleMarkDone} disabled={actionLoading}>
                  ทำเครื่องหมายเสร็จสิ้น
                </button>
              </div>
            )}

            {actionError && <p style={{ color: 'crimson' }}>{actionError}</p>}

            <button type="button" onClick={() => setSelectedId(null)} style={{ marginTop: 16 }}>
              ปิด
            </button>
          </div>
        )}
      </div>

      {result && result.total > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ก่อนหน้า
          </button>
          <span>
            หน้า {page} / {totalPages} (ทั้งหมด {result.total} รายการ)
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
