import { useState, useCallback } from 'react';
import mammoth from 'mammoth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, FileUp, AlertCircle, CheckCircle } from 'lucide-react';

interface WordUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (html: string) => void;
}

type ProcessingStage = 'idle' | 'parsing' | 'uploading' | 'complete' | 'error';

interface ProcessingState {
  stage: ProcessingStage;
  currentImage: number;
  totalImages: number;
  message: string;
}

const getExtensionFromMime = (contentType: string): string => {
  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };
  return mimeMap[contentType] || 'png';
};

const cleanupHtml = (html: string): string => {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const paragraphs = temp.querySelectorAll('p');

  paragraphs.forEach((p) => {
    if (p.querySelector('img, video, iframe, table, ul, ol')) {
      return;
    }

    const normalizedText = (p.textContent ?? '').replace(/\u00A0/g, ' ').trim();

    if (normalizedText.length === 0) {
      p.remove();
    }
  });

  return temp.innerHTML;
};

export const WordUploadDialog = ({ open, onClose, onImport }: WordUploadDialogProps) => {
  const { activeOrganizationId, role } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processedHtml, setProcessedHtml] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingState>({
    stage: 'idle',
    currentImage: 0,
    totalImages: 0,
    message: '',
  });
  const [warnings, setWarnings] = useState<string[]>([]);

  const resetState = () => {
    setSelectedFile(null);
    setProcessedHtml(null);
    setProcessing({ stage: 'idle', currentImage: 0, totalImages: 0, message: '' });
    setWarnings([]);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const validateFile = (file: File): boolean => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const validExtensions = ['.docx'];

    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidType && !hasValidExtension) {
      toast.error('Please upload a .docx file (Word 2007 or later)');
      return false;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return false;
    }

    return true;
  };

  const processDocument = async (file: File) => {
    setProcessing({ stage: 'parsing', currentImage: 0, totalImages: 0, message: 'Parsing document...' });

    try {
      const arrayBuffer = await file.arrayBuffer();

      let imageCount = 0;
      await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(() => {
            imageCount++;
            return Promise.resolve({ src: '' });
          }),
        }
      );

      setProcessing((prev) => ({ ...prev, totalImages: imageCount }));

      let currentImageIndex = 0;
      const uploadedImages: string[] = [];

      const convertImage = mammoth.images.imgElement(async (image) => {
        currentImageIndex++;
        setProcessing({
          stage: 'uploading',
          currentImage: currentImageIndex,
          totalImages: imageCount,
          message: `Uploading image ${currentImageIndex} of ${imageCount}...`,
        });

        try {
          const base64 = await image.readAsBase64String();
          const dataUrl = `data:${image.contentType};base64,${base64}`;
          const extension = getExtensionFromMime(image.contentType);

          const { data, error } = await supabase.functions.invoke('process-and-store-image', {
            body: {
              imageData: dataUrl,
              filename: `word-image-${Date.now()}-${currentImageIndex}.${extension}`,
              organizationId: role === 'client' ? activeOrganizationId : null,
            },
          });

          if (error) throw error;

          if (data?.url) {
            uploadedImages.push(data.url);
            return { src: data.url };
          }

          throw new Error('No URL returned from image upload');
        } catch (err) {
          console.error('Image upload failed:', err);
          return { src: '', alt: '[Image upload failed]' };
        }
      });

      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { convertImage }
      );

      const mammothWarnings = result.messages
        .filter((m) => m.type === 'warning')
        .map((m) => m.message)
        .filter((msg) => !msg.includes('Unrecognised paragraph style') && !msg.includes('Unrecognized paragraph style'));

      setWarnings(mammothWarnings);
      const cleanedHtml = cleanupHtml(result.value);
      setProcessedHtml(cleanedHtml);
      setProcessing({
        stage: 'complete',
        currentImage: imageCount,
        totalImages: imageCount,
        message: `Processing complete! ${uploadedImages.length} image${uploadedImages.length !== 1 ? 's' : ''} uploaded.`,
      });
    } catch (err) {
      console.error('Document processing failed:', err);
      setProcessing({
        stage: 'error',
        currentImage: 0,
        totalImages: 0,
        message: 'Failed to process document. Please try again.',
      });
      toast.error('Failed to process Word document');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      processDocument(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      processDocument(file);
    }
  };

  const handleImport = () => {
    if (processedHtml) {
      onImport(processedHtml);
      handleClose();
      toast.success('Word document imported successfully');
    }
  };

  const getProgressPercent = (): number => {
    if (processing.stage === 'parsing') return 10;
    if (processing.stage === 'uploading' && processing.totalImages > 0) {
      return 10 + (processing.currentImage / processing.totalImages) * 80;
    }
    if (processing.stage === 'complete') return 100;
    return 0;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import Word Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedFile && (
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop a Word document here, or
              </p>
              <label className="cursor-pointer">
                <span className="text-primary hover:underline text-sm">browse files</span>
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Supports .docx files (Word 2007 and later)
              </p>
            </div>
          )}

          {selectedFile && processing.stage !== 'idle' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileUp className="h-4 w-4" />
                <span className="font-medium truncate">{selectedFile.name}</span>
              </div>

              <Progress value={getProgressPercent()} className="h-2" />

              <div className="flex items-center gap-2 text-sm">
                {processing.stage === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : processing.stage === 'complete' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
                <span className={processing.stage === 'error' ? 'text-destructive' : ''}>
                  {processing.message}
                </span>
              </div>

              {warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm">
                  <p className="font-medium text-yellow-800 mb-1">Conversion notes:</p>
                  <ul className="list-disc list-inside text-yellow-700 text-xs space-y-1">
                    {warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {warnings.length > 5 && (
                      <li>...and {warnings.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {processedHtml && processing.stage === 'complete' && (
                <div className="border rounded-md max-h-64 overflow-y-auto p-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Preview:</p>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: processedHtml }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {processing.stage === 'error' && (
            <Button variant="outline" onClick={resetState}>
              Try Again
            </Button>
          )}
          {processing.stage === 'complete' && processedHtml && (
            <Button onClick={handleImport}>
              Import Content
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
