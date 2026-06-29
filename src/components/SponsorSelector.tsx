import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import { Sponsor } from '@/hooks/useSponsors';

interface SponsorSelectorProps {
  sponsors: Sponsor[];
  selectedSponsorId: string | null;
  onSelectSponsor: (sponsorId: string | null) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
}

export function SponsorSelector({
  sponsors,
  selectedSponsorId,
  onSelectSponsor,
  onCreateNew,
  isLoading = false,
}: SponsorSelectorProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-2">Loading sponsors...</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Select a Saved Sponsor</Label>
        <div className="flex gap-2">
          <Select
            value={selectedSponsorId || 'none'}
            onValueChange={(val) => onSelectSponsor(val === 'none' ? null : val)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose a sponsor..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None selected</SelectItem>
              {sponsors.map(sponsor => (
                <SelectItem key={sponsor.id} value={sponsor.id}>
                  <div className="flex items-center gap-2">
                    <img
                      src={sponsor.logo_url}
                      alt=""
                      className="h-5 w-auto max-w-[40px] object-contain rounded"
                    />
                    <span>{sponsor.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSponsorId && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSelectSponsor(null)}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCreateNew}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create New Sponsor
      </Button>
    </div>
  );
}
