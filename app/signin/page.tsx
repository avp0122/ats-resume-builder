import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Sign in — kresume' };

export default function SignInPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <AuthForm mode="signin" />
    </main>
  );
}
