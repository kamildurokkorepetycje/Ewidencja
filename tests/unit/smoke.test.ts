import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('loads the @ alias', async () => {
    const { cn } = await import('@/lib/utils/cn')
    expect(cn('a', false && 'b')).toBe('a')
  })
})
