import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { normalizeUrl } from '@/lib/urlUtils';
import { Bold as BoldIcon, Italic as ItalicIcon, Link as LinkIcon, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SimpleRichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  maxWords?: number;
  placeholder?: string;
  minHeight?: string;
  enableItalic?: boolean;
  enableBulletList?: boolean;
  enableOrderedList?: boolean;
  hideWordCount?: boolean;
}

// Helper to count words from HTML content
export function countWordsFromHtml(html: string): number {
  if (!html) return 0;
  // Strip HTML tags
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  // Split on whitespace and filter empty strings
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

export function SimpleRichTextEditor({ 
  content, 
  onChange, 
  maxWords = 50,
  placeholder = 'Enter text...',
  minHeight = '60px',
  enableItalic = false,
  enableBulletList = false,
  enableOrderedList = false,
  hideWordCount = false,
}: SimpleRichTextEditorProps) {
  const isInternalUpdate = useRef(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      ...(enableItalic ? [Italic] : []),
      ...((enableBulletList || enableOrderedList) ? [ListItem] : []),
      ...(enableBulletList ? [BulletList] : []),
      ...(enableOrderedList ? [OrderedList] : []),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none p-3 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_li>p]:my-0',
        style: `min-height: ${minHeight}`,
      },
      // Prevent Enter key from creating new paragraphs (unless bullet list is enabled)
      handleKeyDown: (enableBulletList || enableOrderedList) ? undefined : (view, event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML();
      if (content !== currentContent) {
        editor.commands.setContent(content);
      }
    }
    isInternalUpdate.current = false;
  }, [content, editor]);

  const wordCount = countWordsFromHtml(content);
  const isOverLimit = wordCount > maxWords;

  const handleSetLink = () => {
    if (!editor) return;
    
    if (linkUrl) {
      const normalized = normalizeUrl(linkUrl);
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const handleLinkButtonClick = () => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkInput(true);
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('bold') && "bg-accent"
          )}
        >
          <BoldIcon className="h-4 w-4" />
        </Button>
        {enableItalic && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('italic') && "bg-accent"
            )}
          >
            <ItalicIcon className="h-4 w-4" />
          </Button>
        )}
        {enableBulletList && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('bulletList') && "bg-accent"
            )}
          >
            <List className="h-4 w-4" />
          </Button>
        )}
        {enableOrderedList && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('orderedList') && "bg-accent"
            )}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleLinkButtonClick}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('link') && "bg-accent"
          )}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        
        {showLinkInput && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 px-2 text-sm border rounded bg-background"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSetLink();
                }
                if (e.key === 'Escape') {
                  setShowLinkInput(false);
                }
              }}
              autoFocus
            />
            <Button type="button" size="sm" variant="secondary" onClick={handleSetLink} className="h-8">
              Set
            </Button>
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              onClick={() => setShowLinkInput(false)}
              className="h-8"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
      
      {/* Editor */}
      <EditorContent editor={editor} />
      
      {/* Word count */}
      {!hideWordCount && (
        <div className={cn(
          "text-xs px-3 py-1 border-t text-right",
          isOverLimit ? "text-destructive" : "text-muted-foreground"
        )}>
          {wordCount} / {maxWords} words
        </div>
      )}
    </div>
  );
}
