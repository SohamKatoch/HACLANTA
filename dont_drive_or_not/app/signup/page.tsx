import LoginForm from "@/components/login-form";

export default function SignupPage() {
  return (
    <main className="flex w-full flex-col justify-center py-6 sm:py-10">
      <LoginForm mode="signup" />
    </main>
  );
}
