const http = require('http');
const crypto = require('crypto');

const PORT = 7777;
const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Set();
const playerStates = new Map(); // playerId -> playerObj
const carStates = new Map();    // carId -> carObj
const spawnedProps = [];        // array of propObjs (max 100)

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('3D Physics Sandbox TCP WebSocket Server Running on Port ' + PORT);
});

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto
        .createHash('sha1')
        .update(key + WS_MAGIC_STRING)
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
    ];

    socket.write(headers.join('\r\n'));
    socket.setNoDelay(true); // Disable Nagle's algorithm for low-latency TCP

    const client = {
        socket,
        playerId: null,
        buffer: Buffer.alloc(0)
    };
    clients.add(client);

    socket.on('data', (chunk) => {
        client.buffer = Buffer.concat([client.buffer, chunk]);
        processBuffer(client);
    });

    socket.on('close', () => handleDisconnect(client));
    socket.on('error', () => handleDisconnect(client));
});

function processBuffer(client) {
    while (client.buffer.length >= 2) {
        const firstByte = client.buffer[0];
        const secondByte = client.buffer[1];

        const opcode = firstByte & 0x0f;
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
            if (client.buffer.length < 4) return; // Wait for more data
            payloadLen = client.buffer.readUInt16BE(2);
            offset = 4;
        } else if (payloadLen === 127) {
            if (client.buffer.length < 10) return; // Wait for more data
            payloadLen = Number(client.buffer.readBigUInt64BE(2));
            offset = 10;
        }

        const totalFrameLen = offset + (isMasked ? 4 : 0) + payloadLen;
        if (client.buffer.length < totalFrameLen) return; // Wait for full frame

        let mask = null;
        if (isMasked) {
            mask = client.buffer.subarray(offset, offset + 4);
            offset += 4;
        }

        const payload = Buffer.from(client.buffer.subarray(offset, offset + payloadLen));
        client.buffer = client.buffer.subarray(totalFrameLen);

        if (isMasked && mask) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= mask[i % 4];
            }
        }

        if (opcode === 0x8) {
            // Close frame
            handleDisconnect(client);
            return;
        } else if (opcode === 0x9) {
            // Ping -> send Pong
            sendRawFrame(client.socket, 0x8a, payload);
        } else if (opcode === 0x1) {
            // Text frame
            const text = payload.toString('utf8');
            handleMessage(client, text);
        }
    }
}

function handleMessage(client, rawJson) {
    let msg;
    try {
        msg = JSON.parse(rawJson);
    } catch (e) {
        return;
    }

    if (!msg || !msg.type) return;

    switch (msg.type) {
        case 'join': {
            if (!msg.id) return;
            client.playerId = msg.id;

            const updatePacket = { ...msg, type: 'playerUpdate' };
            playerStates.set(msg.id, updatePacket);

            // Send initial world snapshot to the joining player
            const otherPlayers = [];
            playerStates.forEach((p, id) => {
                if (id !== msg.id) otherPlayers.push(p);
            });

            const initPacket = JSON.stringify({
                type: 'init',
                selfId: msg.id,
                players: otherPlayers,
                props: spawnedProps,
                cars: Array.from(carStates.values())
            });
            sendMessage(client, initPacket);

            // Notify everyone else
            broadcast(JSON.stringify(updatePacket), client);
            console.log(`[+] Player joined: ${msg.id} (Total: ${playerStates.size})`);
            break;
        }

        case 'playerUpdate': {
            if (!msg.id) return;
            client.playerId = msg.id;
            playerStates.set(msg.id, msg);
            broadcast(rawJson, client);
            break;
        }

        case 'spawnProp': {
            if (spawnedProps.length >= 100) {
                spawnedProps.shift();
            }
            spawnedProps.push(msg);
            broadcast(rawJson, client);
            break;
        }

        case 'spawnCar':
        case 'carUpdate': {
            if (msg.id) {
                carStates.set(msg.id, msg);
                broadcast(rawJson, client);
            }
            break;
        }

        case 'impulseProp':
        case 'playerHit':
        case 'chat': {
            broadcastAll(rawJson);
            break;
        }
    }
}

function sendMessage(client, text) {
    const payload = Buffer.from(text, 'utf8');
    sendRawFrame(client.socket, 0x81, payload);
}

function sendRawFrame(socket, firstByte, payload) {
    if (socket.destroyed) return;

    let header;
    const len = payload.length;

    if (len <= 125) {
        header = Buffer.from([firstByte, len]);
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = firstByte;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = firstByte;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }

    try {
        socket.write(Buffer.concat([header, payload]));
    } catch (err) {
        socket.destroy();
    }
}

function broadcast(text, excludeClient) {
    clients.forEach((client) => {
        if (client !== excludeClient) {
            sendMessage(client, text);
        }
    });
}

function broadcastAll(text) {
    broadcast(text, null);
}

function handleDisconnect(client) {
    if (!clients.has(client)) return;
    clients.delete(client);

    if (client.playerId) {
        const id = client.playerId;
        playerStates.delete(id);

        // Free any car this player was driving
        carStates.forEach((car) => {
            if (car.driverId === id) {
                car.driverId = '';
                broadcastAll(JSON.stringify(car));
            }
        });

        broadcastAll(JSON.stringify({ type: 'playerLeave', id }));
        console.log(`[-] Player left: ${id} (Total: ${playerStates.size})`);
        client.playerId = null;
    }

    try {
        client.socket.destroy();
    } catch (e) {}
}

server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`Node.js TCP Server running on port ${PORT}`);
    console.log(`Connect in game using: 127.0.0.1:${PORT}`);
    console.log('========================================');
});
