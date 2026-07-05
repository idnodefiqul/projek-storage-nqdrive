import { useUploadGlobal, type UploadContextValue } from "../stores/upload-provider";

export type { UploadProgress, UploadItemStatus, UploadItem } from "../stores/upload-provider";

export function useUpload(): UploadContextValue {
  return useUploadGlobal();
}