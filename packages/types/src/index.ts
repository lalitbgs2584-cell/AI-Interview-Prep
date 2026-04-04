export type UserRole = "USER" | "ADMIN"

export interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
  isBlocked: boolean
  isDeleted: boolean
}
