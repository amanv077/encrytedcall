import { storageService } from '../chat/utils/storageService';

export async function saveQuiz(quiz) {
  await storageService.init();
  return storageService.saveQuiz(quiz);
}

export async function saveQuizAnswer(answer) {
  await storageService.init();
  return storageService.saveQuizAnswer(answer);
}

export async function getQuizzesByRoom(roomId) {
  await storageService.init();
  return storageService.getQuizzesByRoom(roomId);
}

export async function getQuizAnswersByRoom(roomId) {
  await storageService.init();
  return storageService.getQuizAnswersByRoom(roomId);
}
