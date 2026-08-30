import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, PatrolLog, Paginated } from '../lib/types';
import { AuthedImage } from '../components/AuthedImage';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, radius, spacing } from '../theme';

const selectStyle = {
  display: 'block',
  padding: spacing.sm,
  marginTop: spacing.xs,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
};
const thStyle = { padding: spacing.sm, fontSize: 13, color: colors.textSecondary };
const tdStyle = { padding: spacing.sm, fontSize: 14, color: colors.textPrimary, verticalAlign: 'top' as const };

/**
 * Epic 12 — Guard Patrol Log (user request, not in the original spec — see
 * docs/PHASE2_BACKLOG.md §5). ADMIN-only oversight view (backend also
 * allows GUARD via the same GET /patrol-logs, but there's no guard-facing
 * admin-web session — the mobile guard app has its own recording screen).
 * Pattern mirrors EntryLogsPage (pagination + date filter) and SosPage
 * (Google Maps link for optional GPS) — photos load via AuthedImage
 * (ADR-007's blob-fetch pattern), never a token-in-URL `<img src>`.
 */
export function PatrolLogsPage() {
  const [guards, setGuards] = useState<AppUser[]>([]);
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [result, setResult] = useState<Paginated<PatrolLog> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AppUser[]>('/users?role=GUARD')
      .then(setGuards)
      .catch(() => setGuards([]));
  }, []);

  async function load() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const data = await api.get<Paginated<PatrolLog>>(`/patrol-logs?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดประวัติตรวจรอบไม่สำเร็จ');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function guardName(id: string): string {
    return guards.find((g) => g.id === id)?.name ?? '(ไม่ทราบชื่อ)';
  }

  function handleSearch() {
    setPage(1);
    load();
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>ประวัติตรวจรอบ</h1>
      <p style={{ fontSize: 13, color: colors.textSecondary }}>
        บันทึกการเดินตรวจของ รปภ. — ถ่ายรูปแบบอิสระ ไม่มีจุดตรวจตายตัว หมายเหตุและพิกัดเป็นข้อมูลเสริม
      </p>

      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end', marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          วันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={selectStyle} />
        </label>
        <Button onClick={handleSearch}>ค้นหา</Button>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {result === null && !error && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {result !== null && result.items.length === 0 && <p style={{ color: colors.textSecondary }}>ไม่พบข้อมูล</p>}

      <Card style={{ padding: 0, overflowX: 'auto' as const }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}`, background: colors.primaryLight }}>
              <th style={thStyle}>รูปถ่าย</th>
              <th style={thStyle}>รปภ.</th>
              <th style={thStyle}>เวลา</th>
              <th style={thStyle}>หมายเหตุ</th>
              <th style={thStyle}>พิกัด</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((log) => (
              <tr key={log.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={tdStyle}>
                  <AuthedImage
                    ref_={log.photoUrl}
                    alt={`รูปตรวจรอบโดย ${guardName(log.guardUserId)}`}
                    style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: radius.input }}
                  />
                </td>
                <td style={tdStyle}>{guardName(log.guardUserId)}</td>
                <td style={tdStyle}>{new Date(log.createdAt).toLocaleString('th-TH')}</td>
                <td style={tdStyle}>{log.note ?? '—'}</td>
                <td style={tdStyle}>
                  {log.latitude && log.longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: colors.secondary }}
                    >
                      {log.latitude}, {log.longitude}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
