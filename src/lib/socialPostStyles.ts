export interface SocialPostStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
  promptInstruction: string;
}

export const SOCIAL_POST_STYLES: SocialPostStyle[] = [
  {
    id: 'professional',
    label: 'Professional',
    icon: '💼',
    description: 'Polished, business-appropriate tone',
    promptInstruction: 'Write in a polished, professional tone suitable for LinkedIn or a business audience. Avoid slang. Use confident, authoritative language.',
  },
  {
    id: 'conversational',
    label: 'Conversational',
    icon: '💬',
    description: 'Casual, friendly — like texting a friend',
    promptInstruction: 'Write like you\'re casually telling a friend about something interesting you just read. Keep it warm and approachable.',
  },
  {
    id: 'curiosity',
    label: 'Curiosity-driven',
    icon: '🤔',
    description: 'Poses a question to hook readers',
    promptInstruction: 'Frame each post as a question or a teaser that makes people want to click. Create intrigue without clickbait.',
  },
  {
    id: 'community',
    label: 'Community-focused',
    icon: '🏘️',
    description: 'Local pride and community impact',
    promptInstruction: 'Emphasize local impact, community pride, and why this matters to neighbors and residents. Speak as a proud community member.',
  },
  {
    id: 'newsworthy',
    label: 'Newsworthy',
    icon: '📰',
    description: 'Breaking-news feel, urgent and factual',
    promptInstruction: 'Write with urgency and authority like a breaking news alert. Keep it factual, concise, and attention-grabbing.',
  },
  {
    id: 'quote',
    label: 'Quote-forward',
    icon: '💬',
    description: 'Pull a compelling direct quote',
    promptInstruction: 'Extract or paraphrase the most compelling quote or statement from the content. Wrap it in quotation marks if it\'s a direct quote. Let the quote speak for itself.',
  },
];
