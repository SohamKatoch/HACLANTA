import LoginForm from "@/components/login-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-8 sm:px-8">
      <LoginForm mode="signup" />
    </main>
  );
}
