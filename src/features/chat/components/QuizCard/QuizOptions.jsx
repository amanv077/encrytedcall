import React from 'react';
import { Radio } from 'antd';
import styles from './QuizCard.module.scss';

export default function QuizOptions({
  options = [],
  selectedOptionId = null,
  disabled = false,
  onChange,
}) {
  return (
    <Radio.Group
      value={selectedOptionId}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      className={styles.optionGroup}
      aria-label="Quiz options"
    >
      {options.map((option) => (
        <div key={option.id} className={styles.optionRow}>
          <Radio value={option.id} aria-label={`Choose ${option.label}`}>
            {option.label}
          </Radio>
        </div>
      ))}
    </Radio.Group>
  );
}
