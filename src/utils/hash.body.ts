import crypto from 'crypto';

export const hashBody = (
  obj: unknown
): string => {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
};
