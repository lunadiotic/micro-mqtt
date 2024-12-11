class IoTControlPanel {
    constructor() {
        this.token = null;
        this.ws = null;
        this.deviceId = 'device-001';
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Login form handling
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        // Device controls
        document.getElementById('device-selector').addEventListener('change', (e) => {
            this.deviceId = e.target.value;
        });

        document.getElementById('send-turn-on').addEventListener('click', () =>
            this.sendCommand('TurnOn'));

        document.getElementById('send-turn-off').addEventListener('click', () =>
            this.sendCommand('TurnOff'));

        // Intensity control
        const intensitySlider = document.getElementById('intensity');
        const intensityValue = document.getElementById('intensity-value');
        intensitySlider.addEventListener('input', (e) => {
            intensityValue.textContent = `${e.target.value}%`;
        });

        intensitySlider.addEventListener('change', (e) => {
            this.sendCommand('SetIntensity', { level: parseInt(e.target.value) });
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.updateStatus('connection-status', 'Login successful!', 'success');
                document.getElementById('device-control').style.display = 'block';
                this.connectWebSocket();
            } else {
                this.updateStatus('connection-status', 'Login failed: ' + data.message, 'error');
            }
        } catch (error) {
            this.updateStatus('connection-status', 'Connection error: ' + error.message, 'error');
        }
    }

    connectWebSocket() {
        this.ws = new WebSocket(`ws://localhost:3001?token=${this.token}`);

        this.ws.onopen = () => {
            this.updateStatus('connection-status', 'WebSocket connected!', 'success');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.ws.onerror = (error) => {
            this.updateStatus('connection-status', 'WebSocket error!', 'error');
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            this.updateStatus('connection-status', 'WebSocket disconnected', 'error');
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(), 5000);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'connection_status':
                this.updateStatus('mqtt-status',
                    `MQTT Broker: ${data.connected ? 'Connected' : 'Disconnected'}`,
                    data.connected ? 'success' : 'error');
                break;

            case 'error':
                this.updateStatus('mqtt-status', 'Error: ' + data.message, 'error');
                break;

            case 'success':
                this.updateStatus('mqtt-status', data.message, 'success');
                break;

            default:
                // Handle device data
                if (data.topic && data.message) {
                    this.displayDeviceData(data);
                }
        }
    }

    sendCommand(command, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'command',
                deviceId: this.deviceId,
                command: command,
                payload: payload
            };

            this.ws.send(JSON.stringify(message));
            console.log('Sending command:', message);
        } else {
            this.updateStatus('connection-status', 'WebSocket is not connected', 'error');
        }
    }

    displayDeviceData(data) {
        const dataContainer = document.getElementById('device-data');
        const dataElement = document.createElement('div');
        dataElement.className = 'device-data';

        // Parse the message if it's JSON
        let messageContent;
        try {
            messageContent = JSON.parse(data.message);
        } catch {
            messageContent = data.message;
        }

        dataElement.innerHTML = `
            <strong>Topic:</strong> ${data.topic}<br>
            <strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}<br>
            <strong>Data:</strong> ${JSON.stringify(messageContent, null, 2)}
        `;

        // Keep only the last 5 messages
        while (dataContainer.children.length >= 5) {
            dataContainer.removeChild(dataContainer.firstChild);
        }

        dataContainer.appendChild(dataElement);
    }

    updateStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = type; // 'success' or 'error'
    }
}

// Initialize the application
const app = new IoTControlPanel();