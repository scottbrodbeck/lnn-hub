import { useMemo, useState, useCallback, ReactNode, CSSProperties } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isSameMonth,
  format,
} from 'date-fns';
import { cn } from '@/lib/utils';

export interface WeekdayCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: any;
}

export interface EventStyle {
  style?: CSSProperties;
  className?: string;
}

export interface DayStyle {
  style?: CSSProperties;
  className?: string;
}

interface WeekdayMonthCalendarProps {
  date: Date;
  events: WeekdayCalendarEvent[];
  onSelectEvent?: (event: WeekdayCalendarEvent) => void;
  onSelectSlot?: (slot: { start: Date }) => void;
  onEventDrop?: (args: { event: WeekdayCalendarEvent; start: Date; end: Date }) => void;
  eventPropGetter?: (event: WeekdayCalendarEvent) => EventStyle;
  dayPropGetter?: (date: Date) => DayStyle;
  renderEvent?: (event: WeekdayCalendarEvent) => ReactNode;
  weekHeight?: number;
  sortEvents?: (a: WeekdayCalendarEvent, b: WeekdayCalendarEvent) => number;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * A purpose-built weekday-only month calendar.
 *
 * Renders a CSS Grid of 5 columns (Mon-Fri) × N week rows for the visible
 * month. Events are stacked vertically inside their day cell — there is no
 * percentage math, no spacers, and no multi-day spans, so events are
 * guaranteed to render in the correct day. Drag-and-drop uses native HTML5
 * drag events.
 */
export function WeekdayMonthCalendar({
  date,
  events,
  onSelectEvent,
  onSelectSlot,
  onEventDrop,
  eventPropGetter,
  dayPropGetter,
  renderEvent,
  weekHeight = 180,
  sortEvents,
}: WeekdayMonthCalendarProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Build the visible date matrix: weeks that contain any day of the month,
  // limited to Mon-Fri. weekStartsOn: 1 = Monday.
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[][] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 5; i++) {
        week.push(addDays(cursor, i));
      }
      result.push(week);
      cursor = addDays(cursor, 7);
    }
    return result;
  }, [date]);

  // Group events by YYYY-MM-DD key for O(1) lookup per cell.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekdayCalendarEvent[]>();
    events.forEach((ev) => {
      const key = format(ev.start, 'yyyy-MM-dd');
      const list = map.get(key);
      if (list) {
        list.push(ev);
      } else {
        map.set(key, [ev]);
      }
    });
    // Stable sort within each day by start time then title
    // Stable sort within each day: custom comparator if supplied, otherwise
    // by start time then title.
    map.forEach((list) => {
      list.sort((a, b) => {
        if (sortEvents) return sortEvents(a, b);
        const t = a.start.getTime() - b.start.getTime();
        if (t !== 0) return t;
        return a.title.localeCompare(b.title);
      });
    });
    return map;
  }, [events, sortEvents]);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, event: WeekdayCalendarEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', event.id);
      // Stash the event id on the dataTransfer; we'll resolve to the actual
      // event from props on drop (state can't be read inline reliably).
      (e.dataTransfer as any)._eventId = event.id;
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dayKey) setDragOverDate(dayKey);
  }, [dragOverDate]);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, day: Date) => {
      e.preventDefault();
      setDragOverDate(null);
      const eventId = e.dataTransfer.getData('text/plain');
      if (!eventId) return;
      const ev = events.find((x) => x.id === eventId);
      if (!ev) return;
      // Skip if dropped on the same day
      if (isSameDay(ev.start, day)) return;
      onEventDrop?.({ event: ev, start: day, end: day });
    },
    [events, onEventDrop]
  );

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden"
      role="grid"
      aria-label="Weekday month calendar"
    >
      {/* Header row */}
      <div className="grid grid-cols-5 bg-muted border-b-2 border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-3 text-center text-sm font-semibold text-foreground"
            role="columnheader"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => (
        <div
          key={weekIdx}
          className="grid grid-cols-5 border-b border-border last:border-b-0"
          role="row"
        >
          {week.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const inMonth = isSameMonth(day, date);
            const isToday = isSameDay(day, new Date());
            const isDragOver = dragOverDate === dayKey;
            const dayProps = dayPropGetter?.(day) ?? {};

            return (
              <div
                key={dayKey}
                role="gridcell"
                onClick={() => onSelectSlot?.({ start: day })}
                onDragOver={(e) => handleDragOver(e, dayKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                className={cn(
                  'border-r border-border last:border-r-0 p-1.5 flex flex-col gap-1 cursor-pointer transition-colors',
                  !inMonth && 'bg-muted/30 text-muted-foreground',
                  isToday && 'bg-accent/40',
                  isDragOver && 'bg-accent ring-2 ring-primary ring-inset'
                )}
                style={{ minHeight: weekHeight, ...(dayProps.style ?? {}) }}
              >
                <div
                  className={cn(
                    'text-xs font-medium px-1 py-0.5',
                    isToday && 'text-primary font-bold',
                    !inMonth && 'opacity-60'
                  )}
                >
                  {format(day, 'd')}
                </div>

                <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
                  {dayEvents.map((ev) => {
                    const styleProps = eventPropGetter?.(ev) ?? {};
                    return (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ev)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent?.(ev);
                        }}
                        className={cn(
                          'rounded text-xs cursor-pointer transition-opacity hover:opacity-80 select-none',
                          styleProps.className
                        )}
                        style={styleProps.style}
                        title={ev.title}
                      >
                        {renderEvent ? renderEvent(ev) : (
                          <div className="px-1.5 py-0.5 truncate">{ev.title}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
