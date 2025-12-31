import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { Send, X, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  senderId: string;
  username: string;
  text: string;
  timestamp: string;
}

interface ChatPanelProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on('receive_message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      socket.off('receive_message');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    socket.emit('send_message', {
      roomId,
      message: inputText
    });
    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-slate-800 border-l border-slate-700 shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
        <h2 className="font-bold flex items-center gap-2">
          <MessageCircle size={20} />
          聊天室
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10">
            <p>还没有消息...</p>
            <p className="text-sm">打个招呼吧！👋</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === socket.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              {!isMe && (
                <span className="text-xs text-slate-400 mb-1 ml-1">{msg.username}</span>
              )}
              <div 
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm break-words ${
                  isMe 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-slate-700 text-slate-200 rounded-bl-none'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-slate-500 mt-1">
                {format(new Date(msg.timestamp), 'HH:mm')}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-slate-700 bg-slate-900/50">
        <div className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="发送消息..."
            className="w-full bg-slate-700/50 border border-slate-600 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:border-blue-500 text-sm transition-colors"
          />
          <button 
            type="submit" 
            disabled={!inputText.trim()}
            className="absolute right-1 top-1 p-1.5 bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
};
