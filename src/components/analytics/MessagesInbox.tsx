'use client';

import { useState } from 'react';
import { Search, Filter, MoreVertical, Send, CheckCheck, MessageSquare, ArrowLeft } from 'lucide-react';

// SVG Inline do Instagram para evitar erros de export do lucide-react
function InstagramIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

interface Message {
  id: string;
  sender: string;
  avatar: string;
  preview: string;
  time: string;
  status: 'unresolved' | 'unread' | 'read';
  messagesList: { sender: string; text: string; time: string }[];
}

const mockConversations: Message[] = [
  {
    id: '1',
    sender: 'asca.cabralia',
    avatar: 'AS',
    preview: 'Massaas 👏👏👏',
    time: 'ago 31, 2026 2:34 PM',
    status: 'unresolved',
    messagesList: [
      { sender: 'asca.cabralia', text: 'Olá! Gostaria de saber mais sobre a casa em Trancoso.', time: '14:30' },
      { sender: 'Você', text: 'Olá! Claro, temos disponibilidade para o próximo mês.', time: '14:32' },
      { sender: 'asca.cabralia', text: 'Massaas 👏👏👏', time: '14:34' }
    ]
  },
  {
    id: '2',
    sender: 'luizeduardeandrade',
    avatar: 'LU',
    preview: 'Show de imagens 📸🔥',
    time: 'ago 31, 2026 5:37 AM',
    status: 'unread',
    messagesList: [
      { sender: 'luizeduardeandrade', text: 'Show de imagens 📸🔥', time: '05:37' }
    ]
  },
  {
    id: '3',
    sender: 'nirodecarli',
    avatar: 'NI',
    preview: 'Obrigado por fazer parte disso, tam...',
    time: 'ago 30, 2026 8:57 PM',
    status: 'read',
    messagesList: [
      { sender: 'nirodecarli', text: 'Obrigado por fazer parte disso, tamo junto!', time: '20:57' }
    ]
  },
  {
    id: '4',
    sender: 'memorianicollefoto',
    avatar: 'ME',
    preview: 'Coisa mais linda 😍',
    time: 'ago 6, 2026 6:55 AM',
    status: 'read',
    messagesList: [
      { sender: 'memorianicollefoto', text: 'Coisa mais linda 😍', time: '06:55' }
    ]
  },
  {
    id: '5',
    sender: 'santohostel.ps',
    avatar: 'SA',
    preview: 'Obrigado pelo lindo registro! BORA!🔥',
    time: 'mar 24, 2026 9:26 AM',
    status: 'read',
    messagesList: [
      { sender: 'santohostel.ps', text: 'Obrigado pelo lindo registro! BORA!🔥', time: '09:26' }
    ]
  }
];

export function MessagesInbox() {
  const [conversations, setConversations] = useState<Message[]>(mockConversations);
  const [activeChat, setActiveChat] = useState<Message>(mockConversations[0]);
  const [filter, setFilter] = useState<'unresolved' | 'unread' | 'all'>('unresolved');
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = c.sender.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'unresolved') return c.status === 'unresolved' && matchesSearch;
    if (filter === 'unread') return c.status === 'unread' && matchesSearch;
    return matchesSearch;
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage = {
      sender: 'Você',
      text: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedChat = {
      ...activeChat,
      messagesList: [...activeChat.messagesList, newMessage],
      preview: `Você: ${inputText}`
    };

    setActiveChat(updatedChat);
    setConversations(conversations.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
    setInputText('');
  };

  return (
    <div className="section-enter flex h-[calc(100dvh-6rem)] min-h-0 overflow-hidden rounded-panel border border-border bg-surface md:h-[calc(100dvh-8.75rem)]">
      
      {/* LATERAL ESQUERDA */}
      <div className={`${isChatOpen ? 'hidden' : 'flex'} w-full shrink-0 flex-col border-border bg-surface md:flex md:w-96 md:border-r`}>
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5">
              <InstagramIcon className="h-4 w-4 text-platform-instagram" />
              <span className="text-xs font-semibold text-ink">Instagram DM</span>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-ink-muted" />
            <input
              type="text"
              placeholder="Digite pelo menos 3 caracteres"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-11 w-full rounded-control border border-border bg-canvas py-2 pl-9 pr-8 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
            />
            <Filter size={14} className="absolute right-3 top-3 cursor-pointer text-ink-muted" />
          </div>

          <div className="flex items-center justify-between pt-1 text-xs font-medium text-ink-muted">
            <button
              onClick={() => setFilter('unresolved')}
              className={`min-h-11 px-1 transition-colors ${filter === 'unresolved' ? 'border-b-2 border-brand-plum font-semibold text-brand-plum' : 'hover:text-ink'}`}
            >
              Não resolvido
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`min-h-11 px-1 transition-colors ${filter === 'unread' ? 'border-b-2 border-brand-plum font-semibold text-brand-plum' : 'hover:text-ink'}`}
            >
              Não lido
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`min-h-11 px-1 transition-colors ${filter === 'all' ? 'border-b-2 border-brand-plum font-semibold text-brand-plum' : 'hover:text-ink'}`}
            >
              Todas
            </button>
            <MoreVertical size={14} className="cursor-pointer text-ink-muted" />
          </div>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  setActiveChat(chat);
                  setConversations(conversations.map(c =>
                    c.id === chat.id && c.status === 'unread' ? { ...c, status: 'read' } : c
                  ));
                  setIsChatOpen(true);
                }}
                className={`p-4 flex items-start gap-3 cursor-pointer transition ${
                  activeChat.id === chat.id ? 'border-l-4 border-brand-plum bg-surface-muted' : 'hover:bg-canvas/70'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-plum text-xs font-semibold text-white">
                    <div className="flex h-full w-full items-center justify-center rounded-full">
                      {chat.avatar}
                    </div>
                  </div>
                  <InstagramIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-surface p-0.5 text-platform-instagram" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h4 className="truncate text-xs font-semibold text-ink">{chat.sender}</h4>
                    <span className="shrink-0 text-[10px] text-ink-muted">{chat.time.split(',')[1] || chat.time}</span>
                  </div>
                  <p className="truncate text-xs text-ink-muted">{chat.preview}</p>
                </div>

                <div className="flex flex-col items-end justify-between self-center">
                  {chat.status === 'unresolved' && (
                    <span className="mb-2 h-2 w-2 rounded-full bg-status-warning"></span>
                  )}
                  {chat.status === 'unread' && (
                    <span className="mb-2 h-2 w-2 rounded-full bg-platform-instagram"></span>
                  )}
                  <CheckCheck size={14} className="text-ink-muted" />
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-ink-muted">
              Nenhuma conversa encontrada neste filtro.
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DIREITO */}
      <div className={`${isChatOpen ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-canvas md:flex`}>
        {activeChat ? (
          <>
            <div className="flex items-center justify-between border-b border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Voltar para conversas"
                  onClick={() => setIsChatOpen(false)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted md:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-plum text-xs font-semibold text-white">
                  <div className="flex h-full w-full items-center justify-center rounded-full">
                    {activeChat.avatar}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{activeChat.sender}</h3>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-status-success">
                    <span aria-hidden="true">●</span> Ativo no Instagram
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setConversations(conversations.map(c => c.id === activeChat.id ? { ...c, status: 'read' } : c));
                  alert('Conversa marcada como resolvida!');
                }}
                className="min-h-11 rounded-control bg-surface-muted px-3 text-xs font-semibold text-ink transition-colors hover:bg-border"
              >
                Marcar como resolvido
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="text-center">
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-medium text-ink-muted">
                  Histórico de Mensagens do Instagram
                </span>
              </div>

              {activeChat.messagesList.map((msg, idx) => {
                const isMe = msg.sender === 'Você';
                return (
                  <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      isMe ? 'rounded-br-none bg-brand-plum text-white' : 'rounded-bl-none border border-border bg-surface text-ink'
                    }`}>
                      <p>{msg.text}</p>
                      <span className={`mt-1 block text-right text-[9px] ${isMe ? 'text-white/65' : 'text-ink-muted'}`}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center gap-3 border-t border-border bg-surface p-4">
              <input
                type="text"
                placeholder="Escreva uma mensagem..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-canvas px-4 py-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum"
              />
              <button
                type="submit"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-control bg-brand-plum text-white transition-colors hover:bg-brand-plum-hover"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center space-y-3 p-8 text-ink-muted">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
              <MessageSquare size={32} />
            </div>
            <p className="text-sm font-medium text-ink-muted">Selecione uma conversa à esquerda para começar</p>
          </div>
        )}
      </div>

    </div>
  );
}