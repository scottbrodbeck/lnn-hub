import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, Send, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSubjectLineStatus } from '@/lib/subjectLineUtils';

interface AnalysisResult {
  editedSubjectLine: string | null;
  explanation: string;
  alternatives: string[];
  hasIssues: boolean;
}

interface SubjectLineAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectLine: string;
  siteName: string;
  mainImageUrl?: string;
  title?: string;
  bodyContent?: string;
  onSubjectLineChange: (newSubjectLine: string) => void;
  onSubmit: () => void;
}

export function SubjectLineAnalysisDialog({
  open,
  onOpenChange,
  subjectLine,
  siteName,
  mainImageUrl,
  title,
  bodyContent,
  onSubjectLineChange,
  onSubmit,
}: SubjectLineAnalysisDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSubjectLine, setCurrentSubjectLine] = useState(subjectLine);

  useEffect(() => {
    if (open) {
      setCurrentSubjectLine(subjectLine);
      analyzeSubjectLine(subjectLine);
    } else {
      // Reset state when dialog closes
      setAnalysis(null);
      setError(null);
    }
  }, [open]);

  const analyzeSubjectLine = async (lineToAnalyze?: string) => {
    const subject = lineToAnalyze ?? currentSubjectLine;
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-subject-line', {
        body: {
          subjectLine: subject,
          siteName,
          mainImageUrl,
          title,
          bodyContent,
        },
      });

      if (fnError) {
        // Try to extract a meaningful message from the error context
        const msg = typeof fnError === 'object' && fnError.message ? fnError.message : String(fnError);
        if (msg.includes('non-2xx')) {
          // Generic invoke error — the function itself may have returned an error body
          throw new Error('The analysis service returned an error. Please try again.');
        }
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setAnalysis(data);
    } catch (err: any) {
      console.error('Analysis error:', err);
      if (err.message?.includes('429') || err.message?.includes('Rate limit')) {
        setError('AI analysis temporarily unavailable. Please try again in a moment.');
      } else if (err.message?.includes('402') || err.message?.includes('Payment')) {
        setError('AI credits exhausted. Please try again later.');
      } else {
        setError(err.message || 'Failed to analyze subject line. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const applySubjectLine = (newLine: string) => {
    setCurrentSubjectLine(newLine);
    onSubjectLineChange(newLine);
    toast.success('Subject line updated');
  };

  const handleSubmit = () => {
    onSubmit();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Subject Line Analysis
          </DialogTitle>
          <DialogDescription>
            AI-powered review for {siteName} editorial standards
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-scroll -mx-6 px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Analyzing your subject line...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-destructive text-center">{error}</p>
              <Button variant="outline" onClick={() => analyzeSubjectLine()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </div>
          ) : analysis ? (
            <div className="space-y-6 py-4">
              {/* Current subject line */}
              <div>
                <Label className="text-sm font-medium">Your Subject Line</Label>
                <div className="mt-1.5 p-3 bg-muted rounded-md">
                  <span className="font-medium">"{currentSubjectLine}"</span>
                  {(() => {
                    const status = getSubjectLineStatus(currentSubjectLine.length);
                    return (
                      <span className={`text-xs ml-2 ${status.color}`}>
                        ({currentSubjectLine.length} chars — {status.label})
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Edited version if different */}
              {analysis.hasIssues && analysis.editedSubjectLine && (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Suggested Edit
                      </Label>
                      <p className="font-medium mt-1.5">"{analysis.editedSubjectLine}"</p>
                      {(() => {
                        const status = getSubjectLineStatus(analysis.editedSubjectLine!.length);
                        return (
                          <span className={`text-xs ${status.color}`}>
                            ({analysis.editedSubjectLine!.length} chars — {status.label})
                          </span>
                        );
                      })()}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => applySubjectLine(analysis.editedSubjectLine!)}
                      disabled={currentSubjectLine === analysis.editedSubjectLine}
                    >
                      Use This
                    </Button>
                  </div>
                </div>
              )}

              {/* No issues message */}
              {!analysis.hasIssues && (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Your subject line meets editorial standards
                    </span>
                  </div>
                </div>
              )}

              {/* Explanation */}
              <div>
                <Label className="text-sm font-medium">Analysis</Label>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {analysis.explanation}
                </p>
              </div>

              {/* Alternatives */}
              <div>
                <Label className="text-sm font-medium">Alternative Options</Label>
                <div className="space-y-2 mt-2">
                  {analysis.alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 p-3 border rounded-md bg-background"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">"{alt}"</span>
                        {(() => {
                          const status = getSubjectLineStatus(alt.length);
                          return (
                            <span className={`text-xs ml-2 ${status.color}`}>
                              ({alt.length} chars — {status.label})
                            </span>
                          );
                        })()}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applySubjectLine(alt)}
                        disabled={currentSubjectLine === alt}
                      >
                        Use
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Go Back
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            <Send className="mr-2 h-4 w-4" />
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
