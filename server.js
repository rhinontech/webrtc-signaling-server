// Signaling Server - Deploy this on Render/Railway/Glitch (Free)
// File: server.js

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Store connected users
const users = new Map();
const rooms = new Map();

app.get('/', (req, res) => {
    res.json({
        status: 'Signaling Server Running',
        users: users.size,
        rooms: rooms.size
    });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User registers with a username
    socket.on('register', (username) => {
        users.set(socket.id, { username, socketId: socket.id });
        io.emit('users-update', Array.from(users.values()));
        console.log(`${username} registered`);
    });

    // Get all online users
    socket.on('get-users', () => {
        socket.emit('users-update', Array.from(users.values()));
    });

    // Create or join a room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-joined', socket.id);
        console.log(`${socket.id} joined room ${roomId}`);
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
        console.log('Offer from', socket.id, 'to', data.to);
        io.to(data.to).emit('offer', {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on('answer', (data) => {
        console.log('Answer from', socket.id, 'to', data.to);
        io.to(data.to).emit('answer', {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });

    // Call initiation
    socket.on('call-user', (data) => {
        io.to(data.to).emit('incoming-call', {
            from: socket.id,
            fromUser: users.get(socket.id)?.username
        });
    });

    socket.on('call-accepted', (data) => {
        io.to(data.to).emit('call-accepted', {
            from: socket.id
        });
    });

    socket.on('call-rejected', (data) => {
        io.to(data.to).emit('call-rejected', {
            from: socket.id
        });
    });

    socket.on('end-call', (data) => {
        io.to(data.to).emit('call-ended', {
            from: socket.id
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        users.delete(socket.id);

        // Remove from rooms
        rooms.forEach((members, roomId) => {
            if (members.has(socket.id)) {
                members.delete(socket.id);
                socket.to(roomId).emit('user-left', socket.id);
            }
        });

        io.emit('users-update', Array.from(users.values()));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});