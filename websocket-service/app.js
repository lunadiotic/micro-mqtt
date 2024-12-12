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
        this.clientSubscriptions = new Map(); // Track client subscriptions
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
            this.clientSubscriptions.set(ws, new Set()); // Initialize empty subscription set
            console.log(`User connected: ${user.username}`);

            ws.send(JSON.stringify({
                type: 'connection_status',
                connected: this.isConnected
            }));

            ws.on('message', (data) => {
                this.handleWebSocketMessage(ws, data);
            });

            ws.on('close', () => {
                this.clientSubscriptions.delete(ws);
                console.log(`User disconnected: ${user.username}`);
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
        const { projectId, deviceId, command, payload } = message;

        this.verifyProjectAccess(projectId, ws.user.id)
            .then(project => {
                const topicPrefix = project.getTopicPrefix();
                const topic = `${topicPrefix}/device/${deviceId}/command`;

                console.log(`Sending command to topic: ${topic}`);

                this.mqttClient.publish(topic, JSON.stringify({
                    command,
                    payload,
                    timestamp: new Date().toISOString(),
                    userId: ws.user.id
                }), { qos: 1 }, (err) => {
                    if (err) {
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
            })
            .catch(error => {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            });
    }

    async handleSubscription(ws, message) {
        try {
            const { projectId, devices } = message;

            // Verify project ownership
            const project = await this.verifyProjectAccess(projectId, ws.user.id);
            if (!project) {
                throw new Error('Project access denied');
            }

            const topicPrefix = project.getTopicPrefix();
            const subscriptions = this.clientSubscriptions.get(ws);

            // Subscribe to project-specific device topics
            devices.forEach(deviceId => {
                // Subscribe to device data topic
                const deviceTopic = `${topicPrefix}/device/${deviceId}/data`;
                subscriptions.add(deviceTopic);

                // Subscribe to device status topic
                const statusTopic = `${topicPrefix}/device/${deviceId}/status`;
                subscriptions.add(statusTopic);

                // Subscribe to MQTT topics
                this.mqttClient.subscribe(deviceTopic);
                this.mqttClient.subscribe(statusTopic);
            });

            ws.send(JSON.stringify({
                type: 'subscription_success',
                projectId,
                devices,
                message: 'Successfully subscribed to device topics'
            }));

        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    }

    async verifyProjectAccess(projectId, userId) {
        // This should make an API call to the project service
        // For now, we'll mock it
        return { id: projectId, userId, getTopicPrefix: () => `${userId}/${projectId}` };
    }

    broadcastToWebSocketClients(data) {
        const { topic, message } = data;

        console.log(`Broadcasting message to WebSocket clients: ${message}`);

        this.wss.clients.forEach((client) => {
            if (client.readyState !== WebSocket.OPEN) return;

            const subscriptions = this.clientSubscriptions.get(client);
            if (!subscriptions) return;

            // Check if client is subscribed to this topic's project
            const hasAccess = Array.from(subscriptions).some(prefix =>
                topic.startsWith(prefix)
            );

            if (hasAccess) {
                client.send(JSON.stringify(data));
            }
        });
    }

    handleDeviceCommand(ws, message) {
        const { projectId, deviceId, command, payload } = message;

        // Verify project access before sending command
        this.verifyProjectAccess(projectId, ws.user.id)
            .then(project => {
                const topicPrefix = project.getTopicPrefix();
                const topic = `${topicPrefix}/device/${deviceId}/command`;

                this.mqttClient.publish(topic, JSON.stringify({
                    command,
                    payload,
                    timestamp: new Date().toISOString(),
                    userId: ws.user.id
                }), { qos: 1 }, (err) => {
                    if (err) {
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
            })
            .catch(error => {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
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