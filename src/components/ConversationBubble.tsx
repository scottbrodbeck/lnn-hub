import { cn } from "@/lib/utils";

interface ConversationBubbleProps {
  role: 'assistant' | 'user';
  content: string;
}

export const ConversationBubble = ({ role, content }: ConversationBubbleProps) => {
  const isAssistant = role === 'assistant';

  return (
    <div className={cn(
      "flex w-full mb-4",
      isAssistant ? "justify-start" : "justify-end"
    )}>
      <div className={cn(
        "max-w-[80%] rounded-lg px-4 py-3",
        isAssistant 
          ? "bg-muted text-foreground" 
          : "bg-primary text-primary-foreground"
      )}>
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
};
