import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Sparkles, 
  Send, 
  X, 
  MessageCircle, 
  Bot, 
  User as UserIcon, 
  HelpCircle, 
  ChevronRight, 
  Trash2, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface AiHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  time?: string;
}

const QUICK_QUESTIONS = [
  'VectOS ikora iki & Ikemura ibihe bibazo?',
  'Uburyo 3 bwo kwinjiza ibicuruzwa (AI Scanner)',
  'Gucuruza & kwakira MoMo (POS Sales)',
  'Gusohora ibintu mu bubiko (3-Way Dispatch)',
  'Amadeni y\'abakiriya (Customer Debt)',
  'Inshingano 8 z\'abakozi (8 Roles)',
  'Ububiko burenze bumwe (Multi-Warehouse)',
  'Imbibi z\'ubushobozi bwa sisitemu (System Limits)'
];

export const AiHelpModal: React.FC<AiHelpModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: "Muraho neza! Welcome to VectOS Customer Care Assistant.\n\nNshinzwe kubasobanurira birambuye uko VectOS ikora, ibibazo ikemura (guhagarika ubujura mu bubiko, kuringaniza MoMo/Cash, gucunga amadeni), uburyo 3 bwo kwinjiza ibicuruzwa (harimo na AI Scanner nshya), gucururiza kuri kounteri (POS), n'inshingano z'abakozi.\n\nBaza ikibazo cyose mu Kinyarwanda cyangwa mu Cyongereza!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
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
  }, [messages, isOpen]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      role: 'user',
      text: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const res = await api.askAiHelp(q, history);
      const aiMsg: Message = {
        role: 'model',
        text: res.reply || 'I am here to help you navigate VectOS. What would you like to know about the system?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: "Muraho neza! Niteguye kubafasha muri buri kintu cyose cyerekeye VectOS.\n\n• Kwinjiza ibicuruzwa: Koresha 'Add New Product', 'Bulk Stock Import (Excel)', cyangwa 'AI Invoice Scanner' ifata ifoto ya fagitire.\n• Gucuruza: Koresha tab ya 'POS & Counter Sales' wakire MoMo, Cash, cyangwa Amadeni.\n• Umutekano: Komande yose igomba kwemezwa n'umubitsi mbere y'uko ushinzwe ububiko asohora ibicuruzwa.\n\nBaza ikindi kibazo cyose ushaka gusobanukirwa birambuye!",
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
      <div className="w-full sm:max-w-md h-[90vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl bg-[#121622] border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
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
              <p className="text-[11px] text-slate-400">Strictly focused on VectOS Rwanda Depot operations</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setMessages([
                  {
                    role: 'model',
                    text: "Conversation cleared. How can I help you navigate VectOS today?",
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
                  className={`max-w-[85%] rounded-2xl p-3 leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-xs shadow-md shadow-amber-500/10'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-xs'
                  }`}
                >
                  <p>{m.text}</p>
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
            Suggested Quick Questions:
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
              placeholder="Baza ikibazo kuri VectOS... / Ask in Kinyarwanda or English"
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
