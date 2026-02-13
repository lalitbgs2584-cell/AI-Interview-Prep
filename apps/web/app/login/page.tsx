"use client";

import { authClient } from "@repo/auth/client";

export default function LoginPage() {
  const handleGoogleSignIn = async () => {
    const data = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  };
  
  const handleGithubSignIn = async () => {
    const data = await authClient.signIn.social({
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
