require('dotenv').config();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { processMessage } = require('./processor');
const { initDb } = require('./db');
const { startUi } = require('./ui_server');
const { initScheduler } = require('./scheduler');
const fs = require('fs');
const QRCode = require('qrcode');

const logger = P({ level: 'silent' });

let currentSock = null;
let connectionInfo = {
    status: 'DISCONNECTED',
    qrDataUrl: null,
    lastUpdate: Date.now()
};

function updateStatus(status, qr = null) {
    connectionInfo.status = status;
    connectionInfo.lastUpdate = Date.now();
    if (qr) {
        QRCode.toDataURL(qr).then(url => {
            connectionInfo.qrDataUrl = url;
            connectionInfo.lastUpdate = Date.now();
        });
    } else if (status === 'CONNECTED') {
        connectionInfo.qrDataUrl = null;
    }
}

async function connectToWhatsApp() {
    updateStatus('CONNECTING');
    // 1. Initialize Database
    await initDb().catch(err => {
        console.error("CRITICAL: Database initialization failed. Check your connections.");
        process.exit(1);
    });

    // 2. Setup WhatsApp Auth
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        generateHighQualityLinkPreview: true,
    });

    // Update the shared persistent socket reference
    currentSock = sock;

    // Start UI once (if not already started)
    if (!global.uiStarted) {
        startUi(() => currentSock, () => connectionInfo, resetConnection);
        initScheduler(() => currentSock, () => connectionInfo);
        global.uiStarted = true;
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SCAN THE QR CODE BELOW ---');
            qrcode.generate(qr, { small: true });
            updateStatus('SCANNING_REQUIRED', qr);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode : 0;
            const reason = lastDisconnect.error?.message || 'Unknown reason';
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed (Code: ${statusCode}, Reason: ${reason}). Reconnecting: ${shouldReconnect}`);
            
            updateStatus(shouldReconnect ? 'CONNECTING' : 'LOGGED_OUT');

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log('Explicitly logged out. Please restart the app or use UI to reset.');
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened successfully!');
            updateStatus('CONNECTED');
        }
    });

    global.debugMessages = global.debugMessages || [];
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                global.debugMessages.push({
                    time: new Date(),
                    fromMe: msg.key.fromMe,
                    type: Object.keys(msg.message || {}).join(', '),
                    pushName: msg.pushName,
                    remoteJid: msg.key.remoteJid,
                    contentStr: JSON.stringify(msg.message).substring(0, 100)
                });
                if (global.debugMessages.length > 50) global.debugMessages.shift();

                if (msg.key.fromMe) {
                    console.log(`[IGNORE] Ignoring message sent from the bot itself (fromMe: true). To test, send a message from a different phone number.`);
                    continue;
                }

                if (msg.message) {
                    await processMessage(sock, msg);
                }
            }
        }
    });

    return sock;
}

async function resetConnection() {
    console.log('Resetting connection...');
    if (currentSock) {
        try {
            await currentSock.logout();
        } catch (e) {}
        currentSock.end();
    }
    
    // Hard delete auth_info
    if (fs.existsSync('auth_info')) {
        fs.rmSync('auth_info', { recursive: true, force: true });
        console.log('Auth data cleared.');
    }
    
    setTimeout(() => connectToWhatsApp(), 2000);
}

connectToWhatsApp().catch(err => console.log("Unexpected error: " + err));
