import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LogoUpload } from '@/components/LogoUpload';
import { SimpleRichTextEditor, countWordsFromHtml } from '@/components/SimpleRichTextEditor';
import { SingleImageUpload } from '@/components/SingleImageUpload';

interface ColumnTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingTemplate?: {
    id: string;
    organization_id: string;
    name: string;
    logo_url: string | null;
    logo_link_url?: string | null;
    logo_author_name?: string | null;
    banner_image_url: string | null;
    intro_paragraph: string | null;
    footer_paragraph: string | null;
    featured_image_url: string | null;
    is_active: boolean;
  } | null;
  organizations: Array<{ id: string; name: string }>;
}

export function ColumnTemplateDialog({ 
  open, 
  onOpenChange, 
  onSuccess, 
  editingTemplate,
  organizations
}: ColumnTemplateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    organization_id: '',
    logo_url: null as string | null,
    logo_link_url: null as string | null,
    logo_author_name: '',
    banner_image_url: null as string | null,
    intro_paragraph: '',
    footer_paragraph: '',
    featured_image_url: null as string | null,
    is_active: true,
  });

  useEffect(() => {
    if (editingTemplate) {
      setFormData({
        name: editingTemplate.name,
        organization_id: editingTemplate.organization_id,
        logo_url: editingTemplate.logo_url,
        logo_link_url: editingTemplate.logo_link_url || null,
        logo_author_name: editingTemplate.logo_author_name || '',
        banner_image_url: editingTemplate.banner_image_url,
        intro_paragraph: editingTemplate.intro_paragraph || '',
        footer_paragraph: editingTemplate.footer_paragraph || '',
        featured_image_url: editingTemplate.featured_image_url,
        is_active: editingTemplate.is_active,
      });
    } else {
      setFormData({
        name: '',
        organization_id: organizations.length === 1 ? organizations[0].id : '',
        logo_url: null,
        logo_link_url: null,
        logo_author_name: '',
        banner_image_url: null,
        intro_paragraph: '',
        footer_paragraph: '',
        featured_image_url: null,
        is_active: true,
      });
    }
  }, [editingTemplate, open, organizations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.organization_id) {
      toast.error('Please select an organization');
      return;
    }

    // Validate intro paragraph word count
    const introWordCount = countWordsFromHtml(formData.intro_paragraph);
    if (introWordCount > 75) {
      toast.error(`Intro paragraph exceeds 75 words (currently ${introWordCount})`);
      return;
    }

    // Validate footer paragraph word count
    const footerWordCount = countWordsFromHtml(formData.footer_paragraph);
    if (footerWordCount > 75) {
      toast.error(`Footer paragraph exceeds 75 words (currently ${footerWordCount})`);
      return;
    }
    
    setLoading(true);

    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const templateData = {
        name: formData.name,
        organization_id: formData.organization_id,
        logo_url: formData.logo_url || null,
        logo_link_url: formData.logo_link_url || null,
        logo_author_name: formData.logo_author_name || null,
        banner_image_url: formData.banner_image_url || null,
        intro_paragraph: formData.intro_paragraph || null,
        footer_paragraph: formData.footer_paragraph || null,
        featured_image_url: formData.featured_image_url || null,
        is_active: formData.is_active,
        created_by: currentUser.user?.id,
      };

      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('column_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Template updated successfully');
      } else {
        // Create new template
        const { error } = await supabase
          .from('column_templates')
          .insert(templateData);

        if (error) throw error;
        toast.success('Template created successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to save template:', error);
      toast.error(error.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingTemplate ? 'Edit Column Template' : 'Add New Column Template'}
          </DialogTitle>
          <DialogDescription>
            {editingTemplate 
              ? 'Update the template details below. All fields are optional except name and organization.' 
              : 'Create a reusable template for column posts. All fields are optional except name and organization.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Column"
                required
              />
            </div>

            {organizations.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <Select
                  value={formData.organization_id}
                  onValueChange={(value) => setFormData({ ...formData, organization_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="logo_author_name">Organization Name</Label>
              <p className="text-sm text-muted-foreground">Text displayed above the logo</p>
              <Input
                id="logo_author_name"
                value={formData.logo_author_name}
                onChange={(e) => setFormData({ ...formData, logo_author_name: e.target.value })}
                placeholder="ABC Example Corp."
              />
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <LogoUpload 
                logoUrl={formData.logo_url} 
                onLogoChange={(url) => setFormData({ ...formData, logo_url: url })}
                logoLinkUrl={formData.logo_link_url}
                onLogoLinkChange={(url) => setFormData({ ...formData, logo_link_url: url })}
                variant="inline"
              />
            </div>

            <div className="space-y-2">
              <Label>Banner Image</Label>
              <p className="text-sm text-muted-foreground">Graphical banner at top of article</p>
              <SingleImageUpload
                imageUrl={formData.banner_image_url}
                onImageChange={(url) => setFormData({ ...formData, banner_image_url: url })}
                aspectRatio="banner"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="intro_paragraph">Intro Paragraph</Label>
              <p className="text-sm text-muted-foreground">
                Italicized text below banner. Max 75 words. Supports bold and links.
              </p>
              <SimpleRichTextEditor
                content={formData.intro_paragraph}
                onChange={(content) => setFormData({ ...formData, intro_paragraph: content })}
                maxWords={75}
                placeholder="Enter introductory paragraph..."
                minHeight="120px"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer_paragraph">Footer Paragraph</Label>
              <p className="text-sm text-muted-foreground">
                Italicized text appended after article content. Max 75 words. Supports bold and links.
              </p>
              <SimpleRichTextEditor
                content={formData.footer_paragraph}
                onChange={(content) => setFormData({ ...formData, footer_paragraph: content })}
                maxWords={75}
                placeholder="Enter footer paragraph..."
                minHeight="120px"
              />
            </div>

            <div className="space-y-2">
              <Label>Featured Image</Label>
              <p className="text-sm text-muted-foreground">Used for social media previews</p>
              <SingleImageUpload
                imageUrl={formData.featured_image_url}
                onImageChange={(url) => setFormData({ ...formData, featured_image_url: url })}
                aspectRatio="auto"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active Status</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
