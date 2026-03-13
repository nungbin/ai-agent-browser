const { Server } = require('socket.io');
const logger = require('./logger');

let io;
let surfaceClient = null;

function initSocketServer() {
    if (io) return; // Prevent multiple servers from starting

    io = new Server(3000, { cors: { origin: '*' } });
    logger.info("🧠 SAP GUI Socket Brain is online on port 3000.");

    io.on('connection', (socket) => {
        logger.info("🟢 Surface Pro Connected via Socket.io!");
        surfaceClient = socket;

        socket.on('disconnect', () => {
            logger.info("🔴 Surface Pro Disconnected.");
            if (surfaceClient && surfaceClient.id === socket.id) {
                surfaceClient = null;
            }
        });
    });
}

function executeSapTask(payload, onStatusUpdate) {
    return new Promise((resolve, reject) => {
        if (!surfaceClient) {
            return reject(new Error("The Surface Pro robot is currently disconnected."));
        }

        const statusHandler = (msg) => {
            if (onStatusUpdate) onStatusUpdate(msg);
        };

        const completeHandler = (data) => {
            surfaceClient.off('status_update', statusHandler);
            surfaceClient.off('task_complete', completeHandler);
            resolve(data);
        };

        surfaceClient.on('status_update', statusHandler);
        surfaceClient.on('task_complete', completeHandler);

        surfaceClient.emit('execute_sap', payload);
    });
}

module.exports = {
    initSocketServer,
    executeSapTask,
    isWindowsConnected: () => !!surfaceClient
};