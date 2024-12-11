const WebSocket = require('ws');
const mqtt = require('mqtt');
const { verifyToken } = require('../utils/auth');
const ClientManager = require('./ClientManager');
const mqttConfig = require('../config/mqtt');
const wsConfig = require('../config/websocket');

class IoTBridgeService {
    constructor() {
        this.mqttClient = null;
        this.wss = null;
        this.isConnected = false;
        this.clientManager = new ClientManager();
        this.initialize();
    }

    initialize() {
        this.setupMQTT();
        this.setupWebSocket();
    }

    setupMQTT() {
        this.mqttClient = mqtt.connect(mqttConfig);

        this.mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            this.isConnected = true;
        });

        this.mqttClient.on('message', (topic, message) => {
            console.log('Received message from MQTT:', topic, message.toString());
            const deviceId = this.extractDeviceIdFromTopic(topic);
            if (deviceId) {
                this.sendToRelevantClients(deviceId, topic, message);
            }
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
    }

    setupWebSocket() {
        this.wss = new WebSocket.Server(wsConfig);
        console.log(`WebSocket server started on port ${wsConfig.port}`);

        this.wss.on('connection', this.handleWebSocketConnection.bind(this));
    }

    async handleWebSocketConnection(ws, req) {
        try {
            const token = new URLSearchParams(req.url.split('?')[1]).get('token');
            if (!token) {
                throw new Error('No token provided');
            }

            const user = await verifyToken(token);
            this.clientManager.addClient(ws, user);
            console.log(`User connected: ${user.username}`);

            ws.send(JSON.stringify({
                type: 'connection_status',
                connected: this.isConnected
            }));

            ws.on('message', (data) => this.handleWebSocketMessage(ws, data));

            ws.on('close', () => {
                console.log(`User disconnected: ${user.username}`);
                this.clientManager.removeClient(ws);
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

            if (!this.isConnected && message.type !== 'ping') {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'MQTT broker is not connected'
                }));
                return;
            }

            switch (message.type) {
                case 'subscribe_widget':
                    this.handleWidgetSubscription(ws, message);
                    break;
                case 'unsubscribe_widget':
                    this.handleWidgetUnsubscription(ws, message);
                    break;
                case 'command':
                    this.handleDeviceCommand(ws, message);
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
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

    handleWidgetSubscription(ws, message) {
        const { deviceId, widgetId } = message;

        if (this.clientManager.addWidgetSubscription(ws, deviceId, widgetId)) {
            const topic = `iot/device/${deviceId}/+`;
            this.mqttClient.subscribe(topic, (err) => {
                if (err) {
                    console.error(`Failed to subscribe to ${topic}:`, err);
                    return;
                }
                console.log(`Subscribed to topic: ${topic} for widget ${widgetId}`);
            });
        }
    }

    handleWidgetUnsubscription(ws, message) {
        const { deviceId, widgetId } = message;

        if (this.clientManager.removeWidgetSubscription(ws, deviceId, widgetId)) {
            if (!this.clientManager.isDeviceNeeded(deviceId)) {
                const topic = `iot/device/${deviceId}/+`;
                this.mqttClient.unsubscribe(topic);
            }
        }
    }

    handleDeviceCommand(ws, message) {
        const { deviceId, command, payload } = message;
        const topic = `iot/device/${deviceId}/command`;

        this.mqttClient.publish(topic, JSON.stringify({
            command,
            payload,
            timestamp: new Date().toISOString()
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
    }

    sendToRelevantClients(deviceId, topic, message) {
        const messageData = {
            type: 'device_data',
            deviceId,
            topic,
            message: message.toString(),
            timestamp: new Date().toISOString()
        };

        const relevantClients = this.clientManager.getClientsForDevice(deviceId);
        relevantClients.forEach(({ ws, widgets }) => {
            if (ws.readyState === WebSocket.OPEN) {
                messageData.widgets = widgets;
                ws.send(JSON.stringify(messageData));
            }
        });
    }

    extractDeviceIdFromTopic(topic) {
        const parts = topic.split('/');
        return (parts[0] === 'iot' && parts[1] === 'device') ? parts[2] : null;
    }

    shutdown() {
        if (this.mqttClient) {
            this.mqttClient.end();
        }
        if (this.wss) {
            this.wss.close();
        }
    }
}

module.exports = IoTBridgeService;