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

export type ToolCallEvent = {
  type: 'toolCall';
  chatId: string;
  messageId: string;
  toolCalls: {
    id: string;
    name: string;
    arguments: string;
  }[];
};

export type ActionEvent = AudioEvent | SystemEvent | ToolCallEvent;
