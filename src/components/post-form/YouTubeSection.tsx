import { Youtube } from 'lucide-react';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import { CollapsibleSection } from './CollapsibleSection';

interface YouTubeSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
}

export function YouTubeSection({
  isOpen,
  onOpenChange,
  youtubeUrl,
  onYoutubeUrlChange,
}: YouTubeSectionProps) {
  return (
    <CollapsibleSection
      icon={Youtube}
      title="YouTube Video Embed"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={!!youtubeUrl}
    >
      <YouTubeEmbed variant="inline" url={youtubeUrl} onChange={onYoutubeUrlChange} />
    </CollapsibleSection>
  );
}
