import pino from 'pino';

export const logger = pino({
  level: "info", // TODO: chaneg it to config later
  base: {
    service: 'wallet-service',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
