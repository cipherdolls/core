import { startBroker, stopBroker } from './mqtt/broker';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () { return Number(this); };

// Start MQTT broker (Aedes)
console.log(`Starting MQTT broker... (commit: ${process.env.COMMIT_SHA ?? 'dev'})`);
await startBroker();

process.on('SIGTERM', async () => {
  await stopBroker();
  process.exit(0);
});

console.log('MQTT broker process running.');
