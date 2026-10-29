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
    <div className="flex h-[calc(100dvh-6rem)] min-h-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm animate-in fade-in duration-300 md:h-[calc(100vh-140px)]">
      
      {/* LATERAL ESQUERDA */}
      <div className={`${isChatOpen ? 'hidden' : 'flex'} w-full shrink-0 flex-col border-gray-200 bg-white md:flex md:w-96 md:border-r`}>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full">
              <InstagramIcon className="w-4 h-4 text-pink-600" />
              <span className="text-xs font-semibold text-gray-700">Instagram DM</span>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Digite pelo menos 3 caracteres"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-none focus:border-gray-400"
            />
            <Filter size={14} className="absolute right-3 top-3 text-gray-400 cursor-pointer" />
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-gray-500 pt-1">
            <button
              onClick={() => setFilter('unresolved')}
              className={`pb-1 ${filter === 'unresolved' ? 'text-gray-900 border-b-2 border-gray-900 font-bold' : 'hover:text-gray-700'}`}
            >
              Não resolvido
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`pb-1 ${filter === 'unread' ? 'text-gray-900 border-b-2 border-gray-900 font-bold' : 'hover:text-gray-700'}`}
            >
              Não lido
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`pb-1 ${filter === 'all' ? 'text-gray-900 border-b-2 border-gray-900 font-bold' : 'hover:text-gray-700'}`}
            >
              Todas
            </button>
            <MoreVertical size={14} className="cursor-pointer text-gray-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
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
                  activeChat.id === chat.id ? 'bg-gray-50 border-l-4 border-pink-500' : 'hover:bg-gray-50/50'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-0.5 flex items-center justify-center text-white font-bold text-xs">
                    <div className="w-full h-full bg-gray-800 rounded-full flex items-center justify-center">
                      {chat.avatar}
                    </div>
                  </div>
                  <InstagramIcon className="w-3 h-3 absolute -bottom-1 -right-1 bg-white text-pink-600 rounded-full p-0.5 shadow" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h4 className="font-semibold text-xs text-gray-900 truncate">{chat.sender}</h4>
                    <span className="text-[10px] text-gray-400 shrink-0">{chat.time.split(',')[1] || chat.time}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{chat.preview}</p>
                </div>

                <div className="flex flex-col items-end justify-between self-center">
                  {chat.status === 'unresolved' && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 mb-2"></span>
                  )}
                  {chat.status === 'unread' && (
                    <span className="w-2 h-2 rounded-full bg-pink-500 mb-2"></span>
                  )}
                  <CheckCheck size={14} className="text-gray-400" />
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-gray-400">
              Nenhuma conversa encontrada neste filtro.
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DIREITO */}
      <div className={`${isChatOpen ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-[#fafafa] md:flex`}>
        {activeChat ? (
          <>
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Voltar para conversas"
                  onClick={() => setIsChatOpen(false)}
                  className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-0.5 flex items-center justify-center text-white font-bold text-xs">
                  <div className="w-full h-full bg-gray-800 rounded-full flex items-center justify-center">
                    {activeChat.avatar}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{activeChat.sender}</h3>
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    ● Ativo no Instagram
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setConversations(conversations.map(c => c.id === activeChat.id ? { ...c, status: 'read' } : c));
                  alert('Conversa marcada como resolvida!');
                }}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-3 py-1.5 rounded-lg transition"
              >
                Marcar como resolvido
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="text-center">
                <span className="text-[10px] bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full font-medium">
                  Histórico de Mensagens do Instagram
                </span>
              </div>

              {activeChat.messagesList.map((msg, idx) => {
                const isMe = msg.sender === 'Você';
                return (
                  <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      isMe ? 'bg-[#231b2d] text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    }`}>
                      <p>{msg.text}</p>
                      <span className={`block text-[9px] mt-1 text-right ${isMe ? 'text-gray-300' : 'text-gray-400'}`}>
                        {msg.time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-200 flex items-center gap-3">
              <input
                type="text"
                placeholder="Escreva uma mensagem..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-800 focus:outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                className="bg-pink-600 hover:bg-pink-700 text-white p-2.5 rounded-xl transition flex items-center justify-center shadow-sm"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
              <MessageSquare size={32} />
            </div>
            <p className="text-sm font-medium text-gray-600">Selecione uma conversa à esquerda para começar</p>
          </div>
        )}
      </div>

    </div>
  );
}