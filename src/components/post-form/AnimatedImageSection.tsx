import { Film } from 'lucide-react';
import { AnimatedImageUpload, AnimatedImage } from '@/components/AnimatedImageUpload';
import { CollapsibleSection } from './CollapsibleSection';

interface AnimatedImageSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  animatedImage: AnimatedImage | null;
  onAnimatedImageChange: (image: AnimatedImage | null) => void;
}

export function AnimatedImageSection({
  isOpen,
  onOpenChange,
  animatedImage,
  onAnimatedImageChange,
}: AnimatedImageSectionProps) {
  return (
    <CollapsibleSection
      icon={Film}
      title="Animated Featured Image"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={!!animatedImage}
    >
      <AnimatedImageUpload
        animatedImage={animatedImage}
        onAnimatedImageChange={onAnimatedImageChange}
      />
    </CollapsibleSection>
  );
}
