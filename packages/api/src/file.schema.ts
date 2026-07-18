import { z } from "zod";
import { FILE_VISIBILITY_OPTIONS } from "@nqdrive/shared";

export const updateFileVisibilitySchema = z.object({
  visibility: z.enum(FILE_VISIBILITY_OPTIONS),
});

export const renameFileSchema = z.object({
  filename: z.string().min(1, "Nama file wajib diisi").max(255),
});

export const createFolderSchema = z.object({
  name: z.string().min(1, "Nama folder wajib diisi").max(255),
  // Professional: fld_xxx string, dual-mode support legacy number
  parentFolderId: z.union([z.string(), z.number().int().positive()]).nullable().optional(),
});

export const listFilesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  // Professional: fld_xxx, dual-mode support legacy number
  folderId: z.union([z.string(), z.coerce.number().int().nonnegative()]).optional(),
  visibility: z.enum(FILE_VISIBILITY_OPTIONS).optional(),
});

export type UpdateFileVisibilityInput = z.infer<typeof updateFileVisibilitySchema>;
export type RenameFileInput = z.infer<typeof renameFileSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type ListFilesQueryInput = z.infer<typeof listFilesQuerySchema>;
