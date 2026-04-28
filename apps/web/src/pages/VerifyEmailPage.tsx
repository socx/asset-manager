import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

type State = 'loading' | 'success' | 'already_verified' | 'expired' | 'invalid' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('invalid');
      return;
    }

    fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json()) as { message: string };
        setMessage(data.message);
        if (res.ok) {
          if (data.message.toLowerCase().includes('already')) {
            setState('already_verified');
          } else {
            setState('success');
          }
        } else if (res.status === 400) {
          if (data.message.toLowerCase().includes('expired')) {
            setState('expired');
          } else {
            setState('invalid');
          }
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [searchParams]);

  const content: Record<State, { icon: string; heading: string; body: React.ReactNode }> = {
    loading: {
      icon: '⏳',
      heading: 'Verifying your email…',
      body: <p className="text-gray-500 text-sm">Please wait.</p>,
    },
    success: {
      icon: '✅',
      heading: 'Email verified!',
      body: (
        <>
          <p className="text-gray-500 text-sm mb-4">Your account is now active.</p>
          <Link
            to="/login"
            className="inline-block bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-5 rounded-md text-sm"
          >
            Log in
          </Link>
        </>
      ),
    },
    already_verified: {
      icon: '✅',
      heading: 'Already verified',
      body: (
        <>
          <p className="text-gray-500 text-sm mb-4">{message}</p>
          <Link to="/login" className="text-sky-600 hover:underline text-sm font-medium">
            Go to login &rarr;
          </Link>
        </>
      ),
    },
    expired: {
      icon: '⏰',
      heading: 'Link expired',
      body: (
        <>
          <p className="text-gray-500 text-sm mb-4">
            This verification link has expired. Request a new one below.
          </p>
          <Link
            to="/resend-verification"
            className="inline-block bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-5 rounded-md text-sm"
          >
            Resend verification email
          </Link>
        </>
      ),
    },
    invalid: {
      icon: '❌',
      heading: 'Invalid link',
      body: (
        <p className="text-gray-500 text-sm">
          This verification link is invalid or has already been used.{' '}
          <Link to="/resend-verification" className="text-sky-600 hover:underline">
            Request a new one
          </Link>
          .
        </p>
      ),
    },
    error: {
      icon: '⚠️',
      heading: 'Something went wrong',
      body: (
        <p className="text-gray-500 text-sm">
          An unexpected error occurred. Please try again or{' '}
          <Link to="/resend-verification" className="text-sky-600 hover:underline">
            request a new verification email
          </Link>
          .
        </p>
      ),
    },
  };

  const { icon, heading, body } = content[state];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">{icon}</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{heading}</h1>
        {body}
      </div>
    </div>
  );
}
