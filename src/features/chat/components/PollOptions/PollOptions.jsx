import React from 'react';
import { Checkbox, Radio } from 'antd';
import styles from './PollOptions.module.scss';

export default function PollOptions({
  options = [],
  allowMultiple = false,
  selectedOptionIds = [],
  disabled = false,
  onChange,
}) {
  const list = options.map((option) => (
    <div key={option.id} className={styles.optionRow}>
      {allowMultiple ? (
        <Checkbox
          checked={selectedOptionIds.includes(option.id)}
          disabled={disabled}
          onChange={(e) => onChange(option.id, e.target.checked)}
          aria-label={`Select option ${option.label}`}
        >
          {option.label}
        </Checkbox>
      ) : (
        <Radio
          checked={selectedOptionIds[0] === option.id}
          disabled={disabled}
          onChange={() => onChange(option.id, true)}
          aria-label={`Choose option ${option.label}`}
        >
          {option.label}
        </Radio>
      )}
    </div>
  ));

  return <div className={styles.optionList}>{list}</div>;
}
