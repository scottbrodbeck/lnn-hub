import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, MessageSquare, Image, Download } from "lucide-react";

// Download helper
const handleImageDownload = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
};

interface RequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string | null;
  type?: 'text' | 'design_specs';
  designSpecs?: {
    // camelCase (expected)
    adCopy?: string;
    visualDirection?: string;
    clickUrl?: string;
    dimensions?: string;
    referenceLinks?: string;
    // snake_case (database format)
    ad_copy?: string;
    visual_direction?: string;
    click_url?: string;
    ad_dimensions?: string;
    reference_links?: string;
    ad_size?: string;
  } | null;
  images?: string[];
}

export function RequestDetailDialog({
  open,
  onOpenChange,
  title,
  content,
  type = 'text',
  designSpecs,
  images,
}: RequestDetailDialogProps) {
  // Helper to get value from either camelCase or snake_case format
  const adCopy = designSpecs?.adCopy || designSpecs?.ad_copy;
  const visualDirection = designSpecs?.visualDirection || designSpecs?.visual_direction;
  const clickUrl = designSpecs?.clickUrl || designSpecs?.click_url;
  const dimensions = designSpecs?.dimensions || designSpecs?.ad_dimensions || designSpecs?.ad_size;
  const referenceLinks = designSpecs?.referenceLinks || designSpecs?.reference_links;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
          {type === 'text' && content && (
            <div className="whitespace-pre-wrap text-sm">{content}</div>
          )}

          {type === 'design_specs' && designSpecs && (
            <div className="space-y-4">
              {adCopy && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Ad Copy / Text</Label>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{adCopy}</p>
                </div>
              )}
              {visualDirection && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Visual Direction</Label>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{visualDirection}</p>
                </div>
              )}
              {clickUrl && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Click URL</Label>
                  <a 
                    href={clickUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {clickUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {dimensions && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Dimensions</Label>
                  <p className="text-sm">{dimensions}</p>
                </div>
              )}
              {referenceLinks && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Reference Links</Label>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{referenceLinks}</p>
                </div>
              )}
            </div>
          )}

          {images && images.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Image className="h-4 w-4" />
                Attached Images
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {images.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`Attachment ${idx + 1}`}
                        className="w-full h-auto rounded-lg border hover:opacity-80 transition-opacity"
                      />
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageDownload(url, `attachment-${idx + 1}.jpg`);
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
