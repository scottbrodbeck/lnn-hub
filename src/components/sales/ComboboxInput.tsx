import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

/**
 * A free-text input with a dropdown of suggestions. Users may pick a
 * suggestion or type their own value.
 */
export function ComboboxInput({ value, onChange, options, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={cn('relative flex gap-2', className)}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Show suggestions"
            className="shrink-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <div className="max-h-64 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
