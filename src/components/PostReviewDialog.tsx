import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, Copy, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface Typo {
  id: string;
  location: 'headline' | 'content';
  originalText: string;
  suggestedText: string;
  context: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
}

interface Improvement {
  category: 'message_strength' | 'length' | 'organization' | 'readability';
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

interface SEOData {
  headlineLength: {
    current: number;
    ideal: string;
    status: 'optimal' | 'too_short' | 'too_long';
    suggestion?: string;
  };
  keywordDensity: {
    topKeywords: Array<{
      keyword: string;
      count: number;
      density: string;
    }>;
    analysis: string;
  };
  metaDescription: {
    suggested: string;
    reason: string;
  };
}

interface ReviewData {
  typos: Typo[];
  efficacy: {
    overallScore: number;
    strengths: string[];
    improvements: Improvement[];
    summary: string;
  };
  seo: SEOData;
}

interface PostReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headline: string;
  content: string;
  authorName: string;
  onReviewComplete: (updatedHeadline: string, updatedContent: string, proceedToPreview: boolean) => void;
  onBackToEdit: (updatedHeadline: string, updatedContent: string) => void;
}

export function PostReviewDialog({
  open,
  onOpenChange,
  headline,
  content,
  authorName,
  onReviewComplete,
  onBackToEdit,
}: PostReviewDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [currentTypoIndex, setCurrentTypoIndex] = useState(0);
  const [acceptedTypos, setAcceptedTypos] = useState<Set<string>>(new Set());
  const [skippedTypos, setSkippedTypos] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'analyzing' | 'typos' | 'efficacy' | 'analyzing_efficacy'>('analyzing');
  const [updatedHeadline, setUpdatedHeadline] = useState(headline);
  const [updatedContent, setUpdatedContent] = useState(content);
  const [fixHistory, setFixHistory] = useState<Array<{ typo: Typo; previousHeadline: string; previousContent: string; index: number }>>([])

  // Calculate reading time estimate
  const calculateReadingTime = (text: string): number => {
    // Strip HTML tags to get plain text
    const plainText = text.replace(/<[^>]*>/g, ' ');
    const wordCount = plainText.trim().split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200); // 200 words per minute
    return readingTime;
  };

  const readingTime = calculateReadingTime(headline + ' ' + content);

  useEffect(() => {
    if (open) {
      reviewPost();
    } else {
      // Reset state when dialog closes
      setIsLoading(true);
      setReviewData(null);
      setCurrentTypoIndex(0);
      setAcceptedTypos(new Set());
      setSkippedTypos(new Set());
      setStep('analyzing');
      setUpdatedHeadline(headline);
      setUpdatedContent(content);
      setFixHistory([]);
    }
  }, [open]);

  const reviewPost = async () => {
    setIsLoading(true);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // First, only fetch typos
      const { data, error } = await supabase.functions.invoke('review-post', {
        body: {
          headline,
          content,
          authorName,
          currentDate,
          typosOnly: true,
        },
      });

      if (error) throw error;
      if (data?.error) {
        // Handle rate limit or payment errors gracefully
        if (data.error === 'rate_limit' || data.error === 'payment_required') {
          toast.error('AI review unavailable, proceeding to preview');
          onReviewComplete(headline, content, true);
          onOpenChange(false);
          return;
        }
        throw new Error(data.message || 'AI review failed');
      }

      setReviewData(data);
      setUpdatedHeadline(headline);
      setUpdatedContent(content);
      
      // Determine next step - if typos found, show them; otherwise evaluate efficacy
      if (data.typos && data.typos.length > 0) {
        setStep('typos');
        setIsLoading(false);
      } else {
        // No typos, go straight to efficacy evaluation
        await evaluateFixedContent(headline, content, currentDate);
      }
    } catch (error) {
      console.error('Error reviewing post:', error);
      toast.error('AI review unavailable, proceeding to preview');
      onReviewComplete(headline, content, true);
      onOpenChange(false);
      setIsLoading(false);
    }
  };

  const evaluateFixedContent = async (fixedHeadline: string, fixedContent: string, currentDate?: string) => {
    setStep('analyzing_efficacy');
    setIsLoading(true);
    
    try {
      const date = currentDate || new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const { data, error } = await supabase.functions.invoke('review-post', {
        body: {
          headline: fixedHeadline,
          content: fixedContent,
          authorName,
          currentDate: date,
          efficacyOnly: true,
        },
      });

      if (error) throw error;
      if (data?.error) {
        // If efficacy evaluation fails, still proceed with what we have
        console.warn('Efficacy evaluation failed:', data.message);
        setStep('efficacy');
        return;
      }

      // Update reviewData with new efficacy and seo data
      setReviewData(prev => ({
        ...prev!,
        efficacy: data.efficacy,
        seo: data.seo,
      }));
      setStep('efficacy');
    } catch (error) {
      console.error('Error evaluating content:', error);
      // Proceed to efficacy step anyway with existing data
      setStep('efficacy');
    } finally {
      setIsLoading(false);
    }
  };

  // Replace the first occurrence of `find` with `replaceWith` inside the TEXT
  // NODES of an HTML string, preserving tags/formatting. A text node's value is
  // already entity-decoded and tag-free, so word-level matches are reliable even
  // when the word sits inside <strong>/<a>/<em>. Returns null if not found.
  const replaceFirstInHtmlTextNodes = (html: string, find: string, replaceWith: string): string | null => {
    if (!find) return null;
    const doc = new DOMParser().parseFromString(`<div id="__rp_root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__rp_root');
    if (!root) return null;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const val = node.nodeValue ?? '';
      const idx = val.indexOf(find);
      if (idx !== -1) {
        node.nodeValue = val.slice(0, idx) + replaceWith + val.slice(idx + find.length);
        return root.innerHTML;
      }
      node = walker.nextNode();
    }
    return null;
  };

  const applyTypoFix = (typo: Typo): boolean => {
    const isHeadline = typo.location === 'headline';
    const text = isHeadline ? updatedHeadline : updatedContent;

    // The post body is rich-text HTML. Apply the word-level correction inside
    // text nodes (tag/entity/whitespace safe), preserving all formatting; only
    // then fall back to a literal string replace. The headline is plain text.
    let fixedText: string | null = null;
    if (isHeadline) {
      fixedText = text.includes(typo.originalText)
        ? text.replace(typo.originalText, typo.suggestedText)
        : null;
    } else {
      fixedText = replaceFirstInHtmlTextNodes(text, typo.originalText, typo.suggestedText);
      if (fixedText === null && text.includes(typo.originalText)) {
        fixedText = text.replace(typo.originalText, typo.suggestedText);
      }
    }

    // If nothing actually changed, do NOT report success — surface it so an
    // "approved" correction is never silently dropped (the reported bug).
    if (fixedText === null || fixedText === text) {
      toast.error(`Couldn't apply this correction automatically — please edit "${typo.originalText}" by hand.`);
      return false;
    }

    // Safety: never let a replacement gut the content.
    if (fixedText.length < text.length * 0.5 && text.length > 100) {
      toast.error('This fix would remove too much content - skipping');
      return false;
    }
    if (typo.originalText.length > 100 && typo.suggestedText.length < 10) {
      toast.error('This fix appears malformed - skipping');
      return false;
    }

    if (isHeadline) {
      setUpdatedHeadline(fixedText);
    } else {
      setUpdatedContent(fixedText);
    }
    return true;
  };

  const handleApplyFix = () => {
    if (!reviewData) return;
    const currentTypo = reviewData.typos[currentTypoIndex];
    
    // Save current state before applying fix
    const previousState = {
      typo: currentTypo,
      previousHeadline: updatedHeadline,
      previousContent: updatedContent,
      index: currentTypoIndex
    };
    
    const success = applyTypoFix(currentTypo);
    if (success) {
      setFixHistory(prev => [...prev, previousState]);
      setAcceptedTypos(prev => new Set([...prev, currentTypo.id]));
    }
    advanceToNextTypo();
  };

  const handleUndoLastFix = () => {
    if (fixHistory.length === 0) return;
    
    const lastFix = fixHistory[fixHistory.length - 1];
    
    // Restore previous state
    setUpdatedHeadline(lastFix.previousHeadline);
    setUpdatedContent(lastFix.previousContent);
    
    // Remove from accepted typos
    setAcceptedTypos(prev => {
      const newSet = new Set(prev);
      newSet.delete(lastFix.typo.id);
      return newSet;
    });
    
    // Remove from history
    setFixHistory(prev => prev.slice(0, -1));
    
    // Go back to that typo
    setCurrentTypoIndex(lastFix.index);
    
    toast.success('Last fix undone');
  };

  const handleSkipFix = () => {
    if (!reviewData) return;
    const currentTypo = reviewData.typos[currentTypoIndex];
    setSkippedTypos(prev => new Set([...prev, currentTypo.id]));
    advanceToNextTypo();
  };

  const handleSkipAll = async () => {
    if (!reviewData) return;
    
    // Mark all remaining typos as skipped
    const remainingTypos = reviewData.typos.slice(currentTypoIndex);
    const newSkipped = new Set(skippedTypos);
    remainingTypos.forEach(typo => newSkipped.add(typo.id));
    setSkippedTypos(newSkipped);
    
    // Evaluate the content with whatever fixes were applied
    await evaluateFixedContent(updatedHeadline, updatedContent);
  };

  const advanceToNextTypo = async () => {
    if (!reviewData) return;
    if (currentTypoIndex < reviewData.typos.length - 1) {
      setCurrentTypoIndex(prev => prev + 1);
    } else {
      // All typos done - now evaluate the FIXED content
      await evaluateFixedContent(updatedHeadline, updatedContent);
    }
  };

  const handleCopySuggestion = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleCopyAllSuggestions = () => {
    if (!reviewData) return;
    const allSuggestions = reviewData.efficacy.improvements
      .map((imp, idx) => `${idx + 1}. ${imp.suggestion}`)
      .join('\n\n');
    navigator.clipboard.writeText(allSuggestions);
    toast.success('All suggestions copied to clipboard');
  };

  const handleContinueToPreview = () => {
    onReviewComplete(updatedHeadline, updatedContent, true);
    onOpenChange(false);
  };

  const handleBackToEditClick = () => {
    onBackToEdit(updatedHeadline, updatedContent);
    onOpenChange(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'message_strength': return 'Message Strength';
      case 'length': return 'Length & Pacing';
      case 'organization': return 'Organization';
      case 'readability': return 'Readability';
      default: return category;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading && step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <DialogTitle className="text-xl">Checking for typos...</DialogTitle>
            <DialogDescription className="text-center">
              Our AI is scanning your post for errors
            </DialogDescription>
          </div>
        )}

        {isLoading && step === 'analyzing_efficacy' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <DialogTitle className="text-xl">Evaluating your post...</DialogTitle>
            <DialogDescription className="text-center">
              Our AI is analyzing the effectiveness of your edited content
            </DialogDescription>
          </div>
        )}

        {!isLoading && reviewData && step === 'typos' && (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <AlertCircle className="h-6 w-6 text-primary" />
                Typo Check
              </DialogTitle>
              <DialogDescription>
                Suggestion {currentTypoIndex + 1} of {reviewData.typos.length}
              </DialogDescription>
            </DialogHeader>

            <Progress value={((currentTypoIndex + 1) / reviewData.typos.length) * 100} className="h-2" />

            {reviewData.typos[currentTypoIndex] && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={getSeverityColor(reviewData.typos[currentTypoIndex].severity)}>
                    {reviewData.typos[currentTypoIndex].severity} priority
                  </Badge>
                  <Badge variant="outline">
                    {reviewData.typos[currentTypoIndex].location}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Original:</p>
                    <div className="p-3 bg-destructive/10 rounded-md">
                      <p className="text-sm line-through">{reviewData.typos[currentTypoIndex].originalText}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Suggested:</p>
                    <div className="p-3 bg-green-500/10 rounded-md">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                        {reviewData.typos[currentTypoIndex].suggestedText}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Reason:</p>
                    <p className="text-sm">{reviewData.typos[currentTypoIndex].reason}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Context:</p>
                    <p className="text-sm italic text-muted-foreground">
                      "{reviewData.typos[currentTypoIndex].context}"
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <div className="flex gap-3">
                    <Button onClick={handleApplyFix} className="flex-1" size="lg">
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Apply Fix
                    </Button>
                    <Button onClick={handleSkipFix} variant="outline" className="flex-1" size="lg">
                      <ChevronRight className="mr-2 h-5 w-5" />
                      Skip
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    {fixHistory.length > 0 && (
                      <Button onClick={handleUndoLastFix} variant="secondary" size="sm" className="flex-1">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Undo Last Fix
                      </Button>
                    )}
                    <Button onClick={handleSkipAll} variant="ghost" size="sm" className="flex-1">
                      Skip All Remaining
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-center text-muted-foreground">
                  {acceptedTypos.size} applied, {skippedTypos.size} skipped
                </p>
              </div>
            )}
          </div>
        )}

        {!isLoading && reviewData && step === 'efficacy' && (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                Post Effectiveness Review
              </DialogTitle>
              {reviewData.typos.length > 0 && (
                <DialogDescription>
                  ✓ Typo check complete: {acceptedTypos.size} fixes applied, {skippedTypos.size} skipped
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-6">
              {/* Overall Score */}
              <div className="text-center p-6 bg-primary/5 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Overall Score</p>
                <p className="text-5xl font-bold text-primary">{reviewData.efficacy.overallScore}/10</p>
                <p className="text-sm text-muted-foreground mt-2">{reviewData.efficacy.summary}</p>
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    Estimated reading time: <span className="font-semibold text-foreground">~{readingTime} minute{readingTime !== 1 ? 's' : ''} read</span>
                  </p>
                </div>
              </div>

              {/* Strengths */}
              {reviewData.efficacy.strengths.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    What's Working Well
                  </h3>
                  <ul className="space-y-2">
                    {reviewData.efficacy.strengths.map((strength, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 mt-0.5">•</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Separator />

              {/* Improvements */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    Suggestions for Improvement
                  </h3>
                  {reviewData.efficacy.improvements.length > 0 && (
                    <Button onClick={handleCopyAllSuggestions} variant="outline" size="sm">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy All
                    </Button>
                  )}
                </div>

                {reviewData.efficacy.improvements.length > 0 ? (
                  <div className="space-y-4">
                    {reviewData.efficacy.improvements.map((improvement, idx) => (
                      <div key={idx} className="p-4 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{getCategoryLabel(improvement.category)}</Badge>
                            <Badge variant={getSeverityColor(improvement.priority)}>
                              {improvement.priority}
                            </Badge>
                          </div>
                          <Button
                            onClick={() => handleCopySuggestion(improvement.suggestion)}
                            variant="ghost"
                            size="sm"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-sm">{improvement.suggestion}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No significant improvements needed. Great job!</p>
                )}
              </div>

              <Separator />

              {/* SEO Analysis */}
              {reviewData.seo && (
                <div>
                  <h3 className="font-semibold mb-3">SEO Optimization</h3>
                  
                  <div className="space-y-4">
                    {/* Headline Length */}
                    <div className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Headline Length</p>
                        <Badge variant={
                          reviewData.seo.headlineLength.status === 'optimal' 
                            ? 'default' 
                            : reviewData.seo.headlineLength.status === 'too_long' 
                            ? 'destructive' 
                            : 'secondary'
                        }>
                          {reviewData.seo.headlineLength.current} characters
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Ideal: {reviewData.seo.headlineLength.ideal}</span>
                          <span>{reviewData.seo.headlineLength.status === 'optimal' ? '✓ Optimal' : 
                                 reviewData.seo.headlineLength.status === 'too_long' ? 'Too long' : 'Too short'}</span>
                        </div>
                        <Progress 
                          value={Math.min((reviewData.seo.headlineLength.current / 60) * 100, 100)} 
                          className="h-2"
                        />
                      </div>
                      {reviewData.seo.headlineLength.suggestion && (
                        <p className="text-xs text-muted-foreground">{reviewData.seo.headlineLength.suggestion}</p>
                      )}
                    </div>

                    {/* Keyword Density */}
                    <div className="p-4 border rounded-lg space-y-3">
                      <p className="text-sm font-medium">Keyword Analysis</p>
                      <div className="space-y-2">
                        {reviewData.seo.keywordDensity.topKeywords.map((kw, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{kw.keyword}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{kw.count}x</span>
                              <Badge variant="outline">{kw.density}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground pt-2 border-t">
                        {reviewData.seo.keywordDensity.analysis}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <Button onClick={handleContinueToPreview} size="lg" className="w-full">
                  Continue to Preview
                </Button>
                <Button onClick={handleBackToEditClick} variant="outline" size="lg" className="w-full">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Go Back to Edit
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
