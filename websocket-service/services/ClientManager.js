class ClientManager {
    constructor() {
        this.clients = new Map();
    }

    addClient(ws, userData) {
        this.clients.set(ws, {
            userId: userData.id,
            username: userData.username,
            activeDevices: new Set(),
            activeWidgets: new Map() // deviceId -> Set of widgetIds
        });
    }

    removeClient(ws) {
        this.clients.delete(ws);
    }

    addWidgetSubscription(ws, deviceId, widgetId) {
        const client = this.clients.get(ws);
        if (!client) return false;

        client.activeDevices.add(deviceId);

        if (!client.activeWidgets.has(deviceId)) {
            client.activeWidgets.set(deviceId, new Set());
        }
        client.activeWidgets.get(deviceId).add(widgetId);
        return true;
    }

    removeWidgetSubscription(ws, deviceId, widgetId) {
        const client = this.clients.get(ws);
        if (!client) return false;

        const deviceWidgets = client.activeWidgets.get(deviceId);
        if (deviceWidgets) {
            deviceWidgets.delete(widgetId);
            if (deviceWidgets.size === 0) {
                client.activeDevices.delete(deviceId);
                client.activeWidgets.delete(deviceId);
            }
        }
        return true;
    }

    getClientsForDevice(deviceId) {
        const relevantClients = [];
        for (const [ws, client] of this.clients.entries()) {
            if (client.activeDevices.has(deviceId)) {
                relevantClients.push({
                    ws,
                    widgets: Array.from(client.activeWidgets.get(deviceId) || [])
                });
            }
        }
        return relevantClients;
    }

    isDeviceNeeded(deviceId) {
        for (const client of this.clients.values()) {
            if (client.activeDevices.has(deviceId)) {
                return true;
            }
        }
        return false;
    }
}

module.exports = ClientManager;