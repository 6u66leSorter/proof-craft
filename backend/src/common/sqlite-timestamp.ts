export const sqliteTimestamp = (timestamp = Date.now()): string =>
  new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')
