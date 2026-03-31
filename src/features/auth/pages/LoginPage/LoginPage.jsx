import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, MessageOutlined } from '@ant-design/icons';
import { matrixManager } from '../../../chat/utils/matrixClient';
import styles from './LoginPage.module.scss';

const { Title, Text } = Typography;

export default function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  const handleLogin = async (values) => {
    setLoading(true);
    setError('');
    
    // Default matrix.org if omitted
    let baseUrl = import.meta.env.VITE_MATRIX_BASE_URL || 'https://matrix.org';
    
    try {
      await matrixManager.login(baseUrl, values.userId, values.password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <Card
        className={styles.card}
        bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <MessageOutlined className={styles.icon} />
        <Title level={3} className={styles.title}>Secure Portal</Title>
        <Text type="secondary" className={styles.subtitle}>Login to healthcare matrix</Text>

        <Form
          form={form}
          name="loginForm"
          layout="vertical"
          style={{ width: '100%' }}
          onFinish={handleLogin}
        >
          <Form.Item
            name="userId"
            rules={[{ required: true, message: 'Please enter your Matrix User ID' }]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#8696a0' }} />} 
              placeholder="@user:server.org" 
              size="large"
              className={styles.input}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: '#8696a0' }} />} 
              placeholder="Password" 
              size="large"
              className={styles.input}
            />
          </Form.Item>

          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

          <Form.Item style={{ margin: 0 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large" 
              loading={loading}
              block
              className={styles.btnPrimary}
            >
              Log In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
