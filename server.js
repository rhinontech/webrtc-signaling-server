// Signaling Server for Direct Call System
// Deploy on Render/Railway/Glitch
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

// Store users with their call IDs
const users = new Map(); // socketId -> { callId, username, socketId }
const callIdToSocket = new Map(); // callId -> socketId

app.get('/', (req, res) => {
    res.json({
        status: 'Direct Call Signaling Server',
        connectedUsers: users.size,
        activeCallIds: Array.from(callIdToSocket.keys())
    });
});

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // Register user with Call ID
    socket.on('register', ({ callId, username }) => {
        // Check if Call ID is already taken
        if (callIdToSocket.has(callId) && callIdToSocket.get(callId) !== socket.id) {
            socket.emit('error', 'Call ID already in use. Please choose another.');
            return;
        }

        // Store user data
        users.set(socket.id, { callId, username, socketId: socket.id });
        callIdToSocket.set(callId, socket.id);

        socket.emit('registered', { callId, socketId: socket.id });
        console.log(`📝 ${username} registered with Call ID: ${callId}`);
    });

    // Check if Call ID exists
    socket.on('check-call-id', (targetCallId) => {
        const targetSocketId = callIdToSocket.get(targetCallId);
        const exists = !!targetSocketId && targetSocketId !== socket.id;
        socket.emit('call-id-status', { callId: targetCallId, exists });
    });

    // Initiate call to a Call ID
    socket.on('call-user', ({ targetCallId }) => {
        const targetSocketId = callIdToSocket.get(targetCallId);
        const caller = users.get(socket.id);

        if (!targetSocketId) {
            socket.emit('error', 'User not found or offline');
            return;
        }

        if (targetSocketId === socket.id) {
            socket.emit('error', 'Cannot call yourself');
            return;
        }

        const targetUser = users.get(targetSocketId);
        
        console.log(`📞 Call from ${caller?.username} (${caller?.callId}) to ${targetUser?.username} (${targetCallId})`);

        io.to(targetSocketId).emit('call-request', {
            from: socket.id,
            fromName: caller?.username,
            fromCallId: caller?.callId
        });
    });

    // Call accepted
    socket.on('call-accepted', ({ to }) => {
        console.log('✅ Call accepted');
        io.to(to).emit('call-accepted', { from: socket.id });
    });

    // Call rejected
    socket.on('call-rejected', ({ to }) => {
        console.log('❌ Call rejected');
        io.to(to).emit('call-rejected');
    });

    // WebRTC Offer
    socket.on('offer', ({ offer, to }) => {
        console.log('📤 Offer forwarded');
        io.to(to).emit('offer', {
            offer,
            from: socket.id
        });
    });

    // WebRTC Answer
    socket.on('answer', ({ answer, to }) => {
        console.log('📥 Answer forwarded');
        io.to(to).emit('answer', { answer });
    });

    // ICE Candidate
    socket.on('ice-candidate', ({ candidate, to }) => {
        if (to) {
            io.to(to).emit('ice-candidate', { candidate });
        }
    });

    // End call
    socket.on('end-call', ({ to }) => {
        if (to) {
            io.to(to).emit('call-ended');
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            console.log(`👋 ${user.username} (${user.callId}) disconnected`);
            callIdToSocket.delete(user.callId);
            users.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
});