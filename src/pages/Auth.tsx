import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { User, Lock, Mail } from 'lucide-react';
import OtpLogin from '@/components/auth/OtpLogin';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const [username, setUsername] = useState('');
const [phone, setPhone] = useState('');
const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Redirect if already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/');
      }
    };
    checkUser();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast({
            title: "Invalid credentials",
            description: "Please check your email and password and try again.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Sign in failed",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully."
        });
        // Ensure accounts row exists/updated
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user;
        if (u) {
          await supabase
            .from('Client_Accounts')
            .upsert(
              {
                user_id: u.id,
                email: u.email,
                first_name: (u.user_metadata as any)?.first_name,
                last_name: (u.user_metadata as any)?.last_name,
                phone: (u.user_metadata as any)?.phone,
                username: (u.user_metadata as any)?.username
              },
              { onConflict: 'user_id' }
            );
        }
        navigate('/');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            username: username
          }
        }
      });

      // Ensure account row is created even without session
      try {
        await supabase.functions.invoke('upsert-client-account', {
          body: {
            userId: null,
            email,
            firstName,
            lastName,
            phone,
            username
          }
        });
      } catch (upsertErr) {
        console.warn('Edge upsert failed (signup):', upsertErr);
      }


      if (error) {
        if (error.message.includes('already registered')) {
          toast({
            title: "Account exists",
            description: "An account with this email already exists. Please sign in instead.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Sign up failed",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        // Send welcome email
        try {
          await supabase.functions.invoke('send-booking-confirmation', {
            body: {
              to: email,
              firstName: firstName,
              lastName: lastName,
              type: 'welcome'
            }
          });
        } catch (emailError) {
          console.error('Welcome email failed:', emailError);
        }

        // Try to sign in immediately so nav updates to Profile
        try {
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            console.warn('Auto sign-in after signup failed:', signInErr.message);
          }
        } catch (autoErr) {
          console.warn('Auto sign-in error:', autoErr);
        }

        // Attempt to create/update Client_Accounts immediately if session is available
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const u = session?.user;
          if (u) {
            await supabase
              .from('Client_Accounts')
              .upsert(
                {
                  user_id: u.id,
                  email: u.email,
                  first_name: firstName,
                  last_name: lastName,
                  phone: phone,
                  username: username
                },
                { onConflict: 'user_id' }
              );
          }
        } catch (accountErr) {
          console.warn('Client_Accounts upsert after signup skipped:', accountErr);
        }

        toast({
          title: "Account created!",
          description: "Please check your email to verify your account."
        });
        navigate('/profile');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground text-2xl">⛳</span>
          </div>
          <h1 className="text-3xl font-bold">Welcome to GolfBooker</h1>
          <p className="text-muted-foreground mt-2">Sign in or create an account to manage your bookings</p>
        </div>

        <Card className="golf-card-shadow">
          <CardHeader>
            <CardTitle className="text-center">Get Started</CardTitle>
            <CardDescription className="text-center">
              Join thousands of golfers who've simplified their booking experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <PasswordInput
                        id="signin-password"
                        placeholder="Your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="first-name"
                          placeholder="John"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input
                        id="last-name"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
                      placeholder="yourname"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone (Optional)</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <PasswordInput
                        id="signup-password"
                        placeholder="Create a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            <TabsContent value="code">
              <OtpLogin onSuccess={() => navigate('/profile')} />
            </TabsContent>
            </Tabs>
            <div className="pt-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Prefer not to sign in?</p>
              <Button variant="ghost" onClick={() => {
                const hasBooking = !!sessionStorage.getItem('bookingData');
                navigate(hasBooking ? '/checkout' : '/book');
              }}>
                Continue as Guest
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;