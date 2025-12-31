const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 允许所有来源，生产环境应限制
    methods: ["GET", "POST"]
  }
});

// 简单的内存存储
// rooms: { [roomId]: { title, targetDate, createdAt, participants: number } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 创建房间
  socket.on('create_room', (data) => {
    const { roomId, title, targetDate } = data;
    rooms[roomId] = {
      title,
      targetDate,
      createdAt: new Date(),
      participants: 0
    };
    socket.emit('room_created', roomId);
  });

  // 加入房间
  socket.on('join_room', (roomId) => {
    if (rooms[roomId]) {
      socket.join(roomId);
      rooms[roomId].participants += 1;
      
      // 发送当前房间信息给新加入的用户
      socket.emit('room_data', rooms[roomId]);
      
      // 通知房间内所有人人数更新
      io.to(roomId).emit('participants_update', rooms[roomId].participants);
      
      console.log(`User ${socket.id} joined room ${roomId}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  // 离开房间
  socket.on('leave_room', (roomId) => {
      if (rooms[roomId]) {
          socket.leave(roomId);
          rooms[roomId].participants = Math.max(0, rooms[roomId].participants - 1);
          io.to(roomId).emit('participants_update', rooms[roomId].participants);
      }
  });
  
  // 互动消息 (例如表情、文字)
  socket.on('send_interaction', ({ roomId, type, content }) => {
      // 广播给房间内除自己以外的人 (或者所有人，取决于UI怎么展示)
      // 这里广播给所有人
      io.to(roomId).emit('receive_interaction', { type, content, senderId: socket.id });
  });

  // 聊天消息
  socket.on('send_message', ({ roomId, message }) => {
    io.to(roomId).emit('receive_message', {
      id: Date.now().toString() + Math.random().toString(),
      senderId: socket.id,
      text: message,
      timestamp: new Date()
    });
  });

  // 语音信令
  socket.on('join_voice', (roomId) => {
    // 通知房间内其他用户有新用户加入语音，需要建立连接
    socket.to(roomId).emit('user_joined_voice', socket.id);
  });

  socket.on('leave_voice', (roomId) => {
    socket.to(roomId).emit('user_left_voice', socket.id);
  });

  socket.on('signal', ({ targetId, signalData }) => {
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      signalData
    });
  });

  socket.on('disconnecting', () => {
      // 获取用户所在的房间
      const roomsJoined = Array.from(socket.rooms);
      roomsJoined.forEach(roomId => {
          if (rooms[roomId]) {
              rooms[roomId].participants = Math.max(0, rooms[roomId].participants - 1);
              io.to(roomId).emit('participants_update', rooms[roomId].participants);
          }
      });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
