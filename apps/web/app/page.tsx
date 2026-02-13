"use client"
import { Button } from "@workspace/ui/components/button"
import { useRouter } from "next/navigation"
export default function Page() {
  const router = useRouter()
  return (
    <div className="flex items-center justify-center min-h-svh">
      <div className="flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Hello World</h1>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/login")}>Login</Button>
          <Button onClick={() => router.push("/signup")}>Signup</Button>
          <Button variant="outline">Outline</Button>
        </div>
      </div>
    </div>
  )
}
