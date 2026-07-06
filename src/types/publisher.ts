export interface FileUploadResult {
  category: string
  url: string
  fileId: number
  success: boolean
  error?: string
  attempts: number
}

export interface PublishReport {
  version: number
  success: boolean
  startedAt: string
  finishedAt: string
  duration: number
  uploadedFiles: number
  uploadedBytes: number
  baseUrl: string
  urls: Record<string, string>
  files: FileUploadResult[]
}

export interface UploadResponse {
  success: boolean
  version: number
  releaseId: number
  fileId: number
  category: string
  iocType: string
  url: string
  baseUrl: string
}
