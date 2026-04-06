import React, { useState } from 'react';
import {
  Form,
  Input,
  Button,
  Typography,
  Alert,
  Checkbox,
  Tabs,
  Modal,
  message,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { matrixManager } from '../../../chat/utils/matrixClient';
import styles from './LoginPage.module.scss';

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

/**
 * @param {{ onLoginSuccess: () => void, sessionAwaitingRecovery?: boolean }} props
 */
export default function LoginPage({ onLoginSuccess, sessionAwaitingRecovery = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [recoveryForm] = Form.useForm();

  const [authTab, setAuthTab] = useState('signin');
  const [loginStep, setLoginStep] = useState('form'); // form | enter_recovery_key
  const [registerStep, setRegisterStep] = useState('form'); // form | show_recovery_key
  const [registerRecoveryKey, setRegisterRecoveryKey] = useState('');
  const [savedRecoveryChecked, setSavedRecoveryChecked] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  const baseUrl = import.meta.env.VITE_MATRIX_BASE_URL || 'https://matrix.org';

  const handleLogin = async (values) => {
    setLoading(true);
    setError('');
    try {
      const result = await matrixManager.login(baseUrl, values.userId, values.password);
      if (result?.needsRecoveryKey) {
        setLoginStep('enter_recovery_key');
        return;
      }
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (values) => {
    setLoading(true);
    setError('');
    try {
      const result = await matrixManager.completeRecoveryWithKey(values.recoveryKey);
      if (!result.success) {
        setError(result.error || 'Incorrect recovery key. Try again.');
        return;
      }
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Restore failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipRecoveryConfirm = async () => {
    setShowSkipModal(false);
    setLoading(true);
    setError('');
    try {
      await matrixManager.skipRecoveryAndStart();
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Could not start session.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    setError('');
    try {
      const out = await matrixManager.registerAccount(baseUrl, values.username, values.password);
      if (out?.recoveryKey) {
        setRegisterRecoveryKey(out.recoveryKey);
        setRegisterStep('show_recovery_key');
        setSavedRecoveryChecked(false);
      }
    } catch (err) {
      setError(
        err.message ||
          'Registration failed. Your homeserver may require email verification or disallow open signup.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterContinue = async () => {
    setLoading(true);
    setError('');
    try {
      await matrixManager.acknowledgeRegisterCryptoAndStart();
      setRegisterStep('form');
      setRegisterRecoveryKey('');
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Could not start chat.');
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(registerRecoveryKey.replace(/\s/g, ''));
      message.success('Recovery key copied');
    } catch {
      message.error('Could not copy');
    }
  };

  const recoveryOnly = sessionAwaitingRecovery || loginStep === 'enter_recovery_key';

  const rightPanelTitle = () => {
    if (sessionAwaitingRecovery || loginStep === 'enter_recovery_key') {
      return 'Restore Your Encrypted Messages';
    }
    if (registerStep === 'show_recovery_key') return 'Save Your Recovery Key';
    if (authTab === 'register') return 'Create your account';
    return 'Welcome back';
  };

  const rightPanelSub = () => {
    if (sessionAwaitingRecovery || loginStep === 'enter_recovery_key') {
      return 'A new session was detected. Enter your recovery key to decrypt your message history.';
    }
    if (registerStep === 'show_recovery_key') {
      return 'If you clear your browser data or log in on a new device, you will need this key. It cannot be recovered if lost.';
    }
    if (authTab === 'register') return 'Register on your Matrix homeserver';
    return 'Sign in to your SynApp account';
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <MessageOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <span className={styles.logoText}>SynApp</span>
        </div>

        <div className={styles.headline}>
          <h1 className={styles.headlineTitle}>
            Secure Clinical
            <br />
            Messaging Platform
          </h1>
          <p className={styles.headlineSub}>
            Connect, collaborate and communicate with your clinical team — securely and in real time.
          </p>
        </div>

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

        <div className={styles.brandFooter}>
          © {new Date().getFullYear()} SynApp · All communications are encrypted
        </div>
      </div>

      <div className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <div className={styles.formLogo}>
              <div className={styles.formLogoIcon}>
                <MessageOutlined style={{ fontSize: 18, color: '#fff' }} />
              </div>
            </div>
            <Title level={3} className={styles.formTitle}>
              {rightPanelTitle()}
            </Title>
            <Text className={styles.formSub}>{rightPanelSub()}</Text>
          </div>

          {recoveryOnly && (
            <Form
              form={recoveryForm}
              layout="vertical"
              onFinish={handleRecoverySubmit}
              className={styles.form}
            >
              <Form.Item
                name="recoveryKey"
                label={<span className={styles.label}>Recovery key</span>}
                rules={[{ required: true, message: 'Enter your recovery key' }]}
              >
                <Input.Password
                  placeholder="Enter your recovery key"
                  size="large"
                  className={styles.input}
                  autoComplete="off"
                />
              </Form.Item>

              {error && (
                <Alert message={error} type="error" showIcon className={styles.alert} />
              )}

              <Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={loading} className={styles.submitBtn}>
                  Restore access
                </Button>
              </Form.Item>

              {!sessionAwaitingRecovery && (
                <Button type="link" block onClick={() => setLoginStep('form')} disabled={loading}>
                  Back to sign in
                </Button>
              )}

              <Button type="link" block onClick={() => setShowSkipModal(true)} disabled={loading}>
                I don&apos;t have my recovery key
              </Button>
            </Form>
          )}

          {registerStep === 'show_recovery_key' && (
            <div className={styles.form}>
              <Input.TextArea
                readOnly
                value={registerRecoveryKey}
                rows={4}
                className={styles.input}
                style={{ fontFamily: 'monospace', marginBottom: 12 }}
              />
              <Button icon={<CopyOutlined />} onClick={copyRecoveryKey} style={{ marginBottom: 16 }} block>
                Copy
              </Button>
              <Checkbox checked={savedRecoveryChecked} onChange={(e) => setSavedRecoveryChecked(e.target.checked)}>
                I have saved my recovery key somewhere safe
              </Checkbox>
              <Button
                type="primary"
                size="large"
                block
                className={styles.submitBtn}
                style={{ marginTop: 20 }}
                disabled={!savedRecoveryChecked}
                loading={loading}
                onClick={handleRegisterContinue}
              >
                Continue
              </Button>
            </div>
          )}

          {!recoveryOnly && registerStep === 'form' && (
            <Tabs
              activeKey={authTab}
              onChange={setAuthTab}
              centered
              items={[
                {
                  key: 'signin',
                  label: 'Sign in',
                  children: (
                    <Form
                      form={loginForm}
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
                        <Alert message={error} type="error" showIcon className={styles.alert} />
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
                  ),
                },
                {
                  key: 'register',
                  label: 'Register',
                  children: (
                    <Form
                      form={registerForm}
                      name="registerForm"
                      layout="vertical"
                      onFinish={handleRegister}
                      requiredMark={false}
                      className={styles.form}
                    >
                      <Form.Item
                        name="username"
                        label={<span className={styles.label}>Username (local part)</span>}
                        rules={[{ required: true, message: 'Choose a username' }]}
                      >
                        <Input prefix={<UserOutlined className={styles.inputIcon} />} placeholder="myname" size="large" className={styles.input} />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={<span className={styles.label}>Password</span>}
                        rules={[{ required: true, message: 'Choose a password' }]}
                      >
                        <Input.Password
                          prefix={<LockOutlined className={styles.inputIcon} />}
                          placeholder="Password"
                          size="large"
                          className={styles.input}
                        />
                      </Form.Item>
                      {error && (
                        <Alert message={error} type="error" showIcon className={styles.alert} />
                      )}
                      <Form.Item style={{ margin: '20px 0 0' }}>
                        <Button type="primary" htmlType="submit" size="large" loading={loading} block className={styles.submitBtn}>
                          Create account
                        </Button>
                      </Form.Item>
                    </Form>
                  ),
                },
              ]}
            />
          )}

          {!recoveryOnly && registerStep === 'form' && (
            <div className={styles.formFooter}>
              <SafetyCertificateOutlined className={styles.footerIcon} />
              <span>Protected by end-to-end encryption</span>
            </div>
          )}
        </div>
      </div>

      <Modal
        title="Continue without recovery?"
        open={showSkipModal}
        onOk={handleSkipRecoveryConfirm}
        onCancel={() => setShowSkipModal(false)}
        okText="Continue anyway"
        cancelText="Cancel"
        confirmLoading={loading}
      >
        <p>
          Without your recovery key, messages sent before this session cannot be decrypted. New messages will work
          normally.
        </p>
        <p>Do you want to continue without restoring history?</p>
      </Modal>
    </div>
  );
}
