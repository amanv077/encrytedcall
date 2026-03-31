import React from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import styles from './CallOverlay.module.scss';

const { Title, Text } = Typography;

export default function CallOverlay({ call, onAccept, onReject }) {
  if (!call) return null;

  return (
    <Modal
      open={true}
      closable={false}
      footer={null}
      centered
      maskClosable={false}
      styles={{ 
        body: { textAlign: 'center', padding: '24px 0' }, 
        content: { background: '#202c33', borderRadius: 16 } 
      }}
      className={styles.modalContent}
    >
      <Title level={4} className={styles.title}>Incoming Video/Audio Call</Title>
      <Text type="secondary" className={styles.callerId}>
        {call.roomId || "Unknown Caller"}
      </Text>

      <Space size="large" className={styles.btnGroup}>
        <Button 
          type="primary" 
          danger 
          shape="circle" 
          size="large" 
          icon={<PhoneOutlined style={{ transform: 'rotate(135deg)' }} />} 
          onClick={onReject}
          className={styles.btnReject}
        />
        <Button 
          type="primary" 
          shape="circle" 
          size="large" 
          icon={<PhoneOutlined />} 
          onClick={onAccept}
          className={styles.btnAccept}
        />
      </Space>
    </Modal>
  );
}
