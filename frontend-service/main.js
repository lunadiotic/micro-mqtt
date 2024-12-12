// main.js
class IoTControlPanel {
    constructor() {
        this.token = null;
        this.ws = null;
        this.currentProject = null;
        this.deviceId = null;
        this.projectSubscriptions = new Set();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Login form handling
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        // Project selector handling
        const projectSelector = document.getElementById('project-selector');
        projectSelector.addEventListener('change', (e) => {
            this.switchProject(e.target.value);
        });

        // Device controls
        document.getElementById('device-selector').addEventListener('change', (e) => {
            this.deviceId = e.target.value;
        });

        document.getElementById('send-turn-on').addEventListener('click', () => {
            this.sendCommand('TurnOn');
        });

        document.getElementById('send-turn-off').addEventListener('click', () => {
            this.sendCommand('TurnOff');
        });

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

                // Fetch user's projects after successful login
                await this.fetchProjects();

                document.getElementById('project-selector').style.display = 'block';
                this.connectWebSocket();
            } else {
                this.updateStatus('connection-status', 'Login failed: ' + data.message, 'error');
            }
        } catch (error) {
            this.updateStatus('connection-status', 'Connection error: ' + error.message, 'error');
        }
    }

    // Project Management
    async fetchProjects() {
        // Mock data untuk testing
        const mockProjects = [
            {
                uniqueId: 'proj-001',
                title: 'Smart Home',
                devices: [
                    { id: 'device-001', name: 'Living Room Light' },
                    { id: 'device-002', name: 'Kitchen Light' }
                ]
            },
            {
                uniqueId: 'proj-002',
                title: 'Office Automation',
                devices: [
                    { id: 'device-003', name: 'Meeting Room AC' },
                    { id: 'device-004', name: 'Main Office Light' }
                ]
            },
            {
                uniqueId: 'proj-003',
                title: 'Garden Monitoring',
                devices: [
                    { id: 'device-005', name: 'Sprinkler System' }
                ]
            }
        ];

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            this.updateProjectSelector(mockProjects);
            this.updateStatus('connection-status', 'Projects loaded successfully', 'success');
        } catch (error) {
            this.updateStatus('connection-status', 'Error loading projects: ' + error.message, 'error');
        }
    }

    updateProjectSelector(projects) {
        const selector = document.getElementById('project-selector');
        selector.innerHTML = '<option value="">Select a project</option>';

        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.uniqueId;
            option.textContent = project.title;
            selector.appendChild(option);
        });
    }

    async switchProject(projectId) {
        if (!projectId) {
            return;
        }

        this.currentProject = projectId;

        // Find selected project from mock data
        const mockProjects = [
            {
                uniqueId: 'proj-001',
                title: 'Smart Home',
                devices: [
                    { id: 'device-001', name: 'Living Room Light' },
                    { id: 'device-002', name: 'Kitchen Light' }
                ]
            },
            {
                uniqueId: 'proj-002',
                title: 'Office Automation',
                devices: [
                    { id: 'device-003', name: 'Meeting Room AC' },
                    { id: 'device-004', name: 'Main Office Light' }
                ]
            },
            {
                uniqueId: 'proj-003',
                title: 'Garden Monitoring',
                devices: [
                    { id: 'device-005', name: 'Sprinkler System' }
                ]
            }
        ];

        const selectedProject = mockProjects.find(p => p.uniqueId === projectId);

        // Update device selector and create device cards
        if (selectedProject) {
            const deviceSelector = document.getElementById('device-selector');
            deviceSelector.innerHTML = selectedProject.devices.map(device =>
                `<option value="${device.id}">${device.name}</option>`
            ).join('');
            this.deviceId = selectedProject.devices[0].id; // Set first device as default

            // Create device cards
            this.initializeDeviceCards(selectedProject.devices);
        }

        document.getElementById('device-control').style.display = 'block';

        // Subscribe to project topics
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.subscribeToProject(projectId);
        }
    }

    // WebSocket Management
    connectWebSocket() {
        this.ws = new WebSocket(`ws://localhost:3001?token=${this.token}`);

        this.ws.onopen = () => {
            this.updateStatus('connection-status', 'WebSocket connected!', 'success');

            // Resubscribe to all previous project subscriptions
            this.projectSubscriptions.forEach(projectId => {
                this.subscribeToProject(projectId);
            });
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

    subscribeToProject(projectId) {
        // Find selected project's devices
        const mockProjects = [
            {
                uniqueId: 'proj-001',
                title: 'Smart Home',
                devices: [
                    { id: 'device-001', name: 'Living Room Light' },
                    { id: 'device-002', name: 'Kitchen Light' }
                ]
            },
            {
                uniqueId: 'proj-002',
                title: 'Office Automation',
                devices: [
                    { id: 'device-003', name: 'Meeting Room AC' },
                    { id: 'device-004', name: 'Main Office Light' }
                ]
            },
            {
                uniqueId: 'proj-003',
                title: 'Garden Monitoring',
                devices: [
                    { id: 'device-005', name: 'Sprinkler System' }
                ]
            }
        ];

        const selectedProject = mockProjects.find(p => p.uniqueId === projectId);

        if (selectedProject && !this.projectSubscriptions.has(projectId)) {
            const subscriptionMessage = {
                type: 'subscribe',
                projectId: projectId,
                devices: selectedProject.devices.map(d => d.id)
            };
            this.ws.send(JSON.stringify(subscriptionMessage));
            this.projectSubscriptions.add(projectId);
        }
    }

    // UI Management
    initializeDeviceCards(devices) {
        console.log('Initializing device cards:', devices);
        const container = document.getElementById('devices-data-container');
        container.innerHTML = '';

        devices.forEach(device => {
            const deviceCard = document.createElement('div');
            deviceCard.className = 'device-card';
            deviceCard.id = `device-card-${device.id}`;
            deviceCard.innerHTML = `
                <h3>
                    ${device.name}
                    <span class="device-status status-offline" id="status-${device.id}">Offline</span>
                </h3>
                <div class="device-messages" id="messages-${device.id}"></div>
            `;
            container.appendChild(deviceCard);
        });
    }

    // Message Handling
    handleWebSocketMessage(data) {
        console.log('Received WebSocket message:', data);

        switch (data.type) {
            case 'connection_status':
                this.updateStatus('mqtt-status',
                    `MQTT Broker: ${data.connected ? 'Connected' : 'Disconnected'}`,
                    data.connected ? 'success' : 'error');
                break;

            case 'subscription_success':
                this.updateStatus('project-status',
                    `Subscribed to project ${data.projectId}`,
                    'success');
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
                    console.log('Received device data:', {
                        topic: data.topic,
                        currentProject: this.currentProject
                    });

                    // Parse topic components
                    const topicParts = data.topic.split('/');
                    const deviceId = topicParts[3]; // userId/projectId/device/deviceId/...
                    const messageType = topicParts[4]; // 'data' or 'status'

                    // Verify the message belongs to current project
                    if (this.currentProject && data.topic.includes(`/${this.currentProject}/`)) {
                        this.displayDeviceData(deviceId, messageType, data);
                    } else {
                        console.log('Skipping data display: message not for current project');
                    }
                }
        }
    }

    displayDeviceData(deviceId, messageType, data) {
        console.log('Displaying data for device:', deviceId, 'type:', messageType, 'data:', data);

        const response = JSON.parse(data.message);
        const deviceMessagesContainer = document.getElementById(`messages-${deviceId}`);
        const deviceStatusElement = document.getElementById(`status-${deviceId}`);

        if (!deviceMessagesContainer) {
            console.warn(`No messages container found for device ${deviceId}`);
            return;
        }

        if (!deviceStatusElement) {
            console.warn(`No status element found for device ${deviceId}`);
        }

        // Handle status updates
        if (messageType === 'status') {
            console.log('Processing status message:', data.message);

            if (deviceStatusElement) {
                deviceStatusElement.className = `device-status status-${response.message.online ? 'online' : 'offline'}`;
                deviceStatusElement.textContent = response.message.online ? 'Online' : 'Offline';
            } else {
                console.error('Status element not found for device:', deviceId);
            }
            return;
        }

        // Handle data messages
        const messageElement = document.createElement('div');
        messageElement.className = 'message-item';

        // Get message content
        const messageContent = data.message;

        // Format the message based on content type
        let formattedMessage = '';
        if (typeof messageContent === 'object') {
            // If message is an object, format it nicely
            formattedMessage = Object.entries(messageContent)
                .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                .join('<br>');
        } else {
            formattedMessage = `<strong>Value:</strong> ${messageContent}`;
        }

        messageElement.innerHTML = `
            <div><small>${new Date(data.timestamp).toLocaleString()}</small></div>
            ${formattedMessage}
        `;

        // Keep only the last 5 messages for this device
        while (deviceMessagesContainer.children.length >= 5) {
            deviceMessagesContainer.removeChild(deviceMessagesContainer.firstChild);
        }

        deviceMessagesContainer.appendChild(messageElement);
    }

    // Command Handling
    sendCommand(command, payload = {}) {
        if (!this.currentProject) {
            this.updateStatus('connection-status', 'Please select a project first', 'error');
            return;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'command',
                projectId: this.currentProject,
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

    // Utility Functions
    updateStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = type; // 'success' atau 'error'
        }
    }
}

// Initialize the application
const app = new IoTControlPanel();