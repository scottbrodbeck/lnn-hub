import { AnimatedImage } from '@/components/AnimatedImageUpload';
import { OpenSections } from '@/hooks/usePostFormState';
import { LogoSection } from './LogoSection';
import { AnimatedImageSection } from './AnimatedImageSection';
import { YouTubeSection } from './YouTubeSection';
import { PollSection } from './PollSection';
import { CTASection } from './CTASection';
import { CommentsSection } from './CommentsSection';
import { AuthorBioSection } from './AuthorBioSection';
import { Sponsor } from '@/hooks/useSponsors';

interface PostOptionalElementsProps {
  openSections: OpenSections;
  onOpenSectionsChange: (sections: OpenSections | ((prev: OpenSections) => OpenSections)) => void;
  
  // Logo
  logoUrl: string | null;
  logoLinkUrl: string | null;
  byline: string;
  onLogoChange: (url: string | null) => void;
  onLogoLinkChange: (url: string | null) => void;
  onBylineChange: (byline: string) => void;
  
  // Sponsor
  sponsors?: Sponsor[];
  selectedSponsorId?: string | null;
  onSponsorSelect?: (sponsorId: string | null) => void;
  onSponsorCreated?: (sponsor: Sponsor) => void;
  organizationId?: string | null;
  userId?: string;
  isLoadingSponsors?: boolean;
  createSponsor?: (data: {
    organization_id: string;
    name: string;
    logo_url: string;
    link_url: string | null;
    created_by?: string;
  }) => Promise<Sponsor | null>;
  
  // Animated Image
  animatedFeaturedImage: AnimatedImage | null;
  onAnimatedFeaturedImageChange: (image: AnimatedImage | null) => void;
  
  // YouTube
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
  
  // Poll
  pollQuestion: string;
  pollOptions: string[];
  onPollQuestionChange: (question: string) => void;
  onPollOptionsChange: (options: string[]) => void;
  onRemovePoll: () => void;
  isDeletingPoll?: boolean;
  
  // CTA
  ctaButtonText: string;
  ctaButtonUrl: string;
  onCtaButtonTextChange: (text: string) => void;
  onCtaButtonUrlChange: (url: string) => void;
  
  // Comments
  commentsEnabled: boolean;
  onCommentsEnabledChange: (enabled: boolean) => void;
  commentsSwitchId?: string;
  
  // Author Bio
  authorName?: string;
  authorBio?: string;
  authorPhotoUrl?: string | null;
  onAuthorNameChange?: (name: string) => void;
  onAuthorBioChange?: (bio: string) => void;
  onAuthorPhotoChange?: (url: string | null) => void;
  showSettingsLinks?: boolean;
  hasAuthorBioDefaultSet?: boolean;
  onRefreshAuthorBioDefaults?: () => void;
}

export function PostOptionalElements({
  openSections,
  onOpenSectionsChange,
  logoUrl,
  logoLinkUrl,
  byline,
  onLogoChange,
  onLogoLinkChange,
  onBylineChange,
  sponsors,
  selectedSponsorId,
  onSponsorSelect,
  onSponsorCreated,
  organizationId,
  userId,
  isLoadingSponsors,
  createSponsor,
  animatedFeaturedImage,
  onAnimatedFeaturedImageChange,
  youtubeUrl,
  onYoutubeUrlChange,
  pollQuestion,
  pollOptions,
  onPollQuestionChange,
  onPollOptionsChange,
  onRemovePoll,
  isDeletingPoll = false,
  ctaButtonText,
  ctaButtonUrl,
  onCtaButtonTextChange,
  onCtaButtonUrlChange,
  commentsEnabled,
  onCommentsEnabledChange,
  commentsSwitchId = 'enable-comments',
  authorName = '',
  authorBio = '',
  authorPhotoUrl = null,
  onAuthorNameChange,
  onAuthorBioChange,
  onAuthorPhotoChange,
  showSettingsLinks = false,
  hasAuthorBioDefaultSet = false,
  onRefreshAuthorBioDefaults,
}: PostOptionalElementsProps) {
  const handleSectionChange = (section: keyof OpenSections) => (open: boolean) => {
    onOpenSectionsChange(prev => ({ ...prev, [section]: open }));
  };

  return (
    <div className="border border-border rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">
        Optional Elements
      </h3>
      
      <div className="space-y-3">
        <LogoSection
          isOpen={openSections.logo}
          onOpenChange={handleSectionChange('logo')}
          logoUrl={logoUrl}
          logoLinkUrl={logoLinkUrl}
          byline={byline}
          onLogoChange={onLogoChange}
          onLogoLinkChange={onLogoLinkChange}
          onBylineChange={onBylineChange}
          showSettingsLink={showSettingsLinks}
          sponsors={sponsors}
          selectedSponsorId={selectedSponsorId}
          onSponsorSelect={onSponsorSelect}
          onSponsorCreated={onSponsorCreated}
          organizationId={organizationId}
          userId={userId}
          isLoadingSponsors={isLoadingSponsors}
          createSponsor={createSponsor}
        />

        <AnimatedImageSection
          isOpen={openSections.animatedImage}
          onOpenChange={handleSectionChange('animatedImage')}
          animatedImage={animatedFeaturedImage}
          onAnimatedImageChange={onAnimatedFeaturedImageChange}
        />

        <YouTubeSection
          isOpen={openSections.youtube}
          onOpenChange={handleSectionChange('youtube')}
          youtubeUrl={youtubeUrl}
          onYoutubeUrlChange={onYoutubeUrlChange}
        />

        <PollSection
          isOpen={openSections.poll}
          onOpenChange={handleSectionChange('poll')}
          question={pollQuestion}
          options={pollOptions}
          onQuestionChange={onPollQuestionChange}
          onOptionsChange={onPollOptionsChange}
          onRemovePoll={onRemovePoll}
          isDeletingPoll={isDeletingPoll}
        />

        <CTASection
          isOpen={openSections.cta}
          onOpenChange={handleSectionChange('cta')}
          buttonText={ctaButtonText}
          buttonUrl={ctaButtonUrl}
          onButtonTextChange={onCtaButtonTextChange}
          onButtonUrlChange={onCtaButtonUrlChange}
        />

        <CommentsSection
          isOpen={openSections.comments}
          onOpenChange={handleSectionChange('comments')}
          commentsEnabled={commentsEnabled}
          onCommentsEnabledChange={onCommentsEnabledChange}
          switchId={commentsSwitchId}
        />

        {onAuthorNameChange && onAuthorBioChange && onAuthorPhotoChange && (
          <AuthorBioSection
            isOpen={openSections.authorBio}
            onOpenChange={handleSectionChange('authorBio')}
            authorName={authorName}
            authorBio={authorBio}
            authorPhotoUrl={authorPhotoUrl}
            onAuthorNameChange={onAuthorNameChange}
            onAuthorBioChange={onAuthorBioChange}
            onAuthorPhotoChange={onAuthorPhotoChange}
            showSettingsLink={showSettingsLinks}
            hasDefaultSet={hasAuthorBioDefaultSet}
            onRefreshDefaults={onRefreshAuthorBioDefaults}
          />
        )}
      </div>
    </div>
  );
}
