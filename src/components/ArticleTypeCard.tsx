import { cn } from "@/lib/utils";
import type { ArticleType } from "@/lib/articleTypes";

interface ArticleTypeCardProps {
  articleType: ArticleType;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const ArticleTypeCard = ({ articleType, isSelected, onSelect }: ArticleTypeCardProps) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(articleType.id)}
      className={cn(
        "flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
        "hover:border-primary/50 hover:bg-muted/50",
        isSelected 
          ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
          : "border-border bg-background"
      )}
    >
      <span className="text-2xl mb-2">{articleType.icon}</span>
      <span className="font-medium text-sm">{articleType.label}</span>
      <span className="text-xs text-muted-foreground mt-1 line-clamp-2">
        {articleType.description}
      </span>
      <div className="mt-2">
        {isSelected ? (
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50" />
        )}
      </div>
    </button>
  );
};
