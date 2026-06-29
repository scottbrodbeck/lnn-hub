import { User } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CollapsibleSection } from './CollapsibleSection';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export interface AuthorProfile {
  id: string;
  full_name: string | null;
  default_author_name: string | null;
  default_author_bio: string | null;
  default_author_photo_url: string | null;
}

interface AdminAuthorSelectorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: AuthorProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string | null) => void;
  disabled?: boolean;
  disabledMessage?: string;
}

export function AdminAuthorSelector({
  isOpen,
  onOpenChange,
  profiles,
  selectedProfileId,
  onSelectProfile,
  disabled = false,
  disabledMessage,
}: AdminAuthorSelectorProps) {
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const isComplete = !!selectedProfileId;

  return (
    <CollapsibleSection
      icon={User}
      title="Author Bio"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={isComplete}
      completeText={selectedProfile?.default_author_name || selectedProfile?.full_name || 'Selected ✓'}
    >
      <div className="space-y-4">
        {disabled || profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {disabledMessage || 'No author profiles available for this organization.'}
          </p>
        ) : (
          <>
            <div>
              <Label className="text-sm font-medium">Select Author</Label>
              <Select
                value={selectedProfileId || 'none'}
                onValueChange={(val) => onSelectProfile(val === 'none' ? null : val)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose an author..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Author</SelectItem>
                  {profiles.map(profile => {
                    const hasAuthorProfile = !!profile.default_author_name;
                    const displayName = profile.default_author_name || profile.full_name || 'Unknown';
                    const subtitle = hasAuthorProfile && profile.full_name && profile.full_name !== profile.default_author_name
                      ? ` (${profile.full_name})`
                      : '';
                    return (
                      <SelectItem key={profile.id} value={profile.id}>
                        <span className="flex items-center gap-2">
                          {displayName}{subtitle}
                          {hasAuthorProfile && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Author</Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedProfile && (
              <div className="flex gap-4 p-3 bg-muted/50 rounded-md border border-border">
                <Avatar className="h-16 w-16 flex-shrink-0">
                  {selectedProfile.default_author_photo_url ? (
                    <AvatarImage
                      src={selectedProfile.default_author_photo_url}
                      alt={selectedProfile.default_author_name || 'Author'}
                    />
                  ) : null}
                  <AvatarFallback>
                    <User className="h-6 w-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">
                    {selectedProfile.default_author_name || selectedProfile.full_name}
                  </p>
                  {selectedProfile.default_author_bio && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                      {selectedProfile.default_author_bio}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
