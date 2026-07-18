/**
 * Represents an admin user — internal id + professional adminId
 */
export interface User {
  id: number;
  adminId: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe public user — only adminId
 */
export interface PublicUser {
  adminId: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * JWT payload — sub is sadm_xxx
 */
export interface JwtPayload {
  sub: string;
  username: string;
  email: string;
  iat: number;
  exp: number;
}
