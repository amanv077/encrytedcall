import { createSelector, createSlice } from '@reduxjs/toolkit';

const initialState = {
  // polls[pollId] = { pollId, question, options, createdBy, createdAt, isClosed }
  polls: {},

  // votes[pollId][userId] = answerId (single-choice for now)
  votes: {},
};

const pollSlice = createSlice({
  name: 'polls',
  initialState,
  reducers: {
    addPoll(state, action) {
      const {
        pollId,
        question,
        options = [],
        createdBy,
        createdAt,
        isClosed = false,
      } = action.payload || {};

      if (!pollId || !question || !Array.isArray(options) || options.length < 2) return;
      if (state.polls[pollId]) return;

      state.polls[pollId] = {
        pollId,
        question,
        options: options.map((opt, index) => ({
          id: opt.id || `opt_${index + 1}`,
          text: opt.text || opt.label || '',
        })),
        createdBy: createdBy || '',
        createdAt: createdAt || Date.now(),
        isClosed: Boolean(isClosed),
      };

      if (!state.votes[pollId]) {
        state.votes[pollId] = {};
      }
    },

    addVote(state, action) {
      const { pollId, userId, answerId } = action.payload || {};
      if (!pollId || !userId || !answerId) return;

      const poll = state.polls[pollId];
      if (poll?.isClosed) return;

      if (!state.votes[pollId]) {
        state.votes[pollId] = {};
      }

      // Validate known answer only if poll definition is available.
      if (poll) {
        const isKnownAnswer = poll.options.some((option) => option.id === answerId);
        if (!isKnownAnswer) return;
      }

      // one vote per user (overwrite allowed)
      state.votes[pollId][userId] = answerId;
    },

    endPoll(state, action) {
      const { pollId } = action.payload || {};
      if (!pollId || !state.polls[pollId]) return;
      state.polls[pollId].isClosed = true;
    },
  },
});

export const { addPoll, addVote, endPoll } = pollSlice.actions;
export default pollSlice.reducer;

// Base selectors
const selectPollFeature = (state) => state.polls || initialState;
const selectPollsMap = (state) => selectPollFeature(state).polls;
const selectVotesMap = (state) => selectPollFeature(state).votes;

// getPollById(state, pollId)
export const getPollById = (state, pollId) => selectPollsMap(state)[pollId] || null;

// getVotesByPoll(state, pollId)
export const getVotesByPoll = (state, pollId) => selectVotesMap(state)[pollId] || {};

// getVoteCountByOption(state, pollId) => { [answerId]: count }
export const getVoteCountByOption = createSelector(
  [getPollById, getVotesByPoll],
  (poll, pollVotes) => {
    if (!poll) return {};

    // Initialize all options to zero to keep UI stable
    const counts = {};
    for (let i = 0; i < poll.options.length; i += 1) {
      counts[poll.options[i].id] = 0;
    }

    // Single-pass aggregation across users
    const values = Object.values(pollVotes);
    for (let i = 0; i < values.length; i += 1) {
      const answerId = values[i];
      if (counts[answerId] !== undefined) {
        counts[answerId] += 1;
      }
    }

    return counts;
  },
);

// Backward-compatible alias
export const getVoteCount = getVoteCountByOption;

// getTotalVotes(state, pollId) => number
export const getTotalVotes = createSelector(
  [getVotesByPoll],
  (pollVotes) => Object.keys(pollVotes).length,
);

// getVotePercentage(state, pollId) => { [answerId]: percent }
export const getVotePercentage = createSelector(
  [getVoteCountByOption, getTotalVotes],
  (counts, totalVotes) => {
    const percentages = {};
    const optionIds = Object.keys(counts);

    if (optionIds.length === 0) return percentages;
    if (totalVotes === 0) {
      for (let i = 0; i < optionIds.length; i += 1) {
        percentages[optionIds[i]] = 0;
      }
      return percentages;
    }

    for (let i = 0; i < optionIds.length; i += 1) {
      const optionId = optionIds[i];
      percentages[optionId] = Math.round((counts[optionId] / totalVotes) * 100);
    }

    return percentages;
  },
);

// getLeadingOption(state, pollId) => optionId | null
// Tie-break rule: first option in poll order wins when counts are equal.
export const getLeadingOption = createSelector(
  [getPollById, getVoteCountByOption],
  (poll, counts) => {
    if (!poll || !poll.options?.length) return null;

    let leadId = null;
    let leadCount = -1;

    for (let i = 0; i < poll.options.length; i += 1) {
      const optionId = poll.options[i].id;
      const count = counts[optionId] || 0;
      if (count > leadCount) {
        leadCount = count;
        leadId = optionId;
      }
    }

    return leadId;
  },
);

