import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Phone, Calendar, CheckSquare, Mail, StickyNote, Trash2,
  ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import {
  useToggleActivityComplete,
  useDeleteCrmActivity,
  type CrmActivityRow as ActivityRowT,
  type CrmActivityType,
} from '@/hooks/useCrmActivities';
import { useEngagementBody } from '@/hooks/useEngagementBody';
import { SyncStatusBadge } from './SyncStatusBadge';

const ICONS: Record<CrmActivityType, any> = {
  call: Phone,
  meeting: Calendar,
  task: CheckSquare,
  email: Mail,
  note: StickyNote,
};

interface Props {
  activity: ActivityRowT;
  showRelated?: boolean;
}

export function ActivityRow({ activity, showRelated = true }: Props) {
  const toggle = useToggleActivityComplete();
  const del = useDeleteCrmActivity();
  const Icon = ICONS[activity.type] ?? StickyNote;
  const completed = !!activity.completed_at;
  const overdue = !completed && activity.due_at && new Date(activity.due_at) < new Date();

  const isEngagement = !!activity.hubspot_id;
  const isExpandable = isEngagement && (activity.type === 'email' || activity.type === 'note' || activity.type === 'call');
  const [expanded, setExpanded] = useState(false);
  const { data: bodyData, isFetching: loadingBody } = useEngagementBody(
    activity.id,
    expanded && !activity.body_html && !activity.body_text,
  );

  const html = activity.body_html ?? bodyData?.body_html ?? null;
  const text = activity.body_text ?? bodyData?.body_text ?? activity.body ?? null;

  const sanitized = useRef<string | null>(null);
  useEffect(() => {
    if (html) sanitized.current = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [html]);

  const timestamp = activity.hs_timestamp ?? activity.due_at ?? activity.created_at;
  const direction = activity.direction;
  const DirectionIcon = direction === 'INCOMING_EMAIL' || direction === 'INBOUND'
    ? ArrowDownLeft
    : direction === 'EMAIL' || direction === 'OUTBOUND'
    ? ArrowUpRight
    : null;

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-start gap-3 p-3">
        {!isEngagement && (
          <Checkbox
            checked={completed}
            onCheckedChange={(v) => toggle.mutate({ id: activity.id, completed: !!v })}
            className="mt-0.5"
          />
        )}
        <Icon className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
        {DirectionIcon && <DirectionIcon className="h-3.5 w-3.5 text-muted-foreground mt-1 -ml-2" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate ${completed ? 'line-through text-muted-foreground' : ''}`}>
              {activity.subject || `(${activity.type})`}
            </span>
            <SyncStatusBadge
              status={activity.sync_status}
              error={activity.sync_error}
              hubspotId={activity.hubspot_id}
            />
            {overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
            {isEngagement && (
              <Badge variant="outline" className="text-[10px]">HubSpot</Badge>
            )}
          </div>
          {!expanded && text && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{text.replace(/<[^>]*>/g, '').trim()}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <span>{new Date(timestamp).toLocaleString()}</span>
            {activity.owner_name && <span>· {activity.owner_name}</span>}
            {showRelated && (activity.deal_title || activity.organization_name || activity.contact_name) && (
              <span>· {activity.deal_title ?? activity.organization_name ?? activity.contact_name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isExpandable && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          )}
          {!isEngagement && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => del.mutate(activity.id)}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 bg-muted/30">
          {loadingBody && !html && !text ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading content…
            </div>
          ) : html ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitized.current ?? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) }}
            />
          ) : text ? (
            <pre className="whitespace-pre-wrap text-xs font-sans">{text}</pre>
          ) : (
            <p className="text-xs text-muted-foreground">No content available.</p>
          )}
        </div>
      )}
    </div>
  );
}
