import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { normalizeUrl } from '@/lib/urlUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  clickUrl: z.string().transform(normalizeUrl).pipe(z.string().url('Must be a valid URL').or(z.literal(''))),
});

type FormValues = z.infer<typeof formSchema>;

interface EditAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad: {
    id: string;
    name: string;
    clickUrl?: string;
    imageUrl: string;
    width: number;
    height: number;
    type: 'billboard' | 'skyscraper';
  } | null;
  onUpdateAd: (data: {
    adId: string;
    name?: string;
    clickUrl?: string;
  }) => Promise<void>;
}

export function EditAdDialog({
  open,
  onOpenChange,
  ad,
  onUpdateAd,
}: EditAdDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      clickUrl: '',
    },
  });

  // Reset form when ad changes
  useEffect(() => {
    if (ad) {
      form.reset({
        name: ad.name,
        clickUrl: ad.clickUrl || '',
      });
    }
  }, [ad, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!ad) return;

    setIsSubmitting(true);
    
    try {
      await onUpdateAd({
        adId: ad.id,
        name: values.name !== ad.name ? values.name : undefined,
        clickUrl: values.clickUrl !== ad.clickUrl ? values.clickUrl : undefined,
      });
      
      onOpenChange(false);
      
      toast({
        title: 'Ad updated',
        description: `"${values.name}" has been updated successfully`,
      });
    } catch (error) {
      console.error('Error updating ad:', error);
      toast({
        title: 'Failed to update ad',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (!newOpen) {
        form.reset();
      }
      onOpenChange(newOpen);
    }
  };

  if (!ad) return null;

  const dimensions = `${ad.width}×${ad.height}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Display Ad</DialogTitle>
          <DialogDescription>
            Update the name or click URL for this ad.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Ad Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ad Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Summer Sale Billboard"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ad Type (read-only) */}
            <div className="space-y-2">
              <FormLabel>Ad Type</FormLabel>
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
                <span className="text-sm">
                  {ad.type === 'billboard' ? 'Billboard' : 'Skyscraper'} ({dimensions})
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ad type cannot be changed after creation
              </p>
            </div>

            {/* Current Image (read-only) */}
            <div className="space-y-2">
              <FormLabel>Creative Image</FormLabel>
              <div className="relative rounded-lg border bg-muted overflow-hidden">
                <img
                  src={ad.imageUrl}
                  alt={ad.name}
                  className="w-full h-auto max-h-48 object-contain"
                />
              </div>
            </div>

            {/* Click URL */}
            <FormField
              control={form.control}
              name="clickUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Click URL</FormLabel>
                  <FormControl>
                    <UrlInput
                      placeholder="https://example.com/landing-page"
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Where users will be directed when they click the ad
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
