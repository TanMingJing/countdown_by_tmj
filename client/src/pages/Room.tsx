import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { differenceInSeconds, intervalToDuration } from 'date-fns';
import { Users, Share2, Heart, PartyPopper, Clock, MessageCircle } from 'lucide-react';
import clsx from 'clsx';

interface RoomData {
  title: string;
  targetDate: string;
  participants: number;
}

interface Interaction {
  id: string;
  type: 'emoji' | 'message';
  content: string;
  senderId: string;
  x: number; // Random position for floating effect
  y: number;
}

const Room: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [timeLeft, setTimeLeft] = useState<Duration | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [participants, setParticipants] = useState(1);
  const [copySuccess, setCopySuccess] = useState(false);

  // 倒计时逻辑
  useEffect(() => {
    if (!roomData?.targetDate) return;

    const timer = setInterval(() => {
      const now = new Date();
      const target = new Date(roomData.targetDate);
      const diff = differenceInSeconds(target, now);

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft(null);
        clearInterval(timer);
      } else {
        setIsExpired(false);
        setTimeLeft(intervalToDuration({ start: now, end: target }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [roomData]);

  // Socket 连接逻辑
  useEffect(() => {
    if (!roomId) return;

    socket.emit('join_room', roomId);

    socket.on('room_data', (data) => {
      setRoomData(data);
      setParticipants(data.participants);
    });

    socket.on('participants_update', (count) => {
      setParticipants(count);
    });

    socket.on('error', (msg) => {
      alert(msg);
      navigate('/');
    });

    socket.on('receive_interaction', (data) => {
      const id = Math.random().toString(36).substring(7);
      const newInteraction = {
        ...data,
        id,
        x: Math.random() * 80 + 10, // 10% - 90% width
        y: Math.random() * 30 + 50, // 50% - 80% height
      };
      
      setInteractions(prev => [...prev, newInteraction]);

      // 3秒后移除
      setTimeout(() => {
        setInteractions(prev => prev.filter(i => i.id !== id));
      }, 3000);
    });

    return () => {
      socket.emit('leave_room', roomId);
      socket.off('room_data');
      socket.off('participants_update');
      socket.off('error');
      socket.off('receive_interaction');
    };
  }, [roomId, navigate]);

  const sendInteraction = (content: string) => {
    socket.emit('send_interaction', {
      roomId,
      type: 'emoji',
      content
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (!roomData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const formatNumber = (num?: number) => String(num || 0).padStart(2, '0');

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 relative overflow-hidden">
      {/* 顶部导航 */}
      <div className="flex justify-between items-center p-4 bg-slate-800/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <Clock className="text-blue-400" />
          <span className="font-bold text-lg">{roomData.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-700/50 px-3 py-1 rounded-full text-sm">
            <Users size={16} className="text-green-400" />
            <span>{participants} 人在线</span>
          </div>
          <button 
            onClick={copyLink}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-full text-sm transition-colors"
          >
            {copySuccess ? '已复制!' : <><Share2 size={16} /> 邀请朋友</>}
          </button>
        </div>
      </div>

      {/* 倒计时主体 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 z-0">
        {isExpired ? (
          <div className="text-center animate-bounce">
            <h1 className="text-6xl md:text-8xl font-bold text-yellow-400 mb-4">时间到！</h1>
            <p className="text-2xl text-slate-300">此刻已至。</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-4xl">
            {[
              { label: '天', value: timeLeft?.days },
              { label: '时', value: timeLeft?.hours },
              { label: '分', value: timeLeft?.minutes },
              { label: '秒', value: timeLeft?.seconds },
            ].map((item, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className="bg-slate-800/80 backdrop-blur-md w-full aspect-square flex items-center justify-center rounded-2xl border border-slate-700 shadow-2xl">
                  <span className="text-5xl md:text-8xl font-mono font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                    {formatNumber(item.value)}
                  </span>
                </div>
                <span className="mt-4 text-slate-400 uppercase tracking-widest text-sm md:text-base">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 互动区域 */}
      <div className="p-8 flex justify-center gap-4 z-10 pb-12">
        <button 
          onClick={() => sendInteraction('❤️')}
          className="p-4 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/50 rounded-full transition-all transform hover:scale-110 active:scale-95 text-2xl"
        >
          ❤️
        </button>
        <button 
          onClick={() => sendInteraction('🎉')}
          className="p-4 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/50 rounded-full transition-all transform hover:scale-110 active:scale-95 text-2xl"
        >
          🎉
        </button>
        <button 
          onClick={() => sendInteraction('🔥')}
          className="p-4 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 rounded-full transition-all transform hover:scale-110 active:scale-95 text-2xl"
        >
          🔥
        </button>
        <button 
          onClick={() => sendInteraction('🚀')}
          className="p-4 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/50 rounded-full transition-all transform hover:scale-110 active:scale-95 text-2xl"
        >
          🚀
        </button>
      </div>

      {/* 浮动表情展示 */}
      {interactions.map((interaction) => (
        <div
          key={interaction.id}
          className="fixed pointer-events-none text-4xl animate-bounce-short opacity-0"
          style={{
            left: `${interaction.x}%`,
            top: `${interaction.y}%`,
            animation: 'floatUp 3s ease-out forwards'
          }}
        >
          {interaction.content}
        </div>
      ))}

      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          10% { opacity: 1; transform: translateY(-20px) scale(1.2); }
          100% { transform: translateY(-200px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Room;
