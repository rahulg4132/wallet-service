import { AppError } from "./error.handler.js";

export const normalizeAmount = (amount: number | string): number => {
  const normalizedAmount = Number(amount);
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount <= 0) {
    throw new AppError('transfer amount is outside the supported range', 500);
  }
  return normalizedAmount;
};
