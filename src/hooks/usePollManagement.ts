import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PollState {
  question: string;
  options: string[];
  embedCode: string | null;
  embedUrl: string | null;
  crowdsignalPollId: string | null;
  originalQuestion: string | null;
  originalOptions: string[] | null;
}

interface UsePollManagementReturn {
  pollState: PollState;
  isCreatingPoll: boolean;
  isUpdatingPoll: boolean;
  isDeletingPoll: boolean;
  setPollQuestion: (question: string) => void;
  setPollOptions: (options: string[]) => void;
  setPollState: (state: Partial<PollState>) => void;
  initializePollFromDraft: (data: {
    question: string;
    options: string[];
    crowdsignalPollId?: string | null;
    embedCode?: string | null;
    embedUrl?: string | null;
  }) => void;
  hasPollChanged: () => boolean;
  createOrUpdatePoll: () => Promise<{ success: boolean; embedCode?: string; embedUrl?: string; pollId?: string }>;
  removePoll: () => Promise<void>;
  resetPoll: () => void;
}

const initialPollState: PollState = {
  question: '',
  options: ['', ''],
  embedCode: null,
  embedUrl: null,
  crowdsignalPollId: null,
  originalQuestion: null,
  originalOptions: null,
};

export function usePollManagement(): UsePollManagementReturn {
  const [pollState, setPollStateInternal] = useState<PollState>(initialPollState);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);
  const [isUpdatingPoll, setIsUpdatingPoll] = useState(false);
  const [isDeletingPoll, setIsDeletingPoll] = useState(false);

  const setPollQuestion = useCallback((question: string) => {
    setPollStateInternal(prev => ({ ...prev, question }));
  }, []);

  const setPollOptions = useCallback((options: string[]) => {
    setPollStateInternal(prev => ({ ...prev, options }));
  }, []);

  const setPollState = useCallback((state: Partial<PollState>) => {
    setPollStateInternal(prev => ({ ...prev, ...state }));
  }, []);

  const initializePollFromDraft = useCallback((data: {
    question: string;
    options: string[];
    crowdsignalPollId?: string | null;
    embedCode?: string | null;
    embedUrl?: string | null;
  }) => {
    setPollStateInternal({
      question: data.question,
      options: data.options,
      embedCode: data.embedCode || null,
      embedUrl: data.embedUrl || null,
      crowdsignalPollId: data.crowdsignalPollId || null,
      originalQuestion: data.crowdsignalPollId ? data.question : null,
      originalOptions: data.crowdsignalPollId ? [...data.options] : null,
    });
  }, []);

  const hasPollChanged = useCallback((): boolean => {
    if (!pollState.originalQuestion || !pollState.originalOptions) return false;
    if (pollState.question !== pollState.originalQuestion) return true;
    const filteredOptions = pollState.options.filter(o => o.trim());
    if (filteredOptions.length !== pollState.originalOptions.length) return true;
    return filteredOptions.some((opt, i) => opt !== pollState.originalOptions![i]);
  }, [pollState]);

  const createOrUpdatePoll = useCallback(async (): Promise<{
    success: boolean;
    embedCode?: string;
    embedUrl?: string;
    pollId?: string;
  }> => {
    const filteredOptions = pollState.options.filter(o => o.trim());
    const hasPollContent = pollState.question.trim() && filteredOptions.length >= 2;

    if (!hasPollContent) {
      return { success: true }; // No poll to create/update
    }

    // Create new poll
    if (!pollState.crowdsignalPollId) {
      setIsCreatingPoll(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-crowdsignal-poll', {
          body: { 
            question: pollState.question, 
            answers: filteredOptions 
          }
        });

        if (error) throw error;

        if (data?.pollId && data?.jsEmbedCode) {
          setPollStateInternal(prev => ({
            ...prev,
            embedCode: data.jsEmbedCode,
            embedUrl: data.embedUrl,
            crowdsignalPollId: data.pollId,
            originalQuestion: pollState.question,
            originalOptions: [...filteredOptions],
          }));
          return {
            success: true,
            embedCode: data.jsEmbedCode,
            embedUrl: data.embedUrl,
            pollId: data.pollId,
          };
        } else {
          throw new Error('Invalid poll creation response');
        }
      } catch (error: any) {
        console.error('Error creating poll:', error);
        toast.error('Failed to create poll. Please try again.');
        return { success: false };
      } finally {
        setIsCreatingPoll(false);
      }
    }

    // Update existing poll
    if (pollState.crowdsignalPollId && hasPollChanged()) {
      setIsUpdatingPoll(true);
      try {
        const { data, error } = await supabase.functions.invoke('update-crowdsignal-poll', {
          body: { 
            pollId: pollState.crowdsignalPollId,
            newQuestion: pollState.question, 
            answers: filteredOptions 
          }
        });

        if (error) throw error;

        if (data?.pollId && data?.jsEmbedCode) {
          setPollStateInternal(prev => ({
            ...prev,
            embedCode: data.jsEmbedCode,
            embedUrl: data.embedUrl,
            originalQuestion: pollState.question,
            originalOptions: [...filteredOptions],
          }));
          toast.success('Poll updated successfully');
          return {
            success: true,
            embedCode: data.jsEmbedCode,
            embedUrl: data.embedUrl,
            pollId: data.pollId,
          };
        } else {
          throw new Error('Invalid poll update response');
        }
      } catch (error: any) {
        console.error('Error updating poll:', error);
        toast.error('Failed to update poll. Please try again.');
        return { success: false };
      } finally {
        setIsUpdatingPoll(false);
      }
    }

    // Poll exists and hasn't changed
    return {
      success: true,
      embedCode: pollState.embedCode || undefined,
      embedUrl: pollState.embedUrl || undefined,
      pollId: pollState.crowdsignalPollId || undefined,
    };
  }, [pollState, hasPollChanged]);

  const removePoll = useCallback(async (): Promise<void> => {
    if (pollState.crowdsignalPollId) {
      setIsDeletingPoll(true);
      try {
        const { data, error } = await supabase.functions.invoke('delete-crowdsignal-poll', {
          body: { pollId: pollState.crowdsignalPollId }
        });

        if (error) throw error;

        if (data?.deleted) {
          toast.success('Poll deleted successfully');
        } else {
          toast.warning('Poll may not have been deleted from Crowdsignal');
        }
      } catch (error: any) {
        console.error('Error deleting poll:', error);
        toast.error('Failed to delete poll from Crowdsignal');
      } finally {
        setIsDeletingPoll(false);
      }
    }

    setPollStateInternal(initialPollState);
  }, [pollState.crowdsignalPollId]);

  const resetPoll = useCallback(() => {
    setPollStateInternal(initialPollState);
  }, []);

  return {
    pollState,
    isCreatingPoll,
    isUpdatingPoll,
    isDeletingPoll,
    setPollQuestion,
    setPollOptions,
    setPollState,
    initializePollFromDraft,
    hasPollChanged,
    createOrUpdatePoll,
    removePoll,
    resetPoll,
  };
}
