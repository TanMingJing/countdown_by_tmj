import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { ArrowRight, Briefcase, PartyPopper, Coffee, Sun } from 'lucide-react';
import { format, addHours, setHours, setMinutes, setSeconds, addDays, nextFriday } from 'date-fns';

const Home: React.FC = () => {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const navigate = useNavigate();

  // 初始化默认时间：当前时间往后推1小时的整点
  useEffect(() => {
    const now = new Date();
    const defaultTime = setSeconds(setMinutes(setHours(addHours(now, 1), now.getHours() + 1), 0), 0);
    setTargetDate(format(defaultTime, "yyyy-MM-dd'T'HH:mm"));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !targetDate) return;

    const roomId = Math.random().toString(36).substring(2, 9);
    
    socket.emit('create_room', {
      roomId,
      title,
      targetDate
    });

    navigate(`/room/${roomId}`);
  };

  const applyPreset = (preset: 'newYear' | 'work' | 'weekend') => {
    const now = new Date();
    let newDate: Date;
    let newTitle = '';

    switch (preset) {
      case 'newYear':
        newDate = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0);
        newTitle = `${now.getFullYear() + 1} 新年快乐`;
        break;
      case 'work':
        // 今天18:00，如果过了就是明天18:00
        newDate = setSeconds(setMinutes(setHours(now, 18), 0), 0);
        if (newDate <= now) {
          newDate = addDays(newDate, 1);
        }
        newTitle = '下班倒计时';
        break;
      case 'weekend':
        // 下一个周五 18:00
        newDate = setSeconds(setMinutes(setHours(nextFriday(now), 18), 0), 0);
        newTitle = '周末狂欢';
        break;
    }

    setTargetDate(format(newDate, "yyyy-MM-dd'T'HH:mm"));
    setTitle(newTitle);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-xl border border-white/10">
        <h1 className="text-4xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          倒计时·共此时
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 快捷预设按钮 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              type="button"
              onClick={() => applyPreset('newYear')}
              className="flex flex-col items-center justify-center p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-xl transition-all group"
            >
              <PartyPopper className="text-yellow-400 mb-1 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs text-slate-300">跨年</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('work')}
              className="flex flex-col items-center justify-center p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-xl transition-all group"
            >
              <Briefcase className="text-blue-400 mb-1 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs text-slate-300">下班</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('weekend')}
              className="flex flex-col items-center justify-center p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-xl transition-all group"
            >
              <Coffee className="text-green-400 mb-1 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs text-slate-300">周末</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              倒计时标题
            </label>
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：新年倒计时"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              目标时间
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            创建房间 <ArrowRight size={20} />
          </button>
        </form>
        
        <p className="mt-6 text-center text-slate-400 text-sm">
          创建一个房间，把链接发给朋友，一起等待重要时刻。
        </p>
      </div>
    </div>
  );
};

export default Home;
