import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import {
  Sparkles,
  Send,
  X,
  MessageCircle,
  Bot,
  User as UserIcon,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface AiHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  time?: string;
  isWelcome?: boolean;
}

const QUICK_QUESTIONS = [
  'What does VectOS solve?',
  'How do I add products (AI Scanner / CSV)?',
  'How does Client\'s Order & Delivery Notice work?',
  'How do I negotiate item prices in POS?',
  '3-Way Order Dispatch & Storekeeper',
  'Amadeni y\'abakiriya (Customer Debt)',
  'Inshingano 8 z\'abakozi (Staff Roles)',
  'How do I change my password?'
];

function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return tokens.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} className="italic text-slate-300">{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function FormattedAiMessage({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        if (line === '---' || line === '***') {
          return <hr key={idx} className="border-slate-800 my-1.5" />;
        }
        if (/^#{1,4}\s+/.test(line)) {
          const heading = line.replace(/^#{1,4}\s+/, '');
          return (
            <p key={idx} className="font-bold text-amber-300 text-[13px] pt-1">
              {renderInlineFormatting(heading)}
            </p>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          const item = line.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-amber-400 font-bold leading-5">•</span>
              <span className="flex-1">{renderInlineFormatting(item)}</span>
            </div>
          );
        }
        const numMatch = line.match(/^(\d+\.)\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-amber-400 font-bold font-mono shrink-0">{numMatch[1]}</span>
              <span className="flex-1">{renderInlineFormatting(numMatch[2])}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineFormatting(rawLine)}</p>;
      })}
    </div>
  );
}

const WELCOME_MESSAGE = (): Message => ({
  role: 'model',
  isWelcome: true,
  text: "Muraho neza! Welcome to the **VectOS AI Assistant**.\n\nAsk me anything about using **VectOS**—such as POS sales & per-item price bargaining, printing **Client's Order** receipts or Delivery Notices, adding stock (manual, CSV, or AI Invoice Scanner), managing debts, staff permissions, or store setup.\n\nAsk your question in **English**, **Kinyarwanda**, or **French**!",
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
});

export const AiHelpModal: React.FC<AiHelpModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE()]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, loading]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      role: 'user',
      text: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const conversationHistory = messages
      .filter((m) => !m.isWelcome)
      .slice(-16)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput('');
    setLoading(true);

    try {
      const res = await api.askAiHelp(q, conversationHistory);
      const aiMsg: Message = {
        role: 'model',
        text: res.reply || 'I am here to help you with VectOS. What would you like to know?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const msg = String(err?.message || '');
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: msg.includes('Too many requests')
            ? msg
            : "I'm having trouble reaching the VectOS server right now. Please check your internet connection and try asking again, or contact WhatsApp Support at **+250 781 549 993**.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="w-full sm:max-w-lg h-[90vh] sm:h-[640px] rounded-t-3xl sm:rounded-3xl bg-[#121622] border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-[#182030] to-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
              <Bot className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white font-display">VectOS AI Guide</h3>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  ERP Expert
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Conversational support strictly for VectOS ERP</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setMessages([
                  {
                    role: 'model',
                    isWelcome: true,
                    text: 'Conversation cleared. Ask me anything about using **VectOS**!',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ]);
              }}
              title="Clear Chat"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WhatsApp Customer Support Direct Link Banner */}
        <div className="px-4 py-2 bg-[#0E2A1E]/80 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span className="text-[11px] font-semibold">Live WhatsApp Support: <strong className="font-mono text-emerald-200">+250 781 549 993</strong></span>
          </div>
          <a
            href="https://wa.me/250781549993?text=Muraho%20VectOS%20Support%2C%20I%20need%20assistance%20with%20my%20store"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-emerald-300 hover:text-white hover:underline flex items-center gap-1"
          >
            <span>Chat</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Chat Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={idx}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                    isUser
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-xs shadow-md shadow-amber-500/10 whitespace-pre-wrap'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-xs'
                  }`}
                >
                  {isUser ? <p>{m.text}</p> : <FormattedAiMessage text={m.text} />}
                  {m.time && (
                    <p
                      className={`text-[9px] mt-1.5 text-right font-mono ${
                        isUser ? 'text-amber-950/70' : 'text-slate-500'
                      }`}
                    >
                      {m.time}
                    </p>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2.5 items-center">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl rounded-tl-xs px-3 py-2 flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-[11px]">VectOS AI is thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Questions */}
        <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80 shrink-0">
          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">
            Suggested Questions:
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                disabled={loading}
                className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-[10px] text-slate-300 hover:text-amber-300 transition cursor-pointer shrink-0"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask anything about VectOS (English, Kinyarwanda, French)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
export default AiHelpModal;
