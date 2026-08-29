import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/auth';
import type { AppUser } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, font, radius, spacing } from '../theme';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AppUser;
}

const PHONE_PATTERN = /^0\d{9}$/;

const labelStyle = { display: 'block', marginBottom: spacing.md, fontSize: 14, color: colors.textPrimary };
const inputStyle = {
  display: 'block',
  width: '100%',
  margin: `${spacing.xs}px 0 0`,
  padding: spacing.sm + 2,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  boxSizing: 'border-box' as const,
};

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PHONE_PATTERN.test(phone)) {
      setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0');
      return;
    }
    setLoading(true);
    try {
      await api.post<void>('/auth/otp/request', { phone });
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ขอ OTP ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { phone, otp });
      if (res.user.role !== 'ADMIN') {
        setError(
          'บัญชีนี้ไม่ใช่บัญชีแอดมิน — แดชบอร์ดนี้ใช้ได้เฉพาะแอดมินเท่านั้น (ลูกบ้าน/รปภ. กรุณาใช้แอปมือถือ)',
        );
        return;
      }
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: 'ADMIN',
        villageId: res.user.villageId,
        userId: res.user.id,
        name: res.user.name,
        phone: res.user.phone,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(160deg, ${colors.primaryLight} 0%, ${colors.background} 45%, ${colors.secondaryLight} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: font.family,
      }}
    >
      <div style={{ width: '100%', maxWidth: 360, margin: spacing.lg }}>
        <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
              fontSize: 30,
              boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)',
            }}
          >
            🏘️
          </span>
          <div style={{ marginTop: spacing.sm, fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
            ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน
          </div>
        </div>
        <Card
          style={{
            width: '100%',
            borderTop: `4px solid ${colors.primary}`,
            boxShadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
          }}
          padding={spacing.xl}
        >
          <h1 style={{ fontSize: 22, color: colors.textPrimary, marginTop: 0 }}>เข้าสู่ระบบ (Admin)</h1>

        {step === 'phone' && (
          <form onSubmit={requestOtp}>
            <label style={labelStyle}>
              เบอร์โทรศัพท์
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.trim())}
                placeholder="0800000000"
                maxLength={10}
                style={inputStyle}
                autoFocus
              />
            </label>
            {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
            <Button type="submit" fullWidth loading={loading} loadingText="กำลังส่ง OTP...">
              ขอรหัส OTP
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitLogin}>
            <p style={{ fontSize: 13, color: colors.textSecondary }}>
              ส่งรหัส OTP ไปยัง {phone} แล้ว (ระบบ dev นี้พิมพ์รหัสไว้ใน console log ของ backend)
            </p>
            <label style={labelStyle}>
              รหัส OTP (6 หลัก)
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.trim())}
                placeholder="000000"
                maxLength={6}
                style={inputStyle}
                autoFocus
              />
            </label>
            {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
            <Button type="submit" fullWidth loading={loading} loadingText="กำลังเข้าสู่ระบบ...">
              เข้าสู่ระบบ
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              style={{ marginTop: spacing.sm }}
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError(null);
              }}
            >
              เปลี่ยนเบอร์โทรศัพท์
            </Button>
          </form>
        )}
        </Card>
      </div>
    </div>
  );
}
