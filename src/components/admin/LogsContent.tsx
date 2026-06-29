import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Mail, Globe, AlertCircle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EmailLog {
  id: string;
  notification_type: string;
  user_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string;
  notification_data: any;
}

interface ApiLog {
  id: string;
  log_type: string;
  status: string;
  summary: string;
  request_data: any;
  response_data: any;
  error_message: string | null;
  created_at: string;
  post_id: string | null;
  site_id: string | null;
}

type UnifiedLog = {
  id: string;
  timestamp: string;
  type: 'email' | 'wordpress';
  typeLabel: string;
  summary: string;
  status: string;
  errorMessage: string | null;
  details?: any;
};

type LogFilter = 'all' | 'email' | 'wordpress';

export function LogsContent() {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<LogFilter>('all');
  const { toast } = useToast();
  const pageSize = 50;

  useEffect(() => {
    fetchLogs();
  }, [page, filter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let unifiedLogs: UnifiedLog[] = [];

      if (filter === 'all' || filter === 'email') {
        const { data: emailData, error: emailError } = await supabase
          .from('email_notification_logs')
          .select('*')
          .order('sent_at', { ascending: false })
          .range(
            filter === 'all' ? 0 : page * pageSize,
            filter === 'all' ? 1000 : (page + 1) * pageSize - 1
          );

        if (emailError) throw emailError;

        const emailLogs: UnifiedLog[] = (emailData || []).map((log: EmailLog) => ({
          id: log.id,
          timestamp: log.sent_at,
          type: 'email',
          typeLabel: getNotificationTypeLabel(log.notification_type),
          summary: log.subject,
          status: log.status,
          errorMessage: log.error_message,
          details: { recipient: log.user_email, data: log.notification_data }
        }));

        unifiedLogs = [...unifiedLogs, ...emailLogs];
      }

      if (filter === 'all' || filter === 'wordpress') {
        const { data: apiData, error: apiError } = await supabase
          .from('api_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(
            filter === 'all' ? 0 : page * pageSize,
            filter === 'all' ? 1000 : (page + 1) * pageSize - 1
          );

        if (apiError) throw apiError;

        const apiLogs: UnifiedLog[] = (apiData || []).map((log: ApiLog) => ({
          id: log.id,
          timestamp: log.created_at,
          type: 'wordpress',
          typeLabel: getApiLogTypeLabel(log.log_type),
          summary: log.summary,
          status: log.status,
          errorMessage: log.error_message,
          details: { request: log.request_data, response: log.response_data }
        }));

        unifiedLogs = [...unifiedLogs, ...apiLogs];
      }

      unifiedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (filter === 'all') {
        const start = page * pageSize;
        const end = start + pageSize;
        setTotalCount(unifiedLogs.length);
        setLogs(unifiedLogs.slice(start, end));
      } else {
        if (filter === 'email') {
          const { count } = await supabase
            .from('email_notification_logs')
            .select('*', { count: 'exact', head: true });
          setTotalCount(count || 0);
        } else {
          const { count } = await supabase
            .from('api_logs')
            .select('*', { count: 'exact', head: true });
          setTotalCount(count || 0);
        }
        setLogs(unifiedLogs);
      }
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load logs',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'success') {
      return (
        <Badge variant="default" className="bg-green-500 hover:bg-green-600">
          <CheckCircle className="w-3 h-3 mr-1" />
          Success
        </Badge>
      );
    }
    if (status === 'error') {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getNotificationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      new_assignment: 'New Assignment',
      due_tomorrow_reminder: 'Due Tomorrow',
      edit_request_approved: 'Edit Approved',
      edit_request_rejected: 'Edit Rejected',
      date_change_approved: 'Date Approved',
      date_change_rejected: 'Date Rejected',
      password_reset: 'Password Reset',
      email_confirmation: 'Email Confirmation',
      magic_link: 'Magic Link',
      welcome_email: 'Welcome Email',
      sponsorship_approved: 'Sponsorship Approved',
      sponsorship_rejected: 'Sponsorship Rejected',
      new_display_campaign: 'New Display Campaign',
    };
    return labels[type] || type;
  };

  const getApiLogTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      wordpress_publish: 'WP Publish',
      wordpress_update: 'WP Update',
      wordpress_test: 'WP Test',
    };
    return labels[type] || type;
  };

  const getTypeBadge = (log: UnifiedLog) => {
    if (log.type === 'email') {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {log.typeLabel}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Globe className="w-3 h-3" />
        {log.typeLabel}
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Select value={filter} onValueChange={(v) => { setFilter(v as LogFilter); setPage(0); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter logs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Logs</SelectItem>
              <SelectItem value="email">Email Notifications</SelectItem>
              <SelectItem value="wordpress">WordPress API</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          Total: {totalCount} logs
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No logs found
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>{getTypeBadge(log)}</TableCell>
                    <TableCell className="max-w-md truncate">
                      {log.summary}
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="max-w-xs">
                      {log.errorMessage ? (
                        <span className="text-destructive text-sm truncate block">
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {page * pageSize + 1} to{' '}
              {Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
