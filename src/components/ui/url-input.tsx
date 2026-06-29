import * as React from 'react';
import { Input } from './input';
import { normalizeUrl, checkUrl404 } from '@/lib/urlUtils';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UrlInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'type'> {
  /** Called with the (possibly normalized) value */
  onValueChange: (value: string) => void;
  /** Current value */
  value: string;
  /** Skip the 404 check on blur */
  skipValidation?: boolean;
}

const UrlInput = React.forwardRef<HTMLInputElement, UrlInputProps>(
  ({ onValueChange, value, skipValidation, className, onBlur, ...props }, ref) => {
    const [is404, setIs404] = React.useState(false);
    const [isChecking, setIsChecking] = React.useState(false);
    const lastCheckedUrl = React.useRef('');

    const handleBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
      onBlur?.(e);

      const normalized = normalizeUrl(value);
      if (normalized !== value) {
        onValueChange(normalized);
      }

      // 404 check
      const urlToCheck = normalized || value;
      if (!urlToCheck || skipValidation || lastCheckedUrl.current === urlToCheck) return;

      // Only check URLs that look valid
      try {
        new URL(urlToCheck);
      } catch {
        return;
      }

      lastCheckedUrl.current = urlToCheck;
      setIs404(false);
      setIsChecking(true);
      try {
        const result = await checkUrl404(urlToCheck);
        setIs404(result);
      } finally {
        setIsChecking(false);
      }
    };

    // Reset 404 state when value changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setIs404(false);
      onValueChange(e.target.value);
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="url"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(is404 && 'border-yellow-500', className)}
          {...props}
        />
        {isChecking && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {is404 && !isChecking && (
          <div className="flex items-center gap-1 mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-3 w-3" />
            <span>This URL returned a 404 error</span>
          </div>
        )}
      </div>
    );
  }
);
UrlInput.displayName = 'UrlInput';

export { UrlInput };
