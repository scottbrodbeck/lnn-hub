import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const InlineImageNodeView = ({ node, selected }: NodeViewProps) => {
  const { src, alt, caption, wpMediaId } = node.attrs as {
    src: string;
    alt?: string | null;
    caption?: string | null;
    wpMediaId?: number | null;
  };

  return (
    <NodeViewWrapper
      as="figure"
      data-inline-image-node="true"
      className={cn(
        'my-6 overflow-hidden rounded-lg border bg-card',
        selected ? 'border-ring shadow-sm ring-2 ring-ring/40 ring-offset-2 ring-offset-background' : 'border-border'
      )}
    >
      <img
        src={src}
        alt={alt || caption || ''}
        className="m-0 w-full rounded-none object-cover"
        draggable={false}
        contentEditable={false}
      />
      <div className="space-y-2 px-3 py-3" contentEditable={false}>
        {caption ? (
          <figcaption className="text-sm italic text-muted-foreground">{caption}</figcaption>
        ) : (
          <p className="text-sm text-muted-foreground">Add a caption from the image editor.</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Double-click to edit</span>
          <Badge variant={wpMediaId ? 'secondary' : 'outline'}>
            {wpMediaId ? 'WordPress linked' : 'Not published yet'}
          </Badge>
        </div>
      </div>
    </NodeViewWrapper>
  );
};
