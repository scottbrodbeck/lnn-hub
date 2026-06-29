import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Track how many times the assignments query is fired.
const queryCalls = { post_assignments: 0, assignment_instances: 0 };

// Build a chainable thenable that resolves to a fixed result.
function makeChain(result: { data: any; error: any }, counterKey?: keyof typeof queryCalls) {
  const chain: any = {};
  const methods = ['select', 'eq', 'or', 'in', 'order', 'maybeSingle'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: any) => {
    if (counterKey) queryCalls[counterKey] += 1;
    return Promise.resolve(result).then(resolve);
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'post_assignments') {
        return makeChain(
          {
            data: [
              {
                id: 'a1',
                assignment_name: 'Test Assignment',
                due_date: '2026-06-01',
                site_id: 's1',
                post_type: 'sponsored',
                is_completed: false,
                is_skipped: false,
                recurrence_type: 'one_time',
                recurrence_day_of_week: null,
                recurrence_end_date: null,
                organization_id: 'org-1',
                content_category: 'website',
                notes: null,
                assigned_to: null,
                site: { name: 'Test Site', url: 'https://test.example' },
              },
            ],
            error: null,
          },
          'post_assignments'
        );
      }
      if (table === 'assignment_instances') {
        return makeChain({ data: [], error: null }, 'assignment_instances');
      }
      return makeChain({ data: [], error: null });
    }),
  },
}));

import { useAssignmentSelection } from './useAssignmentSelection';

beforeEach(() => {
  queryCalls.post_assignments = 0;
  queryCalls.assignment_instances = 0;
});

describe('useAssignmentSelection — inline onCategoryMismatch stability', () => {
  it('fetches once and clears isLoading even when onCategoryMismatch is a new ref each render', async () => {
    // Simulate a parent that passes a brand-new inline arrow each render
    // (the bug pattern that previously caused an infinite refetch loop).
    const { result, rerender } = renderHook(() =>
      useAssignmentSelection({
        mode: 'client',
        organizationId: 'org-1',
        contentCategory: 'website',
        onCategoryMismatch: () => {
          /* fresh closure every render */
        },
      })
    );

    // Wait for initial fetch to settle.
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.assignments).toHaveLength(1);
    expect(result.current.assignments[0].assignment_name).toBe('Test Assignment');

    const callsAfterMount = queryCalls.post_assignments;
    expect(callsAfterMount).toBe(1);

    // Force several re-renders with brand-new inline callbacks.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        rerender();
      });
    }

    // Give any erroneously scheduled effects a chance to fire.
    await new Promise((r) => setTimeout(r, 50));

    // Hook must NOT have refetched on dep churn from the inline callback.
    expect(queryCalls.post_assignments).toBe(callsAfterMount);
    expect(result.current.isLoading).toBe(false);
  });
});
