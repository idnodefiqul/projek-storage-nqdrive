/**
 * Represents an admin user of the NQDRIVE dashboard.
 * Note: NQDRIVE only supports a single local admin (no multi-user, no Google OAuth login).
 */
export interface User {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe representation of a User without sensitive fields.
 * Always use this type when sending user data to the client.
 */
export type PublicUser = Omit<User, "passwordHash">;

/**
 * Payload encoded inside the JWT session token.
 */
export interface JwtPayload {
  sub: number; // user id
  username: string;
  iat: number;
  exp: number;
}
