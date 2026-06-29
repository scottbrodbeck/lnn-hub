import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, format } from 'date-fns';
import { generateAllCalendarEvents, AssignmentInstance } from '@/lib/recurrenceUtils';
import { areSocialPostsDefault } from '@/lib/socialPostText';

export function useChecklistCount() {
  const [checklistUncheckedCount, setChecklistUncheckedCount] = useState(0);

  const fetchChecklistCount = useCallback(async () => {
    try {
      const todayDate = new Date();
      const todayStart = startOfDay(todayDate);
      const todayEnd = endOfDay(todayDate);
      const today = format(todayDate, 'yyyy-MM-dd');

      const { data: assignments } = await supabase
        .from('post_assignments')
        .select('*');

      const { data: instances } = await supabase
        .from('assignment_instances')
        .select('*');

      const todayEvents = generateAllCalendarEvents(
        assignments || [],
        todayStart,
        todayEnd,
        (instances || []) as AssignmentInstance[]
      );

      const websiteEvents = todayEvents.filter(
        e => e.resource.content_category === 'website' && !e.resource.is_completed && !e.resource.is_skipped
      );
      const assignmentCount = websiteEvents.length;

      const blastsCount = todayEvents.filter(
        e => e.resource.content_category === 'email_blast' && !e.resource.is_skipped
      ).length;

      const sponsorshipsCount = todayEvents.filter(
        e => e.resource.content_category === 'email_sponsorship' && !e.resource.is_skipped
      ).length;


      // Count social-post tasks for posts whose assignment publishes today
      const [oneTimeRes, instanceRes] = await Promise.all([
        supabase
          .from('post_assignments')
          .select('submitted_post_id')
          .eq('content_category', 'website')
          .eq('due_date', today)
          .not('submitted_post_id', 'is', null),
        supabase
          .from('assignment_instances')
          .select('submitted_post_id, assignment_id')
          .eq('instance_date', today)
          .not('submitted_post_id', 'is', null),
      ]);

      const instanceAssignmentIds = [
        ...new Set((instanceRes.data || []).map((r: any) => r.assignment_id).filter(Boolean) as string[]),
      ];
      let websiteAssignmentIdSet = new Set<string>();
      if (instanceAssignmentIds.length > 0) {
        const { data: paRows } = await supabase
          .from('post_assignments')
          .select('id')
          .in('id', instanceAssignmentIds)
          .eq('content_category', 'website');
        websiteAssignmentIdSet = new Set((paRows || []).map((r: any) => r.id));
      }

      const todayPostIds = [
        ...new Set([
          ...((oneTimeRes.data || []).map((r: any) => r.submitted_post_id).filter(Boolean) as string[]),
          ...((instanceRes.data || [])
            .filter((r: any) => websiteAssignmentIdSet.has(r.assignment_id))
            .map((r: any) => r.submitted_post_id)
            .filter(Boolean) as string[]),
        ]),
      ];

      let socialPostCount = 0;
      if (todayPostIds.length > 0) {
        const { data: socialPostCandidates } = await supabase
          .from('posts')
          .select('id, headline, content, social_posts')
          .in('id', todayPostIds)
          .not('social_posts', 'is', null);

        const extractPosts = (sp: any): Array<{ text?: string; type?: string; edited?: boolean }> | null => {
          if (!sp) return null;
          if (Array.isArray(sp)) return sp;
          if (typeof sp === 'object' && Array.isArray(sp.posts)) return sp.posts;
          return null;
        };

        socialPostCount = (socialPostCandidates || []).filter((p: any) => {
          const posts = extractPosts(p.social_posts);
          if (!posts || posts.length === 0) return false;
          return !areSocialPostsDefault(posts, p.headline, p.content);
        }).length;
      }

      const { data: checkedItems } = await supabase
        .from('admin_daily_checklist')
        .select('item_id')
        .eq('checklist_date', today);

      const checkedCount = checkedItems?.length || 0;
      const totalItems = assignmentCount + (blastsCount || 0) + (sponsorshipsCount || 0) + socialPostCount;

      setChecklistUncheckedCount(Math.max(0, totalItems - checkedCount));
    } catch (error) {
      console.error('Failed to fetch checklist count:', error);
    }
  }, []);

  useEffect(() => {
    fetchChecklistCount();
  }, [fetchChecklistCount]);

  return { checklistUncheckedCount, setChecklistUncheckedCount, fetchChecklistCount };
}
