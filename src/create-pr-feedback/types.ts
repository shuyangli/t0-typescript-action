export interface CreatePrFeedbackActionInput {
  tensorZeroBaseUrl: string
  clickhouseUrl: string
  clickhouseTable: string
}

export interface TensorZeroFeedbackRequest<T> {
  inference_id?: string
  episode_id?: string
  metric_name: string
  value: T
}
