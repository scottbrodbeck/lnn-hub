import { useState } from 'react';
import { Upload, Settings, X } from 'lucide-react';
import { LogoUpload } from '@/components/LogoUpload';
import { SponsorSelector } from '@/components/SponsorSelector';
import { SponsorManagementDialog } from '@/components/SponsorManagementDialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from './CollapsibleSection';
import { Sponsor } from '@/hooks/useSponsors';
import { UrlInput } from '@/components/ui/url-input';

interface LogoSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  logoUrl: string | null;
  logoLinkUrl: string | null;
  byline: string;
  onLogoChange: (url: string | null) => void;
  onLogoLinkChange: (url: string | null) => void;
  onBylineChange: (byline: string) => void;
  showSettingsLink?: boolean;
  // Sponsor support
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
}

export function LogoSection({
  isOpen,
  onOpenChange,
  logoUrl,
  logoLinkUrl,
  byline,
  onLogoChange,
  onLogoLinkChange,
  onBylineChange,
  showSettingsLink = false,
  sponsors = [],
  selectedSponsorId = null,
  onSponsorSelect,
  onSponsorCreated,
  organizationId,
  userId,
  isLoadingSponsors = false,
  createSponsor,
}: LogoSectionProps) {
  const isComplete = !!(logoUrl || byline || selectedSponsorId);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // When a sponsor is selected, populate the fields
  const handleSponsorSelect = (sponsorId: string | null) => {
    if (!onSponsorSelect) return;
    onSponsorSelect(sponsorId);
    
    if (sponsorId) {
      const sponsor = sponsors.find(s => s.id === sponsorId);
      if (sponsor) {
        onLogoChange(sponsor.logo_url);
        onLogoLinkChange(sponsor.link_url);
        onBylineChange(sponsor.name);
        setManualMode(false);
      }
    } else {
      // Clear fields when deselecting
      onLogoChange(null);
      onLogoLinkChange(null);
      onBylineChange('');
      setManualMode(false);
    }
  };

  const handleCreateNew = () => {
    if (createSponsor && organizationId) {
      setShowCreateDialog(true);
    } else {
      // Fallback: just enter manual mode
      setManualMode(true);
      if (onSponsorSelect) onSponsorSelect(null);
    }
  };

  const handleCreateSave = async (data: { name: string; logo_url: string; link_url: string | null }) => {
    if (!createSponsor || !organizationId) return false;
    setIsCreating(true);
    try {
      const sponsor = await createSponsor({
        organization_id: organizationId,
        name: data.name,
        logo_url: data.logo_url,
        link_url: data.link_url,
        created_by: userId,
      });
      if (sponsor) {
        onSponsorCreated?.(sponsor);
        // Auto-select the newly created sponsor
        handleSponsorSelect(sponsor.id);
        return true;
      }
      return false;
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleRemoveForThisPost = () => {
    onLogoChange(null);
    onLogoLinkChange(null);
    onBylineChange('');
    if (onSponsorSelect) onSponsorSelect(null);
    setManualMode(false);
  };

  const hasSponsorSupport = !!onSponsorSelect && sponsors !== undefined;
  const isSponsorSelected = !!selectedSponsorId;

  return (
    <CollapsibleSection
      icon={Upload}
      title="Logo and Organization Name"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={isComplete}
    >
      {/* Sponsor selector when organization supports it */}
      {hasSponsorSupport && !manualMode && (
        <div className="mb-4">
          <SponsorSelector
            sponsors={sponsors}
            selectedSponsorId={selectedSponsorId}
            onSelectSponsor={handleSponsorSelect}
            onCreateNew={handleCreateNew}
            isLoading={isLoadingSponsors}
          />
        </div>
      )}

      {/* Show read-only preview when a sponsor is selected */}
      {isSponsorSelected && (
        <div className="p-3 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="" className="h-12 w-auto max-w-[120px] object-contain rounded border border-border bg-muted/30 p-1" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{byline}</p>
              {logoLinkUrl && (
                <p className="text-xs text-muted-foreground truncate">{logoLinkUrl}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual entry mode (no sponsor support or manual override) */}
      {(!hasSponsorSupport || manualMode) && !isSponsorSelected && (
        <>
          <LogoUpload
            variant="inline"
            onLogoChange={onLogoChange}
            logoUrl={logoUrl}
            logoLinkUrl={logoLinkUrl}
            onLogoLinkChange={onLogoLinkChange}
          />
          
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <Label htmlFor="byline" className="text-sm font-medium">
              Organization Name
            </Label>
            <Input
              id="byline"
              placeholder="ABC Example Corp."
              value={byline}
              onChange={(e) => onBylineChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Displayed at the top of the post. Horizontal logos work best; cropping is optional.
            </p>
            {(!!logoUrl) !== (!!byline.trim()) && (
              <p className="text-xs text-destructive">
                {logoUrl
                  ? 'An organization name is required when a logo is uploaded.'
                  : 'A sponsor logo is required when an organization name is set.'}
              </p>
            )}
          </div>

          {hasSponsorSupport && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualMode(false)}
              className="mt-2 text-muted-foreground"
            >
              ← Back to sponsor list
            </Button>
          )}
        </>
      )}
      
      {showSettingsLink && (
        <div className="flex items-center justify-between text-sm mt-4 pt-4 border-t border-border">
          <a 
            href="/client/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1"
          >
            <Settings className="h-3 w-3" />
            Manage defaults
          </a>
          {isComplete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleRemoveForThisPost}
            >
              <X className="h-3 w-3 mr-1" />
              Remove for this post
            </Button>
          )}
        </div>
      )}

      <SponsorManagementDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        sponsor={null}
        onSave={handleCreateSave}
        isSaving={isCreating}
      />
    </CollapsibleSection>
  );
}
