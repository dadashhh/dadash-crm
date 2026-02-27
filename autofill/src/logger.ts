export interface LogMeta {
  [key: string]: string | number | boolean | null | undefined;
}

function formatKv(meta: LogMeta): string {
  return Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

function emit(
  level: 'info' | 'warn' | 'error',
  scope: string,
  msg: string,
  meta: LogMeta = {},
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...meta,
  };

  const kvStr = formatKv(meta);
  const line = `[${scope}] ${msg}${kvStr ? ' ' + kvStr : ''}`;

  if (level === 'error') {
    console.error(JSON.stringify(entry));
    console.error(line);
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const log = {
  info: (scope: string, msg: string, meta?: LogMeta) => emit('info', scope, msg, meta),
  warn: (scope: string, msg: string, meta?: LogMeta) => emit('warn', scope, msg, meta),
  error: (scope: string, msg: string, meta?: LogMeta) => emit('error', scope, msg, meta),
};
