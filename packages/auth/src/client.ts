import { createAuthClient } from "better-auth/react"
import { getSessionCookie } from "better-auth/cookies"
console.log(process.env.BETTER_AUTH_BASE_URL)
export const authClient = createAuthClient({
    baseURL: process.env.BETTER_AUTH_BASE_URL || "http://localhost:3000"
})
export { getSessionCookie }