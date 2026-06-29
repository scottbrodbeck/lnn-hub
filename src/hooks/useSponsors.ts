import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Sponsor {
  id: string;
  organization_id: string;
  name: string;
  logo_url: string;
  link_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSponsors(organizationId: string | null) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSponsors = useCallback(async () => {
    if (!organizationId) {
      setSponsors([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sponsors')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setSponsors((data as Sponsor[]) || []);
    } catch (error) {
      console.error('Failed to fetch sponsors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSponsors();
  }, [fetchSponsors]);

  const createSponsor = useCallback(async (sponsor: {
    organization_id: string;
    name: string;
    logo_url: string;
    link_url: string | null;
    created_by?: string;
  }): Promise<Sponsor | null> => {
    try {
      const { data, error } = await supabase
        .from('sponsors')
        .insert(sponsor)
        .select()
        .single();

      if (error) throw error;
      const newSponsor = data as Sponsor;
      setSponsors(prev => [...prev, newSponsor].sort((a, b) => a.name.localeCompare(b.name)));
      return newSponsor;
    } catch (error) {
      console.error('Failed to create sponsor:', error);
      return null;
    }
  }, []);

  const updateSponsor = useCallback(async (
    sponsorId: string,
    updates: Partial<Pick<Sponsor, 'name' | 'logo_url' | 'link_url'>>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('sponsors')
        .update(updates)
        .eq('id', sponsorId);

      if (error) throw error;
      setSponsors(prev => prev.map(s =>
        s.id === sponsorId ? { ...s, ...updates } : s
      ));
      return true;
    } catch (error) {
      console.error('Failed to update sponsor:', error);
      return false;
    }
  }, []);

  const deleteSponsor = useCallback(async (sponsorId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('sponsors')
        .update({ is_active: false })
        .eq('id', sponsorId);

      if (error) throw error;
      setSponsors(prev => prev.filter(s => s.id !== sponsorId));
      return true;
    } catch (error) {
      console.error('Failed to delete sponsor:', error);
      return false;
    }
  }, []);

  return {
    sponsors,
    isLoading,
    fetchSponsors,
    createSponsor,
    updateSponsor,
    deleteSponsor,
  };
}
