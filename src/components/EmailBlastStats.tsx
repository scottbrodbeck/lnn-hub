import { useEmailBlastStats, BlastStats, EmailPlatform } from '@/hooks/useEmailBlastStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Eye, MousePointer, UserMinus, Globe, RefreshCw, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface EmailBlastStatsProps {
  blastId: string;
  siteId: string;
  isPublished: boolean;
  platform?: EmailPlatform;
  compact?: boolean;
}

interface StatCardProps {
  title: string;
  value: number | undefined;
  subtitle?: string;
  icon: React.ElementType;
}

function StatCard({ title, value, subtitle, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value?.toLocaleString() ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailBlastStats({ blastId, siteId, isPublished, platform = 'beehiiv', compact = false }: EmailBlastStatsProps) {
  const { stats, isLoading, error, cached, cachedAt, refetch } = useEmailBlastStats(blastId, siteId, isPublished, platform);

  if (!isPublished) {
    return null;
  }

  if (isLoading) {
    if (compact) {
      return (
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    if (compact) {
      return null;
    }
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Failed to load stats</span>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    if (compact) {
      return (
        <span className="text-xs text-muted-foreground">Stats not available</span>
      );
    }
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Stats are not available for this email blast
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {stats.email_open_rate !== undefined 
            ? `${stats.email_open_rate.toFixed(1)}%` 
            : `${stats.email_unique_opens?.toLocaleString() ?? 0}`}
        </span>
        <span className="flex items-center gap-1">
          <MousePointer className="h-3 w-3" />
          {stats.email_click_rate !== undefined 
            ? `${stats.email_click_rate.toFixed(1)}%` 
            : `${stats.email_unique_clicks?.toLocaleString() ?? 0}`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Emails Sent" 
          value={stats.email_sent_count} 
          icon={Mail} 
        />
        <StatCard 
          title="Opens" 
          value={stats.email_unique_opens}
          subtitle={stats.email_open_rate !== undefined ? `${stats.email_open_rate.toFixed(1)}%` : undefined}
          icon={Eye} 
        />
        <StatCard 
          title="Clicks" 
          value={stats.email_unique_clicks}
          subtitle={stats.email_click_rate !== undefined ? `${stats.email_click_rate.toFixed(1)}%` : undefined}
          icon={MousePointer} 
        />
        <StatCard 
          title="Unsubscribes" 
          value={stats.email_unsubscribes} 
          icon={UserMinus} 
        />
      </div>

      {stats.web_views !== undefined && stats.web_views > 0 && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{stats.web_views.toLocaleString()} web views</p>
              {stats.web_clicks !== undefined && stats.web_clicks > 0 && (
                <p className="text-sm text-muted-foreground">{stats.web_clicks.toLocaleString()} web clicks</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {cached ? 'Cached' : 'Fresh'} stats
          {cachedAt && ` • Updated ${formatDistanceToNow(new Date(cachedAt), { addSuffix: true })}`}
        </span>
        <Button variant="ghost" size="sm" onClick={refetch} className="h-7 px-2">
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>
    </div>
  );
}

// Export a standalone component for displaying stats in a card format
export function EmailBlastStatsCard({ blastId, siteId, isPublished, platform }: Omit<EmailBlastStatsProps, 'compact'>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Email Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <EmailBlastStats blastId={blastId} siteId={siteId} isPublished={isPublished} platform={platform} />
      </CardContent>
    </Card>
  );
}
