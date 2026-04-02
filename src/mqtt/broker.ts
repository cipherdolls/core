import { Aedes, Client } from 'aedes';
import * as net from 'net';
import * as http from 'http';
import { verifyToken, type JwtPayload } from '../auth/jwt';
import { prisma } from '../db';

interface ExtendedClient extends Client {
  tokenDecoded?: JwtPayload;
  tokenType: 'jwt' | 'apikey' | 'systemKey';
}

let broker: Aedes;
let tcpServer: net.Server | undefined;
let wsServer: http.Server | undefined;

export function getBroker(): Aedes {
  return broker;
}

export async function startBroker() {
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  const brokerKey = process.env.MQTT_BROKER_KEY ?? '';

  broker = await Aedes.createBroker();

  broker.on('client', (client: ExtendedClient) => {
    console.log(`[mqtt] Client connected: ${client.id}`);
  });

  broker.on('clientDisconnect', (client: ExtendedClient) => {
    console.log(`[mqtt] Client disconnected: ${client.id}`);
  });

  /* ── Authentication ────────────────────────────────────────── */
  broker.authenticate = (async (client: ExtendedClient, _username: any, password: any, callback: any) => {
    const pw = password ? password.toString() : '';

    // System key
    if (pw === brokerKey && brokerKey !== '') {
      client.tokenType = 'systemKey';
      return callback(null, true);
    }

    // JWT
    try {
      const decoded = verifyToken(pw);
      if (decoded) {
        client.tokenDecoded = decoded;
        client.tokenType = 'jwt';
        return callback(null, true);
      }
    } catch {}

    // API key
    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { key: pw },
        include: { user: true },
      });
      if (apiKey) {
        client.tokenDecoded = {
          userId: apiKey.user.id,
          signerAddress: apiKey.user.signerAddress,
          role: apiKey.user.role,
        };
        client.tokenType = 'apikey';
        return callback(null, true);
      }
    } catch {}

    return callback(null, false);
  }) as any;

  /* ── Subscribe Authorization ───────────────────────────────── */
  broker.authorizeSubscribe = (async (client: ExtendedClient, packet: any, callback: any) => {
    if (client.tokenType === 'systemKey') {
      return callback(null, packet);
    }

    const { userId } = client.tokenDecoded!;
    const parts = packet.topic.split('/');
    const [resourceName, resourceId] = parts;

    if (resourceName === 'users') {
      const user = await prisma.user.findUnique({ where: { id: resourceId } });
      if (user?.id === userId) return callback(null, packet);
      return callback(new Error('Unauthorized'));
    }

    if (resourceName === 'dolls') {
      const doll = await prisma.doll.findUnique({ where: { id: resourceId } });
      if (doll?.userId === userId) return callback(null, packet);
      return callback(new Error('Unauthorized'));
    }

    if (resourceName === 'chats') {
      const chat = await prisma.chat.findUnique({ where: { id: resourceId } });
      if (chat?.userId === userId) return callback(null, packet);
      return callback(new Error('Unauthorized'));
    }

    callback(null, packet);
  }) as any;

  /* ── TCP Server (port 1883) ────────────────────────────────── */
  tcpServer = net.createServer(broker.handle);
  tcpServer.listen(1883, () => {
    console.log(`MQTT TCP broker running on ${brokerUrl}`);
  });

  /* ── WebSocket Server (port 8083) ──────────────────────────── */
  wsServer = http.createServer();
  const ws = require('websocket-stream');
  ws.createServer({ server: wsServer }, broker.handle);
  wsServer.listen(8083, () => {
    console.log('MQTT WebSocket broker running on port 8083');
  });
}

export async function stopBroker() {
  return new Promise<void>((resolve) => {
    tcpServer?.close();
    wsServer?.close();
    broker?.close(() => resolve());
  });
}
