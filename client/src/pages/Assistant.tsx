import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Bot,
  Box,
  Loader2,
  MessageSquare,
  Package,
  Send,
  Truck,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const suggestedQuestions = [
  {
    icon: Package,
    text: "Show high priority sales order",
  },
  {
    icon: Truck,
    text: "Open sales orders status 520",
  },
  {
    icon: Box,
    text: "Top inventory items by quantity on hand",
  },
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 sm:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
      </div>
      <div
        className={`max-w-[85%] sm:max-w-[80%] p-3 sm:p-4 rounded-lg ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        {isUser ? (
          <p className="text-xs sm:text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-xs sm:text-sm prose prose-sm sm:prose-base max-w-none dark:prose-invert">
            <Streamdown>{message.content}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const formatDataForDisplay = (data: any): string => {
    // Priority 1: If data.result is an array, format as markdown table
    if (data?.result && Array.isArray(data.result)) {
      return formatArrayAsTable(data.result);
    }
    // Priority 2: If data.data is an array, format as markdown table
    if (data?.data && Array.isArray(data.data)) {
      return formatArrayAsTable(data.data);
    }
    // Priority 3: Use response field
    if (data?.response) {
      return data.response;
    }
    // Fallback: JSON stringify
    return JSON.stringify(data, null, 2);
  };

  const formatArrayAsTable = (arr: any[]): string => {
    if (arr.length === 0) return "No data available.";
    
    const firstItem = arr[0];
    if (typeof firstItem !== 'object' || firstItem === null) {
      return arr.join('\n');
    }

    // Get all unique keys from first few items (limit to 5)
    const keys = new Set<string>();
    for (let i = 0; i < Math.min(5, arr.length); i++) {
      Object.keys(arr[i]).forEach(key => keys.add(key));
    }
    const headers = Array.from(keys).slice(0, 20); // Limit columns

    // Build markdown table
    let table = `| ${headers.join(' | ')} |\n`;
    table += `| ${headers.map(() => '---').join(' | ')} |\n`;

    // Add rows (limit to 20 rows for readability)
    for (let i = 0; i < Math.min(100, arr.length); i++) {
      const row = headers.map(key => {
        const val = arr[i][key];
        if (val === null || val === undefined) return '';
        let displayVal: string;
        if (typeof val === 'number') {
          displayVal = val.toString();
        } else if (typeof val === 'boolean') {
          displayVal = val ? 'Yes' : 'No';
        } else {
          displayVal = String(val);
        }
        
        // Format JDE dates (any column with 8-digit YYYYMMDD pattern) - tables F4211(SDDRQJ,SDPDDJ), F4111(ILTRDJ), F4301(PDDRQJ,PDPDDJ,PDTRDJ), F43121(PRRCDJ)
        const trimmed = displayVal.trim();
        if (/^\d{8}$/.test(trimmed)) {
          const year = trimmed.slice(0,4);
          const month = trimmed.slice(4,6);
          const day = trimmed.slice(6,8);
          const date = new Date(+year, +month-1, +day);
          if (!isNaN(date.getTime())) {
            displayVal = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
          }
        }
        
        return displayVal.substring(0, 30) + (displayVal.length > 100 ? '...' : ''); 
      });
      table += `| ${row.join(' | ')} |\n`;
    }

    if (arr.length > 100) {
      table += `\n*Showing first 20 of ${arr.length} rows*`;
    }
 
    return table;
  };

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollViewportRef = useRef<HTMLDivElement>(null);



  // Scroll to bottom when new messages added (preserve if user scrolled up)
  const wasAtBottomRef = useRef(true);
  useEffect(() => {
    if (scrollViewportRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
      wasAtBottomRef.current = scrollTop + clientHeight >= scrollHeight - 10;
    }
  });

  useEffect(() => {
    if (wasAtBottomRef.current && scrollViewportRef.current) {
      const scrollToBottomSmooth = () => {
        scrollViewportRef.current!.scrollTop = scrollViewportRef.current!.scrollHeight;
      };
      requestAnimationFrame(scrollToBottomSmooth);
    }
  }, [messages.length]);



  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('https://jde-visionary-ai-backend.onrender.com/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: userMessage }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch response');
      }

      const data = await response.json();
      console.log('API Response:', data);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: formatDataForDisplay(data) },
      ]);
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error processing your request. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  return (
    <DashboardLayout>
      <div className="min-h-0 flex flex-col">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="accent-square-lg" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Digital Assistant</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Ask questions about your supply chain using natural language
          </p>
        </div>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
          <CardHeader className="border-b py-3 sm:py-4">
            <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              JDE Visionary AI
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 flex flex-col">
            <ScrollArea className="flex-1 p-3 sm:p-4 min-h-0" ref={scrollAreaRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 h-full">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 flex items-center justify-center mb-4 sm:mb-6">
                    <Bot className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2">
                    Welcome to the Digital Assistant
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
                    I can help you understand your supply chain data, identify risks,
                    and provide actionable insights. Try asking me a question!
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full max-w-md sm:max-w-lg">
                    <p className="text-caption col-span-full">Suggested Questions</p>
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSuggestedQuestion(q.text)}
                        className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 text-left bg-muted hover:bg-muted/80 transition-colors text-xs sm:text-sm h-fit"
                      >
                        <q.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 flex-shrink-0" />
                        <span className="line-clamp-2">{q.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 [&>*:first-child]:mt-0">
                  {messages.map((message, i) => (
                    <MessageBubble key={i} message={message} />
                  ))}
                  {isLoading && (
                    <div className="flex gap-2 sm:gap-3">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center bg-muted rounded">
                        <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div className="max-w-[85%] sm:max-w-[80%] p-3 sm:p-4 bg-muted flex items-center gap-1.5 sm:gap-2 rounded-lg">
                        <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                        <span className="text-xs sm:text-sm text-muted-foreground">AI is thinking</span>
                        <span className="animate-pulse text-xs sm:text-sm">...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            <div className="p-3 sm:p-4 border-t bg-background/50">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2 sm:gap-3"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your supply chain..."
                  className="flex-1 text-xs sm:text-sm min-h-[38px] sm:min-h-[42px]"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="h-[38px] sm:h-[42px] w-[38px] sm:w-[42px] shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
