import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, UserCircle, Bell, BookOpen, PenTool, Sparkles, ChevronRight } from 'lucide-react';
import { useOnboardingSettings } from '@/hooks/useOnboardingSettings';

const WELCOME_WINDOW_DAYS = 14;

export function WelcomeCard() {
  const { user, role } = useAuth();
  const isAdminViewing = role === 'admin' || role === 'super_admin';
  const { data: onboarding } = useOnboardingSettings();

  const dismissKey = user ? `welcome-card-dismissed:${user.id}` : '';
  const [dismissed, setDismissed] = useState(() =>
    dismissKey ? localStorage.getItem(dismissKey) === '1' : false,
  );

  const { data: profile } = useQuery({
    queryKey: ['profile-created-at', user?.id],
    enabled: !!user?.id && !!onboarding?.welcomeCardEnabled && !isAdminViewing && !dismissed,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!onboarding?.welcomeCardEnabled || isAdminViewing || dismissed) return null;
  if (!profile?.created_at) return null;

  const ageDays = (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > WELCOME_WINDOW_DAYS) return null;

  const dismiss = () => {
    if (dismissKey) localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const rows: Array<{ to: string; icon: React.ElementType; label: string }> = [
    { to: '/client/settings', icon: UserCircle, label: 'Add your author name, bio, and photo' },
    { to: '/client/settings', icon: Bell, label: 'Review your email notification preferences' },
    ...(onboarding.guideEnabled
      ? [{ to: '/client/guide', icon: BookOpen, label: 'Read the Getting Started guide' }]
      : []),
    { to: '/client/submit', icon: PenTool, label: 'Submit your first post' },
  ];

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Welcome to the LNN Client Portal</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1" onClick={dismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">A few quick things to get you set up:</p>
        <div className="mt-3 grid gap-1.5">
          {rows.map((row, i) => (
            <Link
              key={i}
              to={row.to}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <row.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="flex-1">{row.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
