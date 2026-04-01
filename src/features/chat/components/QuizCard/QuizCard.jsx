import React, { useMemo, useState } from 'react';
import { Card, Divider, Typography } from 'antd';
import QuizQuestion from './QuizQuestion';
import QuizOptions from './QuizOptions';
import QuizResult from './QuizResult';
import QuizFooter from './QuizFooter';
import styles from './QuizCard.module.scss';

const { Text } = Typography;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function QuizCard({
  quiz,
  allowChangeAfterSubmit = true,
  roomId = null,
  onSubmitAnswer,
  answersByUser = {},
  currentUserId = null,
}) {
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [myAnswer, setMyAnswer] = useState(null);
  const [optionsState, setOptionsState] = useState(quiz?.options || []);
  const [simulating, setSimulating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const derivedOptions = useMemo(() => {
    const base = (quiz?.options || []).map((opt) => ({
      ...opt,
      label: opt.label || opt.text || '',
      votes: 0,
    }));
    const countMap = {};
    const values = Object.values(answersByUser || {});
    for (let i = 0; i < values.length; i += 1) {
      const answer = values[i];
      countMap[answer] = (countMap[answer] || 0) + 1;
    }
    return base.map((opt) => ({
      ...opt,
      votes: countMap[opt.id] || opt.votes || 0,
    }));
  }, [answersByUser, quiz?.options]);

  const totalVotes = useMemo(
    () => derivedOptions.reduce((sum, option) => sum + (option.votes || 0), 0),
    [derivedOptions],
  );

  const disableInputs = submitted && !allowChangeAfterSubmit;

  const handleSubmit = async () => {
    if (!selectedOptionId) return;

    // Optimistic local result update: show result immediately for the submitter.
    setOptionsState((prev) =>
      prev.map((option) => {
        const wasMine = myAnswer === option.id;
        const nowMine = selectedOptionId === option.id;
        let nextVotes = option.votes || 0;
        if (nowMine) nextVotes += 1;
        if (wasMine) nextVotes -= 1;
        return { ...option, votes: Math.max(0, nextVotes) };
      }),
    );
    setMyAnswer(selectedOptionId);
    setSubmitted(true);

    if (onSubmitAnswer && roomId && quiz?.id) {
      setSubmitting(true);
      try {
        await onSubmitAnswer(roomId, quiz.id, selectedOptionId);
      } catch {
        // Keep optimistic UI state; sync listener will reconcile on timeline updates.
      }
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    if (disableInputs) return;
    setSelectedOptionId(null);
  };

  const handleSimulateVotes = () => {
    setSimulating(true);
    const extraVotes = randomInt(1, 3);
    setOptionsState((prev) => {
      const next = prev.map((option) => ({ ...option }));
      for (let i = 0; i < extraVotes; i += 1) {
        const randomIndex = randomInt(0, Math.max(0, next.length - 1));
        next[randomIndex].votes = (next[randomIndex].votes || 0) + 1;
      }
      return next;
    });
    setTimeout(() => setSimulating(false), 250);
  };

  return (
    <Card className={styles.quizCard} bodyStyle={{ padding: 16 }}>
      <div className={styles.stack}>
        <QuizQuestion question={quiz?.question || ''} submitted={submitted} />

        <QuizOptions
          options={derivedOptions.length ? derivedOptions : optionsState}
          selectedOptionId={selectedOptionId}
          disabled={disableInputs}
          onChange={setSelectedOptionId}
        />

        <QuizFooter
          canSubmit={Boolean(selectedOptionId) && (!submitted || allowChangeAfterSubmit)}
          canChange={!disableInputs && Boolean(selectedOptionId)}
          submitted={submitted}
          disabled={simulating || submitting}
          submitting={submitting}
          onSubmit={handleSubmit}
          onClear={handleClear}
          onSimulateVotes={handleSimulateVotes}
        />

        {submitted && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <QuizResult
              options={derivedOptions.length ? derivedOptions : optionsState}
              totalVotes={totalVotes}
              correctOptionId={quiz?.correctOptionId}
              selectedOptionId={answersByUser?.[currentUserId] || myAnswer}
            />
          </>
        )}

        {!submitted && (
          <Text type="secondary" className={styles.stateHint}>
            Select one option and submit to view results.
          </Text>
        )}
      </div>
    </Card>
  );
}
