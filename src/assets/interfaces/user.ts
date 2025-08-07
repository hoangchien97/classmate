import type { UserRole } from "../enums";

export interface IUser {
  id: string | null;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
}