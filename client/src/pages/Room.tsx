import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { differenceInSeconds, intervalToDuration, addSeconds } from 'date-fns';
import { Users, Share2, Clock, MessageCircle, Bug } from 'lucide-react';
import { ChatPanel } from '../components/ChatPanel';
import { VoiceControl } from '../components/VoiceControl';
import clsx from 'clsx';

interface RoomData {
  title: string;
  targetDate: string;
  participants: number;
}

interface RoomUser {
  id: string;
  username: string;
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
  const [timeLeft, setTimeLeft] = useState<ReturnType<typeof intervalToDuration> | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [participants, setParticipants] = useState(1);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showUsersList, setShowUsersList] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [username, setUsername] = useState<string>(() => localStorage.getItem('username') || '');
  const [showNameModal, setShowNameModal] = useState<boolean>(() => !(localStorage.getItem('username')));
  const [unreadCount, setUnreadCount] = useState(0);

  // Debug function to set countdown to 5 seconds
  const debugSetAlmostDone = () => {
    if (roomData) {
      const newTarget = addSeconds(new Date(), 5).toISOString();
      setRoomData({ ...roomData, targetDate: newTarget });
      setIsExpired(false);
    }
  };

  const playNotificationSound = () => {
    try {
      // Avoid using `any` to satisfy lint rules — declare extended Window type when needed
      type Win = Window & { AudioContext?: typeof globalThis.AudioContext; webkitAudioContext?: typeof globalThis.AudioContext };
      const AudioCtxCtor = (window as Win).AudioContext || (window as Win).webkitAudioContext;
      if (!AudioCtxCtor) return;

      const ctx = new AudioCtxCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  };
  // 倒计时逻辑 — use a Web Worker to avoid main-thread timer throttling when tab is backgrounded
  const countdownWorkerRef = useRef<Worker | null>(null);
  type WakeLockSentinel = { release: () => Promise<void>; addEventListener?: (ev: string, fn: () => void) => void };
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const keepAwake = useCallback(async () => {
    try {
      // Try the Wake Lock API first
      if ('wakeLock' in navigator) {
        try {
          // @ts-expect-error - Wake Lock may be an experimental API on navigator
          const navWithWake = navigator as unknown as { wakeLock?: { request?: (type: 'screen') => Promise<WakeLockSentinel> } };
          const sentinel = navWithWake.wakeLock && navWithWake.wakeLock.request ? await navWithWake.wakeLock.request('screen') : null;
          if (sentinel) {
            wakeLockRef.current = sentinel;
            if (typeof sentinel.addEventListener === 'function') {
              sentinel.addEventListener('release', () => { wakeLockRef.current = null; });
            }
            return;
          }
        } catch (e) {
          // fallthrough to audio fallback
          console.warn('Wake Lock request failed, falling back to audio hack', e);
        }
      }

      // Audio fallback: create a tiny inaudible oscillator to keep the audio thread alive
      type Win = Window & { AudioContext?: typeof globalThis.AudioContext; webkitAudioContext?: typeof globalThis.AudioContext };
      const AudioCtor = (window as Win).AudioContext || (window as Win).webkitAudioContext;
      if (!AudioCtor) return;

      if (!audioCtxRef.current) {
        const ctx = new AudioCtor();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // very low volume
        gain.gain.value = 0.00001;
        osc.type = 'sine';
        osc.frequency.value = 440;

        osc.connect(gain);
        gain.connect(ctx.destination);

        // start quietly
        osc.start();

        audioCtxRef.current = ctx;
        oscRef.current = osc;
        gainRef.current = gain;
      }
    } catch (err) {
      console.warn('keepAwake failed', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current && typeof wakeLockRef.current.release === 'function') {
        try { await wakeLockRef.current.release(); } catch { /* ignore */ }
        wakeLockRef.current = null;
      }

      if (oscRef.current) {
        try { oscRef.current.stop(); } catch { /* ignore */ }
        oscRef.current.disconnect();
        oscRef.current = null;
      }
      if (gainRef.current) {
        try { gainRef.current.disconnect(); } catch { /* ignore */ }
        gainRef.current = null;
      }
      if (audioCtxRef.current) {
        try { await audioCtxRef.current.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
      }
    } catch (err) {
      console.warn('releaseWakeLock failed', err);
    }
  }, []);

  useEffect(() => {
    if (!roomData?.targetDate) return;

    // request notification permission proactively (best-effort)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { void Notification.requestPermission(); } catch (err) { console.warn(err); }
    }

    // try to create a module worker (Vite supports new URL(..., import.meta.url))
    let onVis: (() => void) | undefined;
    try {
      // terminate previous if any
      if (countdownWorkerRef.current) {
        countdownWorkerRef.current.terminate();
        countdownWorkerRef.current = null;
      }

      const worker = new Worker(new URL('../workers/countdownWorker.ts', import.meta.url), { type: 'module' });
      countdownWorkerRef.current = worker;

      worker.postMessage({ targetDate: roomData.targetDate });

      worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data || {};
        if (msg.type === 'tick') {
          // compute fresh duration from actual target date to avoid drift
          setIsExpired(false);
          setTimeLeft(intervalToDuration({ start: new Date(), end: new Date(roomData.targetDate) }));
        } else if (msg.type === 'expired') {
          setIsExpired(true);
          setTimeLeft(null);
          // notify + sound
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('倒计时结束', { body: roomData.title });
            }
          } catch { /* ignore */ }
          playNotificationSound();
        }
      };
      // when the page becomes visible again, resync worker with target date
      onVis = () => {
        if (document.visibilityState === 'visible' && countdownWorkerRef.current) {
          try { countdownWorkerRef.current.postMessage({ targetDate: roomData.targetDate }); } catch { /* ignore */ }
        }
      };
      document.addEventListener('visibilitychange', onVis);
    } catch {
      // fallback to main-thread interval if worker unavailable
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
    }

    return () => {
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      if (countdownWorkerRef.current) {
        countdownWorkerRef.current.terminate();
        countdownWorkerRef.current = null;
      }
    };
  }, [roomData?.targetDate, roomData?.title]);

  // Try to keep the device awake while countdown is running. This uses the Wake Lock API when available
  // and falls back to a very-low-volume oscillator (audio) hack to keep activity in some browsers.
  useEffect(() => {
    if (roomData?.targetDate && !isExpired) {
      void keepAwake();
    } else {
      void releaseWakeLock();
    }

    return () => { void releaseWakeLock(); };
  }, [roomData?.targetDate, isExpired, keepAwake, releaseWakeLock]);

  // Socket 连接逻辑
  // Push subscription helper (defined before socket handlers)
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const tryRegisterPush = useCallback(async (rid: string, targetDate?: string) => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicKey) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      const serverUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
      await fetch(`${serverUrl}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub, roomId: rid, targetDate })
      });
    } catch (err) {
      console.warn('Push registration failed', err);
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;
    
    // 如果没有用户名，不连接 socket，等待用户输入
    if (!username) {
      return;
    }

    socket.emit('join_room', { roomId, username });

    socket.on('room_data', (data) => {
      setRoomData(data);
      setParticipants(data.participants);
      if (data.users) setUsers(data.users);
      // Try to register push subscription for background notifications
      tryRegisterPush(data.roomId || roomId, data.targetDate);
    });

    socket.on('participants_update', (count) => {
      setParticipants(count);
    });

    socket.on('users_update', (list: RoomUser[]) => {
      setUsers(list);
    });

    interface ChatMessage { senderId: string; username?: string; text?: string; id?: string; timestamp?: string }
    const handleReceiveMessage = (msg: ChatMessage) => {
      // 如果消息不是自己发的
      if (msg.senderId !== socket.id) {
        playNotificationSound();
        if (!isChatOpen) {
          setUnreadCount(prev => prev + 1);
        }
      }
    };

    socket.on('receive_message', handleReceiveMessage);

    socket.on('error', (msg) => {
      alert(msg);
      navigate('/');
    });

    socket.on('receive_interaction', (data: { type: 'emoji' | 'message'; content: string; senderId: string }) => {
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
      socket.off('receive_message', handleReceiveMessage); // Only remove this specific listener
      socket.off('error');
      socket.off('receive_interaction');
      socket.off('users_update');
    };
  }, [roomId, navigate, username, isChatOpen, tryRegisterPush]); // Added username and isChatOpen to deps

  

  // handle chat toggle and clear unread when opened
  const toggleChat = () => {
    setIsChatOpen(prev => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  };

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

  if (!roomData || !roomId) {
    if (showNameModal) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900">
           <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">欢迎加入倒计时</h2>
            <p className="text-slate-400 mb-6">请输入您的昵称以便大家认识您</p>
            <form onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const input = (form.get('username') || '').toString();
              if (input.trim()) {
                localStorage.setItem('username', input);
                setUsername(input);
                setShowNameModal(false);
              }
            }}>
              <input
                name="username"
                autoFocus
                defaultValue={localStorage.getItem('username') || ''}
                type="text"
                placeholder="您的昵称"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 mb-4 transition-colors"
                required
              />
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors"
              >
                加入房间
              </button>
            </form>
          </div>
        </div>
        </div>
      );
    }
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
           {/* 语音控制 */}
          <VoiceControl roomId={roomId} />

          <div className="flex items-center gap-1 bg-slate-700/50 px-3 py-1 rounded-full text-sm">
            <Users size={16} className="text-green-400" />
            <span className="mr-2">{participants}</span>
            <button
              onClick={() => setShowUsersList(true)}
              className="text-slate-200 hover:text-white px-2 py-1 rounded hover:bg-slate-700/60"
              title="显示全部成员"
            >
              成员
            </button>
          </div>
          <button 
            onClick={copyLink}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-full text-sm transition-colors"
          >
            {copySuccess ? '已复制!' : <><Share2 size={16} /> 邀请</>}
          </button>
           <button 
            onClick={toggleChat}
            className={`relative p-2 rounded-full transition-colors ${isChatOpen ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600'}`}
          >
            <MessageCircle size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-800">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Debug Button */}
      <button
        onClick={debugSetAlmostDone}
        className="fixed bottom-4 left-4 p-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full transition-all z-50 opacity-50 hover:opacity-100"
        title="Debug: 5秒后结束"
      >
        <Bug size={16} />
      </button>

      {/* 聊天面板 */}
      <ChatPanel roomId={roomId} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* 倒计时主体 */}
      <div className={clsx("flex-1 flex flex-col items-center justify-center p-4 z-0 transition-all duration-300", isChatOpen ? "mr-80" : "")}>
        {isExpired ? (
          <div className="text-center animate-bounce relative">
             <div className="absolute -top-32 left-1/2 transform -translate-x-1/2 w-full whitespace-nowrap overflow-hidden">
                <span className="text-6xl animate-gallop inline-block">🐎</span>
             </div>
            <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-yellow-400 to-red-500 mb-4 animate-pulse">
              2026 马到成功！
            </h1>
            <p className="text-2xl text-yellow-200 font-bold mb-2">金蛇摆尾辞旧岁，骏马奔腾迎新春！</p>
            <p className="text-xl text-slate-300">祝您新的一年一马当先，万事如意！</p>
            
            <style>{`
              @keyframes gallop {
                0% { transform: translateX(-100vw) rotate(0deg); }
                50% { transform: translateX(0) rotate(-10deg); }
                100% { transform: translateX(100vw) rotate(0deg); }
              }
              .animate-gallop {
                animation: gallop 4s linear infinite;
              }
            `}</style>
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
      <div className={clsx("p-8 flex justify-center gap-4 z-10 pb-12 transition-all duration-300", isChatOpen ? "mr-80" : "")}>
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

      {/* Users list dropdown */}
      {showUsersList && (
        // Modal showing full list of users
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowUsersList(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">房间成员 ({users.length})</h3>
              <button onClick={() => setShowUsersList(false)} className="text-slate-400 hover:text-white">关闭</button>
            </div>
            <ul className="space-y-3 max-h-72 overflow-auto">
              {users.map(u => (
                <li key={u.id} className={`flex items-center justify-between text-sm ${u.username === username ? 'text-blue-300 font-bold' : 'text-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs text-slate-300">
                      {u.username.slice(0,1).toUpperCase()}
                    </div>
                    <span className="truncate">{u.username}</span>
                  </div>
                  {u.id === socket.id && <span className="text-xs text-slate-400">(您)</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
