import { startWorkers, stopWorkers } from './queue/startup';
import { startMqttClient, stopMqttClient } from './mqtt/client';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };

// Connect MQTT client so processors can publish events
startMqttClient();

console.log(`Starting worker process... (commit: ${process.env.COMMIT_SHA ?? 'dev'})`);
startWorkers();

process.on('SIGTERM', async () => {
  await stopWorkers();
  stopMqttClient();
  process.exit(0);
});

console.log('Worker process running.');
