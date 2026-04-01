import { storageService } from '../chat/utils/storageService';

export async function savePoll(poll) {
  await storageService.init();
  return storageService.savePoll(poll);
}

export async function saveVote(vote) {
  await storageService.init();
  return storageService.saveVote(vote);
}

export async function closePoll(pollId) {
  await storageService.init();
  return storageService.closePoll(pollId);
}

export async function getPollsByRoom(roomId) {
  await storageService.init();
  return storageService.getPollsByRoom(roomId);
}

export async function getVotesByPoll(pollId) {
  await storageService.init();
  return storageService.getVotesByPoll(pollId);
}

