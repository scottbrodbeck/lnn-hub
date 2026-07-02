import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import lnnLogo from '@/assets/lnn-logo.png';

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, resetPasswordRequest, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Auth mode state
  const [authMode, setAuthMode] = useState<'login' | 'forgot' | 'reset' | 'otp' | 'verify-otp'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Check for reset mode or magic link token on mount
  useEffect(() => {
    const mode = searchParams.get('mode');
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (mode === 'reset') {
      setAuthMode('reset');
    } else if (token && email) {
      // Handle magic link from custom OTP email
      handleMagicLinkVerify(token, email);
    }
  }, [searchParams]);

  const handleMagicLinkVerify = async (token: string, email: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-custom-otp', {
        body: { token }
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Invalid or expired link');
        setAuthMode('otp');
        setOtpEmail(email);
        return;
      }

      if (data?.action_link) {
        // Use the magic link to sign in
        const url = new URL(data.action_link);
        const tokenHash = url.searchParams.get('token');
        const type = url.searchParams.get('type');
        
        if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (verifyError) {
            toast.error('Failed to complete sign in');
            return;
          }

          toast.success('Signed in successfully!');
          navigate(searchParams.get('redirect') || '/');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(loginEmail, loginPassword);
      toast.success('Logged in successfully');
      navigate(searchParams.get('redirect') || '/');
    } catch (error: any) {
      toast.error(error.message || 'Failed to log in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await resetPasswordRequest(forgotEmail);
      toast.success('Password reset email sent! Check your inbox.');
      setForgotEmail('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(newPassword);
      toast.success('Password reset successfully! You can now log in.');
      setAuthMode('login');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/auth');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-custom-otp', {
        body: { email: otpEmail }
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Failed to send code');
      }

      toast.success('Login code sent! Check your email.');
      setAuthMode('verify-otp');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send login code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-custom-otp', {
        body: { email: otpEmail, code: otpCode }
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Invalid code');
      }

      if (data?.action_link) {
        // Use the magic link to complete sign in
        const url = new URL(data.action_link);
        const tokenHash = url.searchParams.get('token');
        const type = url.searchParams.get('type');
        
        if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (verifyError) {
            throw verifyError;
          }

          toast.success(data.isNewUser ? 'Account created and signed in!' : 'Signed in successfully!');
          navigate(searchParams.get('redirect') || '/');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={lnnLogo} 
              alt="LNN Local Hub" 
              className="h-24 w-auto"
            />
          </div>
          <div>
            <CardTitle className="text-2xl">
              {authMode === 'login' && 'Local Hub'}
              {authMode === 'forgot' && 'Reset Password'}
              {authMode === 'reset' && 'Set New Password'}
              {authMode === 'otp' && 'Email Login Code'}
              {authMode === 'verify-otp' && 'Enter Login Code'}
            </CardTitle>
            <CardDescription className="mt-2">
              {authMode === 'login' && 'Sign in to your account'}
              {authMode === 'forgot' && 'Enter your email to receive a password reset link'}
              {authMode === 'reset' && 'Enter your new password'}
              {authMode === 'otp' && 'Get a one-time code sent to your email'}
              {authMode === 'verify-otp' && 'Check your email and enter the code'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {authMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('otp')}
                  className="text-sm text-primary hover:underline"
                >
                  Email me a code
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('forgot')}
                  className="text-sm text-primary hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>
            </form>
          )}

          {authMode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {authMode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {authMode === 'otp' && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-email">Email</Label>
                <Input
                  id="otp-email"
                  type="email"
                  placeholder="you@example.com"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Login Code'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {authMode === 'verify-otp' && (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">6-Digit Code</Label>
                <Input
                  id="otp-code"
                  type="text"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                  autoFocus
                  maxLength={6}
                  pattern="[0-9]{6}"
                />
                <p className="text-xs text-muted-foreground">
                  Check your email for the 6-digit code
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </Button>
              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('otp');
                    setOtpCode('');
                  }}
                  className="text-sm text-primary hover:underline block w-full"
                >
                  Resend Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setOtpEmail('');
                    setOtpCode('');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
