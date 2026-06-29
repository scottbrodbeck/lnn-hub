export interface ArticleType {
  id: string;
  label: string;
  icon: string;
  description: string;
  openingMessage: string;
  questions: string[];
  systemPromptAddition: string;
  targetWordCount: { min: number; max: number };
}

export const ARTICLE_TYPES: ArticleType[] = [
  {
    id: 'business_feature',
    label: 'Business Feature Story',
    icon: '🏢',
    description: 'Tell the story of your business — who you are, what you do, and why it matters.',
    openingMessage: "Great, let's tell the story of [ORG]! I'll ask you a few questions to capture what makes your business special.",
    questions: [
      "How did [ORG] get started? What's the origin story?",
      "What problem do you solve for your customers?",
      "What makes [ORG] different from others in your industry?",
      "Can you share a moment when you knew you were making a real difference?",
      "What's one thing customers might not know about your business?",
      "Where do you see [ORG] heading in the next few years?",
      "What would you want someone new to the area to know about [ORG]?"
    ],
    systemPromptAddition: `Write a magazine-style business profile that tells a compelling story. 
Structure: Lead with an engaging hook, weave in the origin story, highlight what makes them unique, 
include specific examples or anecdotes, and end with a forward-looking statement or call to action.
Tone: Professional yet warm, like a local business magazine feature.`,
    targetWordCount: { min: 500, max: 700 }
  },
  {
    id: 'customer_success',
    label: 'Customer Success Story',
    icon: '⭐',
    description: 'Show how you\'ve helped a customer solve a problem or achieve their goals.',
    openingMessage: "Perfect, let's highlight how [ORG] has made a difference for a customer. I'll ask about a specific success story.",
    questions: [
      "Tell me about a customer or client you've really helped. What was their situation before working with you?",
      "What challenge or problem were they facing?",
      "How did [ORG] step in to help? What did you do specifically?",
      "What were the results? How did things change for them?",
      "Did the customer share any feedback or testimonial about their experience?",
      "What made this partnership or project particularly meaningful to you?",
      "What can other potential customers learn from this success story?"
    ],
    systemPromptAddition: `Write a customer success story that follows a problem-solution-result structure.
Lead with the customer's challenge, show how the business helped, and quantify or describe the positive outcomes.
Include any direct quotes or testimonials naturally. End with a subtle call to action.
Tone: Testimonial-driven, authentic, results-focused.`,
    targetWordCount: { min: 450, max: 600 }
  },
  {
    id: 'product_spotlight',
    label: 'Product or Service Spotlight',
    icon: '🔦',
    description: 'Highlight a specific product, service, or offering your organization provides.',
    openingMessage: "Let's shine a spotlight on what [ORG] offers! I'll ask about a specific product or service you want to highlight.",
    questions: [
      "What product or service would you like to spotlight?",
      "What problem does this solve for your customers?",
      "What makes this offering unique or special compared to alternatives?",
      "Who is the ideal customer for this product or service?",
      "Can you walk me through what a customer experiences when using it?",
      "Are there any special features, ingredients, or details worth highlighting?",
      "Is there a special offer, limited availability, or reason to act now?",
      "What do customers typically say after trying this product or service?"
    ],
    systemPromptAddition: `Write a product/service spotlight that educates and entices without being pushy.
Lead with the problem it solves, describe the offering in sensory or experiential terms,
highlight unique features, and include social proof if available.
Tone: Informative, enthusiastic but not salesy, focused on customer benefits.`,
    targetWordCount: { min: 400, max: 550 }
  },
  {
    id: 'event_promotion',
    label: 'Event Promotion',
    icon: '📅',
    description: 'Promote an upcoming event with all the details readers need to know.',
    openingMessage: "Exciting! Let's get the word out about your event. I'll gather all the key details.",
    questions: [
      "What's the event and when is it happening?",
      "Where will the event take place? Any parking or access details?",
      "Who should attend? Who is this event perfect for?",
      "What will attendees experience or enjoy at this event?",
      "Are there any special guests, performers, or highlights?",
      "How much does it cost, and how can people register or get tickets?",
      "Why is this event special or different from similar events?"
    ],
    systemPromptAddition: `Write an engaging event promotion that creates excitement and provides all essential details.
Lead with what makes this event unmissable, include all practical information (date, time, location, cost),
highlight special features or guests, and end with a clear call to action to register or attend.
Tone: Exciting, informative, community-focused.`,
    targetWordCount: { min: 350, max: 500 }
  },
  {
    id: 'milestone',
    label: 'Grand Opening / Milestone',
    icon: '🎉',
    description: 'Announce a grand opening, anniversary, expansion, or major business milestone.',
    openingMessage: "Congratulations on this milestone! Let's craft an announcement that captures the excitement.",
    questions: [
      "What milestone or achievement are you celebrating?",
      "What led up to this moment? What's the backstory?",
      "Is there a grand opening event, special celebration, or promotion happening?",
      "What's new or different that customers should know about?",
      "How does this milestone reflect your journey or growth?",
      "What are you most excited about as you reach this point?"
    ],
    systemPromptAddition: `Write a celebratory announcement that shares the excitement while informing readers.
Lead with the news, weave in the journey that led here, include event details if applicable,
and invite the community to be part of the celebration.
Tone: Celebratory, grateful, community-inviting.`,
    targetWordCount: { min: 400, max: 550 }
  },
  {
    id: 'community',
    label: 'Community Involvement',
    icon: '🤝',
    description: 'Highlight your organization\'s community involvement, charity work, or local partnerships.',
    openingMessage: "That's wonderful! Let's showcase how [ORG] gives back to the community.",
    questions: [
      "What community initiative, charity, or cause is [ORG] involved with?",
      "How did this involvement get started? What drew you to this cause?",
      "What specific activities or contributions has [ORG] made?",
      "What impact have you seen from this work?",
      "Are there any stories or moments from this involvement that stand out?",
      "How can community members get involved or support this cause?"
    ],
    systemPromptAddition: `Write a community-focused story that highlights genuine involvement without being self-congratulatory.
Lead with the cause and why it matters, show specific actions and impact,
include human-interest moments, and invite reader participation if applicable.
Tone: Heartfelt, authentic, community-centered rather than company-centered.`,
    targetWordCount: { min: 450, max: 600 }
  },
  {
    id: 'expert_tips',
    label: 'Expert Advice / Tips',
    icon: '💡',
    description: 'Share professional expertise, tips, or advice that positions you as a trusted expert.',
    openingMessage: "Great choice! Let's share your expertise in a way that helps readers and builds trust.",
    questions: [
      "What topic or area of expertise would you like to share advice about?",
      "What's a common mistake or misconception people have in this area?",
      "What are your top 3-5 tips or pieces of advice on this topic?",
      "Can you share a specific example or story that illustrates one of these tips?",
      "What should someone do first if they want to take action on this advice?",
      "Is there anything seasonal or timely about this advice?",
      "What credentials or experience make you qualified to speak on this topic?"
    ],
    systemPromptAddition: `Write an expert tips article that educates while subtly establishing credibility.
Lead with why this topic matters to readers, present tips in a clear and actionable way,
use specific examples, and end with an invitation to learn more from the expert.
Tone: Educational, helpful, authoritative but approachable.`,
    targetWordCount: { min: 500, max: 700 }
  },
  {
    id: 'qa_interview',
    label: 'Q&A Interview',
    icon: '🎙️',
    description: 'A conversational interview format featuring you or a team member.',
    openingMessage: "Perfect! Let's do a conversational Q&A that lets your personality shine through.",
    questions: [
      "Who should be featured in this interview, and what's their role at [ORG]?",
      "Tell me about your background. How did you end up in this role?",
      "What do you love most about what you do?",
      "What's a typical day like for you?",
      "What's something surprising people might not know about you or your work?",
      "What advice would you give to someone interested in this field or industry?"
    ],
    systemPromptAddition: `Write a Q&A interview article that feels conversational and personal.
Format as a series of questions and answers, preserving the interviewee's voice and personality.
Include a brief intro about who is being interviewed, then present the Q&A in an engaging flow.
Tone: Personal, conversational, like sitting down for coffee with the interviewee.`,
    targetWordCount: { min: 500, max: 800 }
  }
];

export const getArticleTypeById = (id: string): ArticleType | undefined => {
  return ARTICLE_TYPES.find(type => type.id === id);
};

export const replaceOrgPlaceholder = (text: string, organization: string): string => {
  return text.replace(/\[ORG\]/g, organization);
};
