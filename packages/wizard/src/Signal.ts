export interface PauseWhileOptions {
  interval?: number
  maxAttempts?: number
}

export interface Signal {
  readonly type: 'retry' | 'goto' | 'skip' | 'stop' | 'pauseWhile' | 'fail'
  readonly stepId?: string
  readonly condition?: (state: any) => boolean | Promise<boolean>
  readonly options?: PauseWhileOptions
  readonly message?: string
}

export const Signal = {
  retry: (): Signal => ({ type: 'retry' }),
  goto: (stepId: string): Signal => ({ type: 'goto', stepId }),
  skip: { type: 'skip' } as Signal,
  stop: { type: 'stop' } as Signal,
  fail: (message: string): Signal => ({ type: 'fail', message }),
  pauseWhile: (
    condition: (state: any) => boolean | Promise<boolean>,
    options?: PauseWhileOptions,
  ): Signal => ({ type: 'pauseWhile', condition, options }),
}

export type SignalType = Signal['type']

export function signalLabel(s: Signal): string {
  switch (s.type) {
    case 'retry': return '↻ retry'
    case 'goto': return `→ ${s.stepId}`
    case 'skip': return '→ next'
    case 'stop': return '■ stop'
    case 'fail': return '✗ fail'
    case 'pauseWhile': return '⏳ pause'
  }
}
