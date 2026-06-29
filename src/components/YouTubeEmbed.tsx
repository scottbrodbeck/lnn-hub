import { useState } from 'react';
import { Card } from './ui/card';
import { UrlInput } from './ui/url-input';
import { Label } from './ui/label';
import { Youtube } from 'lucide-react';

interface YouTubeEmbedProps {
  url: string;
  onChange: (url: string) => void;
  variant?: 'card' | 'inline';
}

export const YouTubeEmbed = ({ url, onChange, variant = 'card' }: YouTubeEmbedProps) => {
  const getYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const videoId = getYouTubeId(url);

  const content = (
    <div className="space-y-4">
      <div>
        <Label htmlFor="youtube-url">YouTube URL</Label>
        <UrlInput
          id="youtube-url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onValueChange={onChange}
          className="mt-1.5"
          skipValidation
        />
      </div>

      {videoId && (
        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video preview"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add a YouTube video to the bottom of your post
        </p>
        {content}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Youtube className="h-5 w-5 text-destructive" />
            YouTube Video Embed
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add a YouTube video to the bottom of your post
          </p>
        </div>
        {content}
      </div>
    </Card>
  );
};
