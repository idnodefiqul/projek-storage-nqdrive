/**
 * Key-value application settings stored in D1.
 * Used among other things to track first-run setup completion.
 */
export interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

export const SETTINGS_KEYS = {
  SETUP_COMPLETED: "setup_completed",
} as const;

/**
 * Standard, consistent API response envelope used by every NQDRIVE endpoint.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
