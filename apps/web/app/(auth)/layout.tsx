import { auth } from "@repo/auth/server"
import { headers } from "next/headers"
import  {redirect} from "next/navigation"
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
    let session = null;
    try {
        
        session = await auth.api.getSession(
           {
               headers: await headers()
           }
       )
    } catch (error) {
        
    }
    if (session) {
        redirect(`/dashboard`)
    }
    
    return(
        <>
        {children}
        </>
    )
}