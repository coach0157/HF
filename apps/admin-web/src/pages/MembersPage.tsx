import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { AppUser, House, UserRole } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, radius, spacing } from '../theme';

const ROLE_LABEL: Record<UserRole, string> = {
  RESIDENT: 'ลูกบ้าน',
  GUARD: 'รปภ.',
  ADMIN: 'แอดมิน',
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface UserFormState {
  name: string;
  phone: string;
  role: UserRole;
  houseId: string;
}

const emptyUserForm: UserFormState = { name: '', phone: '', role: 'RESIDENT', houseId: '' };

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

export function MembersPage() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [newHouseNo, setNewHouseNo] = useState('');
  const [newHouseZone, setNewHouseZone] = useState('');
  const [houseError, setHouseError] = useState<string | null>(null);
  const [houseLoading, setHouseLoading] = useState(false);

  async function loadUsers(role: UserRole | 'ALL') {
    setListError(null);
    try {
      const query = role === 'ALL' ? '' : `?role=${role}`;
      const data = await api.get<AppUser[]>(`/users${query}`);
      setUsers(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
    }
  }

  async function loadHouses() {
    try {
      const data = await api.get<House[]>('/houses');
      setHouses(data);
    } catch {
      setHouses([]);
    }
  }

  useEffect(() => {
    loadUsers(roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  useEffect(() => {
    loadHouses();
  }, []);

  function startEdit(u: AppUser) {
    setEditingUserId(u.id);
    setUserForm({ name: u.name, phone: u.phone, role: u.role, houseId: u.houseId ?? '' });
    setUserError(null);
    setShowUserForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
    setUserError(null);
    setShowUserForm(false);
  }

  async function submitUser(e: FormEvent) {
    e.preventDefault();
    setUserError(null);

    if (!userForm.name.trim()) {
      setUserError('กรุณากรอกชื่อ');
      return;
    }
    if (!editingUserId && !/^0\d{9}$/.test(userForm.phone)) {
      setUserError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }

    setLoading(true);
    try {
      if (editingUserId) {
        await api.patch(`/users/${editingUserId}`, {
          name: userForm.name.trim(),
          role: userForm.role,
          houseId: userForm.houseId || NIL_UUID,
        });
      } else {
        await api.post('/users', {
          name: userForm.name.trim(),
          phone: userForm.phone.trim(),
          role: userForm.role,
          ...(userForm.houseId ? { houseId: userForm.houseId } : {}),
        });
      }
      cancelEdit();
      await loadUsers(roleFilter);
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id: string) {
    if (!window.confirm('ยืนยันลบสมาชิกนี้?')) return;
    try {
      await api.delete(`/users/${id}`);
      await loadUsers(roleFilter);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'ลบสมาชิกไม่สำเร็จ');
    }
  }

  async function submitHouse(e: FormEvent) {
    e.preventDefault();
    setHouseError(null);
    if (!newHouseNo.trim()) {
      setHouseError('กรุณากรอกเลขที่บ้าน');
      return;
    }
    setHouseLoading(true);
    try {
      await api.post('/houses', { houseNo: newHouseNo.trim(), ...(newHouseZone.trim() ? { zone: newHouseZone.trim() } : {}) });
      setNewHouseNo('');
      setNewHouseZone('');
      await loadHouses();
    } catch (err) {
      setHouseError(err instanceof ApiError ? err.message : 'เพิ่มบ้านไม่สำเร็จ');
    } finally {
      setHouseLoading(false);
    }
  }

  function houseLabel(id: string | null): string {
    if (!id) return '—';
    const house = houses.find((h) => h.id === id);
    return house ? `${house.houseNo}${house.zone ? ` (โซน ${house.zone})` : ''}` : id;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
        <h1 style={{ color: colors.textPrimary, margin: 0 }}>จัดการสมาชิก/บ้าน</h1>
        {!showUserForm && (
          <Button onClick={() => setShowUserForm(true)}>
            <span aria-hidden>＋</span> เพิ่มสมาชิก
          </Button>
        )}
      </div>

      <section style={{ marginBottom: spacing.xxl }}>
        <h2 style={{ color: colors.textPrimary }}>บ้าน</h2>
        <Card style={{ marginBottom: spacing.md, maxWidth: 480 }}>
          <form onSubmit={submitHouse} style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 14, color: colors.textPrimary }}>
              เลขที่บ้าน
              <input
                type="text"
                value={newHouseNo}
                onChange={(e) => setNewHouseNo(e.target.value)}
                style={{ ...inputStyle, width: 160 }}
              />
            </label>
            <label style={{ fontSize: 14, color: colors.textPrimary }}>
              โซน (ถ้ามี)
              <input
                type="text"
                value={newHouseZone}
                onChange={(e) => setNewHouseZone(e.target.value)}
                style={{ ...inputStyle, width: 120 }}
              />
            </label>
            <Button type="submit" loading={houseLoading} loadingText="กำลังเพิ่ม...">
              เพิ่มบ้าน
            </Button>
          </form>
          {houseError && <p style={{ color: colors.danger, fontSize: 13 }}>{houseError}</p>}
        </Card>
        <ul style={{ paddingLeft: spacing.lg, color: colors.textPrimary }}>
          {houses.map((h) => (
            <li key={h.id}>
              {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 style={{ color: colors.textPrimary }}>สมาชิก</h2>
        {showUserForm && (
        <Card style={{ marginBottom: spacing.xl, maxWidth: 480 }}>
          <form onSubmit={submitUser}>
            <h3 style={{ marginTop: 0, color: colors.textPrimary }}>{editingUserId ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิกใหม่'}</h3>

            <label style={labelStyle}>
              ชื่อ
              <input
                type="text"
                value={userForm.name}
                onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              เบอร์โทรศัพท์
              <input
                type="tel"
                value={userForm.phone}
                disabled={Boolean(editingUserId)}
                onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0811111111"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              บทบาท
              <select
                value={userForm.role}
                onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                style={inputStyle}
              >
                {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              บ้านเลขที่
              <select
                value={userForm.houseId}
                onChange={(e) => setUserForm((f) => ({ ...f, houseId: e.target.value }))}
                style={inputStyle}
              >
                <option value="">— ไม่ผูกบ้าน —</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.houseNo} {h.zone ? `(โซน ${h.zone})` : ''}
                  </option>
                ))}
              </select>
            </label>

            {userError && <p style={{ color: colors.danger, fontSize: 13 }}>{userError}</p>}

            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button type="submit" loading={loading} loadingText="กำลังบันทึก...">
                {editingUserId ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิก'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </Card>
        )}

        <label style={{ fontSize: 14, color: colors.textPrimary }}>
          กรองตามบทบาท:{' '}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}
            style={{ padding: spacing.xs, borderRadius: radius.input, border: `1px solid ${colors.border}` }}
          >
            <option value="ALL">ทั้งหมด</option>
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        {listError && <p style={{ color: colors.danger }}>{listError}</p>}
        {users === null && !listError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}

        <Card style={{ marginTop: spacing.md, padding: 0, overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}`, background: colors.primaryLight }}>
                <th style={thStyle}>ชื่อ</th>
                <th style={thStyle}>เบอร์โทร</th>
                <th style={thStyle}>บทบาท</th>
                <th style={thStyle}>บ้าน</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>{u.name}</td>
                  <td style={tdStyle}>{u.phone}</td>
                  <td style={tdStyle}>{ROLE_LABEL[u.role]}</td>
                  <td style={tdStyle}>{houseLabel(u.houseId)}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: spacing.sm }}>
                    <Button variant="secondary" onClick={() => startEdit(u)}>
                      แก้ไข
                    </Button>
                    <Button variant="danger" onClick={() => removeUser(u.id)}>
                      ลบ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
