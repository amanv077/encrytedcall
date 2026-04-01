export const pollDummyData = [
  {
    id: 'poll-telehealth-shift',
    question: 'Which handoff model should we use for evening telehealth coverage?',
    allowMultiple: false,
    closed: false,
    disableAfterSubmit: true,
    allowVoteChange: false,
    myVotes: [],
    options: [
      { id: 'opt-a', label: 'Nurse-led triage first', votes: 14 },
      { id: 'opt-b', label: 'Doctor-first direct consult', votes: 8 },
      { id: 'opt-c', label: 'Hybrid triage + escalation', votes: 21 },
    ],
  },
  {
    id: 'poll-weekly-rounds',
    question: 'Pick all topics for next clinical operations review',
    allowMultiple: true,
    closed: false,
    disableAfterSubmit: false,
    allowVoteChange: true,
    myVotes: ['opt-aa'],
    options: [
      { id: 'opt-aa', label: 'Readmission reduction workflow', votes: 11 },
      { id: 'opt-bb', label: 'Medication reconciliation checklist', votes: 17 },
      { id: 'opt-cc', label: 'Discharge summary quality audits', votes: 9 },
      { id: 'opt-dd', label: 'Cross-site escalation SLAs', votes: 13 },
    ],
  },
  {
    id: 'poll-closed',
    question: 'Should weekend specialist coverage remain mandatory?',
    allowMultiple: false,
    closed: true,
    disableAfterSubmit: true,
    allowVoteChange: false,
    myVotes: ['opt-z1'],
    options: [
      { id: 'opt-z1', label: 'Yes', votes: 32 },
      { id: 'opt-z2', label: 'No', votes: 7 },
    ],
  },
];
