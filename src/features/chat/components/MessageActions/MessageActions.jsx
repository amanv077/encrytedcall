import React, { useMemo, useState } from 'react';
import { Dropdown, Button, message as antdMessage } from 'antd';
import { EllipsisOutlined, CopyOutlined, ShareAltOutlined } from '@ant-design/icons';
import ForwardModal from '../ForwardModal/ForwardModal';
import styles from './MessageActions.module.scss';

async function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

/**
 * Hover action menu for a single message bubble.
 * Shows Copy + Forward actions while keeping message flow untouched.
 */
export default function MessageActions({ item }) {
  const [forwardOpen, setForwardOpen] = useState(false);

  const copyText = useMemo(() => {
    if (!item?.body) return '';
    if (typeof item.body === 'string' && item.body.startsWith('Forwarded\n')) {
      return item.body.slice('Forwarded\n'.length);
    }
    return item.body;
  }, [item]);

  const menu = {
    items: [
      {
        key: 'copy',
        label: 'Copy',
        icon: <CopyOutlined />,
        onClick: async () => {
          try {
            await copyToClipboard(copyText);
            antdMessage.success('Message copied');
          } catch {
            antdMessage.error('Unable to copy message');
          }
        },
      },
      {
        key: 'forward',
        label: 'Forward',
        icon: <ShareAltOutlined />,
        onClick: () => setForwardOpen(true),
      },
    ],
  };

  return (
    <>
      <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
        <Button
          type="text"
          size="small"
          icon={<EllipsisOutlined />}
          className={styles.actionsBtn}
          onClick={(e) => e.stopPropagation()}
        />
      </Dropdown>

      <ForwardModal
        open={forwardOpen}
        onClose={() => setForwardOpen(false)}
        sourceItem={item}
      />
    </>
  );
}

