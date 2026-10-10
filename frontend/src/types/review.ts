export interface Review {
  id: number
  submission_id: number
  score: number
  summary: string
  roast_text: string
  strengths: string[]
  improvements: string[]
  model_used: string
  input_tokens: number
  output_tokens: number
  created_at: string
}
