"use client";

import { useState } from "react";
import { authClient } from "@repo/auth/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter()
  const handleEmailAuth = async () => {
    try {
        const { data, error } = await authClient.signUp.email({ 
            email,
            password,
            name,
            callbackURL: "/dashboard",
        });
        if (error) {
            alert(error.message);
            return;
        }
        router.push("/dashboard");
    } catch (err) {
      console.error("Email auth error:", err);
    }
  };


  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  };

  const handleGithubSignIn = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm bg-gray-800 rounded-lg p-6 text-white shadow-md">
        <h1 className="text-2xl font-bold text-center mb-2">Welcome Back</h1>
        <p className="text-center text-gray-400 mb-6">
          Sign in to continue to your account
        </p>
        <div className="mb-4">
          <label className="block text-gray-400 mb-1" htmlFor="email">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your email"
          />
          <label className="block text-gray-400 mb-1" htmlFor="name">
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your name"
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-400 mb-1" htmlFor="password">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your password"
          />
        </div>
        <button
          onClick={handleEmailAuth}
          className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-2 rounded-lg mb-4"
        >
          Sign In with Email
        </button>
        <div className="text-center text-gray-500 my-4">or</div>
        <button
          onClick={handleGoogleSignIn}
          className="w-full bg-red-600 hover:bg-red-500 transition-colors py-2 rounded-lg mb-4"
        >
          Continue with Google
        </button>
        <button
          onClick={handleGithubSignIn}
          className="w-full bg-gray-700 hover:bg-gray-600 transition-colors py-2 rounded-lg"
        >
          Continue with GitHub
        </button>

        <p className="text-center text-gray-500 text-sm mt-6">
          By continuing, you agree to our{" "}
          <span className="underline cursor-pointer">Terms</span> and{" "}
          <span className="underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
