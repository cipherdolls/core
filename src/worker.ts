import { startWorkers, stopWorkers } from './queue/startup';
import { startMqttClient, stopMqttClient } from './mqtt/client';
import { startWatcher, stopWatcher } from './token/watcher';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };

// Connect MQTT client so processors can publish events
startMqttClient();

console.log('Starting worker process...');
startWorkers();
startWatcher();

process.on('SIGTERM', async () => {
  stopWatcher();
  await stopWorkers();
  stopMqttClient();
  process.exit(0);
});

console.log('Worker process running.');
