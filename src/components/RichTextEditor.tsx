import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Strike from '@tiptap/extension-strike';
import { updateMediaLibraryCaption } from '@/lib/mediaLibraryApi';
import { Button } from './ui/button';
import { LinkPopover } from './LinkPopover';
import { ImageManagementDialog } from './ImageManagementDialog';
import { toast } from 'sonner';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Heading2,
  Heading3,
  ImageIcon,
  FileUp,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { WordUploadDialog } from './WordUploadDialog';
import { InlineImage } from './editor/InlineImage';
import { extractInlineImageAttrs, InlineImageAttrs } from './editor/inlineImageUtils';
import { transformPastedHtml } from './editor/transformPastedHtml';
import { InlineImagePickerDialog, type InlineImageSelection } from './editor/InlineImagePickerDialog';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const PASTE_MAX_FILE_SIZE = 10 * 1024 * 1024;
const PASTE_READY_TIMEOUT_MS = 60000;
const PASTE_READY_POLL_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const RichTextEditor = ({ content, onChange }: RichTextEditorProps) => {
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isImageManageDialogOpen, setIsImageManageDialogOpen] = useState(false);
  const [isWordDialogOpen, setIsWordDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<InlineImageAttrs | null>(null);
  const [selectedImagePos, setSelectedImagePos] = useState<number | null>(null);
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isInternalUpdate = useRef(false);
  const { uploadImage, getProcessedUrl } = useImageProcessing();

  const waitForProcessedUrl = useCallback(async (recordId: string, fallbackUrl: string) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < PASTE_READY_TIMEOUT_MS) {
      const { url, status } = await getProcessedUrl(recordId);
      if (status === 'ready') {
        return url || fallbackUrl;
      }
      await sleep(PASTE_READY_POLL_INTERVAL_MS);
    }

    throw new Error('Image processing timed out');
  }, [getProcessedUrl]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4, 5, 6],
        },
      }),
      Underline,
      Strike,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      InlineImage,
    ],
    content,
    shouldRerenderOnTransaction: true,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose lg:prose-lg xl:prose-xl min-h-[400px] max-w-none focus:outline-none [&_p]:mb-4 [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-lg [&_h4]:font-semibold [&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-0 [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-0 [&_ol]:pl-6 [&_li]:ml-4 [&_li]:pl-1 [&_ul_ul]:mt-1 [&_ul_ul]:list-circle [&_ol_ol]:mt-1 [&_ol_ol]:list-lower-alpha [&_figure]:mx-0 [&_figure]:my-6 [&_figure_img]:mb-0 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:italic [&_figcaption]:text-muted-foreground',
      },
      transformPastedHTML(html) {
        return transformPastedHtml(html, (removedImageCount) => {
          setTimeout(() => {
            toast.info(
              `${removedImageCount} embedded image${removedImageCount > 1 ? 's' : ''} couldn't be pasted. Please use the image button to add images.`
            );
          }, 100);
        });
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const hasHtmlContent = items.some((item) => item.type === 'text/html');
        const imageItems = items.filter((item) => item.type.startsWith('image/'));

        if (hasHtmlContent) {
          return false;
        }

        if (imageItems.length > 0) {
          event.preventDefault();

          (async () => {
            for (const item of imageItems) {
              const file = item.getAsFile();
              if (!file) continue;

              if (file.size > PASTE_MAX_FILE_SIZE) {
                toast.error('Image size must be less than 10MB');
                continue;
              }

              const loadingToast = toast.loading('Uploading pasted image...');

              try {
                const { tempUrl, recordId } = await uploadImage(file);
                const finalUrl = await waitForProcessedUrl(recordId, tempUrl);

                toast.dismiss(loadingToast);
                editor
                  ?.chain()
                  .focus()
                  .setInlineImage({
                    src: finalUrl,
                    alt: '',
                    caption: null,
                    recordId,
                    sourceUrl: tempUrl,
                    wpMediaId: null,
                    wpUrl: null,
                  })
                  .run();

                toast.success('Image pasted and inserted');
              } catch (pasteError) {
                console.error('Paste image error:', pasteError);
                toast.dismiss(loadingToast);
                toast.error('Failed to process pasted image');
              }
            }
          })();

          return true;
        }

        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentHTML = editor.getHTML();
      if (content !== currentHTML && !(content === '' && currentHTML === '<p></p>')) {
        editor.commands.setContent(content);
      }
    }
    isInternalUpdate.current = false;
  }, [content, editor]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!editor) return;

    const handleEditorDoubleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const figure = target.closest('figure[data-inline-image], figure[data-inline-image-node]') as HTMLElement | null;
      if (!figure) return;

      const attrs = extractInlineImageAttrs(figure);
      if (!attrs) return;

      const pos = editor.view.posAtDOM(figure, 0);

      editor.chain().focus().setNodeSelection(pos).run();
      setSelectedImage(attrs);
      setSelectedImagePos(pos);
      setIsReplacingImage(false);
      setIsImageManageDialogOpen(true);
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('dblclick', handleEditorDoubleClick);

    return () => {
      editorElement.removeEventListener('dblclick', handleEditorDoubleClick);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const selectInlineImageNode = () => {
    if (selectedImagePos === null) return false;
    return editor.chain().focus().setNodeSelection(selectedImagePos).run();
  };

  const handleImageInsert = ({ url, caption, recordId, sourceUrl, wpMediaId, wpUrl }: InlineImageSelection) => {
    const normalizedCaption = caption?.trim() || null;
    const normalizedSourceUrl = sourceUrl || url;
    const attrs: InlineImageAttrs = {
      src: wpUrl || normalizedSourceUrl,
      alt: normalizedCaption,
      caption: normalizedCaption,
      recordId: recordId || null,
      sourceUrl: normalizedSourceUrl,
      wpMediaId: typeof wpMediaId === 'number' ? wpMediaId : null,
      wpUrl: wpUrl || null,
    };

    if (isReplacingImage && selectedImagePos !== null) {
      selectInlineImageNode();
      editor.commands.updateInlineImage(attrs);
    } else {
      editor.chain().focus().setInlineImage(attrs).run();
    }

    setSelectedImage(attrs);
    setIsReplacingImage(false);
    setIsImageDialogOpen(false);
  };

  const handleImageRemove = () => {
    if (!selectInlineImageNode()) return;
    editor.chain().focus().deleteSelection().run();
    setIsImageManageDialogOpen(false);
    setSelectedImage(null);
    setSelectedImagePos(null);
  };

  const handleImageReplace = () => {
    setIsReplacingImage(true);
    setIsImageManageDialogOpen(false);
    setIsImageDialogOpen(true);
  };

  const handleImageSave = async (caption: string) => {
    if (!selectedImage) return;

    const normalizedCaption = caption.trim() || null;
    selectInlineImageNode();
    editor.commands.updateInlineImage({
      caption: normalizedCaption,
      alt: normalizedCaption,
    });

    try {
      await updateMediaLibraryCaption({
        recordId: selectedImage.recordId,
        imageUrl: selectedImage.src,
        caption: normalizedCaption,
      });
    } catch (error) {
      console.error('Failed to update image caption:', error);
      toast.error('Saved in article, but failed to update media library caption');
    }

    setSelectedImage({
      ...selectedImage,
      caption: normalizedCaption,
      alt: normalizedCaption,
    });
    setIsImageManageDialogOpen(false);
  };

  const handleWordImport = (html: string) => {
    editor.chain().focus().insertContent(html).run();
  };

  return (
    <>
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card',
          isFullscreen && 'fixed inset-0 z-40 flex h-dvh flex-col rounded-none border-0 bg-background'
        )}
      >
        <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-border bg-muted/30 p-2 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'bg-accent' : ''}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'bg-accent' : ''}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'bg-accent' : ''}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'bg-accent' : ''}
          >
            <Strikethrough className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading', { level: 2 }) ? 'bg-accent' : ''}
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive('heading', { level: 3 }) ? 'bg-accent' : ''}
          >
            <Heading3 className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'bg-accent' : ''}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'bg-accent' : ''}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive('blockquote') ? 'bg-accent' : ''}
          >
            <Quote className="h-4 w-4" />
          </Button>
          <LinkPopover editor={editor} isActive={editor.isActive('link')} />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsReplacingImage(false);
              setIsImageDialogOpen(true);
            }}
            className="h-8 w-8 p-0"
            title="Insert image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsWordDialogOpen(true)}
            className="h-8 w-8 p-0"
            title="Import Word (.docx)"
          >
            <FileUp className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo className="h-4 w-4" />
          </Button>

          <div className="ml-auto flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen((current) => !current)}
              className="h-8 w-8 p-0"
              title={isFullscreen ? 'Exit fullscreen editor' : 'Expand editor'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className={cn('p-4', isFullscreen && 'flex-1 overflow-y-auto')}>
          <EditorContent
            editor={editor}
            className={cn(isFullscreen && '[&_div.tiptap]:min-h-[calc(100dvh-5rem)]')}
          />
        </div>
      </div>

      <InlineImagePickerDialog
        open={isImageDialogOpen}
        onClose={() => {
          setIsImageDialogOpen(false);
          setIsReplacingImage(false);
        }}
        onSelectImage={handleImageInsert}
      />

      <ImageManagementDialog
        open={isImageManageDialogOpen}
        onClose={() => {
          setIsImageManageDialogOpen(false);
          setSelectedImage(null);
          setSelectedImagePos(null);
          setIsReplacingImage(false);
        }}
        imageUrl={selectedImage?.src || ''}
        caption={selectedImage?.caption || ''}
        onSave={handleImageSave}
        onRemove={handleImageRemove}
        onReplace={handleImageReplace}
      />

      <WordUploadDialog
        open={isWordDialogOpen}
        onClose={() => setIsWordDialogOpen(false)}
        onImport={handleWordImport}
      />
    </>
  );
};