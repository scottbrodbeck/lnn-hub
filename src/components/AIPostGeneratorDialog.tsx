import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AudioRecorder } from "./AudioRecorder";
import { ConversationBubble } from "./ConversationBubble";
import { AIChangeRequestDialog } from "./AIChangeRequestDialog";
import { ArticleTypeGrid } from "./ArticleTypeGrid";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, ArrowLeft, ArrowRight, RotateCcw, FastForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getArticleTypeById, replaceOrgPlaceholder, type ArticleType } from "@/lib/articleTypes";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface Question {
  id: string;
  text: string;
  answered: boolean;
  answer?: string;
  skipped?: boolean;
}

type Stage = 'type_selection' | 'interview' | 'final_question' | 'generation' | 'review';

interface AIPostGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUsePost: (headline: string, content: string) => void;
}

const MIN_QUESTIONS_FOR_WRAP_UP = 3;

export const AIPostGeneratorDialog = ({
  open,
  onOpenChange,
  onUsePost,
}: AIPostGeneratorDialogProps) => {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('type_selection');
  const [messages, setMessages] = useState<Message[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  // Type selection
  const [selectedArticleType, setSelectedArticleType] = useState<string | null>(null);
  const [organization, setOrganization] = useState('');
  const [organizationDescription, setOrganizationDescription] = useState('');

  // Current answer
  const [currentAnswer, setCurrentAnswer] = useState('');

  // Final question
  const [finalQuestion, setFinalQuestion] = useState('');
  const [finalQuestionAnswer, setFinalQuestionAnswer] = useState('');

  // Generated post
  const [generatedHeadline, setGeneratedHeadline] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const getArticleType = (): ArticleType | undefined => {
    return selectedArticleType ? getArticleTypeById(selectedArticleType) : undefined;
  };

  // Calculate progress based on stage and questions answered
  const calculateProgress = () => {
    if (stage === 'type_selection') return 0;
    if (stage === 'generation') return 95;
    if (stage === 'review') return 100;
    
    const totalQuestions = questions.length + 1; // +1 for final question
    const answeredCount = questions.filter(q => q.answered || q.skipped).length;
    
    if (stage === 'interview') {
      return Math.round((answeredCount / totalQuestions) * 90);
    }
    if (stage === 'final_question') {
      return 90;
    }
    return 0;
  };

  const progress = calculateProgress();

  const canWrapUp = currentQuestionIndex >= MIN_QUESTIONS_FOR_WRAP_UP - 1 && 
    questions.filter(q => q.answered).length >= MIN_QUESTIONS_FOR_WRAP_UP;

  const resetInterview = () => {
    setStage('type_selection');
    setMessages([]);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedArticleType(null);
    setOrganization('');
    setOrganizationDescription('');
    setCurrentAnswer('');
    setFinalQuestion('');
    setFinalQuestionAnswer('');
    setGeneratedHeadline('');
    setGeneratedContent('');
  };

  const handleStartInterview = () => {
    if (!selectedArticleType || !organization.trim() || !organizationDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select an article type and fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const articleType = getArticleType();
    if (!articleType) return;

    // Build questions from the article type
    const interviewQuestions: Question[] = articleType.questions.map((q, idx) => ({
      id: `q-${idx}`,
      text: replaceOrgPlaceholder(q, organization),
      answered: false,
    }));

    setQuestions(interviewQuestions);
    
    // Add opening message and first question
    const openingMessage = replaceOrgPlaceholder(articleType.openingMessage, organization);
    setMessages([
      { role: 'assistant', content: openingMessage },
      { role: 'assistant', content: interviewQuestions[0].text }
    ]);
    
    setStage('interview');
    setCurrentQuestionIndex(0);
  };

  const handleAnswerQuestion = () => {
    if (!currentAnswer.trim()) {
      toast({
        title: "Missing Answer",
        description: "Please provide an answer before continuing",
        variant: "destructive",
      });
      return;
    }

    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex].answered = true;
    updatedQuestions[currentQuestionIndex].answer = currentAnswer;
    setQuestions(updatedQuestions);

    setMessages(prev => [...prev, { role: 'user', content: currentAnswer }]);
    setCurrentAnswer('');

    if (currentQuestionIndex < questions.length - 1) {
      const nextQuestion = questions[currentQuestionIndex + 1];
      setMessages(prev => [...prev, { role: 'assistant', content: nextQuestion.text }]);
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // All predefined questions answered, move to final question
      handleGenerateFinalQuestion();
    }
  };

  const handleSkipQuestion = () => {
    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex].skipped = true;
    setQuestions(updatedQuestions);

    if (currentQuestionIndex < questions.length - 1) {
      const nextQuestion = questions[currentQuestionIndex + 1];
      setMessages(prev => [...prev, { role: 'assistant', content: nextQuestion.text }]);
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // All predefined questions done (skipped or answered), move to final question
      handleGenerateFinalQuestion();
    }
    setCurrentAnswer('');
  };

  const handleWrapUp = () => {
    // Save current answer if there is one
    if (currentAnswer.trim()) {
      const updatedQuestions = [...questions];
      updatedQuestions[currentQuestionIndex].answered = true;
      updatedQuestions[currentQuestionIndex].answer = currentAnswer;
      setQuestions(updatedQuestions);
      setMessages(prev => [...prev, { role: 'user', content: currentAnswer }]);
    }
    setCurrentAnswer('');
    handleGenerateFinalQuestion();
  };

  const handleGenerateFinalQuestion = async () => {
    setIsLoading(true);
    setStage('final_question');

    // Build conversation history for the AI
    const conversationHistory = buildConversationHistory();

    try {
      const { data, error } = await supabase.functions.invoke('generate-post-interview', {
        body: {
          type: 'generate_final_question',
          articleType: selectedArticleType,
          organization,
          organizationDescription,
          conversationHistory,
        },
      });

      if (error) throw error;

      setFinalQuestion(data.question);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.question 
      }]);
    } catch (error: any) {
      console.error('Error generating final question:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate final question. Please try again.",
        variant: "destructive",
      });
      // Fall back to a generic final question
      const fallbackQuestion = "Is there anything else you'd like to add that would help tell your story?";
      setFinalQuestion(fallbackQuestion);
      setMessages(prev => [...prev, { role: 'assistant', content: fallbackQuestion }]);
    } finally {
      setIsLoading(false);
    }
  };

  const buildConversationHistory = () => {
    const history: { question: string; answer: string }[] = [];
    
    questions.forEach(q => {
      if (q.answered && q.answer) {
        history.push({ question: q.text, answer: q.answer });
      }
    });

    return history;
  };

  const handleAnswerFinalQuestion = () => {
    if (finalQuestionAnswer.trim()) {
      setMessages(prev => [...prev, { role: 'user', content: finalQuestionAnswer }]);
    }
    handleGenerateArticle();
  };

  const handleSkipFinalQuestion = () => {
    handleGenerateArticle();
  };

  const handleGenerateArticle = async () => {
    setIsLoading(true);
    setStage('generation');

    const conversationHistory = buildConversationHistory();
    
    // Add final question/answer if answered
    if (finalQuestion && finalQuestionAnswer.trim()) {
      conversationHistory.push({
        question: finalQuestion,
        answer: finalQuestionAnswer,
      });
    }

    try {
      const { data, error } = await supabase.functions.invoke('generate-post-interview', {
        body: {
          type: 'generate',
          articleType: selectedArticleType,
          organization,
          organizationDescription,
          conversationHistory,
        },
      });

      if (error) throw error;

      setGeneratedHeadline(data.headline);
      setGeneratedContent(data.content);
      setStage('review');
    } catch (error: any) {
      console.error('Error generating article:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate article. Please try again.",
        variant: "destructive",
      });
      setStage('final_question');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineArticle = async (changeRequest: string) => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-post-interview', {
        body: {
          type: 'refine',
          conversationHistory: buildConversationHistory(),
          changeRequest,
          currentArticle: {
            headline: generatedHeadline,
            content: generatedContent,
          },
        },
      });

      if (error) throw error;

      setGeneratedHeadline(data.headline);
      setGeneratedContent(data.content);
      
      toast({
        title: "Article Updated",
        description: "Your changes have been applied successfully",
      });
    } catch (error: any) {
      console.error('Error refining article:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to refine article. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsePost = () => {
    onUsePost(generatedHeadline, generatedContent);
    onOpenChange(false);
    toast({
      title: "Post Generated!",
      description: "AI-generated content has been loaded. Review and edit as needed.",
    });
  };

  const handleGoBackFromFinalQuestion = () => {
    // Remove the final question message
    setMessages(prev => prev.slice(0, -1));
    setFinalQuestion('');
    setFinalQuestionAnswer('');
    setStage('interview');
    // Go back to last question
    setCurrentQuestionIndex(questions.length - 1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Post Generator
            </DialogTitle>
          </DialogHeader>

          {stage !== 'type_selection' && stage !== 'review' && (
            <Progress value={progress} className="w-full" />
          )}

          {/* TYPE SELECTION STAGE */}
          {stage === 'type_selection' && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">What type of article would you like to create?</Label>
                <div className="mt-3">
                  <ArticleTypeGrid
                    selectedType={selectedArticleType}
                    onSelectType={setSelectedArticleType}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div>
                  <Label htmlFor="organization">Organization Name *</Label>
                  <Input
                    id="organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g., Acme Corporation"
                  />
                </div>

                <div>
                  <Label htmlFor="organizationDescription">What does your organization do? *</Label>
                  <Textarea
                    id="organizationDescription"
                    value={organizationDescription}
                    onChange={(e) => setOrganizationDescription(e.target.value)}
                    placeholder="Briefly describe your organization's mission and activities"
                    className="min-h-[80px]"
                  />
                </div>

                <Button 
                  onClick={handleStartInterview} 
                  disabled={!selectedArticleType || !organization.trim() || !organizationDescription.trim()}
                  className="w-full"
                >
                  Start AI Interview
                </Button>
              </div>
            </div>
          )}

          {/* INTERVIEW STAGE */}
          {stage === 'interview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </div>
                {canWrapUp && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWrapUp}
                    className="gap-2"
                  >
                    <FastForward className="h-4 w-4" />
                    Wrap Up Interview
                  </Button>
                )}
              </div>

              <div className="max-h-[250px] overflow-y-auto p-4 bg-muted/30 rounded-lg">
                {messages.map((msg, idx) => (
                  <ConversationBubble key={idx} role={msg.role} content={msg.content} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              <AudioRecorder
                value={currentAnswer}
                onTranscriptChange={setCurrentAnswer}
              />

              <button
                type="button"
                onClick={handleSkipQuestion}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Skip this question
              </button>

              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (currentQuestionIndex > 0) {
                      setCurrentQuestionIndex(prev => prev - 1);
                      setCurrentAnswer(questions[currentQuestionIndex - 1].answer || '');
                      // Remove last user and assistant message to go back
                      setMessages(prev => prev.slice(0, -2));
                    }
                  }}
                  disabled={currentQuestionIndex === 0}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleAnswerQuestion} disabled={!currentAnswer.trim()}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* FINAL QUESTION STAGE */}
          {stage === 'final_question' && (
            <div className="space-y-4">
              <div className="text-sm font-medium text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                One Final Question
              </div>

              <div className="max-h-[200px] overflow-y-auto p-4 bg-muted/30 rounded-lg">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating a personalized question...
                  </div>
                ) : (
                  <ConversationBubble role="assistant" content={finalQuestion} />
                )}
                <div ref={messagesEndRef} />
              </div>

              {!isLoading && (
                <>
                  <AudioRecorder
                    value={finalQuestionAnswer}
                    onTranscriptChange={setFinalQuestionAnswer}
                  />

                  <button
                    type="button"
                    onClick={handleSkipFinalQuestion}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Skip this question
                  </button>

                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={handleGoBackFromFinalQuestion}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Questions
                    </Button>
                    <Button onClick={handleAnswerFinalQuestion}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Article
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* GENERATION STAGE */}
          {stage === 'generation' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Crafting your article...</p>
              <p className="text-sm text-muted-foreground">This may take a moment</p>
            </div>
          )}

          {/* REVIEW STAGE */}
          {stage === 'review' && (
            <div className="space-y-4">
              <div className="p-6 bg-muted/30 rounded-lg space-y-4">
                <div>
                  <h3 className="text-2xl font-bold mb-2">{generatedHeadline}</h3>
                  <div 
                    className="prose prose-sm max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: generatedContent }}
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={resetInterview}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Start Over
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowChangeDialog(true)} disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Request Changes
                  </Button>
                  <Button onClick={handleUsePost}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Use This Post
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AIChangeRequestDialog
        open={showChangeDialog}
        onOpenChange={setShowChangeDialog}
        currentHeadline={generatedHeadline}
        currentContent={generatedContent}
        onRefine={handleRefineArticle}
      />
    </>
  );
};
