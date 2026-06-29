import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { UrlInput } from './ui/url-input';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Link2 } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface LinkPopoverProps {
  editor: Editor;
  isActive: boolean;
}

export const LinkPopover = ({ editor, isActive }: LinkPopoverProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      const previousUrl = editor.getAttributes('link').href || '';
      setUrl(previousUrl);
    }
  }, [isOpen, editor]);

  const handleSetLink = () => {
    if (!url) {
      editor.chain().focus().unsetLink().run();
      setIsOpen(false);
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();

    setIsOpen(false);
    setUrl('');
  };

  const handleRemoveLink = () => {
    editor.chain().focus().unsetLink().run();
    setIsOpen(false);
    setUrl('');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <UrlInput
              id="link-url"
              placeholder="https://example.com"
              value={url}
              onValueChange={setUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSetLink();
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSetLink}
              className="flex-1"
              size="sm"
            >
              {isActive ? 'Update Link' : 'Insert Link'}
            </Button>
            {isActive && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemoveLink}
                size="sm"
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
