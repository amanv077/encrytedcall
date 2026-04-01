import React, { useMemo, useState } from 'react';
import { Button, Card, Form, Input, Radio, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import styles from './PollCreator.module.scss';

const { Text } = Typography;

function makeOption(id, label = '') {
  return { id, label };
}

export default function PollCreator({ onCreate, loading = false }) {
  const [question, setQuestion] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState([makeOption('opt-1'), makeOption('opt-2')]);
  const [submitted, setSubmitted] = useState(false);

  const cleanedOptions = useMemo(
    () => options.map((option) => ({ ...option, label: option.label.trim() })),
    [options],
  );

  const validation = useMemo(() => {
    const errors = [];
    if (!question.trim()) errors.push('Question is required.');
    if (cleanedOptions.length < 2) errors.push('Add at least two options.');
    if (cleanedOptions.some((option) => !option.label)) errors.push('Options cannot be empty.');
    return {
      valid: errors.length === 0,
      errors,
    };
  }, [cleanedOptions, question]);

  const addOption = () => {
    const next = options.length + 1;
    setOptions((prev) => [...prev, makeOption(`opt-${Date.now()}-${next}`)]);
  };

  const removeOption = (id) => {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((option) => option.id !== id)));
  };

  const updateOption = (id, label) => {
    setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, label } : option)));
  };

  const resetForm = () => {
    setQuestion('');
    setAllowMultiple(false);
    setOptions([makeOption('opt-1'), makeOption('opt-2')]);
    setSubmitted(false);
  };

  const handleCreate = () => {
    setSubmitted(true);
    if (!validation.valid) return;

    const payload = {
      id: `poll-${Date.now()}`,
      question: question.trim(),
      allowMultiple,
      options: cleanedOptions.map((option) => ({
        id: option.id,
        label: option.label,
        votes: 0,
      })),
      closed: false,
      disableAfterSubmit: true,
      allowVoteChange: false,
      myVotes: [],
    };

    if (onCreate) onCreate(payload);
    resetForm();
  };

  return (
    <Card className={styles.creatorCard} title="Create Poll">
      <Form layout="vertical">
        <Form.Item label="Question" required>
          <Input
            value={question}
            placeholder="Enter your poll question"
            maxLength={180}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Poll question"
          />
        </Form.Item>

        <div className={styles.optionsHeader}>
          <Text className={styles.sectionTitle}>Options</Text>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addOption}
            aria-label="Add poll option"
          >
            Add option
          </Button>
        </div>

        <Space direction="vertical" className={styles.optionStack}>
          {options.map((option, index) => (
            <div className={styles.optionRow} key={option.id}>
              <Input
                value={option.label}
                placeholder={`Option ${index + 1}`}
                onChange={(e) => updateOption(option.id, e.target.value)}
                aria-label={`Poll option ${index + 1}`}
              />
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                disabled={options.length <= 2}
                onClick={() => removeOption(option.id)}
                aria-label={`Remove option ${index + 1}`}
              />
            </div>
          ))}
        </Space>

        <Form.Item label="Mode" className={styles.modeField}>
          <Radio.Group
            value={allowMultiple ? 'multi' : 'single'}
            onChange={(e) => setAllowMultiple(e.target.value === 'multi')}
            aria-label="Poll type"
          >
            <Radio value="single">Single choice</Radio>
            <Radio value="multi">Multiple choice</Radio>
          </Radio.Group>
        </Form.Item>

        {submitted && !validation.valid && (
          <div className={styles.errorBlock} role="alert" aria-live="polite">
            {validation.errors.map((error) => (
              <Text key={error} type="danger">
                {error}
              </Text>
            ))}
          </div>
        )}

        <Button
          type="primary"
          onClick={handleCreate}
          loading={loading}
          className={styles.createButton}
          aria-label="Create poll"
        >
          Create Poll
        </Button>
      </Form>
    </Card>
  );
}
