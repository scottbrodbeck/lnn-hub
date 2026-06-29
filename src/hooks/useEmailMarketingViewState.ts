import { useState, useEffect, useMemo, useCallback } from 'react';

export type EmailTab = 'all' | 'blasts' | 'sponsorships' | 'submitted';
export type SortOption = 'due_date_asc' | 'due_date_desc' | 'name_asc' | 'name_desc';

type SortPreferences = {
  [key in EmailTab]: SortOption;
};

interface EmailMarketingViewState {
  activeTab: EmailTab;
  sortPreferences: SortPreferences;
  searchTerm: string;
}

const DEFAULT_SORT_PREFERENCES: SortPreferences = {
  all: 'due_date_asc',
  blasts: 'due_date_asc',
  sponsorships: 'due_date_asc',
  submitted: 'due_date_desc',
};

const DEFAULT_STATE: EmailMarketingViewState = {
  activeTab: 'all',
  sortPreferences: DEFAULT_SORT_PREFERENCES,
  searchTerm: '',
};

const STORAGE_KEY = 'emailMarketingViewState';

const loadState = (): EmailMarketingViewState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        activeTab: parsed.activeTab || DEFAULT_STATE.activeTab,
        sortPreferences: {
          all: parsed.sortPreferences?.all || DEFAULT_SORT_PREFERENCES.all,
          blasts: parsed.sortPreferences?.blasts || DEFAULT_SORT_PREFERENCES.blasts,
          sponsorships: parsed.sortPreferences?.sponsorships || DEFAULT_SORT_PREFERENCES.sponsorships,
          submitted: parsed.sortPreferences?.submitted || DEFAULT_SORT_PREFERENCES.submitted,
        },
        searchTerm: '', // Never persist search
      };
    }
  } catch (e) {
    console.error('Failed to load email marketing view state:', e);
  }
  return DEFAULT_STATE;
};

export function useEmailMarketingViewState() {
  const [state, setState] = useState<EmailMarketingViewState>(loadState);

  // Persist tab + sort (not search) to localStorage
  useEffect(() => {
    const { searchTerm, ...persistable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state.activeTab, state.sortPreferences]);

  const setActiveTab = useCallback((activeTab: EmailTab) => {
    setState(prev => ({ ...prev, activeTab }));
  }, []);

  const updateSortForTab = useCallback((tab: EmailTab, sort: SortOption) => {
    setState(prev => ({
      ...prev,
      sortPreferences: { ...prev.sortPreferences, [tab]: sort },
    }));
  }, []);

  const setSearchTerm = useCallback((searchTerm: string) => {
    setState(prev => ({ ...prev, searchTerm }));
  }, []);

  const currentSort = useMemo(
    () => state.sortPreferences[state.activeTab],
    [state.sortPreferences, state.activeTab]
  );

  return {
    activeTab: state.activeTab,
    setActiveTab,
    sortPreferences: state.sortPreferences,
    updateSortForTab,
    currentSort,
    searchTerm: state.searchTerm,
    setSearchTerm,
  };
}
