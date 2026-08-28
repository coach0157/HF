import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { Announcement, AnnouncementLevel, AnnouncementTargetScope, House } from '../lib/types';

const LEVEL_LABEL: Record<AnnouncementLevel, string> = {
  NORMAL: 'ปกติ',
  IMPORTANT: 'สำคัญ',
  EMERGENCY: 'ฉุกเฉิน',
};

const LEVEL_COLOR: Record<AnnouncementLevel, string> = {
  NORMAL: '#555',
  IMPORTANT: '#b8860b',
  EMERGENCY: '#c0392b',
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

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      <h1>จัดการประกาศ</h1>

      <form onSubmit={handleSubmit} style={{ border: '1px solid #ddd', padding: 16, marginBottom: 24, maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}</h2>

        <label style={{ display: 'block', marginBottom: 10 }}>
          หัวข้อ
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          เนื้อหา
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={4}
            style={{ display: 'block', width: '100%', padding: 6 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          ระดับความสำคัญ
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as AnnouncementLevel }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          >
            {(Object.keys(LEVEL_LABEL) as AnnouncementLevel[]).map((lvl) => (
              <option key={lvl} value={lvl}>
                {LEVEL_LABEL[lvl]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          กลุ่มเป้าหมาย
          <select
            value={form.targetScope}
            onChange={(e) => setForm((f) => ({ ...f, targetScope: e.target.value as AnnouncementTargetScope }))}
            style={{ display: 'block', width: '100%', padding: 6 }}
          >
            {(Object.keys(SCOPE_LABEL) as AnnouncementTargetScope[]).map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABEL[scope]}
              </option>
            ))}
          </select>
        </label>

        {form.targetScope === 'ZONE' && (
          <label style={{ display: 'block', marginBottom: 10 }}>
            โซน
            <input
              type="text"
              value={form.targetZone}
              onChange={(e) => setForm((f) => ({ ...f, targetZone: e.target.value }))}
              placeholder="เช่น A"
              style={{ display: 'block', width: '100%', padding: 6 }}
            />
          </label>
        )}

        {form.targetScope === 'HOUSE' && (
          <fieldset style={{ marginBottom: 10 }}>
            <legend>เลือกบ้าน</legend>
            {houses.length === 0 && <p>ยังไม่มีข้อมูลบ้าน</p>}
            {houses.map((h) => (
              <label key={h.id} style={{ display: 'block' }}>
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
                />
                {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
              </label>
            ))}
          </fieldset>
        )}

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'สร้างประกาศ'}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              ยกเลิก
            </button>
          )}
        </div>
      </form>

      <h2>รายการประกาศ</h2>
      {listError && <p style={{ color: 'crimson' }}>{listError}</p>}
      {announcements === null && !listError && <p>กำลังโหลด...</p>}
      {announcements !== null && announcements.length === 0 && <p>ยังไม่มีประกาศ</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {announcements?.map((a) => (
          <li key={a.id} style={{ border: '1px solid #eee', padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{a.title}</strong>
              <span style={{ color: LEVEL_COLOR[a.level], fontWeight: 'bold' }}>{LEVEL_LABEL[a.level]}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.content}</p>
            <p style={{ fontSize: 12, color: '#666' }}>
              กลุ่มเป้าหมาย: {SCOPE_LABEL[a.targetScope]}
              {a.targetScope === 'ZONE' && a.targetZone ? ` (${a.targetZone})` : ''}
              {' · '}
              {new Date(a.createdAt).toLocaleString('th-TH')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => startEdit(a)}>แก้ไข</button>
              <button onClick={() => handleDelete(a.id)}>ลบ</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
