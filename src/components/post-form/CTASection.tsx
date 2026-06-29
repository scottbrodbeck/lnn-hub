import { MousePointerClick } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { CollapsibleSection } from './CollapsibleSection';

interface CTASectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  buttonText: string;
  buttonUrl: string;
  onButtonTextChange: (text: string) => void;
  onButtonUrlChange: (url: string) => void;
}

export function CTASection({
  isOpen,
  onOpenChange,
  buttonText,
  buttonUrl,
  onButtonTextChange,
  onButtonUrlChange,
}: CTASectionProps) {
  return (
    <CollapsibleSection
      icon={MousePointerClick}
      title="Call-to-Action Button"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={!!(buttonText && buttonUrl)}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add a clickable button at the end of your post to drive specific actions
        </p>
        
        <div>
          <Label htmlFor="cta-text" className="text-sm font-medium text-foreground">
            Button Text
          </Label>
          <Input
            id="cta-text"
            value={buttonText}
            onChange={(e) => onButtonTextChange(e.target.value.slice(0, 20))}
            placeholder="e.g., Learn More, Contact Us"
            className="mt-1.5"
            maxLength={20}
          />
          <div className="mt-1 text-xs text-muted-foreground text-right">
            {buttonText.length}/20 characters
          </div>
        </div>

        <div>
          <Label htmlFor="cta-url" className="text-sm font-medium text-foreground">
            Click-Through URL
          </Label>
          <UrlInput
            id="cta-url"
            value={buttonUrl}
            onValueChange={onButtonUrlChange}
            placeholder="https://example.com"
            className="mt-1.5"
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}
