import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { Announcement, AnnouncementLevel, AnnouncementTargetScope, House } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import type { BadgeVariant } from '../components/Badge';
import { colors, radius, spacing } from '../theme';

const LEVEL_LABEL: Record<AnnouncementLevel, string> = {
  NORMAL: 'ปกติ',
  IMPORTANT: 'สำคัญ',
  EMERGENCY: 'ฉุกเฉิน',
};

const LEVEL_BADGE_VARIANT: Record<AnnouncementLevel, BadgeVariant> = {
  NORMAL: 'success',
  IMPORTANT: 'warning',
  EMERGENCY: 'danger',
};

const SCOPE_LABEL: Record<AnnouncementTargetScope, string> = {
  ALL: 'ทั้งหมู่บ้าน',
  ZONE: 'เฉพาะโซน',
  HOUSE: 'เฉพาะบ้าน',
};

interface FormState {
  title: string;
  content: string;
  level: AnnouncementLevel;
  targetScope: AnnouncementTargetScope;
  targetZone: string;
  targetHouseIds: string[];
}

const emptyForm: FormState = {
  title: '',
  content: '',
  level: 'NORMAL',
  targetScope: 'ALL',
  targetZone: '',
  targetHouseIds: [],
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

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function loadAnnouncements() {
    setListError(null);
    try {
      const data = await api.get<Announcement[]>('/announcements');
      setAnnouncements(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดรายการประกาศไม่สำเร็จ');
    }
  }

  useEffect(() => {
    loadAnnouncements();
    api.get<House[]>('/houses').then(setHouses).catch(() => setHouses([]));
  }, []);

  function startEdit(a: Announcement) {
    setEditingId(a.id);
    setShowForm(true);
    setForm({
      title: a.title,
      content: a.content,
      level: a.level,
      targetScope: a.targetScope,
      targetZone: a.targetZone ?? '',
      // QA fix: preload the houses already targeted (from GET /announcements'
      // targetHouseIds) instead of starting from an empty selection — leaving
      // this empty forced admins to re-pick every house on every edit and
      // silently dropped any they missed (data loss). See docs/QA_REPORT.md.
      targetHouseIds: a.targetHouseIds ?? [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.content.trim()) {
      setError('กรุณากรอกหัวข้อและเนื้อหาประกาศ');
      return;
    }
    if (form.targetScope === 'ZONE' && !form.targetZone.trim()) {
      setError('กรุณาระบุโซนเป้าหมาย');
      return;
    }
    if (form.targetScope === 'HOUSE' && form.targetHouseIds.length === 0) {
      setError('กรุณาเลือกบ้านอย่างน้อย 1 หลัง');
      return;
    }

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      level: form.level,
      targetScope: form.targetScope,
      ...(form.targetScope === 'ZONE' ? { targetZone: form.targetZone.trim() } : {}),
      ...(form.targetScope === 'HOUSE' ? { targetHouseIds: form.targetHouseIds } : {}),
    };

    setLoading(true);
    try {
      if (editingId) {
        await api.patch(`/announcements/${editingId}`, payload);
      } else {
        await api.post('/announcements', payload);
      }
      cancelEdit();
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกประกาศไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('ยืนยันลบประกาศนี้?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      await loadAnnouncements();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'ลบประกาศไม่สำเร็จ');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
        <h1 style={{ color: colors.textPrimary, margin: 0 }}>จัดการประกาศ</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <span aria-hidden>＋</span> สร้างประกาศใหม่
          </Button>
        )}
      </div>

      {showForm && (
      <Card as="div" style={{ marginTop: spacing.lg, marginBottom: spacing.xl, maxWidth: 520 }}>
        <form onSubmit={handleSubmit}>
          <h2 style={{ marginTop: 0, fontSize: 18, color: colors.textPrimary }}>
            {editingId ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
          </h2>

          <label style={labelStyle}>
            หัวข้อ
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            เนื้อหา
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={4}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            ระดับความสำคัญ
            <select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as AnnouncementLevel }))}
              style={inputStyle}
            >
              {(Object.keys(LEVEL_LABEL) as AnnouncementLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {LEVEL_LABEL[lvl]}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            กลุ่มเป้าหมาย
            <select
              value={form.targetScope}
              onChange={(e) => setForm((f) => ({ ...f, targetScope: e.target.value as AnnouncementTargetScope }))}
              style={inputStyle}
            >
              {(Object.keys(SCOPE_LABEL) as AnnouncementTargetScope[]).map((scope) => (
                <option key={scope} value={scope}>
                  {SCOPE_LABEL[scope]}
                </option>
              ))}
            </select>
          </label>

          {form.targetScope === 'ZONE' && (
            <label style={labelStyle}>
              โซน
              <input
                type="text"
                value={form.targetZone}
                onChange={(e) => setForm((f) => ({ ...f, targetZone: e.target.value }))}
                placeholder="เช่น A"
                style={inputStyle}
              />
            </label>
          )}

          {form.targetScope === 'HOUSE' && (
            <fieldset
              style={{
                marginBottom: spacing.md,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.input,
                padding: spacing.md,
              }}
            >
              <legend style={{ fontSize: 13, color: colors.textSecondary, padding: `0 ${spacing.xs}px` }}>
                เลือกบ้าน
              </legend>
              {houses.length === 0 && <p style={{ color: colors.textSecondary }}>ยังไม่มีข้อมูลบ้าน</p>}
              {houses.map((h) => (
                <label key={h.id} style={{ display: 'block', fontSize: 14, padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={form.targetHouseIds.includes(h.id)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        targetHouseIds: e.target.checked
                          ? [...f.targetHouseIds, h.id]
                          : f.targetHouseIds.filter((id) => id !== h.id),
                      }))
                    }
                  />{' '}
                  {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
                </label>
              ))}
            </fieldset>
          )}

          {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Button type="submit" loading={loading} loadingText="กำลังบันทึก...">
              {editingId ? 'บันทึกการแก้ไข' : 'สร้างประกาศ'}
            </Button>
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </Card>
      )}

      <h2
        style={{
          color: colors.textPrimary,
          background: colors.primaryLight,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: radius.input,
        }}
      >
        รายการประกาศ
      </h2>
      {listError && <p style={{ color: colors.danger }}>{listError}</p>}
      {announcements === null && !listError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
      {announcements !== null && announcements.length === 0 && (
        <p style={{ color: colors.textSecondary }}>ยังไม่มีประกาศ</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {announcements?.map((a) => (
          <Card key={a.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>{a.title}</strong>
              <Badge variant={LEVEL_BADGE_VARIANT[a.level]}>{LEVEL_LABEL[a.level]}</Badge>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', color: colors.textPrimary }}>{a.content}</p>
            <p style={{ fontSize: 12, color: colors.textSecondary }}>
              กลุ่มเป้าหมาย: {SCOPE_LABEL[a.targetScope]}
              {a.targetScope === 'ZONE' && a.targetZone ? ` (${a.targetZone})` : ''}
              {' · '}
              {new Date(a.createdAt).toLocaleString('th-TH')}
            </p>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button variant="secondary" onClick={() => startEdit(a)}>
                แก้ไข
              </Button>
              <Button variant="danger" onClick={() => handleDelete(a.id)}>
                ลบ
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
