import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProcessedImage } from '@/components/ImageUpload';
import { toast } from 'sonner';

interface ColumnTemplate {
  id: string;
  name: string;
  logo_url: string | null;
  logo_link_url: string | null;
  logo_author_name: string | null;
  author_name: string | null;
  banner_image_url: string | null;
  intro_paragraph: string | null;
  featured_image_url: string | null;
  footer_paragraph: string | null;
}

interface ApplyTemplateCallbacks<T = any> {
  setLogoUrl: (url: string | null) => void;
  setLogoLinkUrl: (url: string | null) => void;
  setByline: (name: string) => void;
  setContent: (content: string) => void;
  setImages: (updater: (prev: ProcessedImage[]) => ProcessedImage[]) => void;
  setOpenSections: (updater: (prev: T) => T) => void;
  currentContent: string;
}

export function useColumnTemplates(organizationId: string | null) {
  const [columnTemplates, setColumnTemplates] = useState<ColumnTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (organizationId) {
      fetchColumnTemplates();
    } else {
      setColumnTemplates([]);
    }
  }, [organizationId]);

  const fetchColumnTemplates = async () => {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('column_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setColumnTemplates(data || []);
    } catch (error) {
      console.error('Error fetching column templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyTemplate = useCallback((
    template: ColumnTemplate,
    callbacks: ApplyTemplateCallbacks
  ) => {
    const { 
      setLogoUrl, 
      setLogoLinkUrl, 
      setByline, 
      setContent, 
      setImages, 
      setOpenSections,
      currentContent 
    } = callbacks;

    if (template.logo_url) {
      setLogoUrl(template.logo_url);
      setLogoLinkUrl(template.logo_link_url || null);
      setOpenSections(prev => ({ ...prev, logo: true }));
    }

    if (template.logo_author_name) {
      setByline(template.logo_author_name);
    }

    let prependContent = '';
    
    if (template.banner_image_url) {
      prependContent += `<figure class="banner-container">\n  <img src="${template.banner_image_url}" alt="" class="w-full" />\n</figure>\n\n`;
    }
    
    if (template.intro_paragraph) {
      // Remove line breaks and paragraph tags, then wrap in em for italics
      let cleanedIntro = template.intro_paragraph
        .replace(/<\/p>\s*<p>/gi, ' ')  // Paragraph breaks → space
        .replace(/<br\s*\/?>/gi, ' ')    // BR tags → space
        .replace(/<p>/gi, '')            // Opening p tags
        .replace(/<\/p>/gi, '');         // Closing p tags
      
      prependContent += `<p><em>${cleanedIntro}</em></p>\n\n`;
      // Add plain text placeholder to break italic formatting
      prependContent += `<p>[Insert article here]</p>\n\n`;
    }

    let appendContent = '';
    if (template.footer_paragraph) {
      let cleanedFooter = template.footer_paragraph
        .replace(/<\/p>\s*<p>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, '');
      appendContent = `\n\n<p><em>${cleanedFooter}</em></p>`;
    }

    if (prependContent || appendContent) {
      setContent(prependContent + currentContent + appendContent);
    }

    if (template.featured_image_url) {
      const newImage: ProcessedImage = {
        id: crypto.randomUUID(),
        originalUrl: template.featured_image_url,
        processedUrl: template.featured_image_url,
        isFeatured: true,
      };
      setImages(prev => [newImage, ...prev.map(img => ({ ...img, isFeatured: false }))]);
    }

    toast.success(`Template "${template.name}" applied`);
  }, []);

  return {
    columnTemplates,
    isLoading,
    applyTemplate,
    refetch: fetchColumnTemplates,
  };
}
