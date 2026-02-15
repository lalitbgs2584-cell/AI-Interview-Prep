import { createAuthClient } from "better-auth/react"
import { getSessionCookie } from "better-auth/cookies"
export const authClient = createAuthClient({
    baseURL: "http://localhost:3000"
})
export { getSessionCookie }