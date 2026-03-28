import LoginForm from "@/components/login-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-3xl">
        <LoginForm mode="signup" />
      </div>
    </main>
  );
}
