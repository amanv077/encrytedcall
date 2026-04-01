import React, { useMemo, useState } from 'react';
import { Button, Card, Form, Input, Radio, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import styles from './QuizCreator.module.scss';

const { Text } = Typography;

function makeOption(id, label = '') {
  return { id, label };
}

export default function QuizCreator({ onCreate, loading = false }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([makeOption('opt-1'), makeOption('opt-2')]);
  const [correctOptionId, setCorrectOptionId] = useState('opt-1');
  const [submitted, setSubmitted] = useState(false);

  const cleanedOptions = useMemo(
    () => options.map((option) => ({ ...option, label: option.label.trim() })),
    [options],
  );

  const validation = useMemo(() => {
    const errors = [];
    if (!question.trim()) errors.push('Question is required.');
    if (cleanedOptions.length < 2 || cleanedOptions.length > 4) {
      errors.push('Quiz must have 2 to 4 options.');
    }
    if (cleanedOptions.some((option) => !option.label)) errors.push('Options cannot be empty.');
    if (!cleanedOptions.some((option) => option.id === correctOptionId)) {
      errors.push('Select a valid correct answer.');
    }
    return { valid: errors.length === 0, errors };
  }, [cleanedOptions, correctOptionId, question]);

  const addOption = () => {
    if (options.length >= 4) return;
    const nextIdx = options.length + 1;
    const nextId = `opt-${Date.now()}-${nextIdx}`;
    setOptions((prev) => [...prev, makeOption(nextId)]);
  };

  const removeOption = (id) => {
    if (options.length <= 2) return;
    setOptions((prev) => {
      const next = prev.filter((option) => option.id !== id);
      if (!next.some((option) => option.id === correctOptionId)) {
        setCorrectOptionId(next[0]?.id || '');
      }
      return next;
    });
  };

  const updateOption = (id, label) => {
    setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, label } : option)));
  };

  const handleCreate = () => {
    setSubmitted(true);
    if (!validation.valid) return;
    onCreate?.({
      question: question.trim(),
      options: cleanedOptions,
      correctOptionId,
    });
  };

  return (
    <Card className={styles.creatorCard} title="Create Quiz">
      <Form layout="vertical">
        <Form.Item label="Question" required>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter one quiz question"
            maxLength={180}
            aria-label="Quiz question"
          />
        </Form.Item>

        <div className={styles.optionsHeader}>
          <Text className={styles.sectionTitle}>Options (2 to 4)</Text>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addOption}
            disabled={options.length >= 4}
            aria-label="Add quiz option"
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
                aria-label={`Quiz option ${index + 1}`}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={options.length <= 2}
                onClick={() => removeOption(option.id)}
                aria-label={`Remove option ${index + 1}`}
              />
            </div>
          ))}
        </Space>

        <Form.Item label="Correct Answer" className={styles.modeField} required>
          <Radio.Group value={correctOptionId} onChange={(e) => setCorrectOptionId(e.target.value)}>
            <Space direction="vertical">
              {options.map((option, index) => (
                <Radio key={option.id} value={option.id}>
                  {option.label?.trim() || `Option ${index + 1}`}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>

        {submitted && !validation.valid && (
          <div className={styles.errorBlock} role="alert" aria-live="polite">
            {validation.errors.map((error) => (
              <Text key={error} type="danger">{error}</Text>
            ))}
          </div>
        )}

        <Button
          type="primary"
          loading={loading}
          onClick={handleCreate}
          className={styles.createButton}
          aria-label="Create quiz"
        >
          Send Quiz
        </Button>
      </Form>
    </Card>
  );
}
