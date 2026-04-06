import React, { useState } from 'react';
import { Form, Input, Button, Typography, Alert } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { matrixManager } from '../../../chat/utils/matrixClient';
import styles from './LoginPage.module.scss';
import axios from 'axios';
const { Title, Text } = Typography;

const FEATURES = [
  {
    icon: <SafetyCertificateOutlined />,
    title: 'End-to-End Encrypted',
    desc: 'Every message and call is encrypted so only you and the recipient can read it.',
  },
  {
    icon: <ThunderboltOutlined />,
    title: 'Real-Time Collaboration',
    desc: 'Instant messaging, voice & video calls — all in one unified workspace.',
  },
  {
    icon: <TeamOutlined />,
    title: 'GDPR Compliant',
    desc: 'Data minimisation, local encryption and remote wipe built in by design.',
  },
];

export default function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  const handleLogin = async (values) => {
    setLoading(true);
    setError('');
    const baseUrl = import.meta.env.VITE_MATRIX_BASE_URL || 'https://matrix.org';
    try {
      // const loginResponse = await axios.post("https://glary-xiomara-stupefactive.ngrok-free.dev/api/auth/login1", {
      //   "username": values.userId,
      //   "password": values.password
      // });

      // console.log('loginResponse', loginResponse);
      await matrixManager.login("http://172.16.7.246:8008", values.userId, values.password);
      // await matrixManager.login("https://glary-xiomara-stupefactive.ngrok-free.dev", loginResponse.data.userId, loginResponse.data.password,loginResponse.data.deviceId,loginResponse.data.accessToken);


      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── Left brand panel ──────────────────────────────────────────────── */}
      <div className={styles.brand}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <MessageOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <span className={styles.logoText}>SynApp</span>
        </div>

        {/* Headline */}
        <div className={styles.headline}>
          <h1 className={styles.headlineTitle}>
            Secure Clinical<br />Messaging Platform
          </h1>
          <p className={styles.headlineSub}>
            Connect, collaborate and communicate with your clinical team —
            securely and in real time.
          </p>
        </div>

        {/* Feature list */}
        <div className={styles.featureList}>
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className={styles.featureItem}>
              <div className={styles.featureIcon}>{icon}</div>
              <div>
                <div className={styles.featureTitle}>{title}</div>
                <div className={styles.featureDesc}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom watermark */}
        <div className={styles.brandFooter}>
          © {new Date().getFullYear()} SynApp · All communications are encrypted
        </div>
      </div>

      {/* ── Right login panel ─────────────────────────────────────────────── */}
      <div className={styles.formSide}>
        <div className={styles.formCard}>

          {/* Card header */}
          <div className={styles.formHeader}>
            <div className={styles.formLogo}>
              <div className={styles.formLogoIcon}>
                <MessageOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
            </div>
            <Title level={3} className={styles.formTitle}>Welcome back</Title>
            <Text className={styles.formSub}>Sign in to your SynApp account</Text>
          </div>

          {/* Form */}
          <Form
            form={form}
            name="loginForm"
            layout="vertical"
            onFinish={handleLogin}
            requiredMark={false}
            className={styles.form}
          >
            <Form.Item
              name="userId"
              label={<span className={styles.label}>Matrix User ID</span>}
              rules={[{ required: true, message: 'Please enter your Matrix User ID' }]}
            >
              <Input
                prefix={<UserOutlined className={styles.inputIcon} />}
                placeholder="@username:server.org"
                size="large"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className={styles.label}>Password</span>}
              rules={[{ required: true, message: 'Please enter your password' }]}
              style={{ marginBottom: 8 }}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="Enter your password"
                size="large"
                className={styles.input}
              />
            </Form.Item>

            <div className={styles.forgotRow}>
              <a className={styles.forgotLink}>Forgot password?</a>
            </div>

            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                className={styles.alert}
              />
            )}

            <Form.Item style={{ margin: '20px 0 0' }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                block
                className={styles.submitBtn}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </Form.Item>
          </Form>

          {/* Footer note */}
          <div className={styles.formFooter}>
            <SafetyCertificateOutlined className={styles.footerIcon} />
            <span>Protected by end-to-end encryption</span>
          </div>
        </div>
      </div>

    </div>
  );
}
