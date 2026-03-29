export type ProcessEvent = {
  resourceName: string;
  resourceId: string;
  resourceAttributes?: Record<string, any>;
  jobName: string;
  jobId: number;
  jobStatus: 'active' | 'completed' | 'failed' | 'retrying';
};

export type AudioEvent = {
  type: 'audio';
  action: 'play' | 'stop' | 'replay' | 'record' | 'record_stop';
  messageId?: string;
};

export type SystemEvent = {
  type: 'system';
  action: 'reset' | 'restart' | 'deepsleep';
};

export type ActionEvent = AudioEvent | SystemEvent;
