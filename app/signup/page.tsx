import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Sign up — kresume' };

export default function SignUpPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <AuthForm mode="signup" />
    </main>
  );
}
