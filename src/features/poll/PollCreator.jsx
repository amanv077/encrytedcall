import React from 'react';
import { Button, Form, Input, Space, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { usePolls } from './usePolls';

const { Text } = Typography;

/**
 * Step 4: PollCreator UI integration with createPoll().
 *
 * Props:
 * - roomId: active Matrix room ID
 * - client: reserved for caller-level compatibility
 * - onCreated: optional callback after successful create
 */
export default function PollCreator({ client, roomId, onCreated }) {
  const [form] = Form.useForm();
  const { creatingPoll, createPoll } = usePolls();

  const handleSubmit = async (values) => {
    const question = values?.question?.trim();
    const options = (values?.options || [])
      .map((opt, index) => ({
        id: `opt_${index + 1}`,
        label: opt?.label?.trim() || '',
      }))
      .filter((opt) => opt.label);

    await createPoll(roomId, {
      question,
      options,
      allowMultiple: false,
    });

    form.resetFields();
    if (onCreated) onCreated();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        question: '',
        options: [{ label: '' }, { label: '' }],
      }}
    >
      {/* Keep prop as part of public API to match integration contract */}
      <input type="hidden" value={client ? 'client-ready' : 'client-missing'} readOnly />

      <Form.Item
        label="Poll Question"
        name="question"
        rules={[
          { required: true, whitespace: true, message: 'Question is required.' },
          { max: 200, message: 'Question must be 200 characters or less.' },
        ]}
      >
        <Input placeholder="Enter poll question" />
      </Form.Item>

      <Form.List name="options">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, idx) => (
              <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                <Form.Item
                  {...field}
                  label={idx === 0 ? 'Options' : ''}
                  name={[field.name, 'label']}
                  rules={[
                    { required: true, whitespace: true, message: 'Option cannot be empty.' },
                  ]}
                  style={{ minWidth: 360, marginBottom: 0 }}
                >
                  <Input placeholder={`Option ${idx + 1}`} />
                </Form.Item>
                <Button
                  type="text"
                  icon={<MinusCircleOutlined />}
                  disabled={fields.length <= 2}
                  onClick={() => remove(field.name)}
                  aria-label={`Remove option ${idx + 1}`}
                />
              </Space>
            ))}

            <Form.Item>
              <Button type="dashed" onClick={() => add({ label: '' })} icon={<PlusOutlined />} block>
                Add option
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>

      <Form.Item shouldUpdate>
        {() => {
          const values = form.getFieldsValue(true);
          const rawOptions = values?.options || [];
          const nonEmptyCount = rawOptions.filter((o) => o?.label?.trim()).length;
          const canSubmit = !!values?.question?.trim() && nonEmptyCount >= 2 && !!roomId;

          return (
            <Space direction="vertical" style={{ width: '100%' }}>
              {!roomId && <Text type="danger">Select a room before creating a poll.</Text>}
              <Button
                type="primary"
                htmlType="submit"
                loading={creatingPoll}
                disabled={!canSubmit}
                block
              >
                Create Poll
              </Button>
            </Space>
          );
        }}
      </Form.Item>
    </Form>
  );
}

