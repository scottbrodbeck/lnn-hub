import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Pencil, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SocialPost } from '@/lib/postUtils';
import { SOCIAL_POST_STYLES } from '@/lib/socialPostStyles';
import { cn } from '@/lib/utils';
import {
  createDefaultSocialPosts,
  createManualSocialPosts,
} from '@/lib/socialPostText';

type Stage = 'style' | 'manual' | 'results';

interface SocialPostSelectorProps {
  headline: string;
  content: string;
  siteName?: string;
  selectedSocialPosts: SocialPost[];
  onSocialPostsChange: (posts: SocialPost[]) => void;
}

const AI_TIMEOUT_MS = 20_000;
const MANUAL_POST_COUNT = 2;

export const SocialPostSelector = ({
  headline,
  content,
  siteName,
  selectedSocialPosts,
  onSocialPostsChange,
}: SocialPostSelectorProps) => {
  const [stage, setStage] = useState<Stage>('style');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SocialPost[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [manualPosts, setManualPosts] = useState<string[]>(Array(MANUAL_POST_COUNT).fill(''));
  const [aiUnavailable, setAiUnavailable] = useState(false);

  useEffect(() => {
    if (selectedSocialPosts.length > 0 && suggestions.length === 0) {
      setSuggestions(selectedSocialPosts);
      setSelectedIds(selectedSocialPosts.map((post) => post.id));
      setStage('results');
    }
  }, [selectedSocialPosts, suggestions.length]);

  useEffect(() => {
    const selected = suggestions.filter((suggestion) => selectedIds.includes(suggestion.id));
    onSocialPostsChange(selected);
  }, [selectedIds, suggestions, onSocialPostsChange]);

  const applyPosts = (posts: SocialPost[]) => {
    setSuggestions(posts);
    setSelectedIds(posts.slice(0, 2).map((post) => post.id));
    setEditingPostId(null);
    setEditText('');
    setStage('results');
  };

  const handleUseDefaultPosts = () => {
    applyPosts(createDefaultSocialPosts(headline, content));
  };

  const handleOpenManualPosts = () => {
    setManualPosts([
      selectedSocialPosts[0]?.text || '',
      selectedSocialPosts[1]?.text || '',
    ]);
    setStage('manual');
  };

  const handleUseManualPosts = () => {
    if (manualPosts.some((post) => !post.trim())) {
      toast.error('Please write both social posts');
      return;
    }

    applyPosts(createManualSocialPosts(manualPosts[0], manualPosts[1]));
  };

  const handleGenerate = async () => {
    if (!selectedStyle) return;

    setIsGenerating(true);
    setStage('results');

    try {
      const generationPromise = supabase.functions.invoke('generate-social-posts', {
        body: { headline, content, siteName: siteName || 'local', style: selectedStyle },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('AI generation timed out after 20 seconds')), AI_TIMEOUT_MS);
      });

      const { data, error } = await Promise.race([generationPromise, timeoutPromise]);

      if (error) throw error;

      if (!data?.suggestions?.length) {
        throw new Error('No suggestions returned');
      }

      const posts: SocialPost[] = data.suggestions.map((suggestion: any) => ({
        id: suggestion.id || crypto.randomUUID(),
        text: suggestion.text,
        type: 'informative' as const,
        edited: false,
      }));

      applyPosts(posts);
      setAiUnavailable(false);
    } catch (error: any) {
      console.error('Error generating social posts:', error);
      setAiUnavailable(true);
      setSuggestions([]);
      setSelectedIds([]);
      setStage('style');
      toast.error('AI posts are unavailable right now. You can write your own or use default posts.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTogglePost = (postId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(postId)) return prev.filter((id) => id !== postId);
      if (prev.length < 2) return [...prev, postId];
      return [prev[1], postId];
    });
  };

  const handleStartEdit = (post: SocialPost) => {
    setEditingPostId(post.id);
    setEditText(post.text);
  };

  const handleSaveEdit = () => {
    if (!editingPostId) return;

    const trimmed = editText.trim();
    setSuggestions((prev) =>
      prev.map((post) => {
        if (post.id !== editingPostId) return post;
        const textChanged = trimmed !== (post.text || '').trim();
        return {
          ...post,
          text: trimmed,
          edited: textChanged ? true : post.edited,
        };
      }),
    );
    setEditingPostId(null);
    setEditText('');
  };

  const handleBackToStyle = () => {
    setSuggestions([]);
    setSelectedIds([]);
    setEditingPostId(null);
    setEditText('');
    setStage('style');
  };

  const renderStyle = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleUseDefaultPosts}
          className={cn(
            'flex flex-col items-start rounded-lg border-2 border-border bg-background p-4 text-left transition-all',
            'hover:border-primary/50 hover:bg-muted/50',
          )}
        >
          <span className="text-sm font-medium text-foreground">Skip (Use Default Posts)</span>
          <span className="mt-1 text-xs text-muted-foreground">
            Use the article headline and first sentence as your two posts.
          </span>
        </button>

        <button
          type="button"
          onClick={handleOpenManualPosts}
          className={cn(
            'flex flex-col items-start rounded-lg border-2 border-border bg-background p-4 text-left transition-all',
            'hover:border-primary/50 hover:bg-muted/50',
          )}
        >
          <span className="text-sm font-medium text-foreground">Write your own</span>
          <span className="mt-1 text-xs text-muted-foreground">
            Create exactly two custom social posts without using AI.
          </span>
        </button>
      </div>

      {aiUnavailable ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            AI post generation is unavailable right now. You can still write your own posts or use the default ones.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {SOCIAL_POST_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setSelectedStyle(style.id)}
                className={cn(
                  'flex flex-col items-start rounded-lg border-2 bg-background p-4 text-left transition-all',
                  'hover:border-primary/50 hover:bg-muted/50',
                  selectedStyle === style.id
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border',
                )}
              >
                <span className="mb-2 text-2xl">{style.icon}</span>
                <span className="text-sm font-medium text-foreground">{style.label}</span>
                <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{style.description}</span>
              </button>
            ))}
          </div>

          <Button onClick={handleGenerate} disabled={!selectedStyle} className="w-full">
            Generate Posts
          </Button>
        </>
      )}
    </div>
  );

  const renderManual = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setStage('style')} className="h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h4 className="text-sm font-medium text-foreground">Write your own posts</h4>
      </div>

      <div className="space-y-3">
        {manualPosts.map((post, index) => (
          <div key={index} className="space-y-2">
            <p className="text-sm font-medium text-foreground">Post {index + 1}</p>
            <Textarea
              value={post}
              onChange={(event) => {
                const nextPosts = [...manualPosts];
                nextPosts[index] = event.target.value;
                setManualPosts(nextPosts);
              }}
              rows={3}
              maxLength={280}
              className="resize-none"
              placeholder={`Write social post ${index + 1}...`}
            />
            <p className="text-xs text-muted-foreground">{post.length}/280</p>
          </div>
        ))}
      </div>

      <Button onClick={handleUseManualPosts} className="w-full">
        Use These Posts
      </Button>
    </div>
  );

  const renderResults = () => (
    <div className="space-y-4">
      {isGenerating ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating social posts...</p>
        </div>
      ) : (
        <>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {suggestions.map((post) => (
              <div
                key={post.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  selectedIds.includes(post.id)
                    ? 'border-primary bg-accent/50'
                    : 'border-border hover:bg-accent/30',
                )}
              >
                <Checkbox
                  id={post.id}
                  checked={selectedIds.includes(post.id)}
                  onCheckedChange={() => handleTogglePost(post.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  {editingPostId === post.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        rows={3}
                        maxLength={280}
                        className="resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{editText.length}/280</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingPostId(null);
                              setEditText('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={!editText.trim()}>
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="flex-1 break-words text-sm text-foreground">
                        {post.text || 'Add your post text'}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(post)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {post.edited && (
                          <Badge variant="secondary" className="text-xs">
                            Edited
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {post.text.length}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBackToStyle}>
              <ArrowLeft className="mr-1 h-3 w-3" /> Back
            </Button>
          </div>

          <div
            className={cn(
              'rounded-lg border p-3',
              selectedIds.length === 2 ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/40',
            )}
          >
            <p className="text-sm text-foreground">
              {selectedIds.length === 2
                ? '2 social posts selected'
                : `Select exactly 2 posts (${selectedIds.length}/2)`}
            </p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="border-t border-border pt-6">
      <h3 className="mb-2 text-lg font-semibold text-foreground">Social Media Posts</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {stage === 'style' && 'Pick a tone for your posts, write your own, or use default posts.'}
        {stage === 'manual' && 'Write exactly two social posts.'}
        {stage === 'results' && 'Select exactly 2 posts to use for social media promotion.'}
      </p>

      {stage === 'style' && renderStyle()}
      {stage === 'manual' && renderManual()}
      {stage === 'results' && renderResults()}
    </div>
  );
};
