import { OpenAI } from 'openai'
import * as core from '@actions/core'

export type TensorZeroOpenAiInferenceResponse =
  OpenAI.Chat.Completions.ChatCompletion & TensorZeroInferenceResponse
interface TensorZeroInferenceResponse {
  // Inference ID
  id: string
  episode_id: string
  variant_name: string
}

export interface TensorZeroFeedbackRequest<T> {
  metric_name: string
  inference_id: string
  value: T
  tags?: TensorZeroGithubCiBotFeedbackTags
}

export interface TensorZeroGithubCiBotFeedbackTags {
  reason: string
}

function getOpenAiCompatibleUrl(baseUrl: string): string {
  if (baseUrl[baseUrl.length - 1] === '/') {
    baseUrl = baseUrl.slice(0, -1)
  }
  return `${baseUrl}/openai/v1`
}

export async function callTensorZeroOpenAi(
  tensorZeroBaseUrl: string,
  systemPrompt: string,
  prompt: string
): Promise<TensorZeroOpenAiInferenceResponse> {
  const tensorZeroOpenAiEndpointUrl = getOpenAiCompatibleUrl(tensorZeroBaseUrl)
  const client = new OpenAI({
    baseURL: tensorZeroOpenAiEndpointUrl,
    // API key is supplied from the Gateway; we just need an API key for OpenAI client to be happy.
    apiKey: 'dummy'
  })
  return (await client.chat.completions.create({
    model: 'tensorzero::model_name::openai::gpt-5',
    messages: [
      {
        content: systemPrompt,
        role: 'system'
      },
      {
        content: prompt,
        role: 'user'
      }
    ]
  })) as TensorZeroOpenAiInferenceResponse
}

export async function provideInferenceFeedback<T>(
  tensorZeroBaseUrl: string,
  metricName: string,
  inferenceId: string,
  value: T,
  tags?: TensorZeroGithubCiBotFeedbackTags
): Promise<void> {
  const feedbackUrl = `${tensorZeroBaseUrl}/feedback`
  const feedbackRequest: TensorZeroFeedbackRequest<T> = {
    metric_name: metricName,
    inference_id: inferenceId,
    value,
    tags
  }
  core.info(`Feedback Request: ${JSON.stringify(feedbackRequest, null, 2)}`)
  const response = await fetch(feedbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(feedbackRequest)
  })
  if (!response.ok) {
    throw new Error(`Failed to provide feedback: ${response.statusText}`)
  }
  return
}
