import { useState, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export function TagsInput({ value, onChange, placeholder = 'Type and press Enter' }: Props) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setDraft('');
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5 min-h-10">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1">
          {t}
          <button
            type="button"
            onClick={() => remove(t)}
            className="hover:text-destructive"
            aria-label={`Remove ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length === 0 ? placeholder : ''}
        className="border-0 focus-visible:ring-0 px-1 h-7 flex-1 min-w-[120px]"
      />
    </div>
  );
}
