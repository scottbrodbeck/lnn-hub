import { useState, useEffect, useMemo, useCallback } from 'react';

export type FilterStatus = 'all' | 'upcoming' | 'overdue' | 'submitted';
export type SortOption = 'due_date_asc' | 'due_date_desc' | 'name_asc' | 'name_desc';
export type ViewMode = 'list' | 'calendar';

export type SortPreferences = {
  [key in FilterStatus]: SortOption;
};

interface ClientPostsViewState {
  filterStatus: FilterStatus;
  viewMode: ViewMode;
  sortPreferences: SortPreferences;
  calendarDate: string; // ISO string
}

const DEFAULT_SORT_PREFERENCES: SortPreferences = {
  all: 'due_date_asc',
  upcoming: 'due_date_asc',
  overdue: 'due_date_asc',
  submitted: 'due_date_desc',
};

const DEFAULT_VIEW_STATE: ClientPostsViewState = {
  filterStatus: 'all',
  viewMode: 'list',
  sortPreferences: DEFAULT_SORT_PREFERENCES,
  calendarDate: new Date().toISOString(),
};

const STORAGE_KEY = 'clientPostsViewState';
const OLD_SORT_KEY = 'assignmentsSortPreferences';

const loadViewState = (): ClientPostsViewState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        filterStatus: parsed.filterStatus || DEFAULT_VIEW_STATE.filterStatus,
        viewMode: parsed.viewMode || DEFAULT_VIEW_STATE.viewMode,
        sortPreferences: {
          all: parsed.sortPreferences?.all || DEFAULT_SORT_PREFERENCES.all,
          upcoming: parsed.sortPreferences?.upcoming || DEFAULT_SORT_PREFERENCES.upcoming,
          overdue: parsed.sortPreferences?.overdue || DEFAULT_SORT_PREFERENCES.overdue,
          submitted: parsed.sortPreferences?.submitted || DEFAULT_SORT_PREFERENCES.submitted,
        },
        calendarDate: parsed.calendarDate || DEFAULT_VIEW_STATE.calendarDate,
      };
    }

    // Migrate from old sort preferences key
    const oldSortPrefs = localStorage.getItem(OLD_SORT_KEY);
    if (oldSortPrefs) {
      const parsed = JSON.parse(oldSortPrefs);
      const migrated: ClientPostsViewState = {
        ...DEFAULT_VIEW_STATE,
        sortPreferences: {
          all: parsed.all || DEFAULT_SORT_PREFERENCES.all,
          upcoming: parsed.upcoming || DEFAULT_SORT_PREFERENCES.upcoming,
          overdue: parsed.overdue || DEFAULT_SORT_PREFERENCES.overdue,
          submitted: parsed.submitted || DEFAULT_SORT_PREFERENCES.submitted,
        },
      };
      // Save migrated state and clean up old key
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(OLD_SORT_KEY);
      return migrated;
    }
  } catch (e) {
    console.error('Failed to load view state:', e);
  }
  return DEFAULT_VIEW_STATE;
};

export function useClientPostsViewState() {
  const [state, setState] = useState<ClientPostsViewState>(loadViewState);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setFilterStatus = useCallback((filterStatus: FilterStatus) => {
    setState(prev => ({ ...prev, filterStatus }));
  }, []);

  const setViewMode = useCallback((viewMode: ViewMode) => {
    setState(prev => ({ ...prev, viewMode }));
  }, []);

  const setSortPreferences = useCallback((sortPreferences: SortPreferences) => {
    setState(prev => ({ ...prev, sortPreferences }));
  }, []);

  const updateSortForTab = useCallback((tab: FilterStatus, sort: SortOption) => {
    setState(prev => ({
      ...prev,
      sortPreferences: {
        ...prev.sortPreferences,
        [tab]: sort,
      },
    }));
  }, []);

  const setCalendarDate = useCallback((date: Date) => {
    setState(prev => ({ ...prev, calendarDate: date.toISOString() }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setState({ ...DEFAULT_VIEW_STATE, calendarDate: new Date().toISOString() });
  }, []);

  const isDefaultView = useMemo(() => {
    return (
      state.filterStatus === DEFAULT_VIEW_STATE.filterStatus &&
      state.viewMode === DEFAULT_VIEW_STATE.viewMode &&
      state.sortPreferences.all === DEFAULT_SORT_PREFERENCES.all &&
      state.sortPreferences.upcoming === DEFAULT_SORT_PREFERENCES.upcoming &&
      state.sortPreferences.overdue === DEFAULT_SORT_PREFERENCES.overdue &&
      state.sortPreferences.submitted === DEFAULT_SORT_PREFERENCES.submitted
    );
  }, [state.filterStatus, state.viewMode, state.sortPreferences]);

  const calendarDate = useMemo(() => {
    try {
      return new Date(state.calendarDate);
    } catch {
      return new Date();
    }
  }, [state.calendarDate]);

  return {
    filterStatus: state.filterStatus,
    setFilterStatus,
    viewMode: state.viewMode,
    setViewMode,
    sortPreferences: state.sortPreferences,
    setSortPreferences,
    updateSortForTab,
    calendarDate,
    setCalendarDate,
    resetToDefaults,
    isDefaultView,
  };
}
