const WebSocket = require('ws');
const mqtt = require('mqtt');
const { verifyToken } = require('./auth');

// MQTT Configuration
const mqttOptions = {
    host: '',
    port: 8883,
    protocol: 'mqtts',
    username: '',
    password: '',
    reconnectPeriod: 5000, // Mencoba reconnect setiap 5 detik
    connectTimeout: 30000, // Timeout koneksi 30 detik
};

class IoTBridgeService {
    constructor() {
        this.mqttClient = null;
        this.wss = null;
        this.isConnected = false;
        this.initialize();
    }

    initialize() {
        this.setupMQTT();
        this.setupWebSocket();
    }

    setupMQTT() {
        this.mqttClient = mqtt.connect(mqttOptions);

        this.mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            this.isConnected = true;

            // Subscribe ke topik yang diperlukan
            const topics = ['iot/device/data', 'iot/device/status'];
            topics.forEach(topic => {
                this.mqttClient.subscribe(topic, (err) => {
                    if (err) {
                        console.error(`Failed to subscribe to ${topic}:`, err);
                    } else {
                        console.log(`Subscribed to topic: ${topic}`);
                    }
                });
            });
        });

        this.mqttClient.on('error', (error) => {
            console.error('MQTT Error:', error);
            this.isConnected = false;
        });

        this.mqttClient.on('offline', () => {
            console.log('MQTT Client is offline');
            this.isConnected = false;
        });

        this.mqttClient.on('reconnect', () => {
            console.log('MQTT Client is trying to reconnect...');
        });

        this.mqttClient.on('message', (topic, message) => {
            console.log('Received message from MQTT:', topic, message.toString());
            this.broadcastToWebSocketClients({
                topic,
                message: message.toString(),
                timestamp: new Date().toISOString()
            });
        });
    }

    setupWebSocket() {
        this.wss = new WebSocket.Server({ port: 3001 });
        console.log('WebSocket server started on port 3001');

        this.wss.on('connection', this.handleWebSocketConnection.bind(this));
    }

    async handleWebSocketConnection(ws, req) {
        try {
            const token = new URLSearchParams(req.url.split('?')[1]).get('token');
            if (!token) {
                throw new Error('No token provided');
            }

            const user = await verifyToken(token);
            ws.user = user;
            console.log(`User connected: ${user.username}`);

            // Kirim status koneksi MQTT ke client
            ws.send(JSON.stringify({
                type: 'connection_status',
                connected: this.isConnected
            }));

            ws.on('message', (data) => {
                this.handleWebSocketMessage(ws, data);
            });

            ws.on('close', () => {
                console.log(`User disconnected: ${user.username}`);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for user ${user.username}:`, error);
            });

        } catch (err) {
            console.error('WebSocket connection error:', err.message);
            ws.close(1008, 'Unauthorized');
        }
    }

    handleWebSocketMessage(ws, data) {
        try {
            const message = JSON.parse(data);
            console.log(`Received message from ${ws.user.username}:`, message);

            if (!this.isConnected) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'MQTT broker is not connected'
                }));
                return;
            }

            switch (message.type) {
                case 'command':
                    this.handleDeviceCommand(ws, message);
                    break;
                case 'subscribe':
                    this.handleSubscription(ws, message);
                    break;
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Unknown message type'
                    }));
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    }

    handleDeviceCommand(ws, message) {
        const { deviceId, command, payload } = message;
        const topic = `iot/device/${deviceId}/command`;

        this.mqttClient.publish(topic, JSON.stringify({
            command,
            payload,
            timestamp: new Date().toISOString(),
            userId: ws.user.id
        }), { qos: 1 }, (err) => {
            if (err) {
                console.error('Failed to publish command:', err);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to send command'
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'success',
                    message: 'Command sent successfully'
                }));
            }
        });
    }

    handleSubscription(ws, message) {
        const { topic } = message;
        // Implementasi logika subscribe sesuai kebutuhan
        // Pastikan untuk memvalidasi hak akses user terhadap topic
    }

    broadcastToWebSocketClients(data) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}

// Start the service
const bridge = new IoTBridgeService();

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    if (bridge.mqttClient) {
        bridge.mqttClient.end();
    }
    if (bridge.wss) {
        bridge.wss.close();
    }
});