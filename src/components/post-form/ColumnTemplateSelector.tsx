import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText } from 'lucide-react';

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

interface ColumnTemplateSelectorProps {
  templates: ColumnTemplate[];
  onApplyTemplate: (template: ColumnTemplate) => void;
  className?: string;
}

export function ColumnTemplateSelector({
  templates,
  onApplyTemplate,
  className = '',
}: ColumnTemplateSelectorProps) {
  if (templates.length === 0) {
    return null;
  }

  if (templates.length === 1) {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={() => onApplyTemplate(templates[0])}
        className={`flex-1 border-2 ${className}`}
      >
        <FileText className="mr-2 h-5 w-5" />
        Use Column Template
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={`flex-1 border-2 ${className}`}
        >
          <FileText className="mr-2 h-5 w-5" />
          Use Column Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onClick={() => onApplyTemplate(template)}
          >
            {template.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
