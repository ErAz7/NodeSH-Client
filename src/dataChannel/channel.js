import 'colors';
import http from 'http';
import { Server } from 'socket.io';
import KeyExchange from '../encryption/keyExchange.js';
import * as encryption from '../encryption/encryption.js';
import CONFIG from '../config/constants.js';

export default class Channel {
    constructor() {
        this.eventListeners = {
            connection: {},
            disconnection: {},
            message: {}
        };
        this.socket = null;
        this.encryptionKey = null;

        this.init();
    }

    addEventListener(event, func) {
        this.eventListeners[event][func.name] = func;
    }

    removeEventListener(event, func) {
        if (!func.name) {
            throw new Error('Anonymus listener functions cant be removed, use a named function');
        }

        delete this.eventList[event][func.name];
    }

    callEventListeners(event, ...args) {
        const listeners = this.eventListeners[event];

        for (const listenerName in listeners) {
            const listener = listeners[listenerName];

            listener(...args);
        }
    }

    init() {
        const httpServer = http.createServer();
        const io = new Server(httpServer, {
            // ...
        });

        io.on('connection', socket => {
            this.socket = socket;

            socket.on('message', message => {
                const finalMessage = this.encryptionKey ? this.decrypt(message) : message;

                this.callEventListeners('message', finalMessage);
            });

            socket.on('disconnect', () => {
                this.reset();
                this.callEventListeners('disconnection');
            });

            this.keyExchange();

            const { remotePort: port, remoteAddress: address } = socket.request.connection;

            console.log(`Connected to ${address}:${port}`.green.bold);
        });

        httpServer.listen(CONFIG.ports.data, () => console.log(`WebSocket listening on port ${CONFIG.ports.data}`.cyan.bold));
    }

    reset() {
        this.socket = null;
        this.eventListeners = {
            connection: this.eventListeners.connection,
            disconnection: {},
            message: {}
        };
        this.encryptionKey = null;
    }

    send(message) {
        const finalMessage = this.encryptionKey ? this.encrypt(message) : message;

        this.socket.emit('message', finalMessage);
    }

    encrypt(data) {
        return encryption.encrypt(JSON.stringify(data), this.encryptionKey);
    }

    decrypt(data) {
        return JSON.parse(encryption.decrypt(data, this.encryptionKey));
    }

    keyExchange() {
        new KeyExchange(this, key => {
            console.log('Establihed secure conenction'.white.bold.bgGreen);
            this.encryptionKey = key;
            this.callEventListeners('connection');
        }).listen();
    }
}
