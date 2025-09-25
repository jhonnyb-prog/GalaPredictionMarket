import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { Link } from "wouter";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided');
      return;
    }

    // Verify the email token
    const verifyEmail = async () => {
      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage('Your email has been successfully verified!');
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            setLocation('/login');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Email verification failed');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Network error. Please try again.');
      }
    };

    verifyEmail();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4">
            {status === 'loading' && (
              <div className="bg-blue-100 dark:bg-blue-900/20 w-full h-full rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="bg-green-100 dark:bg-green-900/20 w-full h-full rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            )}
            {status === 'error' && (
              <div className="bg-red-100 dark:bg-red-900/20 w-full h-full rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            )}
          </div>
          
          <CardTitle className="text-2xl font-bold">
            {status === 'loading' && 'Verifying Email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
          
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your email address'}
            {status === 'success' && 'Your account has been successfully verified'}
            {status === 'error' && 'We couldn\'t verify your email address'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {status === 'loading' && (
            <p className="text-sm text-muted-foreground">
              This should only take a moment...
            </p>
          )}
          
          {status === 'success' && (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  {message}
                </AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">
                You can now sign in to your account and start using Gala 8Ball.
              </p>
              <p className="text-xs text-muted-foreground">
                Redirecting to sign in page in a few seconds...
              </p>
              <Button asChild className="w-full">
                <Link href="/login" data-testid="link-to-login">
                  Continue to Sign In
                </Link>
              </Button>
            </div>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive" data-testid="error-message">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {message}
                </AlertDescription>
              </Alert>
              
              <div className="text-sm text-muted-foreground space-y-2">
                <p>This might happen if:</p>
                <ul className="text-xs space-y-1 text-left">
                  <li>• The verification link has expired</li>
                  <li>• The link has already been used</li>
                  <li>• The link is invalid or corrupted</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/signup" data-testid="link-to-signup">
                    <Mail className="w-4 h-4 mr-2" />
                    Sign Up Again
                  </Link>
                </Button>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/login" data-testid="link-to-login">
                    Back to Sign In
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}