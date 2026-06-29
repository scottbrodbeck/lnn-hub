import { ARTICLE_TYPES } from "@/lib/articleTypes";
import { ArticleTypeCard } from "./ArticleTypeCard";

interface ArticleTypeGridProps {
  selectedType: string | null;
  onSelectType: (id: string) => void;
}

export const ArticleTypeGrid = ({ selectedType, onSelectType }: ArticleTypeGridProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ARTICLE_TYPES.map((articleType) => (
        <ArticleTypeCard
          key={articleType.id}
          articleType={articleType}
          isSelected={selectedType === articleType.id}
          onSelect={onSelectType}
        />
      ))}
    </div>
  );
};
